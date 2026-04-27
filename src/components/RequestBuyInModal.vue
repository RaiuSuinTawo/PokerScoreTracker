<script setup lang="ts">
/**
 * Composer for a buy-in request (player-facing, or admin-self shortcut).
 * See EXPANSION_PLAN.md §8 Phase 5.
 *
 * Emits `submit({ hands, note? })` for the parent (detail page) to wire
 * through ledgerStore.requestBuyIn.
 */
import { ref } from 'vue'

const props = withDefaults(
  defineProps<{
    autoApprove?: boolean
    nickname: string
    submitting?: boolean
  }>(),
  {
    autoApprove: false,
    submitting: false,
  },
)

const emit = defineEmits<{
  submit: [payload: { hands: number; note?: string }]
  cancel: []
}>()

const hands = ref('1')
const note = ref('')

function bump(delta: number) {
  const v = Number(hands.value) || 0
  const next = Math.max(1, Math.min(1000, v + delta))
  hands.value = String(next)
}

function submit() {
  const n = Math.max(1, Math.min(1000, Math.round(Number(hands.value) || 0)))
  emit('submit', {
    hands: n,
    note: note.value.trim() || undefined,
  })
}
</script>

<template>
  <view class="modal-mask" @click="emit('cancel')">
    <view class="modal-card" @click.stop>
      <text class="modal-title">请求带入</text>
      <text class="modal-sub">
        {{ nickname }}
        <text v-if="autoApprove" class="auto-badge">自动批准</text>
        <text v-else class="pending-badge">待管理员审批</text>
      </text>

      <view class="field">
        <text class="label">增加手数</text>
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
        <button class="btn-primary" :disabled="submitting" @click="submit">
          {{ submitting ? '提交中…' : autoApprove ? '直接加入' : '发送申请' }}
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
  display: flex;
  gap: 8rpx;
  justify-content: center;
  align-items: center;
}
.auto-badge {
  background: #1a73e8;
  color: #fff;
  font-size: 22rpx;
  padding: 2rpx 12rpx;
  border-radius: 20rpx;
}
.pending-badge {
  background: #ff9800;
  color: #fff;
  font-size: 22rpx;
  padding: 2rpx 12rpx;
  border-radius: 20rpx;
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
.btn-secondary {
  background: #f0f0f0;
  color: #333;
}
</style>
