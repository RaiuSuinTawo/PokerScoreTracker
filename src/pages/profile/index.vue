<script setup lang="ts">
/**
 * Profile page — ledger history + bankroll curve.
 * See EXPANSION_PLAN.md §8 Phase 7.
 */
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useAuthStore } from '@/stores/authStore'
import { useProfileStore } from '@/stores/profileStore'
import { requireAuth } from '@/utils/requireAuth'
import BankrollChart from '@/components/BankrollChart.vue'
import type { ProfileLedgerRow } from '@/api/types'

const auth = useAuthStore()
const store = useProfileStore()
const user = computed(() => auth.user)

const archivedCount = computed(() => store.archivedLedgers.length)
const activeCount = computed(() => store.activeLedgers.length)
const finalBankroll = computed(() => store.finalBankroll)
const finalBankrollColor = computed(() =>
  finalBankroll.value > 0 ? '#e53935' : finalBankroll.value < 0 ? '#2e7d32' : '#888',
)

onShow(async () => {
  if (!requireAuth()) return
  try {
    await store.refresh()
  } catch {
    /* http.ts toasted */
  }
})

function goHome() {
  uni.reLaunch({ url: auth.PAGE_HOME })
}

function goLedger(l: ProfileLedgerRow) {
  uni.navigateTo({ url: `/pages/index/index?id=${l.id}` })
}

async function handleLogout() {
  await auth.logout()
  store.reset()
  uni.reLaunch({ url: auth.PAGE_LOGIN })
}

function netColor(v: number | null): string {
  if (v == null) return '#888'
  if (v > 0) return '#e53935'
  if (v < 0) return '#2e7d32'
  return '#888'
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
</script>

<template>
  <view class="page">
    <view class="topbar">
      <button class="nav-btn" size="mini" @click="goHome">账本列表</button>
      <text class="title">我的</text>
      <button class="nav-btn danger" size="mini" @click="handleLogout">退出</button>
    </view>

    <view class="identity">
      <text class="name">{{ user?.displayName || '' }}</text>
      <text class="username">@{{ user?.username || '' }}</text>
    </view>

    <view class="summary">
      <view class="stat">
        <text class="stat-label">累计盈亏</text>
        <text class="stat-value" :style="{ color: finalBankrollColor }">{{ finalBankroll }}</text>
      </view>
      <view class="stat">
        <text class="stat-label">已归档</text>
        <text class="stat-value">{{ archivedCount }}</text>
      </view>
      <view class="stat">
        <text class="stat-label">进行中</text>
        <text class="stat-value">{{ activeCount }}</text>
      </view>
    </view>

    <view class="card">
      <text class="card-title">Bankroll 曲线</text>
      <text class="card-sub">仅统计已归档账本，按归档时间升序累加</text>
      <view class="chart-slot">
        <BankrollChart :points="store.points" />
      </view>
      <view v-if="store.points.length === 0" class="chart-empty">
        <text>归档账本后会自动累计到此处</text>
      </view>
    </view>

    <view class="card">
      <text class="card-title">参与的账本（{{ store.ledgers.length }}）</text>
      <view v-if="store.isLoading && store.ledgers.length === 0" class="hint">加载中…</view>
      <view v-else-if="store.ledgers.length === 0" class="hint empty">
        <text>还没有账本记录</text>
      </view>
      <view v-else class="ledger-list">
        <view
          v-for="l in store.ledgers"
          :key="l.id"
          class="ledger-item"
          @click="goLedger(l)"
        >
          <view class="row-left">
            <text class="l-title">{{ l.title }}</text>
            <view class="l-meta">
              <text class="tag" :class="l.role === 'ADMIN' ? 'tag-admin' : 'tag-player'">
                {{ l.role === 'ADMIN' ? '管理员' : '玩家' }}
              </text>
              <text v-if="l.status === 'ARCHIVED'" class="tag tag-archived">已归档</text>
              <text v-else class="tag tag-active">进行中</text>
              <text class="serial">{{ l.serial }}</text>
            </view>
            <text v-if="l.archivedAt" class="date">归档于 {{ formatDate(l.archivedAt) }}</text>
            <text v-else class="date">创建于 {{ formatDate(l.createdAt) }}</text>
          </view>
          <view class="row-right">
            <text
              v-if="l.myNet != null"
              class="net"
              :style="{ color: netColor(l.myNet) }"
            >{{ l.myNet > 0 ? '+' + l.myNet : l.myNet }}</text>
            <text v-else class="net muted">—</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 24rpx 32rpx 40rpx;
}
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8rpx 0;
}
.nav-btn {
  font-size: 22rpx;
  background: #fff;
  border: 2rpx solid #ddd;
  color: #555;
}
.nav-btn.danger {
  color: #888;
}
.title {
  font-size: 34rpx;
  font-weight: 700;
  color: #333;
}
.identity {
  margin-top: 24rpx;
  padding: 20rpx 0;
}
.name {
  font-size: 36rpx;
  font-weight: 700;
  color: #333;
  display: block;
}
.username {
  font-size: 24rpx;
  color: #888;
}

.summary {
  margin-top: 16rpx;
  display: flex;
  gap: 16rpx;
  padding: 24rpx;
  background: #fff;
  border-radius: 16rpx;
}
.stat {
  flex: 1;
  text-align: center;
}
.stat-label {
  font-size: 22rpx;
  color: #888;
  display: block;
}
.stat-value {
  font-size: 36rpx;
  font-weight: 700;
  color: #333;
  margin-top: 8rpx;
  display: block;
}

.card {
  margin-top: 24rpx;
  padding: 24rpx;
  background: #fff;
  border-radius: 16rpx;
}
.card-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
  display: block;
}
.card-sub {
  font-size: 22rpx;
  color: #aaa;
  display: block;
  margin-top: 4rpx;
}
.chart-slot {
  margin-top: 16rpx;
}
.chart-empty {
  padding: 60rpx 0;
  text-align: center;
  color: #bbb;
  font-size: 24rpx;
}

.ledger-list {
  margin-top: 12rpx;
}
.ledger-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f2f2f2;
  gap: 16rpx;
}
.ledger-item:last-child {
  border-bottom: none;
}
.row-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.l-title {
  font-size: 28rpx;
  color: #333;
  font-weight: 600;
}
.l-meta {
  display: flex;
  gap: 8rpx;
  align-items: center;
  flex-wrap: wrap;
}
.tag {
  font-size: 20rpx;
  padding: 2rpx 10rpx;
  border-radius: 20rpx;
}
.tag-admin {
  background: #1a73e8;
  color: #fff;
}
.tag-player {
  background: #e8f0fe;
  color: #1a73e8;
}
.tag-active {
  background: #e6f4ea;
  color: #1e8e3e;
}
.tag-archived {
  background: #eee;
  color: #888;
}
.serial {
  font-family: monospace;
  font-size: 22rpx;
  color: #888;
}
.date {
  font-size: 22rpx;
  color: #aaa;
}
.row-right {
  display: flex;
  align-items: center;
}
.net {
  font-size: 32rpx;
  font-weight: 700;
}
.net.muted {
  color: #ccc;
  font-size: 26rpx;
}

.hint {
  padding: 60rpx 0;
  text-align: center;
  color: #aaa;
}
.empty {
  color: #bbb;
}
</style>
