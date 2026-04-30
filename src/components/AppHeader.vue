<script setup lang="ts">
import { ref, onMounted } from 'vue'

const statusBarHeight = ref(20) // fallback px

onMounted(() => {
  try {
    const sys = uni.getSystemInfoSync()
    statusBarHeight.value = sys.statusBarHeight ?? 20
  } catch {
    statusBarHeight.value = 20
  }
})
</script>

<template>
  <view class="header" :style="{ paddingTop: statusBarHeight + 'px' }">
    <text class="logo-icon">♠</text>
    <text class="title">德扑记账</text>
    <text class="logo-icon">♠</text>
  </view>
</template>

<style lang="scss" scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  padding-bottom: 20rpx;
  background: #f5f5f5;
}
.logo-icon {
  font-size: 44rpx;
  color: #1a73e8;
}
.title {
  font-size: 40rpx;
  font-weight: 700;
  color: #333;
}
</style>
