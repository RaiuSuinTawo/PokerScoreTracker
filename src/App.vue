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
  // 首页就是 ledger-list，无需跳转。
  // 未登录用户也可以看到主界面（空状态），操作时再触发登录。
})

onShow(() => {
  // 全局心跳：每 5 分钟调 /auth/me 验证 session 有效性
  // 如果被踢（tokenVersion 不匹配），http.ts 自动触发 onAuthFailure → 弹回登录页
  // 注：每个 API 调用已自带 requireAuth 校验，心跳仅用于检测"无操作时被踢"的场景
  const auth = useAuthStore()
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  heartbeatTimer = setInterval(() => {
    if (auth.isAuthenticated) {
      auth.refreshMe().catch(() => { /* http.ts handles 401 */ })
    }
  }, 300_000) // 5 minutes
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
