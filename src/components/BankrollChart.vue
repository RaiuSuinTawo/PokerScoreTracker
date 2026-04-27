<script setup lang="ts">
/**
 * Lightweight bankroll line chart.
 * See EXPANSION_PLAN.md §7.9 — we chose to self-implement to avoid the
 * ~80KB qiun-data-charts dependency for a single page.
 *
 *  - Draws cumulative-net line over archived ledgers.
 *  - Axis: zero baseline highlighted; auto-range padded 10%.
 *  - Points marked; tap a point forwards via `point-tap` emit.
 *  - Uses uni.createCanvasContext — works on mp-weixin and H5.
 */
import { onMounted, watch, ref, nextTick } from 'vue'
import type { BankrollPoint } from '@/api/types'

const props = withDefaults(
  defineProps<{
    points: BankrollPoint[]
    canvasId?: string
    height?: number // rpx
  }>(),
  {
    canvasId: 'bankroll-canvas',
    height: 480,
  },
)

defineEmits<{
  'point-tap': [p: BankrollPoint]
}>()

// Rough pixel dimensions read via uni.getSystemInfoSync.windowWidth × ratio.
const canvasWidthPx = ref(320)
const canvasHeightPx = ref(200)

function computeDimensions() {
  try {
    const sys = uni.getSystemInfoSync()
    // page padding 32rpx on each side → subtract roughly
    const w = sys.windowWidth - 32 // px; simple and close enough
    canvasWidthPx.value = Math.max(280, w)
    const rpx2px = sys.windowWidth / 750
    canvasHeightPx.value = Math.round(props.height * rpx2px)
  } catch {
    canvasWidthPx.value = 320
    canvasHeightPx.value = 200
  }
}

function draw() {
  const ctx = uni.createCanvasContext(props.canvasId)
  const W = canvasWidthPx.value
  const H = canvasHeightPx.value
  const padL = 44
  const padR = 16
  const padT = 16
  const padB = 28

  // Clear
  ctx.setFillStyle('#ffffff')
  ctx.fillRect(0, 0, W, H)

  const pts = props.points
  if (pts.length === 0) {
    ctx.setFillStyle('#bbbbbb')
    ctx.setFontSize(12)
    ctx.setTextAlign('center')
    ctx.fillText('暂无数据', W / 2, H / 2)
    ctx.draw()
    return
  }

  // Range
  const values = pts.map((p) => p.cumulative)
  const minV = Math.min(0, ...values)
  const maxV = Math.max(0, ...values)
  const span = maxV - minV || 1
  const pad = span * 0.1
  const yMin = minV - pad
  const yMax = maxV + pad
  const yRange = yMax - yMin || 1

  const chartW = W - padL - padR
  const chartH = H - padT - padB

  function xAt(i: number): number {
    if (pts.length === 1) return padL + chartW / 2
    return padL + (i / (pts.length - 1)) * chartW
  }
  function yAt(v: number): number {
    return padT + (1 - (v - yMin) / yRange) * chartH
  }

  // Axis frame
  ctx.setStrokeStyle('#eeeeee')
  ctx.setLineWidth(1)
  ctx.beginPath()
  ctx.moveTo(padL, padT)
  ctx.lineTo(padL, padT + chartH)
  ctx.lineTo(padL + chartW, padT + chartH)
  ctx.stroke()

  // Zero baseline (if in range)
  if (yMin < 0 && yMax > 0) {
    const y0 = yAt(0)
    ctx.setStrokeStyle('#cfd8dc')
    ctx.setLineWidth(1)
    // dashed approximation: short segments
    const step = 6
    let x = padL
    ctx.beginPath()
    while (x < padL + chartW) {
      ctx.moveTo(x, y0)
      ctx.lineTo(Math.min(x + step, padL + chartW), y0)
      x += step * 2
    }
    ctx.stroke()
  }

  // Y axis labels (min / max / 0 if inside)
  ctx.setFillStyle('#888888')
  ctx.setFontSize(10)
  ctx.setTextAlign('right')
  ctx.fillText(String(Math.round(yMax)), padL - 4, padT + 10)
  ctx.fillText(String(Math.round(yMin)), padL - 4, padT + chartH)
  if (yMin < 0 && yMax > 0) {
    ctx.fillText('0', padL - 4, yAt(0) + 3)
  }

  // Line
  ctx.setStrokeStyle('#1a73e8')
  ctx.setLineWidth(2)
  ctx.beginPath()
  pts.forEach((p, i) => {
    const x = xAt(i)
    const y = yAt(p.cumulative)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()

  // Fill area below/above zero for emphasis (soft)
  ctx.setFillStyle('rgba(26,115,232,0.08)')
  ctx.beginPath()
  pts.forEach((p, i) => {
    const x = xAt(i)
    const y = yAt(p.cumulative)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.lineTo(xAt(pts.length - 1), padT + chartH)
  ctx.lineTo(xAt(0), padT + chartH)
  ctx.closePath()
  ctx.fill()

  // Points
  pts.forEach((p, i) => {
    const x = xAt(i)
    const y = yAt(p.cumulative)
    ctx.setFillStyle(p.cumulative >= 0 ? '#e53935' : '#2e7d32')
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fill()
  })

  // X axis labels: first / last date
  ctx.setFillStyle('#888888')
  ctx.setFontSize(10)
  function shortDate(iso: string): string {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  ctx.setTextAlign('left')
  ctx.fillText(shortDate(pts[0].at), padL, padT + chartH + 14)
  if (pts.length > 1) {
    ctx.setTextAlign('right')
    ctx.fillText(shortDate(pts[pts.length - 1].at), padL + chartW, padT + chartH + 14)
  }

  ctx.draw()
}

async function redraw() {
  computeDimensions()
  await nextTick()
  // Delay a microtask; some platforms need the canvas element flushed.
  setTimeout(() => draw(), 0)
}

onMounted(() => {
  redraw()
})

watch(
  () => props.points,
  () => redraw(),
  { deep: true },
)
</script>

<template>
  <view class="chart-wrap">
    <canvas
      :canvas-id="canvasId"
      :id="canvasId"
      class="chart-canvas"
      :style="{
        width: canvasWidthPx + 'px',
        height: canvasHeightPx + 'px',
      }"
    />
  </view>
</template>

<style lang="scss" scoped>
.chart-wrap {
  width: 100%;
  display: flex;
  justify-content: center;
  background: #fff;
  border-radius: 16rpx;
  padding: 16rpx 0;
}
.chart-canvas {
  display: block;
}
</style>
