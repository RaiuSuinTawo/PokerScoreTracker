<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { Player } from '@/types'

/**
 * EditPlayerModal
 * -----------------------------------------------------
 *  Phase 4 gating props (see EXPANSION_PLAN.md §7.5):
 *    readonlyFields: which of nickname|buyInCount|chipAmount are read-only
 *    showDelete    : whether to render the "delete player" zone
 * -----------------------------------------------------
 *  Emits `save` with only the fields that are editable.
 *  The buy-in count spinner is only shown if buyInCount is NOT readonly.
 */
const props = withDefaults(
  defineProps<{
    player: Player
    readonlyFields?: Array<'nickname' | 'buyInCount' | 'chipAmount'>
    showDelete?: boolean
  }>(),
  {
    readonlyFields: () => ['buyInCount'] as Array<'nickname' | 'buyInCount' | 'chipAmount'>,
    showDelete: false,
  },
)

const emit = defineEmits<{
  save: [patch: Partial<{ nickname: string; buyInCount: number; chipAmount: number }>]
  remove: []
  cancel: []
}>()

const nickname = ref(props.player.nickname)
const buyInCount = ref(String(props.player.buyInCount))
const chipAmount = ref(String(props.player.chipAmount))

const roNickname = computed(() => props.readonlyFields?.includes('nickname'))
const roBuyIn = computed(() => props.readonlyFields?.includes('buyInCount'))
const roChip = computed(() => props.readonlyFields?.includes('chipAmount'))

// Sync when player prop changes
watch(
  () => props.player,
  (p) => {
    nickname.value = p.nickname
    buyInCount.value = String(p.buyInCount)
    chipAmount.value = String(p.chipAmount)
  },
  { immediate: true },
)

function increment() {
  if (roBuyIn.value) return
  const val = Number(buyInCount.value) || 0
  buyInCount.value = String(val + 1)
}
function decrement() {
  if (roBuyIn.value) return
  const val = Number(buyInCount.value) || 0
  if (val > 0) buyInCount.value = String(val - 1)
}

function confirm() {
  const patch: Partial<{ nickname: string; buyInCount: number; chipAmount: number }> = {}
  if (!roNickname.value) {
    const n = nickname.value.trim()
    if (n && n !== props.player.nickname) patch.nickname = n
  }
  if (!roBuyIn.value) {
    const b = Number(buyInCount.value)
    if (!isNaN(b) && Math.max(0, Math.round(b)) !== props.player.buyInCount) {
      patch.buyInCount = Math.max(0, Math.round(b))
    }
  }
  if (!roChip.value) {
    const c = Number(chipAmount.value)
    if (!isNaN(c) && Math.max(0, c) !== props.player.chipAmount) {
      patch.chipAmount = Math.max(0, c)
    }
  }
  emit('save', patch)
}

function confirmRemove() {
  uni.showModal({
    title: '删除玩家',
    content: `确认删除「${props.player.nickname}」？`,
    success(res) {
      if (res.confirm) emit('remove')
    },
  })
}
</script>

<template>
  <view class="modal-mask" @click="emit('cancel')">
    <view class="modal-body" @click.stop>
      <text class="modal-title">编辑玩家</text>

      <!-- Nickname -->
      <view class="field">
        <text class="field-label">昵称</text>
        <input
          v-model="nickname"
          class="field-input"
          :class="{ readonly: roNickname }"
          :disabled="roNickname"
          maxlength="12"
          placeholder="输入昵称"
        />
      </view>

      <!-- Buy-in count -->
      <view class="field">
        <text class="field-label">
          手数
          <text v-if="roBuyIn" class="field-hint">（需通过"请求带入"申请调整）</text>
        </text>
        <view class="buyin-control" v-if="!roBuyIn">
          <text class="btn-round" @click="decrement">−</text>
          <input v-model="buyInCount" class="buyin-input" type="number" />
          <text class="btn-round btn-plus" @click="increment">+</text>
        </view>
        <view class="buyin-readonly" v-else>
          <text class="buyin-readonly-value">{{ buyInCount }}</text>
        </view>
      </view>

      <!-- Chip amount -->
      <view class="field">
        <text class="field-label">
          码量
          <text v-if="roChip" class="field-hint">（仅管理员可录入）</text>
        </text>
        <input
          v-model="chipAmount"
          class="field-input"
          :class="{ readonly: roChip }"
          :disabled="roChip"
          type="digit"
          placeholder="输入剩余码量"
        />
      </view>

      <!-- Actions -->
      <view class="modal-actions">
        <button class="btn-cancel" @click="emit('cancel')">取消</button>
        <button class="btn-confirm" @click="confirm">保存</button>
      </view>

      <!-- Delete -->
      <view v-if="showDelete" class="delete-zone" @click="confirmRemove">
        <text class="delete-text">删除该玩家</text>
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
  width: 600rpx;
  background: #fff;
  border-radius: 24rpx;
  padding: 40rpx;
}

.modal-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #333;
  display: block;
  margin-bottom: 32rpx;
  text-align: center;
}

.field {
  margin-bottom: 24rpx;
}

.field-label {
  font-size: 26rpx;
  color: #666;
  display: block;
  margin-bottom: 12rpx;
}
.field-hint {
  font-size: 22rpx;
  color: #aaa;
  margin-left: 8rpx;
}

.field-input {
  height: 80rpx;
  background: #f5f5f5;
  border: 2rpx solid #ddd;
  border-radius: 12rpx;
  color: #333;
  padding: 0 20rpx;
  font-size: 30rpx;
}
.field-input.readonly {
  background: #eee;
  color: #888;
}

.buyin-control {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32rpx;
  padding: 12rpx 0;
}
.buyin-readonly {
  padding: 12rpx 0;
  text-align: center;
}
.buyin-readonly-value {
  font-size: 40rpx;
  font-weight: 700;
  color: #888;
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

.buyin-input {
  width: 120rpx;
  height: 64rpx;
  background: #f5f5f5;
  border: 2rpx solid #ddd;
  border-radius: 12rpx;
  font-size: 36rpx;
  font-weight: 700;
  text-align: center;
  color: #333;
}

.modal-actions {
  display: flex;
  gap: 20rpx;
  margin-top: 32rpx;

  button {
    flex: 1;
    height: 80rpx;
    border-radius: 12rpx;
    font-size: 30rpx;
    border: none;
  }
  .btn-cancel {
    background: #f0f0f0;
    color: #666;
  }
  .btn-confirm {
    background: #1a73e8;
    color: #fff;
  }
}

.delete-zone {
  margin-top: 24rpx;
  text-align: center;
  padding: 16rpx 0;
}

.delete-text {
  color: #e53935;
  font-size: 28rpx;
}
</style>
