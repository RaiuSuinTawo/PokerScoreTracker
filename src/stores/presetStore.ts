/**
 * Preset store — manages ledger presets (server-persisted, user-owned).
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/utils/http'
import type { LedgerPresetDTO } from '@/api/types'

export interface PresetCreateInput {
  name: string
  title?: string
  chipValue?: number
  chipMultiplier?: number
  autoApprove?: boolean
}

export interface PresetPatchInput {
  name?: string
  title?: string
  chipValue?: number
  chipMultiplier?: number
  autoApprove?: boolean
}

export const usePresetStore = defineStore('presets', () => {
  const presets = ref<LedgerPresetDTO[]>([])
  const isLoading = ref(false)

  async function load(): Promise<void> {
    isLoading.value = true
    try {
      const res = await api.get<{ presets: LedgerPresetDTO[] }>('/ledger-presets')
      presets.value = res.presets
    } finally {
      isLoading.value = false
    }
  }

  async function create(input: PresetCreateInput): Promise<LedgerPresetDTO> {
    const res = await api.post<{ preset: LedgerPresetDTO }>('/ledger-presets', input)
    presets.value = [res.preset, ...presets.value]
    return res.preset
  }

  async function update(id: string, patch: PresetPatchInput): Promise<LedgerPresetDTO> {
    const res = await api.patch<{ preset: LedgerPresetDTO }>(`/ledger-presets/${id}`, patch)
    const idx = presets.value.findIndex((p) => p.id === id)
    if (idx >= 0) presets.value[idx] = res.preset
    return res.preset
  }

  async function remove(id: string): Promise<void> {
    await api.del(`/ledger-presets/${id}`)
    presets.value = presets.value.filter((p) => p.id !== id)
  }

  function reset() {
    presets.value = []
    isLoading.value = false
  }

  return {
    presets,
    isLoading,
    load,
    create,
    update,
    remove,
    reset,
  }
})
