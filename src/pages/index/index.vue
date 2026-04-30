<script setup lang="ts">
/**
 * Ledger detail page (formerly the single-user accounting screen).
 * See EXPANSION_PLAN.md §8 Phase 4.
 *
 * Data flow:
 *  - onLoad(q.id) -> ledgerStore.load(id)
 *  - onShow       -> refresh + startPolling
 *  - onHide       -> stopPolling
 *  - onUnload     -> reset
 *
 * All mutations go through ledgerStore actions which hit the API
 * and kick the poller.
 */
import { ref, computed } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { useAuthStore } from '@/stores/authStore'
import { useLedgerStore } from '@/stores/ledgerStore'
import { requireAuth } from '@/utils/requireAuth'
import { ApiError } from '@/utils/http'
import type { PlayerDTO } from '@/api/types'
import type { Player, FinalProfitInfo } from '@/types'

import AppHeader from '@/components/AppHeader.vue'
import ChipValueInput from '@/components/ChipValueInput.vue'
import PlayerRow from '@/components/PlayerRow.vue'
import StatsBar from '@/components/StatsBar.vue'
import EditPlayerModal from '@/components/EditPlayerModal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import RequestBuyInModal from '@/components/RequestBuyInModal.vue'

const auth = useAuthStore()
const store = useLedgerStore()

const ledgerId = ref<string | null>(null)

// ── View state ──
const showPlayerModal = ref(false)
const editingPlayerId = ref<string | null>(null)
const showDeleteLedgerConfirm = ref(false)
const showArchiveConfirm = ref(false)
const showBuyInModal = ref(false)
const buyInTargetPlayerId = ref<string | null>(null)
const submittingBuyIn = ref(false)
const archiving = ref(false)

// ── Derived ──
const ledger = computed(() => store.ledger)
const settlement = computed(() => store.settlement)
const players = computed(() => ledger.value?.players ?? [])
const chipValue = computed(() => ledger.value?.chipValue ?? 200)
const chipMultiplier = computed(() => ledger.value?.chipMultiplier ?? 1)

/** Map server PlayerDTO → legacy Player shape expected by PlayerRow / EditPlayerModal. */
function toLegacy(p: PlayerDTO): Player {
  return {
    id: p.id,
    nickname: p.nickname,
    buyInCount: p.buyInCount,
    chipAmount: p.chipAmount,
    joinedAt: new Date(p.createdAt).getTime(),
  }
}

const legacyPlayers = computed<Player[]>(() => players.value.map(toLegacy))

const finalProfitMap = computed<Record<string, FinalProfitInfo>>(() => {
  const m: Record<string, FinalProfitInfo> = {}
  for (const p of settlement.value?.perPlayer ?? []) {
    m[p.playerId] = {
      playerId: p.playerId,
      nickname: p.nickname,
      rawProfit: p.rawProfit,
      expenseShare: p.expenseShare,
      finalProfit: p.finalProfit,
    }
  }
  return m
})

const totalUp = computed(() => settlement.value?.totalUp ?? 0)
const totalDown = computed(() => settlement.value?.totalDown ?? 0)
const totalSharedExpense = computed(() => settlement.value?.totalSharedExpense ?? 0)
const balanceDiff = computed(() => settlement.value?.balanceDiff ?? 0)
const isBalanced = computed(() => !!settlement.value?.isBalanced)

/** show P/L only when at least one cashout is non-zero */
const showProfit = computed(() => players.value.some((p) => p.chipAmount !== 0))
const editingPlayer = computed<Player | null>(() => {
  const id = editingPlayerId.value
  if (!id) return null
  const p = players.value.find((x) => x.id === id)
  return p ? toLegacy(p) : null
})

const editingReadonlyFields = computed<Array<'nickname' | 'buyInCount' | 'chipAmount'>>(() => {
  const id = editingPlayerId.value
  if (!id) return ['buyInCount']
  const fields: Array<'nickname' | 'buyInCount' | 'chipAmount'> = []
  if (!store.canEditNickname(id)) fields.push('nickname')
  // buyInCount: always read-only in the modal (goes through request flow — Phase 5)
  fields.push('buyInCount')
  if (!store.canEditChipAmount) fields.push('chipAmount')
  return fields
})

const modalShowDelete = computed(() => store.role === 'ADMIN' && !store.isArchived)

