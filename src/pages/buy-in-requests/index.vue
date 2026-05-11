<script setup lang="ts">
/**
 * Buy-in history page — read-only history of all buy-in/buy-out records.
 * No approval needed; all requests are auto-approved.
 */
import { ref, computed } from 'vue'
import { onLoad, onShow, onHide } from '@dcloudio/uni-app'
import { useLedgerStore } from '@/stores/ledgerStore'
import { useAuthStore } from '@/stores/authStore'
import { requireAuth } from '@/utils/requireAuth'
import { ApiError, api } from '@/utils/http'
import type { BuyInRequestDTO } from '@/api/types'
import BuyInRequestItem from '@/components/BuyInRequestItem.vue'

const auth = useAuthStore()
const store = useLedgerStore()

const historyRequests = ref<BuyInRequestDTO[]>([])
const isLoading = ref(false)

const players = computed(() => store.ledger?.players ?? [])
const nameByPlayerId = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {}
  for (const p of players.value) m[p.id] = p.nickname
  return m
})

async function loadHistory() {
  if (!store.ledger) return
  isLoading.value = true
  try {
    const res = await api.get<{ requests: BuyInRequestDTO[] }>(
      `/ledgers/${store.ledger.id}/buy-in-requests`,
    )
    historyRequests.value = res.requests
  } catch (err) {
    if (err instanceof ApiError) uni.showToast({ title: err.message, icon: 'none' })
  } finally {
    isLoading.value = false
  }
}

onLoad((q) => {
  if (!requireAuth()) return
  const id = (q as any)?.id as string | undefined
  if (!id) {
    if (!store.ledger) {
      uni.showToast({ title: '缺少账本参数', icon: 'none' })
      setTimeout(() => uni.navigateBack({ fail: () => uni.reLaunch({ url: auth.PAGE_HOME }) }), 800)
    }
    return
  }
  if (!store.ledger || store.ledger.id !== id) {
    void store.load(id).catch((err) => {
      if (err instanceof ApiError) uni.showToast({ title: err.message, icon: 'none' })
    })
  }
})

onShow(async () => {
  if (store.ledger) {
    await loadHistory()
    store.startPolling()
  }
})
onHide(() => {
  store.stopPolling()
})

function nicknameFor(r: BuyInRequestDTO): string {
  return nameByPlayerId.value[r.playerId] ?? '（已移除）'
}

function goBack() {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: auth.PAGE_HOME }) })
}
</script>

<template>
  <view class="page">
    <view class="header">
      <text class="title">带入记录</text>
    </view>

    <view v-if="isLoading" class="hint">加载中…</view>
    <view v-else-if="historyRequests.length === 0" class="hint empty">
      <text>暂无带入记录</text>
    </view>
    <view v-else class="list">
      <BuyInRequestItem
        v-for="r in historyRequests"
        :key="r.id"
        :request="r"
        :nickname="nicknameFor(r)"
      />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 16rpx 32rpx 40rpx;
}
.header {
  padding: 12rpx 4rpx 20rpx;
  border-bottom: 2rpx solid #eee;
  margin-bottom: 20rpx;
}
.title {
  font-size: 32rpx;
  font-weight: 700;
  color: #333;
}
.hint {
  padding: 120rpx 0;
  text-align: center;
  color: #aaa;
  font-size: 26rpx;
}
.empty {
  color: #bbb;
}
</style>
