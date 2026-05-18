<script setup lang="ts">
/**
 * Ledger Presets management page.
 * Users can create, edit, and delete presets for quick ledger creation.
 */
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useAuthStore } from '@/stores/authStore'
import { usePresetStore } from '@/stores/presetStore'
import { requireAuth } from '@/utils/requireAuth'
import { ApiError } from '@/utils/http'
import type { LedgerPresetDTO } from '@/api/types'

const auth = useAuthStore()
const store = usePresetStore()

const showModal = ref(false)
const editingId = ref<string | null>(null)
const formName = ref('')
const formTitle = ref('')
const formChipValue = ref('200')
const formChipMultiplier = ref('1')
const formAutoApprove = ref(true)
const formError = ref('')
const submitting = ref(false)

const isEditing = computed(() => !!editingId.value)
const modalTitle = computed(() => isEditing.value ? '编辑预设' : '新增预设')

function resetForm() {
  editingId.value = null
  formName.value = ''
  formTitle.value = ''
  formChipValue.value = '200'
  formChipMultiplier.value = '1'
  formAutoApprove.value = true
  formError.value = ''
}

function openCreate() {
  resetForm()
  showModal.value = true
}

function openEdit(preset: LedgerPresetDTO) {
  editingId.value = preset.id
  formName.value = preset.name
  formTitle.value = preset.title
  formChipValue.value = String(preset.chipValue)
  formChipMultiplier.value = String(preset.chipMultiplier)
  formAutoApprove.value = preset.autoApprove
  formError.value = ''
  showModal.value = true
}

function closeModal() {
  if (submitting.value) return
  showModal.value = false
}

async function doSave() {
  const name = formName.value.trim()
  if (!name) { formError.value = '请输入预设名称'; return }
  const chipValue = Number(formChipValue.value)
  const chipMultiplier = Number(formChipMultiplier.value)
  if (!chipValue || chipValue <= 0) { formError.value = '筹码面值必须为正数'; return }
  if (!chipMultiplier || chipMultiplier <= 0) { formError.value = '筹码倍率必须为正数'; return }

  submitting.value = true
  formError.value = ''
  try {
    const data = {
      name,
      title: formTitle.value.trim(),
      chipValue,
      chipMultiplier,
      autoApprove: formAutoApprove.value,
    }
    if (editingId.value) {
      await store.update(editingId.value, data)
      uni.showToast({ title: '已更新', icon: 'none' })
    } else {
      await store.create(data)
      uni.showToast({ title: '已创建', icon: 'none' })
    }
    showModal.value = false
  } catch (err) {
    formError.value = err instanceof ApiError ? err.message : '操作失败'
  } finally {
    submitting.value = false
  }
}

async function doDelete(preset: LedgerPresetDTO) {
  uni.showModal({
    title: '删除预设',
    content: `确定删除「${preset.name}」？`,
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.remove(preset.id)
        uni.showToast({ title: '已删除', icon: 'none' })
      } catch (err) {
        uni.showToast({ title: err instanceof ApiError ? err.message : '删除失败', icon: 'none' })
      }
    },
  })
}

function goBack() {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/ledger-list/index' }) })
}

onShow(async () => {
  await auth.waitUntilReady()
  if (!requireAuth()) return
  try {
    await store.load()
  } catch {
    /* http.ts toasted */
  }
})
</script>

