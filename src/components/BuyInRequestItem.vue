<script setup lang="ts">
/**
 * Buy-in request item — read-only history display.
 * No approval/reject/cancel buttons needed.
 */
import { computed } from 'vue'
import type { BuyInRequestDTO } from '@/api/types'

const props = defineProps<{
  request: BuyInRequestDTO
  nickname: string
}>()

const statusLabel = computed(() => {
  switch (props.request.status) {
    case 'APPROVED':
      return '已生效'
    case 'PENDING':
      return '待处理'
    case 'REJECTED':
      return '已拒绝'
    case 'CANCELED':
      return '已取消'
    default:
      return props.request.status
  }
})
const statusClass = computed(() => `status-${props.request.status.toLowerCase()}`)

const handsText = computed(() => {
  const h = props.request.hands
  return h > 0 ? `+${h} 手` : `${h} 手`
})

const createdAt = computed(() => {
  const d = new Date(props.request.createdAt)
  if (isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const mon = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${mon}-${day} ${hh}:${mm}`
})
</script>

<template>
  <view class="item" :class="statusClass">
    <view class="row-top">
      <view class="left">
        <text class="nickname">{{ nickname }}</text>
        <text class="hands" :class="{ negative: request.hands < 0 }">{{ handsText }}</text>
      </view>
      <text class="status">{{ statusLabel }}</text>
    </view>
    <view v-if="request.note" class="note">备注：{{ request.note }}</view>
    <view class="row-bottom">
      <text class="time">{{ createdAt }}</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.item {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
  border-left: 6rpx solid #2e7d32;
}
.item.status-pending {
  border-left-color: #ff9800;
}
.item.status-approved {
  border-left-color: #2e7d32;
}
.item.status-rejected {
  border-left-color: #e53935;
}
.item.status-canceled {
  border-left-color: #aaa;
  background: #fafafa;
}
.row-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.left {
  display: flex;
  align-items: baseline;
  gap: 16rpx;
}
.nickname {
  font-size: 30rpx;
  font-weight: 600;
  color: #1a73e8;
}
.hands {
  font-size: 26rpx;
  color: #2e7d32;
  font-weight: 600;
}
.hands.negative {
  color: #e53935;
}
.status {
  font-size: 24rpx;
  color: #555;
}
.status-approved .status { color: #2e7d32; }
.status-pending .status { color: #ff9800; }
.status-rejected .status { color: #e53935; }
.status-canceled .status { color: #888; }

.note {
  font-size: 24rpx;
  color: #666;
  margin-top: 8rpx;
  line-height: 1.4;
}
.row-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12rpx;
}
.time {
  font-size: 22rpx;
  color: #aaa;
}
</style>
