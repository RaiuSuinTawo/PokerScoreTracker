/**
 * Profile store — ledger history + bankroll curve.
 * See EXPANSION_PLAN.md §7.1 and §8 Phase 7.
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/utils/http'
import type { BankrollPoint, ProfileLedgerRow } from '@/api/types'

export const useProfileStore = defineStore('profile', () => {
  const ledgers = ref<ProfileLedgerRow[]>([])
  const points = ref<BankrollPoint[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const archivedLedgers = computed(() => ledgers.value.filter((l) => l.status === 'ARCHIVED'))
  const activeLedgers = computed(() => ledgers.value.filter((l) => l.status === 'ACTIVE'))

  const finalBankroll = computed(() =>
    points.value.length ? points.value[points.value.length - 1].cumulative : 0,
  )

  async function refresh() {
    isLoading.value = true
    error.value = null
    try {
      const [lr, br] = await Promise.all([
        api.get<{ ledgers: ProfileLedgerRow[] }>('/profile/ledgers'),
        api.get<{ points: BankrollPoint[] }>('/profile/bankroll'),
      ])
      ledgers.value = lr.ledgers
      points.value = br.points
    } catch (err: any) {
      error.value = err?.message ?? '加载失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  function reset() {
    ledgers.value = []
    points.value = []
    error.value = null
    isLoading.value = false
  }

  return {
    ledgers,
    points,
    isLoading,
    error,
    archivedLedgers,
    activeLedgers,
    finalBankroll,
    refresh,
    reset,
  }
})
