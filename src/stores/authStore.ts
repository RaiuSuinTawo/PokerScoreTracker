/**
 * Auth store — holds the current user + tokens; provides login/logout/refresh/hydrate.
 *
 * Persistence: tokens stored via uni.setStorageSync under dedicated keys.
 * Installs a TokenBridge with http.ts at module setup so the network layer
 * can read tokens and react to 401 without a circular import.
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { LoginResponse, MeResponse, UserPublic } from '@/api/types'
import { api, installTokenBridge, ApiError, request } from '@/utils/http'

const STORAGE_KEYS = {
  access: 'AUTH_ACCESS',
  refresh: 'AUTH_REFRESH',
  user: 'AUTH_USER',
} as const

// Pages paths (kept here to avoid magic strings scattered)
const PAGE_LOGIN = '/pages/login/index'
const PAGE_CHANGE_PWD = '/pages/change-password/index'
const PAGE_HOME = '/pages/ledger-list/index'

function readStorage(key: string): string | null {
  try {
    const v = uni.getStorageSync(key)
    return typeof v === 'string' && v.length > 0 ? v : null
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value == null) uni.removeStorageSync(key)
    else uni.setStorageSync(key, value)
  } catch {
    /* ignore */
  }
}

export const useAuthStore = defineStore('auth', () => {
  const access = ref<string | null>(null)
  const refresh = ref<string | null>(null)
  const user = ref<UserPublic | null>(null)
  const isHydrated = ref(false)

  const isAuthenticated = computed(() => !!access.value && !!user.value)
  const mustChangePwd = computed(() => !!user.value?.mustChangePwd)

  function _persistTokens() {
    writeStorage(STORAGE_KEYS.access, access.value)
    writeStorage(STORAGE_KEYS.refresh, refresh.value)
    writeStorage(STORAGE_KEYS.user, user.value ? JSON.stringify(user.value) : null)
  }

  function _setTokens(a: string, r: string) {
    access.value = a
    refresh.value = r
    _persistTokens()
  }

  function _setUser(u: UserPublic | null) {
    user.value = u
    writeStorage(STORAGE_KEYS.user, u ? JSON.stringify(u) : null)
  }

  function _clear() {
    access.value = null
    refresh.value = null
    user.value = null
    _persistTokens()
  }

  // ---- Bootstrap from storage ----
  async function hydrate() {
    if (isHydrated.value) return
    const a = readStorage(STORAGE_KEYS.access)
    const r = readStorage(STORAGE_KEYS.refresh)
    const u = readStorage(STORAGE_KEYS.user)
    if (a) access.value = a
    if (r) refresh.value = r
    if (u) {
      try {
        user.value = JSON.parse(u) as UserPublic
      } catch {
        user.value = null
      }
    }
    isHydrated.value = true

    // If we have tokens, verify with /auth/me; refresh path is auto-handled by http.ts
    if (access.value) {
      try {
        const me = await api.get<MeResponse>('/auth/me')
        _setUser(me.user)
      } catch (err) {
        if (err instanceof ApiError) {
          // http.ts already cleared & redirected on hard failures; just swallow here
        }
      }
    }
  }

  // ---- Actions ----
  async function login(username: string, password: string) {
    const res = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      data: { username, password },
      skipAuth: true,
      skipAuthHandling: true,
    })
    _setTokens(res.access, res.refresh)
    _setUser(res.user)
  }

  async function logout() {
    const r = refresh.value
    _clear()
    if (r) {
      try {
        await request('/auth/logout', {
          method: 'POST',
          data: { refresh: r },
          skipAuth: true,
          skipAuthHandling: true,
        })
      } catch {
        /* best effort */
      }
    }
  }

  async function changePassword(oldPassword: string, newPassword: string) {
    await api.post('/auth/change-password', { oldPassword, newPassword })
    // server revokes all refresh tokens; re-login required.
    _clear()
  }

  async function refreshMe() {
    const me = await api.get<MeResponse>('/auth/me')
    _setUser(me.user)
  }

  // ---- Install network bridge (§7.2) ----
  installTokenBridge({
    getAccess: () => access.value,
    getRefresh: () => refresh.value,
    setTokens: (a, r) => _setTokens(a, r),
    onAuthFailure: async (reason) => {
      if (reason === 'must-change-pwd') {
        // Soft-redirect so user can change password.
        try {
          uni.reLaunch({ url: PAGE_CHANGE_PWD })
        } catch {
          /* ignore — page may not exist yet early in startup */
        }
        return
      }
      _clear()
      try {
        uni.reLaunch({ url: PAGE_LOGIN })
      } catch {
        /* ignore */
      }
    },
  })

  return {
    // state
    access,
    refresh,
    user,
    isHydrated,
    // getters
    isAuthenticated,
    mustChangePwd,
    // actions
    hydrate,
    login,
    logout,
    changePassword,
    refreshMe,
    // page paths (for App.vue to read after hydrate)
    PAGE_LOGIN,
    PAGE_CHANGE_PWD,
    PAGE_HOME,
  }
})
