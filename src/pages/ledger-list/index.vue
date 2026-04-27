<template>
  <view class="page">
    <view class="topbar">
      <view>
        <text class="title">我的账本</text>
        <text class="subtitle">{{ user?.displayName }}（{{ user?.username }}）</text>
      </view>
      <view class="topbar-actions">
        <button class="logout-btn" size="mini" @click="goProfile">我的</button>
        <button class="logout-btn" size="mini" @click="handleLogout">退出</button>
      </view>
    </view>

    <view class="tabs">
      <view
        class="tab"
        :class="{ active: currentTab === 'active' }"
        @click="currentTab = 'active'"
      >进行中 <text class="count" v-if="store.active.length">{{ store.active.length }}</text></view>
      <view
        class="tab"
        :class="{ active: currentTab === 'archived' }"
        @click="currentTab = 'archived'"
      >已归档 <text class="count" v-if="store.archived.length">{{ store.archived.length }}</text></view>
    </view>

    <view v-if="store.isLoading && !visibleList.length" class="loading">加载中…</view>
    <view v-else-if="!visibleList.length" class="empty">
      <text class="empty-icon">♠</text>
      <text class="empty-text">{{ currentTab === 'active' ? '还没有账本，点下方按钮创建或加入' : '暂无已归档账本' }}</text>
    </view>
    <view v-else class="list">
      <LedgerCard
        v-for="l in visibleList"
        :key="l.id"
        :ledger="l"
        @tap="openLedger"
        @delete="confirmDelete"
      />
    </view>

    <view class="fab-row">
      <button class="fab-btn primary" @click="openCreate">+ 创建账本</button>
      <button class="fab-btn secondary" @click="openJoin">加入账本</button>
    </view>

    <!-- Create modal -->
    <view v-if="showCreate" class="modal-mask" @tap="closeCreate">
      <view class="modal-card" @tap.stop>
        <text class="modal-title">创建账本</text>
        <view class="field">
          <text class="label">账本名称</text>
          <input
            class="input"
            v-model="createTitle"
            placeholder="例如：周末小局 / 公司夜场"
            maxlength="60"
            :disabled="submitting"
          />
        </view>
        <view v-if="createError" class="error">{{ createError }}</view>
        <view class="actions">
          <button class="btn-secondary" :disabled="submitting" @click="closeCreate">取消</button>
          <button class="btn-primary" :disabled="!createTitle.trim() || submitting" @click="doCreate">
            {{ submitting ? '创建中…' : '创建' }}
          </button>
        </view>
      </view>
    </view>

    <!-- Join modal -->
    <view v-if="showJoin" class="modal-mask" @tap="closeJoin">
      <view class="modal-card" @tap.stop>
        <text class="modal-title">加入账本</text>
        <view class="field">
          <text class="label">序列号（8 位，大小写不敏感）</text>
          <input
            class="input serial-input"
            v-model="joinSerial"
            placeholder="例如 D3B7KHEG"
            maxlength="16"
            :disabled="submitting"
          />
        </view>
        <view v-if="joinError" class="error">{{ joinError }}</view>
        <view class="actions">
          <button class="btn-secondary" :disabled="submitting" @click="closeJoin">取消</button>
          <button class="btn-primary" :disabled="!joinSerial.trim() || submitting" @click="doJoin">
            {{ submitting ? '加入中…' : '加入' }}
          </button>
        </view>
      </view>
    </view>

    <!-- Delete confirm -->
    <view v-if="deleteTarget" class="modal-mask" @tap="cancelDelete">
      <view class="modal-card" @tap.stop>
        <text class="modal-title">删除账本</text>
        <text class="modal-body">
          确定删除账本「{{ deleteTarget.title }}」（{{ deleteTarget.serial }}）吗？
          此操作会同时删除所有玩家、公摊、申请记录，且无法撤销。
        </text>
        <view class="actions">
          <button class="btn-secondary" :disabled="submitting" @click="cancelDelete">取消</button>
          <button class="btn-danger-solid" :disabled="submitting" @click="doDelete">
            {{ submitting ? '删除中…' : '确认删除' }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useAuthStore } from '@/stores/authStore'
import { useLedgerListStore } from '@/stores/ledgerListStore'
import { requireAuth } from '@/utils/requireAuth'
import { ApiError } from '@/utils/http'
import type { LedgerSummary } from '@/api/types'
import LedgerCard from '@/components/LedgerCard.vue'

const auth = useAuthStore()
const store = useLedgerListStore()
const user = computed(() => auth.user)

const currentTab = ref<'active' | 'archived'>('active')
const visibleList = computed<LedgerSummary[]>(() =>
  currentTab.value === 'active' ? store.active : store.archived,
)

const showCreate = ref(false)
const showJoin = ref(false)
const submitting = ref(false)

const createTitle = ref('')
const createError = ref('')
const joinSerial = ref('')
const joinError = ref('')

const deleteTarget = ref<LedgerSummary | null>(null)

onShow(async () => {
  if (!requireAuth()) return
  try {
    await store.refresh()
  } catch {
    /* toast handled by http.ts */
  }
})

