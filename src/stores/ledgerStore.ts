/**
 * Ledger store — the active ledger being viewed/edited.
 * See EXPANSION_PLAN.md §7.4.
 *
 * Lifecycle:
 *   - load(id)          fetch full ledger + settlement, reset polling state
 *   - startPolling()    begin 5s adaptive poller hitting /events + /settlement
 *   - stopPolling()     stop the poller
 *   - refresh()         force-refetch ledger + settlement
 *   - reset()           blank state (call on page unload)
 *
 * All mutating actions call `kick()` on the poller so other clients see
 * the change quickly.
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, ApiError } from '@/utils/http'
import { createPoller, type Poller } from '@/utils/polling'
import type {
  BuyInRequestDTO,
  EventsResponse,
  ExpenseDTO,
  LedgerFull,
  LedgerResponse,
  PlayerDTO,
  Role,
  Settlement,
} from '@/api/types'

export const useLedgerStore = defineStore('ledger', () => {
  // ---- State ----
  const ledger = ref<LedgerFull | null>(null)
  const settlement = ref<Settlement | null>(null)
  const pendingRequests = ref<BuyInRequestDTO[]>([]) // Phase 5
  const lastEventAt = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  let poller: Poller | null = null

  // ---- Getters ----
  const role = computed<Role | null>(() => ledger.value?.me?.role ?? null)
  const myPlayerId = computed(() => ledger.value?.me?.playerId ?? null)
  const isArchived = computed(() => ledger.value?.status === 'ARCHIVED')

  const canEditLedger = computed(() => role.value === 'ADMIN' && !isArchived.value)
  const canEditChipAmount = computed(() => role.value === 'ADMIN' && !isArchived.value)
  const canDeleteLedger = computed(() => role.value === 'ADMIN')
  const canArchive = computed(
    () => role.value === 'ADMIN' && !isArchived.value && !!settlement.value?.isBalanced,
  )

  function canEditNickname(pid: string): boolean {
    if (isArchived.value) return false
    if (role.value === 'ADMIN') return true
    return pid === myPlayerId.value
  }

  /** Decide the UX mode for the +/- stepper on a player row. */
  function buyInControlMode(pid: string): 'direct' | 'request' | 'none' {
    if (isArchived.value) return 'none'
    if (role.value === 'ADMIN') return 'direct'
    if (pid === myPlayerId.value) return 'request'
    return 'none'
  }

  // ---- Helpers ----
  function _applyLedger(full: LedgerFull) {
    ledger.value = full
  }

  async function _fetchSettlement() {
    if (!ledger.value) return
    try {
      const s = await api.get<Settlement>(`/ledgers/${ledger.value.id}/settlement`)
      settlement.value = s
    } catch (err) {
      if (err instanceof ApiError) {
        error.value = err.message
      }
    }
  }

  // ---- Actions ----
  async function load(id: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await api.get<LedgerResponse>(`/ledgers/${id}`)
      _applyLedger(res.ledger)
      lastEventAt.value = null
      await Promise.all([_fetchSettlement(), _fetchPending()])
    } catch (err) {
      if (err instanceof ApiError) error.value = err.message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function refresh(): Promise<void> {
    if (!ledger.value) return
    const res = await api.get<LedgerResponse>(`/ledgers/${ledger.value.id}`)
    _applyLedger(res.ledger)
    await Promise.all([_fetchSettlement(), _fetchPending()])
  }

  async function _fetchPending(): Promise<void> {
    if (!ledger.value) return
    try {
      const res = await api.get<{ requests: BuyInRequestDTO[] }>(
        `/ledgers/${ledger.value.id}/buy-in-requests`,
        { status: 'PENDING' },
      )
      pendingRequests.value = res.requests
    } catch {
      /* swallow — surfaced by http.ts */
    }
  }

  /** Poll tick: /events?since=<lastEventAt>; if any event, refetch ledger+settlement. */
  async function _pollOnce(): Promise<boolean> {
    if (!ledger.value) return false
    const q: Record<string, string> = {}
    if (lastEventAt.value) q.since = lastEventAt.value
    const res = await api.get<EventsResponse>(`/ledgers/${ledger.value.id}/events`, q)
    if (res.events.length === 0) {
      // Even an empty poll advances serverTime so subsequent since= is tight.
      lastEventAt.value = res.serverTime
      return false
    }
    const newest = res.events[res.events.length - 1].createdAt
    lastEventAt.value = newest
    await refresh()
    return true
  }

  function startPolling() {
    if (poller?.isRunning()) return
    poller = createPoller({
      baseIntervalMs: 5000,
      maxIntervalMs: 10000,
      emptyToBackoff: 5,
      fn: _pollOnce,
      onError: (e) => console.warn('[ledgerStore] poll error', e),
    })
    poller.start()
  }
  function stopPolling() {
    poller?.stop()
  }
  function kickPolling() {
    poller?.kick()
  }

  // ---- Mutations (each maps to one API call) ----
  async function setChipValue(v: number): Promise<void> {
    if (!ledger.value) return
    const res = await api.patch<LedgerResponse>(`/ledgers/${ledger.value.id}`, { chipValue: v })
    _applyLedger(res.ledger)
    await _fetchSettlement()
    kickPolling()
  }

  async function setChipMultiplier(v: number): Promise<void> {
    if (!ledger.value) return
    const res = await api.patch<LedgerResponse>(`/ledgers/${ledger.value.id}`, {
      chipMultiplier: v,
    })
    _applyLedger(res.ledger)
    await _fetchSettlement()
    kickPolling()
  }

  async function updatePlayer(
    pid: string,
    patch: Partial<Pick<PlayerDTO, 'nickname' | 'chipAmount' | 'order'>>,
  ): Promise<void> {
    if (!ledger.value) return
    await api.patch(`/ledgers/${ledger.value.id}/players/${pid}`, patch)
    await refresh()
    kickPolling()
  }

  async function removePlayer(pid: string): Promise<void> {
    if (!ledger.value) return
    await api.del(`/ledgers/${ledger.value.id}/players/${pid}`)
    await refresh()
    kickPolling()
  }

  async function addExpense(label: string, amount: number): Promise<ExpenseDTO> {
    if (!ledger.value) throw new Error('NO_LEDGER')
    const res = await api.post<{ expense: ExpenseDTO }>(
      `/ledgers/${ledger.value.id}/expenses`,
      { label, amount },
    )
    await refresh()
    kickPolling()
    return res.expense
  }

  async function updateExpense(
    eid: string,
    patch: { label?: string; amount?: number },
  ): Promise<void> {
    if (!ledger.value) return
    await api.patch(`/ledgers/${ledger.value.id}/expenses/${eid}`, patch)
    await refresh()
    kickPolling()
  }

  async function removeExpense(eid: string): Promise<void> {
    if (!ledger.value) return
    await api.del(`/ledgers/${ledger.value.id}/expenses/${eid}`)
    await refresh()
    kickPolling()
  }

  async function deleteLedger(): Promise<void> {
    if (!ledger.value) return
    await api.del(`/ledgers/${ledger.value.id}`)
    reset()
  }

  async function archive(): Promise<void> {
    if (!ledger.value) return
    const res = await api.post<LedgerResponse>(`/ledgers/${ledger.value.id}/archive`)
    _applyLedger(res.ledger)
    await _fetchSettlement()
    kickPolling()
  }

  // ---- Buy-in requests (Phase 5) ----
  async function fetchPendingRequests(): Promise<void> {
    await _fetchPending()
  }

  async function requestBuyIn(hands: number, note?: string): Promise<BuyInRequestDTO> {
    if (!ledger.value) throw new Error('NO_LEDGER')
    const res = await api.post<{ request: BuyInRequestDTO }>(
      `/ledgers/${ledger.value.id}/buy-in-requests`,
      note ? { hands, note } : { hands },
    )
    // For admin-self, this auto-approves and bumps buyInCount server-side.
    await refresh()
    kickPolling()
    return res.request
  }

  async function approveRequest(rid: string): Promise<void> {
    await api.post(`/buy-in-requests/${rid}/approve`)
    await refresh()
    kickPolling()
  }

  async function rejectRequest(rid: string, reason?: string): Promise<void> {
    await api.post(`/buy-in-requests/${rid}/reject`, reason ? { reason } : {})
    await _fetchPending()
    kickPolling()
  }

  async function cancelRequest(rid: string): Promise<void> {
    await api.post(`/buy-in-requests/${rid}/cancel`)
    await _fetchPending()
    kickPolling()
  }

  /** Admin count of PENDING requests — for the top-bar badge. */
  const pendingCount = computed(() => {
    if (role.value !== 'ADMIN') return 0
    return pendingRequests.value.filter((r) => r.status === 'PENDING').length
  })

  function reset() {
    stopPolling()
    ledger.value = null
    settlement.value = null
    pendingRequests.value = []
    lastEventAt.value = null
    error.value = null
    isLoading.value = false
  }

  return {
    // state
    ledger,
    settlement,
    pendingRequests,
    pendingCount,
    lastEventAt,
    isLoading,
    error,
    // getters
    role,
    myPlayerId,
    isArchived,
    canEditLedger,
    canEditChipAmount,
    canDeleteLedger,
    canArchive,
    canEditNickname,
    buyInControlMode,
    // actions
    load,
    refresh,
    startPolling,
    stopPolling,
    kickPolling,
    setChipValue,
    setChipMultiplier,
    updatePlayer,
    removePlayer,
    addExpense,
    updateExpense,
    removeExpense,
    deleteLedger,
    archive,
    fetchPendingRequests,
    requestBuyIn,
    approveRequest,
    rejectRequest,
    cancelRequest,
    reset,
  }
})
