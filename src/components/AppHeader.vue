<script setup lang="ts">
import { ref, onMounted } from 'vue'

/**
 * 计算自定义导航栏需要的顶部高度（px）。
 * 小程序：statusBarHeight + 胶囊按钮高度 + 上下间距
 * H5/其他：仅 statusBarHeight
 */
const navPaddingTop = ref(20) // 状态栏 px
const navHeight = ref(44) // 导航内容区高度 px

onMounted(() => {
  try {
    const sys = uni.getSystemInfoSync()
    const statusBar = sys.statusBarHeight ?? 20
    navPaddingTop.value = statusBar

    // #ifdef MP-WEIXIN
    // 微信胶囊按钮位置精确计算导航高度
    const menu = wx.getMenuButtonBoundingClientRect()
    // 导航内容区高度 = (胶囊底部 - 状态栏高度) + 胶囊上方间距
    navHeight.value = (menu.bottom - statusBar) + (menu.top - statusBar)
    // #endif
  } catch {
    navPaddingTop.value = 20
    navHeight.value = 44
  }
})
</script>

<template>
  <view
    class="header"
    :style="{
      paddingTop: navPaddingTop + 'px',
      height: navHeight + 'px',
    }"
  >
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
  box-sizing: content-box;
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