// ── Lifecycle ──
onLoad(async (q) => {
  if (!requireAuth()) return
  const id = (q as any)?.id as string | undefined
  if (!id) {
    uni.showToast({ title: '缺少账本参数', icon: 'none' })
    uni.reLaunch({ url: auth.PAGE_HOME })
    return
  }
  ledgerId.value = id
  try {
    await store.load(id)
    // load 成功后立即启动轮询，不依赖 onShow 的时序
    store.startPolling()
  } catch (err) {
    if (err instanceof ApiError) {
      uni.showToast({ title: err.message, icon: 'none' })
    }
    setTimeout(() => uni.reLaunch({ url: auth.PAGE_HOME }), 1500)
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
  store.reset()
})

// ── Actions ──
function openPlayerEdit(playerId: string) {
  editingPlayerId.value = playerId
  showPlayerModal.value = true
}

async function savePlayer(patch: Partial<{ nickname: string; buyInCount: number; chipAmount: number }>) {
  const id = editingPlayerId.value
  if (!id) return
  try {
    // buyInCount changes are ignored in this page; Phase 5 will add the request modal
    const { buyInCount: _drop, ...rest } = patch
    if (Object.keys(rest).length > 0) {
      await store.updatePlayer(id, rest)
    }
    showPlayerModal.value = false
    editingPlayerId.value = null
  } catch (err) {
    uni.showToast({
      title: err instanceof ApiError ? err.message : '保存失败',
      icon: 'none',
    })
  }
}

async function removePlayerCurrent() {
  const id = editingPlayerId.value
  if (!id) return
  try {
    await store.removePlayer(id)
    showPlayerModal.value = false
    editingPlayerId.value = null
  } catch (err) {
    uni.showToast({
      title: err instanceof ApiError ? err.message : '删除失败',
      icon: 'none',
    })
  }
}

async function onChipValueUpdate(v: number) {
  if (!store.canEditLedger) return
  try {
    await store.setChipValue(v)
  } catch (err) {
    uni.showToast({
      title: err instanceof ApiError ? err.message : '保存失败',
      icon: 'none',
    })
  }
}

async function onChipMultiplierUpdate(v: number) {
  if (!store.canEditLedger) return
  try {
    await store.setChipMultiplier(v)
  } catch (err) {
    uni.showToast({
      title: err instanceof ApiError ? err.message : '保存失败',
      icon: 'none',
    })
  }
}

/**
 * Admin +/- behaviour:
 *   '+' → open RequestBuyInModal for the targeted player with autoApprove=true
 *         if it's admin-self; otherwise admin still goes through the request
 *         table (auto-approved only for their own row per D3). In practice
 *         admins will usually click '+' on their own row to track their re-buys.
 *   '-' → not exposed in v1 (corrections go through reject/cancel of prior
 *         requests or admin-side DB if truly needed).
 */
async function directAdjustBuyIn(playerId: string, delta: 1 | -1) {
  if (delta !== 1) {
    uni.showToast({ title: '减手数请在收件箱中处理对应申请', icon: 'none' })
    return
  }
  openBuyInModal(playerId)
}

function requestBuyIn(playerId: string) {
  openBuyInModal(playerId)
}

function openBuyInModal(playerId: string) {
  buyInTargetPlayerId.value = playerId
  showBuyInModal.value = true
}

const buyInTargetNickname = computed(() => {
  const id = buyInTargetPlayerId.value
  if (!id) return ''
  return players.value.find((p) => p.id === id)?.nickname ?? ''
})

const buyInAutoApprove = computed(
  () => store.role === 'ADMIN' && buyInTargetPlayerId.value === store.myPlayerId,
)

async function submitBuyIn(payload: { hands: number; note?: string }) {
  submittingBuyIn.value = true
  try {
    const r = await store.requestBuyIn(payload.hands, payload.note)
    showBuyInModal.value = false
    buyInTargetPlayerId.value = null
    uni.showToast({
      title: r.status === 'APPROVED' ? '已加入' : '已发送申请',
      icon: 'none',
      duration: 1500,
    })
  } catch (err) {
    uni.showToast({
      title: err instanceof ApiError ? err.message : '发送失败',
      icon: 'none',
    })
  } finally {
    submittingBuyIn.value = false
  }
}

function cancelBuyIn() {
  if (submittingBuyIn.value) return
  showBuyInModal.value = false
  buyInTargetPlayerId.value = null
}

function goToBuyInRequests() {
  if (!ledgerId.value) return
  uni.navigateTo({ url: `/pages/buy-in-requests/index?id=${ledgerId.value}` })
}

function openArchiveConfirm() {
  showArchiveConfirm.value = true
}

async function doArchive() {
  archiving.value = true
  try {
    await store.archive()
    showArchiveConfirm.value = false
    uni.showToast({ title: '账本已归档', icon: 'none', duration: 1500 })
  } catch (err) {
    showArchiveConfirm.value = false
    uni.showToast({
      title: err instanceof ApiError ? err.message : '归档失败',
      icon: 'none',
      duration: 2500,
    })
  } finally {
    archiving.value = false
  }
}

function goToSharedExpense() {
  if (!ledgerId.value) return
  uni.navigateTo({ url: `/pages/shared-expense/index?id=${ledgerId.value}` })
}

function goBack() {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: auth.PAGE_HOME }) })
}