<template>
  <view class="page">
    <view class="topbar">
      <button class="nav-btn" size="mini" @click="goBack">返回</button>
      <text class="title">账本预设</text>
      <view class="placeholder" />
    </view>

    <view v-if="store.isLoading && !store.presets.length" class="loading">加载中…</view>

    <view v-else-if="!store.presets.length" class="empty">
      <text class="empty-icon">⚙</text>
      <text class="empty-text">暂无预设，点下方按钮创建</text>
    </view>

    <view v-else class="list">
      <view
        v-for="p in store.presets"
        :key="p.id"
        class="preset-card"
        @click="openEdit(p)"
      >
        <view class="card-header">
          <text class="card-name">{{ p.name }}</text>
          <button class="del-btn" size="mini" @click.stop="doDelete(p)">删除</button>
        </view>
        <view class="card-body">
          <text class="card-detail">面值 {{ p.chipValue }} · 倍率 ×{{ p.chipMultiplier }}</text>
          <text v-if="p.title" class="card-detail">账本名: {{ p.title }}</text>
          <text class="card-detail">{{ p.autoApprove ? '自动通过' : '需审批' }}</text>
        </view>
      </view>
    </view>

    <view class="fab-row">
      <button class="fab-btn primary" @click="openCreate">+ 新增预设</button>
    </view>

    <!-- Edit/Create Modal -->
    <view v-if="showModal" class="modal-mask" @tap="closeModal">
      <view class="modal-card" @tap.stop>
        <text class="modal-title">{{ modalTitle }}</text>

        <view class="field">
          <text class="label">预设名称</text>
          <input
            class="input"
            v-model="formName"
            placeholder="如：日常 5/10"
            maxlength="60"
            :disabled="submitting"
          />
        </view>

        <view class="field">
          <text class="label">账本名称（可选）</text>
          <input
            class="input"
            v-model="formTitle"
            placeholder="创建时预填（可留空）"
            maxlength="60"
            :disabled="submitting"
          />
        </view>

        <view class="field">
          <text class="label">筹码面值</text>
          <input
            class="input"
            v-model="formChipValue"
            type="digit"
            placeholder="200"
            :disabled="submitting"
          />
        </view>

        <view class="field">
          <text class="label">筹码倍率</text>
          <input
            class="input"
            v-model="formChipMultiplier"
            type="digit"
            placeholder="1"
            :disabled="submitting"
          />
        </view>

        <view class="field toggle-field" @click="formAutoApprove = !formAutoApprove">
          <text class="label">带入自动通过</text>
          <view class="toggle" :class="{ on: formAutoApprove }">
            <view class="toggle-knob" />
          </view>
        </view>

        <view v-if="formError" class="error">{{ formError }}</view>

        <view class="actions">
          <button class="btn-secondary" :disabled="submitting" @click="closeModal">取消</button>
          <button class="btn-primary" :disabled="!formName.trim() || submitting" @click="doSave">
            {{ submitting ? '保存中…' : '保存' }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.page { padding: 0 0 140rpx; }
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 24rpx 32rpx; background: #fff; border-bottom: 1rpx solid #eee;
}
.topbar .title { font-size: 34rpx; font-weight: 600; }
.topbar .placeholder { width: 100rpx; }
.nav-btn { font-size: 24rpx; color: #1a73e8; background: none; padding: 0; }

.loading, .empty { text-align: center; padding: 120rpx 0; color: #999; }
.empty-icon { font-size: 80rpx; display: block; margin-bottom: 16rpx; }
.empty-text { font-size: 28rpx; }

.list { padding: 24rpx 32rpx; }
.preset-card {
  background: #fff; border-radius: 16rpx; padding: 24rpx;
  margin-bottom: 20rpx; box-shadow: 0 2rpx 8rpx rgba(0,0,0,.05);
}
.card-header { display: flex; align-items: center; justify-content: space-between; }
.card-name { font-size: 30rpx; font-weight: 600; color: #333; }
.del-btn { font-size: 22rpx; color: #e53935; background: none; padding: 4rpx 16rpx; }
.card-body { margin-top: 12rpx; }
.card-detail { font-size: 24rpx; color: #888; margin-right: 16rpx; }

.fab-row {
  position: fixed; bottom: 40rpx; left: 0; right: 0;
  display: flex; justify-content: center; padding: 0 48rpx;
}
.fab-btn {
  flex: 1; max-width: 500rpx; height: 88rpx; line-height: 88rpx;
  border-radius: 44rpx; font-size: 30rpx; font-weight: 500; text-align: center;
}
.fab-btn.primary { background: #1a73e8; color: #fff; }

/* Modal */
.modal-mask {
  position: fixed; inset: 0; background: rgba(0,0,0,.5);
  display: flex; align-items: center; justify-content: center; z-index: 999;
}
.modal-card {
  width: 85%; max-width: 640rpx; background: #fff; border-radius: 24rpx;
  padding: 40rpx 36rpx; max-height: 85vh; overflow-y: auto;
}
.modal-title { font-size: 34rpx; font-weight: 600; margin-bottom: 32rpx; display: block; }
.field { margin-bottom: 24rpx; }
.label { font-size: 24rpx; color: #666; margin-bottom: 8rpx; display: block; }
.input {
  width: 100%; height: 80rpx; border: 1rpx solid #ddd; border-radius: 12rpx;
  padding: 0 20rpx; font-size: 28rpx; box-sizing: border-box;
}

.toggle-field {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16rpx 0; cursor: pointer;
}
.toggle {
  width: 88rpx; height: 48rpx; border-radius: 24rpx; background: #ccc;
  position: relative; transition: background .2s;
}
.toggle.on { background: #1a73e8; }
.toggle-knob {
  width: 40rpx; height: 40rpx; border-radius: 50%; background: #fff;
  position: absolute; top: 4rpx; left: 4rpx; transition: transform .2s;
  box-shadow: 0 2rpx 4rpx rgba(0,0,0,.2);
}
.toggle.on .toggle-knob { transform: translateX(40rpx); }

.error { color: #e53935; font-size: 24rpx; margin-bottom: 16rpx; }
.actions { display: flex; gap: 20rpx; margin-top: 24rpx; }
.btn-secondary, .btn-primary {
  flex: 1; height: 80rpx; line-height: 80rpx; border-radius: 12rpx;
  font-size: 28rpx; text-align: center;
}
.btn-secondary { background: #f0f0f0; color: #333; }
.btn-primary { background: #1a73e8; color: #fff; }
.btn-primary[disabled] { opacity: .5; }
</style>
