/**
 * Ledger list store — caches summaries for the ledger-list page.
 * See EXPANSION_PLAN.md §7.1.
 *
 * Responsibilities:
 *  - fetch & hold the {active, archived} summary arrays
 *  - create / join actions (delegates to server; refreshes list on success)
 *  - delete action (admin only)
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { LedgerFull, LedgerListResponse, LedgerResponse, LedgerSummary } from '@/api/types'
import { api } from '@/utils/http'

export const useLedgerListStore = defineStore('ledgerList', () => {
  const active = ref<LedgerSummary[]>([])
  const archived = ref<LedgerSummary[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const hasAny = computed(() => active.value.length > 0 || archived.value.length > 0)

  async function refresh() {
    isLoading.value = true
    error.value = null
    try {
      const res = await api.get<LedgerListResponse>('/ledgers')
      active.value = res.active
      archived.value = res.archived
    } catch (err: any) {
      error.value = err?.message ?? '加载失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function create(title: string): Promise<LedgerFull> {
    const res = await api.post<LedgerResponse>('/ledgers', { title })
    await refresh()
    return res.ledger
  }

  async function joinBySerial(serial: string): Promise<LedgerFull> {
    const res = await api.post<LedgerResponse>('/ledgers/join', { serial })
    await refresh()
    return res.ledger
  }

  async function remove(ledgerId: string): Promise<void> {
    await api.del(`/ledgers/${ledgerId}`)
    await refresh()
  }

  function reset() {
    active.value = []
    archived.value = []
    error.value = null
    isLoading.value = false
  }

  return {
    active,
    archived,
    isLoading,
    error,
    hasAny,
    refresh,
    create,
    joinBySerial,
    remove,
    reset,
  }
})
