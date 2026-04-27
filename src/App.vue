<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { useAuthStore } from '@/stores/authStore'

onLaunch(async () => {
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
  // placeholder
})
onHide(() => {
  // placeholder
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
