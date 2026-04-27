<template>
  <view class="page">
    <view class="header">
      <text class="title">修改密码</text>
      <text v-if="forced" class="subtitle">首次登录，请先修改初始密码</text>
    </view>

    <view class="form">
      <view class="field">
        <text class="label">当前密码</text>
        <input
          class="input"
          type="password"
          v-model="oldPassword"
          placeholder="请输入当前密码"
          maxlength="256"
          :disabled="loading"
        />
      </view>
      <view class="field">
        <text class="label">新密码</text>
        <input
          class="input"
          type="password"
          v-model="newPassword"
          placeholder="不少于 8 位"
          maxlength="256"
          :disabled="loading"
        />
      </view>
      <view class="field">
        <text class="label">确认新密码</text>
        <input
          class="input"
          type="password"
          v-model="confirmPassword"
          placeholder="再次输入新密码"
          maxlength="256"
          :disabled="loading"
        />
      </view>
      <view v-if="error" class="error">{{ error }}</view>
      <button class="submit" :disabled="!canSubmit || loading" @click="submit">
        {{ loading ? '提交中…' : '确认修改' }}
      </button>
      <button v-if="!forced" class="cancel" :disabled="loading" @click="cancel">返回</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from '@/utils/http'

const auth = useAuthStore()

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')

const forced = computed(() => auth.mustChangePwd)

const canSubmit = computed(
  () =>
    oldPassword.value.length >= 1 &&
    newPassword.value.length >= 8 &&
    newPassword.value === confirmPassword.value,
)

async function submit() {
  if (!canSubmit.value || loading.value) return
  if (newPassword.value === oldPassword.value) {
    error.value = '新密码不能与旧密码相同'
    return
  }
  loading.value = true
  error.value = ''
  try {
    await auth.changePassword(oldPassword.value, newPassword.value)
    uni.showToast({ title: '修改成功，请重新登录', icon: 'none', duration: 1500 })
    setTimeout(() => {
      uni.reLaunch({ url: auth.PAGE_LOGIN })
    }, 1200)
  } catch (err) {
    if (err instanceof ApiError) {
      error.value = err.message || '修改失败'
    } else {
      error.value = '修改失败，请重试'
    }
  } finally {
    loading.value = false
  }
}

function cancel() {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: auth.PAGE_HOME }) })
}
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 80rpx 48rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 48rpx;
}
.title {
  font-size: 40rpx;
  font-weight: 700;
  color: #333;
}
.subtitle {
  font-size: 26rpx;
  color: #ff9800;
}
.form {
  width: 100%;
  max-width: 640rpx;
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
.cancel {
  height: 72rpx;
  background: transparent;
  color: #888;
  font-size: 28rpx;
  line-height: 72rpx;
}
</style>
