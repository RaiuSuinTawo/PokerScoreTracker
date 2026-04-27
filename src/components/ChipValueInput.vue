<script setup lang="ts">
const props = defineProps<{
  chipValue: number
  chipMultiplier: number
  readonly?: boolean
}>()
const emit = defineEmits<{
  'update:chipValue': [val: number]
  'update:chipMultiplier': [val: number]
}>()

function onChipBlur(e: any) {
  if (props.readonly) return
  const val = Number(e.detail.value)
  if (val > 0) emit('update:chipValue', val)
}

function onMultiplierBlur(e: any) {
  if (props.readonly) return
  const val = Number(e.detail.value)
  if (val > 0) emit('update:chipMultiplier', val)
}
</script>

<template>
  <view class="chip-input-row">
    <view class="input-group">
      <text class="label">每手码量</text>
      <input
        type="number"
        :value="String(chipValue)"
        class="chip-input"
        :class="{ readonly }"
        :disabled="readonly"
        @blur="onChipBlur"
      />
    </view>
    <view class="input-group">
      <text class="label">筹码倍率</text>
      <input
        type="digit"
        :value="String(chipMultiplier)"
        class="chip-input"
        :class="{ readonly }"
        :disabled="readonly"
        @blur="onMultiplierBlur"
      />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.chip-input-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32rpx;
  padding: 16rpx 0;
}
.input-group {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.label {
  font-size: 28rpx;
  color: #666;
}
.chip-input {
  width: 160rpx;
  height: 72rpx;
  background: #fff;
  border: 2rpx solid #ddd;
  border-radius: 36rpx;
  color: #333;
  font-size: 32rpx;
  text-align: center;
  font-weight: 600;
}
.chip-input.readonly {
  background: #f5f5f5;
  color: #888;
}
</style>
