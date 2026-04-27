<template>
  <view class="card" :class="{ archived: ledger.status === 'ARCHIVED' }" @click="$emit('tap', ledger)">
    <view class="card-head">
      <text class="title">{{ ledger.title }}</text>
      <view class="badges">
        <text class="badge" :class="ledger.role === 'ADMIN' ? 'badge-admin' : 'badge-player'">
          {{ ledger.role === 'ADMIN' ? '管理员' : '玩家' }}
        </text>
        <text v-if="ledger.status === 'ARCHIVED'" class="badge badge-archived">已归档</text>
      </view>
    </view>
    <view class="card-meta">
      <view class="meta-item">
        <text class="meta-label">序列号</text>
        <text class="meta-value serial">{{ ledger.serial }}</text>
      </view>
      <view class="meta-item">
        <text class="meta-label">玩家</text>
        <text class="meta-value">{{ ledger.playerCount }} 人</text>
      </view>
      <view class="meta-item" v-if="ledger.archivedAt">
        <text class="meta-label">归档于</text>
        <text class="meta-value">{{ formatDate(ledger.archivedAt) }}</text>
      </view>
    </view>
    <view v-if="ledger.role === 'ADMIN' && !readonlyActions" class="card-actions" @click.stop>
      <button class="btn-danger" size="mini" @click="$emit('delete', ledger)">删除</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { LedgerSummary } from '@/api/types'

defineProps<{
  ledger: LedgerSummary
  readonlyActions?: boolean
}>()

defineEmits<{
  (e: 'tap', l: LedgerSummary): void
  (e: 'delete', l: LedgerSummary): void
}>()

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
</script>

<style lang="scss" scoped>
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  border: 2rpx solid transparent;
  transition: border-color 0.15s;
}
.card.archived {
  background: #f5f5f5;
}
.card:active {
  border-color: #1a73e8;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16rpx;
}
.title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
  flex: 1;
  word-break: break-all;
}
.badges {
  display: flex;
  gap: 8rpx;
  flex-wrap: wrap;
}
.badge {
  padding: 4rpx 12rpx;
  border-radius: 20rpx;
  font-size: 22rpx;
  white-space: nowrap;
}
.badge-admin {
  background: #1a73e8;
  color: #fff;
}
.badge-player {
  background: #e8f0fe;
  color: #1a73e8;
}
.badge-archived {
  background: #eee;
  color: #888;
}
.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 24rpx;
  margin-top: 20rpx;
}
.meta-item {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.meta-label {
  font-size: 22rpx;
  color: #888;
}
.meta-value {
  font-size: 26rpx;
  color: #333;
}
.meta-value.serial {
  font-family: 'Courier New', monospace;
  font-weight: 600;
  letter-spacing: 2rpx;
}
.card-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16rpx;
  gap: 12rpx;
}
.btn-danger {
  font-size: 24rpx;
  color: #e53935;
  background: #fff;
  border: 2rpx solid #e53935;
}
</style>
