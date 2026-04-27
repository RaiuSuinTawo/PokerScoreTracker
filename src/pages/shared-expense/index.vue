<script setup lang="ts">
/**
 * Shared expense page.
 * See EXPANSION_PLAN.md §8 Phase 4.
 *
 * Reads ledger & settlement via ledgerStore; mutations gated by canEditLedger.
 * The page is navigated to from the detail page with ?id=<ledgerId>.
 */
import { ref, computed } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { useLedgerStore } from '@/stores/ledgerStore'
import { useAuthStore } from '@/stores/authStore'
import { requireAuth } from '@/utils/requireAuth'
import { ApiError } from '@/utils/http'

const auth = useAuthStore()
const store = useLedgerStore()

const expenses = computed(() => store.ledger?.expenses ?? [])
const players = computed(() => store.ledger?.players ?? [])
const settlement = computed(() => store.settlement)
const totalSharedExpense = computed(() => settlement.value?.totalSharedExpense ?? 0)

/** Players with non-zero expenseShare — derived from authoritative settlement. */
const allocations = computed(() => {
  const perPlayer = settlement.value?.perPlayer ?? []
  const byId = Object.fromEntries(players.value.map((p) => [p.id, p]))
  return perPlayer
    .filter((p) => p.expenseShare > 0)
    .map((p) => ({
      playerId: p.playerId,
      playerNickname: byId[p.playerId]?.nickname ?? p.nickname,
      originalProfit: p.rawProfit,
      expenseShare: p.expenseShare,
      adjustedProfit: p.finalProfit,
    }))
})

const canWrite = computed(() => store.canEditLedger)

// ── Add expense form ──
const newLabel = ref('')
const newAmount = ref('')

async function addExpense() {
  if (!canWrite.value) return
  const amount = Number(newAmount.value)
  if (!newLabel.value.trim() || !amount || amount <= 0) {
    uni.showToast({ title: '请输入有效的名称和金额', icon: 'none' })
    return
  }
  try {
    await store.addExpense(newLabel.value.trim(), amount)
    newLabel.value = ''
    newAmount.value = ''
  } catch (err) {
    uni.showToast({
      title: err instanceof ApiError ? err.message : '保存失败',
      icon: 'none',
    })
  }
}

function removeExpense(id: string) {
  if (!canWrite.value) return
  uni.showModal({
    title: '删除开销',
    content: '确认删除此项开销？',
    async success(res) {
      if (!res.confirm) return
      try {
        await store.removeExpense(id)
      } catch (err) {
        uni.showToast({
          title: err instanceof ApiError ? err.message : '删除失败',
          icon: 'none',
        })
      }
    },
  })
}

// ── Edit expense ──
const showEditModal = ref(false)
const editingExpenseId = ref<string | null>(null)
const editLabel = ref('')
const editAmount = ref('')

function openEditExpense(id: string, label: string, amount: number) {
  if (!canWrite.value) return
  editingExpenseId.value = id
  editLabel.value = label
  editAmount.value = String(amount)
  showEditModal.value = true
}

async function saveEditExpense() {
  if (!canWrite.value) return
  const amount = Number(editAmount.value)
  if (!editLabel.value.trim() || !amount || amount <= 0) {
    uni.showToast({ title: '请输入有效的名称和金额', icon: 'none' })
    return
  }
  if (!editingExpenseId.value) return
  try {
    await store.updateExpense(editingExpenseId.value, {
      label: editLabel.value.trim(),
      amount,
    })
    showEditModal.value = false
  } catch (err) {
    uni.showToast({
      title: err instanceof ApiError ? err.message : '保存失败',
      icon: 'none',
    })
  }
}

// ── Quick-add presets ──
const presets = ['房费', '餐饮', '饮料', '其他']
function pickPreset(label: string) {
  if (!canWrite.value) return
  newLabel.value = label
}

