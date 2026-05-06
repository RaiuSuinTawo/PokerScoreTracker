<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { useAuthStore } from '@/stores/authStore'

let heartbeatTimer: ReturnType<typeof setInterval> | null = null

onLaunch(async () => {
  // #ifdef MP-WEIXIN
  const cloudEnv = import.meta.env?.VITE_CLOUD_ENV as string | undefined
  if (cloudEnv) {
    wx.cloud.init({ env: cloudEnv, traceUser: true })
  }
  // #endif

  const auth = useAuthStore()
  try {
    await auth.hydrate()
  } catch (e) {
    console.error('[App] auth hydrate failed', e)
  }
  // Route dispatch: pages.json's first entry is the login page so unauthed users
  // already land there; if we are authed, hop to home.
  if (auth.isAuthenticated) {
    if (auth.mustChangePwd) {
      uni.reLaunch({ url: auth.PAGE_CHANGE_PWD })
    } else {
      uni.reLaunch({ url: auth.PAGE_HOME })
    }
  }
})

onShow(() => {
  // 全局心跳：每 5 秒调 /auth/me 验证 session 有效性
  // 如果被踢（tokenVersion 不匹配），http.ts 自动触发 onAuthFailure → 弹回登录页
  const auth = useAuthStore()
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  heartbeatTimer = setInterval(() => {
    if (auth.isAuthenticated) {
      auth.refreshMe().catch(() => { /* http.ts handles 401 */ })
    }
  }, 2000)
})

onHide(() => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
})
</script>

<style>
page {
  background-color: #f5f5f5;
  color: #333;
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', sans-serif;
}

button::after {
  border: none;
}
</style>