function copySerial() {
  if (!store.ledger) return
  uni.setClipboardData({
    data: store.ledger.serial,
    success: () => uni.showToast({ title: '序列号已复制', icon: 'none' }),
  })
}

function confirmDeleteLedger() {
  showDeleteLedgerConfirm.value = true
}

async function doDeleteLedger() {
  try {
    await store.deleteLedger()
    showDeleteLedgerConfirm.value = false
    uni.reLaunch({ url: auth.PAGE_HOME })
  } catch (err) {
    showDeleteLedgerConfirm.value = false
    uni.showToast({
      title: err instanceof ApiError ? err.message : '删除失败',
      icon: 'none',
    })
  }
}
</script>

<template>
  <view class="page" v-if="ledger">
    <AppHeader />

    <!-- Ledger meta -->
    <view class="ledger-meta">
      <view class="meta-left">
        <text class="title">{{ ledger.title }}</text>
        <view class="meta-tags">
          <text class="tag" :class="store.role === 'ADMIN' ? 'tag-admin' : 'tag-player'">
            {{ store.role === 'ADMIN' ? '管理员' : '玩家' }}
          </text>
          <text class="tag tag-serial" @click="copySerial">{{ ledger.serial }} 📋</text>
          <text v-if="store.isArchived" class="tag tag-archived">已归档</text>
        </view>
      </view>
      <view class="meta-right">
        <button class="icon-btn" size="mini" @click="goBack">返回</button>
        <button class="icon-btn" size="mini" @click="goToBuyInRequests">
          申请
          <text v-if="store.pendingCount > 0" class="badge">{{ store.pendingCount }}</text>
        </button>
        <button
          v-if="store.canDeleteLedger"
          class="icon-btn danger"
          size="mini"
          @click="confirmDeleteLedger"
        >删除</button>
      </view>
    </view>

    <view v-if="store.isArchived" class="archived-banner">
      账本已归档，仅可查看，不可修改
    </view>

    <ChipValueInput
      :chip-value="chipValue"
      :chip-multiplier="chipMultiplier"
      :readonly="!store.canEditLedger"
      @update:chip-value="onChipValueUpdate"
      @update:chip-multiplier="onChipMultiplierUpdate"
    />

    <!-- Table header -->
    <view class="table-header">
      <text class="col-nick">玩家</text>
      <text class="col-buyin">手数</text>
      <text class="col-chips">码量</text>
      <text class="col-expense">公摊</text>
      <text class="col-profit">盈亏</text>
    </view>

    <view v-if="players.length === 0" class="empty">
      <text class="empty-text">等待玩家加入…</text>
      <text class="empty-hint" @click="copySerial">点击复制序列号 {{ ledger.serial }} 发给朋友</text>
    </view>

    <view v-else class="player-list">
      <PlayerRow
        v-for="p in legacyPlayers"
        :key="p.id"
        :player="p"
        :chip-value="chipValue"
        :final-profit="finalProfitMap[p.id]"
        :is-initial="!showProfit"
        :can-edit-nickname="store.canEditNickname(p.id)"
        :can-adjust-buy-in="store.buyInControlMode(p.id)"
        :can-edit-chip-amount="store.canEditChipAmount"
        :is-my-row="p.id === store.myPlayerId"
        @open-edit="openPlayerEdit"
        @increment="() => directAdjustBuyIn(p.id, 1)"
        @decrement="() => directAdjustBuyIn(p.id, -1)"
        @request-buy-in="requestBuyIn"
      />
    </view>

    <StatsBar
      :total-up="totalUp"
      :total-shared-expense="totalSharedExpense"
      :total-down="totalDown"
      :balance-diff="balanceDiff"
      :is-balanced="isBalanced"
      :show-balance="showProfit"
    />

    <!-- Footer actions -->
    <view class="footer-actions">
      <button class="footer-btn secondary" @click="goToBuyInRequests">
        带入申请
        <text v-if="store.pendingCount > 0" class="badge">{{ store.pendingCount }}</text>
      </button>
      <button class="footer-btn" @click="goToSharedExpense">公摊开销</button>
      <button
        v-if="store.role === 'ADMIN' && !store.isArchived"
        class="footer-btn archive"
        :disabled="!store.canArchive"
        @click="openArchiveConfirm"
      >归档</button>
    </view>

    <!-- Edit modal -->
    <EditPlayerModal
      v-if="showPlayerModal && editingPlayer"
      :player="editingPlayer"
      :readonly-fields="editingReadonlyFields"
      :show-delete="modalShowDelete"
      @save="savePlayer"
      @remove="removePlayerCurrent"
      @cancel="showPlayerModal = false; editingPlayerId = null"
    />

    <!-- Request buy-in modal -->
    <RequestBuyInModal
      v-if="showBuyInModal"
      :nickname="buyInTargetNickname"
      :auto-approve="buyInAutoApprove"
      :submitting="submittingBuyIn"
      @submit="submitBuyIn"
      @cancel="cancelBuyIn"
    />

    <!-- Delete ledger confirm -->
    <ConfirmDialog
      v-if="showDeleteLedgerConfirm"
      title="删除账本"
      :message="`确认删除账本「${ledger.title}」（${ledger.serial}）？此操作不可撤销。`"
      @confirm="doDeleteLedger"
      @cancel="showDeleteLedgerConfirm = false"
    />

    <!-- Archive confirm -->
    <ConfirmDialog
      v-if="showArchiveConfirm"
      title="归档账本"
      :message="`归档后账本将转为只读，所有玩家、公摊、带入申请都不可再修改。确认归档「${ledger.title}」？`"
      @confirm="doArchive"
      @cancel="showArchiveConfirm = false"
    />
  </view>

  <view v-else class="loading-page">
    <text>加载中…</text>
  </view>
