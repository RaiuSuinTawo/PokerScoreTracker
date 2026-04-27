<script setup lang="ts">
import { computed } from 'vue'
import type { Player, FinalProfitInfo } from '@/types'

/**
 * PlayerRow
 * -------------------------------------------------------------------
 *  Phase 4 gating props (see EXPANSION_PLAN.md §7.5):
 *    canEditNickname     — show-edit on row tap only allowed if true
 *    canAdjustBuyIn      — 'direct' (admin) | 'request' (own) | 'none'
 *    canEditChipAmount   — admin-only (D2)
 *    isMyRow             — highlight accent for the current user's row
 * -------------------------------------------------------------------
 */
const props = defineProps<{
  player: Player
  chipValue: number
  finalProfit: FinalProfitInfo | undefined
  isInitial: boolean
  canEditNickname?: boolean
  canAdjustBuyIn?: 'direct' | 'request' | 'none'
  canEditChipAmount?: boolean
  isMyRow?: boolean
}>()

const emit = defineEmits<{
  'open-edit': [playerId: string]
  increment: []
  decrement: []
  'request-buy-in': [playerId: string]
}>()

const expenseShare = computed(() => props.finalProfit?.expenseShare ?? 0)
const profit = computed(() => props.finalProfit?.finalProfit ?? 0)
const profitColor = computed(() =>
  profit.value > 0 ? '#e53935' : profit.value < 0 ? '#2e7d32' : '#888',
)

const stepperMode = computed<'direct' | 'request' | 'none'>(
  () => props.canAdjustBuyIn ?? 'none',
)
const canOpenEdit = computed(
  () => !!props.canEditNickname || !!props.canEditChipAmount,
)

function onRowTap() {
  if (!canOpenEdit.value) return
  emit('open-edit', props.player.id)
}

function onIncrement() {
  if (stepperMode.value === 'direct') emit('increment')
  else if (stepperMode.value === 'request') emit('request-buy-in', props.player.id)
}

function onDecrement() {
  if (stepperMode.value === 'direct') emit('decrement')
}
</script>

<template>
  <view class="player-row" :class="{ my: isMyRow, clickable: canOpenEdit }" @click="onRowTap">
    <!-- Nickname -->
    <view class="col-nick">
      <text class="nickname">{{ player.nickname }}</text>
      <text v-if="isMyRow" class="me-tag">我</text>
    </view>

    <!-- Buy-in count with conditional stepper -->
    <view class="col-buyin">
      <template v-if="stepperMode === 'direct'">
        <text class="btn-round" @click.stop="onDecrement">−</text>
        <text class="buyin-count">{{ player.buyInCount }}</text>
        <text class="btn-round btn-plus" @click.stop="onIncrement">+</text>
      </template>
      <template v-else-if="stepperMode === 'request'">
        <text class="buyin-count">{{ player.buyInCount }}</text>
        <text class="btn-round btn-plus btn-request" @click.stop="onIncrement">+</text>
      </template>
      <template v-else>
        <text class="buyin-count readonly">{{ player.buyInCount }}</text>
      </template>
    </view>

    <!-- Chip amount -->
    <view class="col-chips">
      <text class="chip-amount">{{ player.chipAmount }}</text>
    </view>

    <!-- Shared expense share -->
    <view class="col-expense">
      <text class="expense-value" :class="{ 'has-expense': expenseShare > 0 }">
        {{ expenseShare > 0 ? expenseShare : '-' }}
      </text>
    </view>

    <!-- Profit/loss -->
    <view class="col-profit">
      <template v-if="!isInitial">
        <text :style="{ color: profitColor }" class="profit-value">
          {{ profit }}
        </text>
      </template>
      <text v-else class="profit-value" style="color: #ccc">-</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.player-row {
  display: flex;
  align-items: center;
  padding: 24rpx 0;
  border-bottom: 1rpx solid #eee;
  background: #fff;
}
.player-row.my {
  background: #f5faff;
}
.player-row.clickable {
  cursor: pointer;
}

.col-nick {
  flex: 1.3;
  display: flex;
  align-items: center;
  gap: 8rpx;

  .nickname {
    color: #1a73e8;
    font-size: 30rpx;
    font-weight: 600;
  }
  .me-tag {
    font-size: 20rpx;
    background: #1a73e8;
    color: #fff;
    padding: 2rpx 8rpx;
    border-radius: 8rpx;
  }
}

.col-buyin {
  flex: 1.8;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;

  .btn-round {
    width: 44rpx;
    height: 44rpx;
    line-height: 40rpx;
    text-align: center;
    border: 2rpx solid #1a73e8;
    border-radius: 50%;
    font-size: 28rpx;
    color: #1a73e8;
  }
  .btn-plus {
    background: #1a73e8;
    color: #fff;
  }
  .btn-request {
    background: #ff9800;
    border-color: #ff9800;
  }

  .buyin-count {
    font-size: 32rpx;
    min-width: 40rpx;
    text-align: center;
    font-weight: 600;
  }
  .buyin-count.readonly {
    color: #888;
  }
}

.col-chips {
  flex: 1.2;
  text-align: center;
  .chip-amount {
    color: #333;
    font-size: 30rpx;
  }
}

.col-expense {
  flex: 1;
  text-align: center;

  .expense-value {
    font-size: 26rpx;
    color: #ccc;
  }
  .has-expense {
    color: #ff9800;
    font-weight: 600;
  }
}

.col-profit {
  flex: 1.2;
  text-align: right;

  .profit-value {
    font-size: 30rpx;
    font-weight: 700;
  }
}
</style>