// ── Lifecycle: if user navigated here directly (deep link) we need to load. ──
onLoad((q) => {
  if (!requireAuth()) return
  const id = (q as any)?.id as string | undefined
  if (!id) {
    // Maybe user navigated from the detail page where the store is already loaded.
    if (!store.ledger) {
      uni.showToast({ title: '缺少账本参数', icon: 'none' })
      setTimeout(() => uni.navigateBack({ fail: () => uni.reLaunch({ url: auth.PAGE_HOME }) }), 800)
    }
    return
  }
  if (!store.ledger || store.ledger.id !== id) {
    void store.load(id).catch((err) => {
      if (err instanceof ApiError) uni.showToast({ title: err.message, icon: 'none' })
    })
  }
})

onShow(() => {
  if (store.ledger) {
    void store.refresh()
    store.startPolling()
  }
})
onHide(() => {
  store.stopPolling()
})
onUnload(() => {
  // Don't reset — the detail page is still holding the same ledger.
})
</script>

<template>
  <view class="page">
    <view v-if="!canWrite" class="readonly-banner">
      <text>{{ store.isArchived ? '账本已归档，仅可查看' : '仅管理员可管理公摊开销' }}</text>
    </view>

    <!-- Expense input form -->
    <view class="form-card" v-if="canWrite">
      <text class="section-title">添加公摊开销</text>

      <view class="preset-row">
        <text
          v-for="label in presets"
          :key="label"
          class="preset-chip"
          :class="{ active: newLabel === label }"
          @click="pickPreset(label)"
        >
          {{ label }}
        </text>
      </view>

      <view class="input-row">
        <input v-model="newLabel" class="input-field" placeholder="开销名称" maxlength="20" />
        <input v-model="newAmount" class="input-field amount" type="digit" placeholder="金额" />
        <button class="btn-add" @click="addExpense">添加</button>
      </view>
    </view>

    <!-- Expense list -->
    <view class="section-card" v-if="expenses.length > 0">
      <text class="section-title">开销明细</text>
      <view v-for="item in expenses" :key="item.id" class="expense-item">
        <text class="expense-label" @click="openEditExpense(item.id, item.label, item.amount)">{{ item.label }}</text>
        <text class="expense-amount" @click="openEditExpense(item.id, item.label, item.amount)">¥{{ item.amount }}</text>
        <template v-if="canWrite">
          <text class="edit-btn" @click="openEditExpense(item.id, item.label, item.amount)">编辑</text>
          <text class="remove-btn" @click="removeExpense(item.id)">删除</text>
        </template>
      </view>
      <view class="total-row">
        <text>合计</text>
        <text class="total-amount">¥{{ totalSharedExpense }}</text>
      </view>
    </view>

    <!-- Allocation preview -->
    <view class="section-card" v-if="allocations.length > 0">
      <text class="section-title">分摊预览（按盈利比例）</text>
      <view class="alloc-header">
        <text class="alloc-col">玩家</text>
        <text class="alloc-col">盈利</text>
        <text class="alloc-col">应摊</text>
        <text class="alloc-col">摊后盈利</text>
      </view>
      <view v-for="alloc in allocations" :key="alloc.playerId" class="alloc-row">
        <text class="alloc-col name-col">{{ alloc.playerNickname }}</text>
        <text class="alloc-col green-text">+{{ alloc.originalProfit }}</text>
        <text class="alloc-col orange-text">-{{ alloc.expenseShare }}</text>
        <text class="alloc-col green-text">+{{ alloc.adjustedProfit }}</text>
      </view>
    </view>

    <!-- Empty states -->
    <view v-if="players.length === 0" class="empty-hint">
      <text>请先回账本添加玩家</text>
    </view>
    <view v-else-if="allocations.length === 0 && expenses.length > 0" class="empty-hint">
      <text>当前无盈利玩家，无法分摊开销</text>
    </view>

    <!-- Edit expense modal -->
    <view v-if="showEditModal" class="modal-mask" @click="showEditModal = false">
      <view class="modal-body" @click.stop>
        <text class="modal-title">编辑开销</text>
        <view class="modal-field">
          <text class="modal-label">名称</text>
          <input v-model="editLabel" class="modal-input" maxlength="20" />
        </view>
        <view class="modal-field">
          <text class="modal-label">金额</text>
          <input v-model="editAmount" class="modal-input" type="digit" />
        </view>
        <view class="modal-actions">
          <button class="btn-cancel" @click="showEditModal = false">取消</button>
          <button class="btn-confirm" @click="saveEditExpense">确定</button>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24rpx;
}
.readonly-banner {
  background: #fff3e0;
  color: #e65100;
  padding: 16rpx;
  text-align: center;
  font-size: 26rpx;
  border-radius: 12rpx;
  margin-bottom: 16rpx;
}

