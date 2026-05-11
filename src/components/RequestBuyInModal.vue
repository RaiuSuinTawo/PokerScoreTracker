<script setup lang="ts">
/**
 * Buy-in modal — self-service (no approval needed).
 * Supports both adding (+) and removing (-) hands.
 */
import { ref, computed } from 'vue'

const props = withDefaults(
  defineProps<{
    nickname: string
    submitting?: boolean
    mode?: 'add' | 'remove'
  }>(),
  {
    submitting: false,
    mode: 'add',
  },
)

const emit = defineEmits<{
  submit: [payload: { hands: number; note?: string }]
  cancel: []
}>()

const hands = ref('1')
const note = ref('')

const isRemove = computed(() => props.mode === 'remove')

function bump(delta: number) {
  const v = Number(hands.value) || 0
  const next = Math.max(1, Math.min(1000, v + delta))
  hands.value = String(next)
}

function submit() {
  const n = Math.max(1, Math.min(1000, Math.round(Number(hands.value) || 0)))
  emit('submit', {
    hands: isRemove.value ? -n : n,
    note: note.value.trim() || undefined,
  })
}
</script>

<template>
  <view class="modal-mask" @click="emit('cancel')">
    <view class="modal-card" @click.stop>
      <text class="modal-title">{{ isRemove ? '减少带入' : '增加带入' }}</text>
      <text class="modal-sub">{{ nickname }}</text>

      <view class="field">
        <text class="label">{{ isRemove ? '减少手数' : '增加手数' }}</text>
        <view class="stepper">
          <text class="btn-round" @click="bump(-1)">−</text>
          <input v-model="hands" class="hands-input" type="number" />
          <text class="btn-round btn-plus" @click="bump(1)">+</text>
        </view>
      </view>

      <view class="field">
        <text class="label">备注（可选）</text>
        <input v-model="note" class="input" maxlength="120" placeholder="例如：re-buy / top-up" />
      </view>

      <view class="actions">
        <button class="btn-secondary" :disabled="submitting" @click="emit('cancel')">取消</button>
        <button
          :class="isRemove ? 'btn-danger' : 'btn-primary'"
          :disabled="submitting"
          @click="submit"
        >
          {{ submitting ? '提交中…' : isRemove ? '确认减少' : '确认带入' }}
        </button>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}
.modal-card {
  width: 600rpx;
  padding: 40rpx;
  background: #fff;
  border-radius: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.modal-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #333;
  text-align: center;
}
.modal-sub {
  font-size: 26rpx;
  color: #555;
  text-align: center;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}
.label {
  font-size: 26rpx;
  color: #666;
}
.stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32rpx;
  padding: 12rpx 0;
}
.btn-round {
  width: 64rpx;
  height: 64rpx;
  line-height: 60rpx;
  text-align: center;
  border: 2rpx solid #1a73e8;
  border-radius: 50%;
  font-size: 34rpx;
  color: #1a73e8;
}
.btn-plus {
  background: #1a73e8;
  color: #fff;
}
.hands-input {
  width: 140rpx;
  height: 64rpx;
  background: #f5f5f5;
  border: 2rpx solid #ddd;
  border-radius: 12rpx;
  font-size: 36rpx;
  font-weight: 700;
  text-align: center;
  color: #333;
}
.input {
  height: 72rpx;
  background: #f5f5f5;
  border: 2rpx solid #ddd;
  border-radius: 12rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
}
.actions {
  display: flex;
  gap: 16rpx;
  margin-top: 8rpx;
}
.btn-primary,
.btn-danger,
.btn-secondary {
  flex: 1;
  height: 76rpx;
  line-height: 76rpx;
  font-size: 28rpx;
  border-radius: 12rpx;
}
.btn-primary {
  background: #1a73e8;
  color: #fff;
}
.btn-primary[disabled] {
  background: #a8c7f5;
}
.btn-danger {
  background: #e53935;
  color: #fff;
}
.btn-danger[disabled] {
  background: #ef9a9a;
}
.btn-secondary {
  background: #f0f0f0;
  color: #333;
}
</style>