async function handleLogout() {
  await auth.logout()
  store.reset()
  uni.reLaunch({ url: auth.PAGE_LOGIN })
}

function goProfile() {
  uni.navigateTo({ url: '/pages/profile/index' })
}

function openCreate() {
  createTitle.value = ''
  createError.value = ''
  showCreate.value = true
}
function closeCreate() {
  if (submitting.value) return
  showCreate.value = false
}
async function doCreate() {
  const title = createTitle.value.trim()
  if (!title) return
  submitting.value = true
  createError.value = ''
  try {
    const ledger = await store.create(title)
    showCreate.value = false
    uni.showToast({ title: `已创建（${ledger.serial}）`, icon: 'none', duration: 1800 })
  } catch (err) {
    createError.value = err instanceof ApiError ? err.message : '创建失败'
  } finally {
    submitting.value = false
  }
}

function openJoin() {
  joinSerial.value = ''
  joinError.value = ''
  showJoin.value = true
}
function closeJoin() {
  if (submitting.value) return
  showJoin.value = false
}
async function doJoin() {
  const serial = joinSerial.value.trim()
  if (!serial) return
  submitting.value = true
  joinError.value = ''
  try {
    const ledger = await store.joinBySerial(serial)
    showJoin.value = false
    uni.showToast({ title: `已加入「${ledger.title}」`, icon: 'none', duration: 1800 })
  } catch (err) {
    joinError.value = err instanceof ApiError ? err.message : '加入失败'
  } finally {
    submitting.value = false
  }
}

function confirmDelete(l: LedgerSummary) {
  deleteTarget.value = l
}
function cancelDelete() {
  if (submitting.value) return
  deleteTarget.value = null
}
async function doDelete() {
  if (!deleteTarget.value) return
  const l = deleteTarget.value
  submitting.value = true
  try {
    await store.remove(l.id)
    deleteTarget.value = null
    uni.showToast({ title: '已删除', icon: 'none' })
  } catch (err) {
    uni.showToast({
      title: err instanceof ApiError ? err.message : '删除失败',
      icon: 'none',
    })
  } finally {
    submitting.value = false
  }
}

function openLedger(l: LedgerSummary) {
  uni.navigateTo({ url: `/pages/index/index?id=${l.id}` })
}
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 24rpx 32rpx 160rpx;
  display: flex;
  flex-direction: column;
}
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12rpx 0 24rpx;
}
.title {
  font-size: 40rpx;
  font-weight: 700;
  color: #333;
  display: block;
}
.subtitle {
  font-size: 24rpx;
  color: #888;
  margin-top: 4rpx;
  display: block;
}
.logout-btn {
  font-size: 24rpx;
  color: #888;
}
.topbar-actions {
  display: flex;
  gap: 12rpx;
}

.tabs {
  display: flex;
  gap: 24rpx;
  padding: 12rpx 4rpx 20rpx;
  border-bottom: 2rpx solid #eee;
  margin-bottom: 20rpx;
}
.tab {
  font-size: 28rpx;
  color: #888;
  padding: 12rpx 0;
  position: relative;
}
.tab.active {
  color: #1a73e8;
  font-weight: 600;
}
.tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -12rpx;
  height: 4rpx;
  background: #1a73e8;
  border-radius: 2rpx;
}
.count {
  margin-left: 6rpx;
  font-size: 22rpx;
  color: #aaa;
  font-weight: 400;
}
.tab.active .count {
  color: #1a73e8;
}

.loading,
.empty {
  padding: 120rpx 0;
  text-align: center;
  color: #aaa;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}
.empty-icon {
  font-size: 80rpx;
  color: #ddd;
}
.empty-text {
  font-size: 26rpx;
  color: #999;
}

.list {
  flex: 1;
}

.fab-row {
  position: fixed;
  left: 32rpx;
  right: 32rpx;
  bottom: 32rpx;
  display: flex;
  gap: 16rpx;
}
.fab-btn {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  font-size: 30rpx;
  border-radius: 44rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.08);
}
.fab-btn.primary {
  background: #1a73e8;
  color: #fff;
}
.fab-btn.secondary {
  background: #fff;
  color: #1a73e8;
  border: 2rpx solid #1a73e8;
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
  width: 620rpx;
  padding: 40rpx;
  background: #fff;
  border-radius: 20rpx;
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
  font-size: 26rpx;
  color: #555;
  line-height: 1.6;
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
  background: #fafafa;
  border: 2rpx solid #e0e0e0;
  border-radius: 12rpx;
  font-size: 30rpx;
}
.serial-input {
  font-family: 'Courier New', monospace;
  letter-spacing: 4rpx;
  text-transform: uppercase;
}
.error {
  color: #e53935;
  font-size: 26rpx;
}
.actions {
  display: flex;
  gap: 16rpx;
  margin-top: 8rpx;
}
.btn-primary,
.btn-secondary,
.btn-danger-solid {
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
.btn-danger-solid {
  background: #e53935;
  color: #fff;
}
.btn-danger-solid[disabled] {
  background: #f4a7a4;
}
</style>