</template>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding-bottom: 120rpx;
}
.loading-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
}
.ledger-meta {
  padding: 16rpx 32rpx;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16rpx;
}
.meta-left {
  flex: 1;
}
.title {
  font-size: 32rpx;
  font-weight: 700;
  color: #333;
  display: block;
}
.meta-tags {
  display: flex;
  gap: 8rpx;
  margin-top: 8rpx;
  flex-wrap: wrap;
}
.tag {
  padding: 3rpx 12rpx;
  font-size: 22rpx;
  border-radius: 20rpx;
}
.tag-admin {
  background: #1a73e8;
  color: #fff;
}
.tag-player {
  background: #e8f0fe;
  color: #1a73e8;
}
.tag-serial {
  background: #fff;
  color: #333;
  border: 1rpx solid #ddd;
  font-family: monospace;
  letter-spacing: 2rpx;
  font-size: 28rpx;
  font-weight: 600;
  padding: 4rpx 16rpx;
}
.tag-archived {
  background: #eee;
  color: #888;
}
.meta-right {
  display: flex;
  gap: 8rpx;
}
.icon-btn {
  font-size: 22rpx;
  background: #fff;
  color: #666;
  border: 1rpx solid #ddd;
  position: relative;
}
.icon-btn.danger {
  color: #e53935;
  border-color: #e53935;
}
.icon-btn .badge {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  background: #e53935;
  color: #fff;
  font-size: 18rpx;
  min-width: 28rpx;
  height: 28rpx;
  line-height: 28rpx;
  border-radius: 14rpx;
  padding: 0 6rpx;
}
.archived-banner {
  margin: 12rpx 32rpx;
  padding: 16rpx;
  background: #fff3e0;
  color: #e65100;
  text-align: center;
  font-size: 26rpx;
  border-radius: 12rpx;
}
.table-header {
  display: flex;
  padding: 16rpx 0;
  background: #fafafa;
  border-bottom: 2rpx solid #eee;

  text {
    font-size: 24rpx;
    color: #888;
    text-align: center;
  }
  .col-nick { flex: 1.3; padding-left: 24rpx; text-align: left; }
  .col-buyin { flex: 1.8; }
  .col-chips { flex: 1.2; }
  .col-expense { flex: 1; }
  .col-profit { flex: 1.2; padding-right: 24rpx; text-align: right; }
}
.empty {
  padding: 120rpx 0;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.empty-text {
  font-size: 28rpx;
  color: #aaa;
}
.empty-hint {
  font-size: 24rpx;
  color: #ccc;
  font-family: monospace;
}
.player-list {
  padding: 0 24rpx;
  background: #fff;
}
.footer-actions {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16rpx 24rpx calc(16rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1rpx solid #eee;
  display: flex;
  gap: 16rpx;
}
.footer-btn {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  background: #1a73e8;
  color: #fff;
  font-size: 28rpx;
  border-radius: 12rpx;
  position: relative;
}
.footer-btn.secondary {
  background: #fff;
  color: #1a73e8;
  border: 2rpx solid #1a73e8;
}
.footer-btn.archive {
  background: #2e7d32;
  color: #fff;
}
.footer-btn.archive[disabled] {
  background: #c8e6c9;
  color: #fff;
}
.footer-btn .badge {
  position: absolute;
  top: -10rpx;
  right: 12rpx;
  background: #e53935;
  color: #fff;
  font-size: 20rpx;
  min-width: 32rpx;
  height: 32rpx;
  line-height: 32rpx;
  border-radius: 16rpx;
  padding: 0 8rpx;
}
</style>
