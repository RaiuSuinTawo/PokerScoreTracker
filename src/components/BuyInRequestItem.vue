<script setup lang="ts">
import { computed } from 'vue'
import type { BuyInRequestDTO, Role } from '@/api/types'

const props = defineProps<{
  request: BuyInRequestDTO
  nickname: string
  role: Role
  isMine: boolean
  busy?: boolean
}>()

const emit = defineEmits<{
  approve: [rid: string]
  reject: [rid: string]
  cancel: [rid: string]
}>()

const statusLabel = computed(() => {
  switch (props.request.status) {
    case 'PENDING':
      return '待处理'
    case 'APPROVED':
      return '已批准'
    case 'REJECTED':
      return '已拒绝'
    case 'CANCELED':
      return '已取消'
    default:
      return props.request.status
  }
})
const statusClass = computed(() => `status-${props.request.status.toLowerCase()}`)

const createdAt = computed(() => {
  const d = new Date(props.request.createdAt)
  if (isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const mon = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${mon}-${day} ${hh}:${mm}`
})

const canDecide = computed(
  () => props.role === 'ADMIN' && props.request.status === 'PENDING',
)
const canCancel = computed(() => props.isMine && props.request.status === 'PENDING')
</script>

<template>
  <view class="item" :class="statusClass">
    <view class="row-top">
      <view class="left">
        <text class="nickname">{{ nickname }}</text>
        <text class="hands">+{{ request.hands }} 手</text>
      </view>
      <text class="status">{{ statusLabel }}</text>
    </view>
    <view v-if="request.note" class="note">备注：{{ request.note }}</view>
    <view v-if="request.rejectReason" class="reject-reason">拒绝理由：{{ request.rejectReason }}</view>
    <view class="row-bottom">
      <text class="time">{{ createdAt }}</text>
      <view class="actions">
        <button
          v-if="canDecide"
          class="btn btn-reject"
          size="mini"
          :disabled="busy"
          @click="emit('reject', request.id)"
        >拒绝</button>
        <button
          v-if="canDecide"
          class="btn btn-approve"
          size="mini"
          :disabled="busy"
          @click="emit('approve', request.id)"
        >批准</button>
        <button
          v-if="canCancel"
          class="btn btn-cancel"
          size="mini"
          :disabled="busy"
          @click="emit('cancel', request.id)"
        >取消申请</button>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.item {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
  border-left: 6rpx solid #ccc;
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
  color: #333;
  font-weight: 600;
}
.status {
  font-size: 24rpx;
  color: #555;
}
.status-pending .status { color: #ff9800; }
.status-approved .status { color: #2e7d32; }
.status-rejected .status { color: #e53935; }
.status-canceled .status { color: #888; }

.note,
.reject-reason {
  font-size: 24rpx;
  color: #666;
  margin-top: 8rpx;
  line-height: 1.4;
}
.reject-reason {
  color: #e53935;
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
.actions {
  display: flex;
  gap: 8rpx;
}
.btn {
  font-size: 24rpx;
}
.btn-approve {
  background: #1a73e8;
  color: #fff;
}
.btn-reject {
  background: #fff;
  color: #e53935;
  border: 2rpx solid #e53935;
}
.btn-cancel {
  background: #fff;
  color: #888;
  border: 2rpx solid #ccc;
}
</style>
