<script setup lang="ts">
defineProps<{
  title: string
  message: string
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <view class="modal-mask" @click="emit('cancel')">
    <view class="modal-body" @click.stop>
      <text class="modal-title">{{ title }}</text>
      <text class="modal-message">{{ message }}</text>
      <view class="modal-actions">
        <button class="btn-cancel" @click="emit('cancel')">取消</button>
        <button class="btn-confirm" @click="emit('confirm')">确定</button>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}
.modal-body {
  width: 560rpx;
  background: #fff;
  border-radius: 24rpx;
  padding: 40rpx;
  text-align: center;
}
.modal-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
  display: block;
  margin-bottom: 20rpx;
}
.modal-message {
  font-size: 28rpx;
  color: #666;
  display: block;
  margin-bottom: 32rpx;
  line-height: 1.5;
}
.modal-actions {
  display: flex;
  gap: 20rpx;

  button {
    flex: 1;
    height: 76rpx;
    border-radius: 12rpx;
    font-size: 28rpx;
    border: none;
  }
  .btn-cancel {
    background: #f0f0f0;
    color: #666;
  }
  .btn-confirm {
    background: #e53935;
    color: #fff;
  }
}
</style>
