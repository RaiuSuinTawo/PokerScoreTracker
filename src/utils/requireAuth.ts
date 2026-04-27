/**
 * Page guard helper. Use inside a page's onLoad:
 *
 *   import { onLoad } from '@dcloudio/uni-app'
 *   import { requireAuth } from '@/utils/requireAuth'
 *   onLoad((q) => {
 *     if (!requireAuth()) return
 *     // ... rest of page init using q
 *   })
 */
import { useAuthStore } from '@/stores/authStore'

export function requireAuth(): boolean {
  const auth = useAuthStore()
  if (!auth.isAuthenticated) {
    uni.reLaunch({ url: auth.PAGE_LOGIN })
    return false
  }
  if (auth.mustChangePwd) {
    uni.reLaunch({ url: auth.PAGE_CHANGE_PWD })
    return false
  }
  return true
}