.form-card, .section-card {
  background: #fff;
  border-radius: 20rpx;
  padding: 28rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.05);
}

.section-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #333;
  margin-bottom: 20rpx;
  display: block;
}

.preset-row {
  display: flex;
  gap: 16rpx;
  margin-bottom: 20rpx;
  flex-wrap: wrap;
}

.preset-chip {
  padding: 10rpx 28rpx;
  background: #f0f0f0;
  border-radius: 28rpx;
  font-size: 26rpx;
  color: #666;
  &.active {
    background: #1a73e8;
    color: #fff;
  }
}

.input-row {
  display: flex;
  gap: 16rpx;
}

.input-field {
  flex: 1;
  height: 76rpx;
  background: #f5f5f5;
  border: 2rpx solid #ddd;
  border-radius: 12rpx;
  padding: 0 20rpx;
  color: #333;
  font-size: 28rpx;
  &.amount {
    flex: 0.6;
  }
}

.btn-add {
  flex: 0 0 120rpx;
  background: #1a73e8;
  color: #fff;
  border: none;
  border-radius: 12rpx;
  height: 76rpx;
  line-height: 76rpx;
  font-size: 28rpx;
}

.expense-item {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
}

.expense-label {
  flex: 1;
  font-size: 28rpx;
  color: #333;
}

.expense-amount {
  flex: 0 0 120rpx;
  text-align: right;
  color: #e53935;
  font-weight: 600;
  font-size: 28rpx;
}

.edit-btn {
  flex: 0 0 64rpx;
  text-align: center;
  color: #1a73e8;
  font-size: 26rpx;
  margin-left: 12rpx;
}

.remove-btn {
  flex: 0 0 64rpx;
  text-align: right;
  color: #e53935;
  font-size: 26rpx;
}

.total-row {
  display: flex;
  justify-content: space-between;
  padding-top: 20rpx;
  font-weight: 600;
  color: #333;
}

.total-amount {
  color: #e53935;
  font-size: 32rpx;
}

.alloc-header {
  display: flex;
  padding-bottom: 16rpx;
  border-bottom: 1rpx solid #eee;
}

.alloc-col {
  flex: 1;
  font-size: 24rpx;
  color: #999;
  text-align: center;
}

.alloc-row {
  display: flex;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f8f8f8;

  .alloc-col {
    flex: 1;
    text-align: center;
    font-size: 28rpx;
    color: #333;
  }

  .name-col {
    color: #1a73e8;
    font-weight: 500;
  }

  .green-text {
    color: #2e7d32;
  }

  .orange-text {
    color: #ff9800;
  }
}

.empty-hint {
  text-align: center;
  color: #bbb;
  padding: 80rpx 0;
  font-size: 28rpx;
}

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
}

.modal-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
  display: block;
  margin-bottom: 28rpx;
  text-align: center;
}

.modal-field {
  margin-bottom: 20rpx;
}

.modal-label {
  font-size: 26rpx;
  color: #666;
  display: block;
  margin-bottom: 8rpx;
}

.modal-input {
  height: 80rpx;
  background: #f5f5f5;
  border: 2rpx solid #ddd;
  border-radius: 12rpx;
  color: #333;
  padding: 0 20rpx;
  font-size: 30rpx;
}

.modal-actions {
  display: flex;
  gap: 20rpx;
  margin-top: 32rpx;

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
    background: #1a73e8;
    color: #fff;
  }
}
</style>
