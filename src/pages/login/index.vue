<template>
  <view class="login-page">
    <view class="brand">
      <text class="brand-icon">♠</text>
      <text class="brand-title">德扑记账</text>
      <text class="brand-icon">♠</text>
    </view>

    <!-- #ifdef MP-WEIXIN -->
    <view class="auto-login">
      <text v-if="wxLoading" class="loading-text">正在登录...</text>
      <view v-else class="wx-action">
        <view class="field wx-field">
          <text class="label">昵称</text>
          <input
            class="input nickname-input"
            type="nickname"
            v-model="wxNickname"
            placeholder="点击使用微信昵称"
            maxlength="64"
          />
        </view>
        <button class="wx-btn" :disabled="!wxNickname.trim()" @click="handleWxLogin">一键登录</button>
        <text v-if="wxFailed" class="fail-text">登录失败，请重试</text>
      </view>
    </view>
    <!-- #endif -->

    <!-- #ifndef MP-WEIXIN -->
    <view class="subtitle">请登录或注册</view>

    <view class="tabs">
      <view class="tab" :class="{ active: tab === 'login' }" @click="tab = 'login'">登录</view>
      <view class="tab" :class="{ active: tab === 'register' }" @click="tab = 'register'">注册</view>
    </view>

    <!-- Login form -->
    <view v-if="tab === 'login'" class="form">
      <view class="field">
        <text class="label">账号</text>
        <input
          class="input"
          v-model="username"
          placeholder="用户名"
          maxlength="64"
          :disabled="loading"
          autocomplete="username"
        />
      </view>
      <view class="field">
        <text class="label">密码</text>
        <input
          class="input"
          type="password"
          v-model="password"
          placeholder="请输入密码"
          maxlength="256"
          :disabled="loading"
          autocomplete="current-password"
        />
      </view>
      <view v-if="error" class="error">{{ error }}</view>
      <button class="submit" :disabled="!canLogin || loading" @click="handleLogin">
        {{ loading ? '登录中…' : '登录' }}
      </button>
    </view>

    <!-- Register form -->
    <view v-if="tab === 'register'" class="form">
      <view class="field">
        <text class="label">用户名</text>
        <input
          class="input"
          v-model="regUsername"
          placeholder="3-32位字母数字下划线"
          maxlength="32"
          :disabled="loading"
        />
      </view>
      <view class="field">
        <text class="label">昵称</text>
        <input
          class="input"
          v-model="regDisplayName"
          placeholder="显示给其他玩家的名称"
          maxlength="64"
          :disabled="loading"
        />
      </view>
      <view class="field">
        <text class="label">密码</text>
        <input
          class="input"
          type="password"
          v-model="regPassword"
          placeholder="至少8位"
          maxlength="256"
          :disabled="loading"
        />
      </view>
      <view class="field">
        <text class="label">确认密码</text>
        <input
          class="input"
          type="password"
          v-model="regConfirm"
          placeholder="再次输入密码"
          maxlength="256"
          :disabled="loading"
        />
      </view>
      <view v-if="error" class="error">{{ error }}</view>
      <button class="submit" :disabled="!canRegister || loading" @click="handleRegister">
        {{ loading ? '注册中…' : '注册' }}
      </button>
    </view>
    <!-- #endif -->

    <!-- Legacy data export dialog -->
    <view v-if="showLegacyDialog" class="modal-mask" @tap="dismissLegacy">
      <view class="modal-card" @tap.stop>
        <text class="modal-title">本地旧数据</text>
        <text class="modal-body">
          检测到旧版本本地账本数据。新版本使用云端账本，本地数据可导出留存后清除。
        </text>
        <view class="modal-actions">
          <button class="btn-secondary" @click="exportLegacy">导出到剪贴板</button>
          <button class="btn-primary" @click="dismissLegacy">我知道了，清除本地</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from '@/utils/http'

const auth = useAuthStore()

const tab = ref<'login' | 'register'>('login')
const loading = ref(false)
const error = ref('')

// Login fields
const username = ref('')
const password = ref('')
const canLogin = computed(() => username.value.trim().length > 0 && password.value.length > 0)

// Register fields
const regUsername = ref('')
const regDisplayName = ref('')
const regPassword = ref('')
const regConfirm = ref('')
const canRegister = computed(
  () =>
    regUsername.value.trim().length >= 3 &&
    regDisplayName.value.trim().length > 0 &&
    regPassword.value.length >= 8 &&
    regConfirm.value.length > 0,
)

// WeChat auto-login state
const wxFailed = ref(false)

function goHome() {
  if (auth.mustChangePwd) {
    uni.reLaunch({ url: auth.PAGE_CHANGE_PWD })
  } else {
    uni.reLaunch({ url: auth.PAGE_HOME })
  }
}

async function handleLogin() {
  if (!canLogin.value || loading.value) return
  loading.value = true
  error.value = ''
  try {
    await auth.login(username.value.trim(), password.value)
    goHome()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message || '登录失败' : '登录失败，请重试'
  } finally {
    loading.value = false
  }
}

