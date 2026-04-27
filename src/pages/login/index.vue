<template>
  <view class="login-page">
    <view class="brand">
      <text class="brand-icon">♠</text>
      <text class="brand-title">德扑记账</text>
      <text class="brand-icon">♠</text>
    </view>
    <view class="subtitle">请登录继续</view>

    <view class="form">
      <view class="field">
        <text class="label">账号</text>
        <input
          class="input"
          v-model="username"
          placeholder="由管理员分配"
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
      <button class="submit" :disabled="!canSubmit || loading" @click="submit">
        {{ loading ? '登录中…' : '登录' }}
      </button>
    </view>

    <view class="hint">
      账号由管理员预配置，无注册功能。<br />
      忘记密码请联系管理员重置。
    </view>

    <!-- Legacy data export dialog (§5 of plan) -->
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

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

const auth = useAuthStore()

const canSubmit = computed(() => username.value.trim().length > 0 && password.value.length > 0)

async function submit() {
  if (!canSubmit.value || loading.value) return
  loading.value = true
  error.value = ''
  try {
    await auth.login(username.value.trim(), password.value)
    if (auth.mustChangePwd) {
      uni.reLaunch({ url: auth.PAGE_CHANGE_PWD })
    } else {
      uni.reLaunch({ url: auth.PAGE_HOME })
    }
  } catch (err) {
    if (err instanceof ApiError) {
      error.value = err.message || '登录失败'
    } else {
      error.value = '登录失败，请重试'
    }
  } finally {
    loading.value = false
  }
}

// ---- Legacy local data detection & export dialog (§5) ----
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
  } catch {
    /* ignore */
  }
}

function buildLegacyExport(raw: string): string {
  // Attempt to shape like original `#HOLDEM#<JSON>#END#`; fall back to raw if malformed.
  try {
    const parsed = JSON.parse(raw)
    const session = parsed?.sessions?.[0] ?? parsed
    const compact = {
      v: 1,
      cv: session.chipValue ?? 200,
      cm: session.chipMultiplier ?? 1,
      p: (session.players ?? []).map((pl: any) => ({
        n: pl.nickname,
        b: pl.buyInCount,
        c: pl.chipAmount,
      })),
      e: (session.sharedExpenses ?? []).map((ex: any) => ({
        l: ex.label,
        a: ex.amount,
      })),
    }
    return `#HOLDEM#${JSON.stringify(compact)}#END#`
  } catch {
    return raw
  }
}

function exportLegacy() {
  if (!legacyRaw) return
  const text = buildLegacyExport(legacyRaw)
  // Try clipboard (native + H5)
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
    uni.showToast({ title: '复制失败，请手动保存', icon: 'none' })
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
  } catch {
    /* ignore */
  }
  showLegacyDialog.value = false
}

onMounted(() => {
  detectLegacy()
})
onShow(() => {
  // If user somehow lands here while already authed, bounce to home.
  if (auth.isAuthenticated && !auth.mustChangePwd) {
    uni.reLaunch({ url: auth.PAGE_HOME })
  }
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
.form {
  width: 100%;
  max-width: 640rpx;
  margin-top: 64rpx;
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
.hint {
  margin-top: 48rpx;
  font-size: 24rpx;
  color: #999;
  text-align: center;
  line-height: 1.6;
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
