<script setup lang="ts">
defineProps<{
  totalUp: number
  totalSharedExpense: number
  totalDown: number
  balanceDiff: number
  isBalanced: boolean
  showBalance: boolean
}>()
</script>

<template>
  <view class="stats-bar">
    <view class="stat">
      <text class="stat-label">总水上</text>
      <text class="stat-value red">{{ totalUp }}</text>
    </view>
    <view class="stat">
      <text class="stat-label">公摊</text>
      <text class="stat-value orange">{{ totalSharedExpense }}</text>
    </view>
    <view class="stat">
      <text class="stat-label">总水下</text>
      <text class="stat-value green">{{ totalDown }}</text>
    </view>
    <view class="stat">
      <text class="stat-label">差值</text>
      <text class="stat-value">{{ balanceDiff }}</text>
    </view>
    <view class="stat" v-if="showBalance">
      <text
        class="balance-badge"
        :class="isBalanced ? 'balanced' : 'unbalanced'"
      >
        {{ isBalanced ? '帐平' : '未平帐' }}
      </text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.stats-bar {
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx 12rpx;
  margin: 20rpx 0;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.05);
  flex-wrap: wrap;
  gap: 12rpx 0;
}
.stat {
  text-align: center;
}
.stat-label {
  font-size: 22rpx;
  color: #999;
  display: block;
  margin-bottom: 8rpx;
}
.stat-value {
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
}
.red { color: #e53935; }
.green { color: #2e7d32; }
.orange { color: #ff9800; }
.balance-badge {
  padding: 8rpx 24rpx;
  border-radius: 20rpx;
  font-size: 26rpx;
  font-weight: 600;
  &.balanced { background: #e8f5e9; color: #2e7d32; }
  &.unbalanced { background: #ffebee; color: #e53935; }
}
</style>