async function handleRegister() {
  if (!canRegister.value || loading.value) return
  if (regPassword.value !== regConfirm.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  loading.value = true
  error.value = ''
  try {
    await auth.register(regUsername.value.trim(), regPassword.value, regDisplayName.value.trim())
    goHome()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message || '注册失败' : '注册失败，请重试'
  } finally {
    loading.value = false
  }
}

// #ifdef MP-WEIXIN
const wxLoading = ref(false)
const wxNickname = ref('')

async function handleWxLogin() {
  const nickname = wxNickname.value.trim()
  if (!nickname) {
    uni.showToast({ title: '请输入昵称', icon: 'none' })
    return
  }
  wxLoading.value = true
  wxFailed.value = false
  const ok = await auth.wxLogin(nickname)
  wxLoading.value = false
  if (ok) {
    goHome()
  } else {
    wxFailed.value = true
  }
}

onMounted(async () => {
  if (auth.isAuthenticated) {
    goHome()
  }
})
// #endif

// #ifndef MP-WEIXIN
onShow(() => {
  if (auth.isAuthenticated && !auth.mustChangePwd) {
    uni.reLaunch({ url: auth.PAGE_HOME })
  }
})
// #endif

// ---- Legacy local data detection & export dialog ----
const LEGACY_KEY = 'POKER_APP_DATA'
const LEGACY_DISMISSED_KEY = 'LEGACY_EXPORT_DISMISSED'
const showLegacyDialog = ref(false)
let legacyRaw: string | null = null

function detectLegacy() {
  try {
    const dismissed = uni.getStorageSync(LEGACY_DISMISSED_KEY)
    if (dismissed) return
    const raw = uni.getStorageSync(LEGACY_KEY)
    if (!raw) return
    legacyRaw = typeof raw === 'string' ? raw : JSON.stringify(raw)
    showLegacyDialog.value = true
  } catch { /* ignore */ }
}

function exportLegacy() {
  if (!legacyRaw) return
  const text = legacyRaw
  // #ifdef H5
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    uni.showToast({ title: '已复制到剪贴板', icon: 'none' })
  } catch {
    uni.showToast({ title: '复制失败', icon: 'none' })
  }
  // #endif
  // #ifndef H5
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '已复制到剪贴板', icon: 'none' }),
    fail: () => uni.showToast({ title: '复制失败', icon: 'none' }),
  })
  // #endif
}

function dismissLegacy() {
  try {
    uni.removeStorageSync(LEGACY_KEY)
    uni.setStorageSync(LEGACY_DISMISSED_KEY, '1')
  } catch { /* ignore */ }
  showLegacyDialog.value = false
}

onMounted(() => {
  detectLegacy()
})
</script>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  padding: 120rpx 48rpx 48rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12rpx;
  font-size: 48rpx;
  font-weight: 700;
  color: #1a73e8;
}
.brand-icon {
  font-size: 48rpx;
}
.subtitle {
  margin-top: 12rpx;
  font-size: 26rpx;
  color: #888;
}

.auto-login {
  margin-top: 120rpx;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.loading-text {
  font-size: 30rpx;
  color: #888;
}
.wx-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
  width: 100%;
  max-width: 480rpx;
}
.wx-field {
  width: 100%;
}
.nickname-input {
  text-align: center;
}
.wx-btn {
  width: 480rpx;
  height: 88rpx;
  line-height: 88rpx;
  background: #07c160;
  color: #fff;
  font-size: 32rpx;
  border-radius: 12rpx;
}
.fail-text {
  font-size: 26rpx;
  color: #e53935;
}
.retry-btn {
  width: 240rpx;
  height: 72rpx;
  line-height: 72rpx;
  background: #1a73e8;
  color: #fff;
  font-size: 28rpx;
  border-radius: 12rpx;
}

.tabs {
  display: flex;
  gap: 32rpx;
  margin-top: 48rpx;
  margin-bottom: 8rpx;
}
.tab {
  font-size: 30rpx;
  color: #888;
  padding: 12rpx 0;
  position: relative;
}
.tab.active {
  color: #1a73e8;
  font-weight: 600;
}
.tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4rpx;
  background: #1a73e8;
  border-radius: 2rpx;
}

.form {
  width: 100%;
  max-width: 640rpx;
  margin-top: 32rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}
.label {
  font-size: 26rpx;
  color: #555;
}
.input {
  height: 80rpx;
  padding: 0 24rpx;
  background: #fff;
  border: 2rpx solid #e0e0e0;
  border-radius: 12rpx;
  font-size: 30rpx;
}
.error {
  margin-top: -8rpx;
  color: #e53935;
  font-size: 26rpx;
}
.submit {
  margin-top: 16rpx;
  height: 88rpx;
  background: #1a73e8;
  color: #fff;
  font-size: 32rpx;
  border-radius: 12rpx;
  line-height: 88rpx;
}
.submit[disabled] {
  background: #a8c7f5;
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99;
}
.modal-card {
  width: 600rpx;
  padding: 40rpx;
  background: #fff;
  border-radius: 16rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.modal-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #333;
}
.modal-body {
  font-size: 28rpx;
  color: #555;
  line-height: 1.6;
}
.modal-actions {
  display: flex;
  gap: 16rpx;
}
.btn-primary,
.btn-secondary {
  flex: 1;
  height: 72rpx;
  line-height: 72rpx;
  font-size: 28rpx;
  border-radius: 10rpx;
}
.btn-primary {
  background: #1a73e8;
  color: #fff;
}
.btn-secondary {
  background: #f0f0f0;
  color: #333;
}
</style>
