<script setup lang="ts">
/**
 * Buy-in inbox.
 * - Admin: sees every request (tabs: 待处理 / 历史); can approve / reject.
 * - Player: sees only own requests; can cancel pending.
 * See EXPANSION_PLAN.md §8 Phase 5.
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

const currentTab = ref<'pending' | 'history'>('pending')
const historyRequests = ref<BuyInRequestDTO[]>([])
const isLoadingHistory = ref(false)
const actioningId = ref<string | null>(null)
const rejectingId = ref<string | null>(null)
const rejectReason = ref('')

const role = computed(() => store.role)
const myPlayerId = computed(() => store.myPlayerId)
const players = computed(() => store.ledger?.players ?? [])
const nameByPlayerId = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {}
  for (const p of players.value) m[p.id] = p.nickname
  return m
})

const pending = computed(() => store.pendingRequests)
const visibleRequests = computed(() =>
  currentTab.value === 'pending' ? pending.value : historyRequests.value,
)

async function loadHistory() {
  if (!store.ledger) return
  isLoadingHistory.value = true
  try {
    // ask server for everything; admin sees all, player sees own
    const r1 = await api.get<{ requests: BuyInRequestDTO[] }>(
      `/ledgers/${store.ledger.id}/buy-in-requests`,
      { status: 'APPROVED' },
    )
    const r2 = await api.get<{ requests: BuyInRequestDTO[] }>(
      `/ledgers/${store.ledger.id}/buy-in-requests`,
      { status: 'REJECTED' },
    )
    const r3 = await api.get<{ requests: BuyInRequestDTO[] }>(
      `/ledgers/${store.ledger.id}/buy-in-requests`,
      { status: 'CANCELED' },
    )
    const combined = [...r1.requests, ...r2.requests, ...r3.requests]
    combined.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    historyRequests.value = combined
  } catch (err) {
    if (err instanceof ApiError) uni.showToast({ title: err.message, icon: 'none' })
  } finally {
    isLoadingHistory.value = false
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
    await store.fetchPendingRequests()
    if (currentTab.value === 'history') await loadHistory()
    store.startPolling()
  }
})
onHide(() => {
  store.stopPolling()
})

function switchTab(tab: 'pending' | 'history') {
  currentTab.value = tab
  if (tab === 'history') void loadHistory()
}

async function onApprove(rid: string) {
  actioningId.value = rid
  try {
    await store.approveRequest(rid)
    uni.showToast({ title: '已批准', icon: 'none' })
  } catch (err) {
    uni.showToast({
      title: err instanceof ApiError ? err.message : '操作失败',
      icon: 'none',
    })
  } finally {
    actioningId.value = null
  }
}

function onRejectStart(rid: string) {
  rejectingId.value = rid
  rejectReason.value = ''
}

async function onRejectConfirm() {
  if (!rejectingId.value) return
  const rid = rejectingId.value
  actioningId.value = rid
  try {
    await store.rejectRequest(rid, rejectReason.value.trim() || undefined)
    uni.showToast({ title: '已拒绝', icon: 'none' })
    rejectingId.value = null
    rejectReason.value = ''
  } catch (err) {
    uni.showToast({
      title: err instanceof ApiError ? err.message : '操作失败',
      icon: 'none',
    })
  } finally {
    actioningId.value = null
  }
}

async function onCancel(rid: string) {
  actioningId.value = rid
  try {
    await store.cancelRequest(rid)
    uni.showToast({ title: '已取消', icon: 'none' })
  } catch (err) {
    uni.showToast({
      title: err instanceof ApiError ? err.message : '操作失败',
      icon: 'none',
    })
  } finally {
    actioningId.value = null
  }
}

function isMine(r: BuyInRequestDTO): boolean {
  return r.requestedById === auth.user?.id
}

function nicknameFor(r: BuyInRequestDTO): string {
  return nameByPlayerId.value[r.playerId] ?? '（已移除）'
}

function goBack() {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: auth.PAGE_HOME }) })
}
</script>

<template>
  <view class="page">
    <view class="topbar">
      <text class="title">带入申请</text>
    </view>

    <view class="tabs">
      <view
        class="tab"
        :class="{ active: currentTab === 'pending' }"
        @click="switchTab('pending')"
      >
        待处理
        <text v-if="pending.length" class="count">{{ pending.length }}</text>
      </view>
      <view
        class="tab"
        :class="{ active: currentTab === 'history' }"
        @click="switchTab('history')"
      >历史</view>
    </view>

    <view v-if="currentTab === 'history' && isLoadingHistory" class="hint">加载中…</view>
    <view v-else-if="visibleRequests.length === 0" class="hint empty">
      <text v-if="currentTab === 'pending'">暂无待处理请求</text>
      <text v-else>暂无历史记录</text>
    </view>
    <view v-else class="list">
      <BuyInRequestItem
        v-for="r in visibleRequests"
        :key="r.id"
        :request="r"
        :nickname="nicknameFor(r)"
        :role="role ?? 'PLAYER'"
        :is-mine="isMine(r)"
        :busy="actioningId === r.id"
        @approve="onApprove"
        @reject="onRejectStart"
        @cancel="onCancel"
      />
    </view>

    <!-- Reject reason modal -->
    <view v-if="rejectingId" class="modal-mask" @click="rejectingId = null">
      <view class="modal-card" @click.stop>
        <text class="modal-title">拒绝理由（可选）</text>
        <input
          v-model="rejectReason"
          class="input"
          maxlength="120"
          placeholder="例如：已开新局、手数不符"
        />
        <view class="modal-actions">
          <button class="btn-secondary" :disabled="actioningId === rejectingId" @click="rejectingId = null">取消</button>
          <button class="btn-primary" :disabled="actioningId === rejectingId" @click="onRejectConfirm">确认拒绝</button>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 16rpx 32rpx 40rpx;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16rpx 0;
}
.title {
  font-size: 34rpx;
  font-weight: 700;
  color: #333;
}
.tabs {
  display: flex;
  gap: 24rpx;
  padding: 12rpx 4rpx 20rpx;
  border-bottom: 2rpx solid #eee;
  margin-bottom: 20rpx;
}
.tab {
  font-size: 28rpx;
  color: #888;
  padding: 12rpx 0;
  position: relative;
}
.tab.active {
  color: #1a73e8;
  font-weight: 600;
}
.tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -12rpx;
  height: 4rpx;
  background: #1a73e8;
  border-radius: 2rpx;
}
.count {
  margin-left: 6rpx;
  font-size: 22rpx;
  color: #e53935;
  font-weight: 700;
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

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99;
}
.modal-card {
  width: 600rpx;
  padding: 40rpx;
  background: #fff;
  border-radius: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.modal-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #333;
}
.input {
  height: 72rpx;
  background: #f5f5f5;
  border: 2rpx solid #ddd;
  border-radius: 12rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
}
.modal-actions {
  display: flex;
  gap: 16rpx;
}
.btn-primary,
.btn-secondary {
  flex: 1;
  height: 76rpx;
  line-height: 76rpx;
  font-size: 28rpx;
  border-radius: 12rpx;
}
.btn-primary {
  background: #e53935;
  color: #fff;
}
.btn-secondary {
  background: #f0f0f0;
  color: #333;
}
</style>
