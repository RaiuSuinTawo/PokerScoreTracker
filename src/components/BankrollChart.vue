<script setup lang="ts">
/**
 * Lightweight bankroll line chart — time-axis version.
 *
 * Features:
 *  - X-axis is a real time axis (date-based positioning)
 *  - Nice integer Y-axis ticks with gridlines
 *  - Per-point date labels on X-axis (with collision avoidance)
 *  - Touch interaction: drag to see specific point values (tooltip)
 *  - Data points are per-day aggregated (not per-ledger)
 */
import { onMounted, watch, ref, nextTick, getCurrentInstance } from 'vue'

export interface ChartPoint {
  date: string       // 'YYYY-MM-DD'
  dayNet: number     // sum of perLedgerNet for this day
  cumulative: number // running total
  titles: string[]   // ledger titles archived on this day
}

const props = withDefaults(
  defineProps<{
    points: ChartPoint[]
    startDate: string  // 'YYYY-MM-DD' — left edge of chart
    endDate: string    // 'YYYY-MM-DD' — right edge of chart (today)
    canvasId?: string
    height?: number    // rpx
  }>(),
  {
    canvasId: 'bankroll-canvas',
    height: 480,
  },
)

defineEmits<{
  'point-tap': [p: ChartPoint]
}>()

const instance = getCurrentInstance()

const canvasWidthPx = ref(320)
const canvasHeightPx = ref(200)

// Layout state shared between draw() and touch handlers
const layout = ref({
  padL: 50,
  padR: 28,
  padT: 24,
  padB: 36,
  chartW: 0,
  chartH: 0,
  yMin: 0,
  yRange: 1,
  tStart: 0,  // start date timestamp
  tRange: 1,  // end - start in ms
})

// Touch interaction state
const activePointIndex = ref<number | null>(null)

function computeDimensions() {
  try {
    const sys = uni.getSystemInfoSync()
    const w = sys.windowWidth - 32
    canvasWidthPx.value = Math.max(280, w)
    const rpx2px = sys.windowWidth / 750
    canvasHeightPx.value = Math.round(props.height * rpx2px)
  } catch {
    canvasWidthPx.value = 320
    canvasHeightPx.value = 200
  }
}

function niceRange(minV: number, maxV: number, tickCount = 5) {
  if (minV === maxV) {
    const v = minV
    if (v === 0) return { niceMin: -1, niceMax: 1, ticks: [-1, 0, 1] }
    const step = Math.pow(10, Math.floor(Math.log10(Math.abs(v))))
    return {
      niceMin: Math.floor(v / step) * step - step,
      niceMax: Math.ceil(v / step) * step + step,
      ticks: [Math.floor(v / step) * step - step, Math.round(v), Math.ceil(v / step) * step + step],
    }
  }
  const span = maxV - minV
  const rawStep = span / tickCount
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const niceFractions = [1, 2, 5, 10]
  const niceStep = niceFractions.map((f) => f * magnitude).find((s) => s >= rawStep) ?? magnitude * 10
  const niceMin = Math.floor(minV / niceStep) * niceStep
  const niceMax = Math.ceil(maxV / niceStep) * niceStep
  const ticks: number[] = []
  for (let t = niceMin; t <= niceMax + niceStep * 0.01; t += niceStep) {
    ticks.push(Math.round(t))
  }
  return { niceMin, niceMax, ticks }
}

/** Convert a date string to start-of-day timestamp. */
function dateToTs(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getTime()
}

/** X pixel position for a given date string. */
function xAtDate(dateStr: string): number {
  const { padL, chartW, tStart, tRange } = layout.value
  if (tRange === 0) return padL + chartW / 2
  const t = dateToTs(dateStr)
  return padL + ((t - tStart) / tRange) * chartW
}

/** X pixel position for point index. */
function xAt(i: number): number {
  return xAtDate(props.points[i].date)
}

function yAt(v: number): number {
  const { padT, chartH, yMin, yRange } = layout.value
  return padT + (1 - (v - yMin) / yRange) * chartH
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function draw(highlightIdx: number | null = null) {
  const ctx = uni.createCanvasContext(props.canvasId, instance)
  const W = canvasWidthPx.value
  const H = canvasHeightPx.value
  const { padL, padR, padT, padB } = layout.value

  const chartW = W - padL - padR
  const chartH = H - padT - padB
  layout.value.chartW = chartW
  layout.value.chartH = chartH

  // Time range
  const tStart = dateToTs(props.startDate)
  const tEnd = dateToTs(props.endDate)
  layout.value.tStart = tStart
  layout.value.tRange = tEnd - tStart || 1

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

  // Compute nice Y range
  const values = pts.map((p) => p.cumulative)
  const dataMin = Math.min(0, ...values)
  const dataMax = Math.max(0, ...values)
  const { niceMin, niceMax, ticks } = niceRange(dataMin, dataMax, 4)
  layout.value.yMin = niceMin
  layout.value.yRange = niceMax - niceMin || 1

  // Y-axis gridlines and labels
  ctx.setFontSize(10)
  ctx.setTextAlign('right')
  for (const tick of ticks) {
    const y = yAt(tick)
    if (tick === 0) {
      ctx.setStrokeStyle('#90a4ae')
      ctx.setLineWidth(1)
    } else {
      ctx.setStrokeStyle('#e0e0e0')
      ctx.setLineWidth(0.5)
    }
    ctx.beginPath()
    const step = tick === 0 ? 6 : 4
    let x = padL
    while (x < padL + chartW) {
      ctx.moveTo(x, y)
      ctx.lineTo(Math.min(x + step, padL + chartW), y)
      x += step * 2
    }
    ctx.stroke()
    ctx.setFillStyle(tick === 0 ? '#555555' : '#888888')
    ctx.fillText(String(tick), padL - 6, y + 3)
  }

  // Y axis vertical line
  ctx.setStrokeStyle('#e0e0e0')
  ctx.setLineWidth(1)
  ctx.beginPath()
  ctx.moveTo(padL, padT)
  ctx.lineTo(padL, padT + chartH)
  ctx.stroke()

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
  // Extend line flat to today if last point isn't today
  if (pts.length > 0) {
    const lastPt = pts[pts.length - 1]
    const lastX = xAt(pts.length - 1)
    const todayX = padL + chartW
    if (todayX - lastX > 1) {
      ctx.lineTo(todayX, yAt(lastPt.cumulative))
    }
  }
  ctx.stroke()

  // Fill area below line
  ctx.setFillStyle('rgba(26,115,232,0.08)')
  ctx.beginPath()
  pts.forEach((p, i) => {
    const x = xAt(i)
    const y = yAt(p.cumulative)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  if (pts.length > 0) {
    const lastPt = pts[pts.length - 1]
    const lastX = xAt(pts.length - 1)
    const todayX = padL + chartW
    if (todayX - lastX > 1) {
      ctx.lineTo(todayX, yAt(lastPt.cumulative))
    }
    ctx.lineTo(todayX, padT + chartH)
  }
  ctx.lineTo(xAt(0), padT + chartH)
  ctx.closePath()
  ctx.fill()

  // Points
  pts.forEach((p, i) => {
    const x = xAt(i)
    const y = yAt(p.cumulative)
    const isHighlighted = i === highlightIdx
    const radius = isHighlighted ? 5 : 3
    if (isHighlighted) {
      ctx.setFillStyle('#ffffff')
      ctx.beginPath()
      ctx.arc(x, y, radius + 2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.setFillStyle(p.cumulative >= 0 ? '#e53935' : '#2e7d32')
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  })

  // X-axis date labels
  ctx.setFillStyle('#888888')
  ctx.setFontSize(10)

  // Always draw start date (left-aligned) and end date (right-aligned)
  const startLabel = shortDate(props.startDate)
  const endLabel = shortDate(props.endDate)
  ctx.setTextAlign('left')
  ctx.fillText(startLabel, padL, padT + chartH + 14)
  ctx.setTextAlign('right')
  ctx.fillText(endLabel, padL + chartW, padT + chartH + 14)

  // Draw intermediate point labels if they don't collide with edges
  const startLabelRight = padL + startLabel.length * 6 + 4
  const endLabelLeft = padL + chartW - endLabel.length * 6 - 4
  let lastLabelX = startLabelRight
  pts.forEach((p, i) => {
    const x = xAt(i)
    if (x <= startLabelRight + 4) return  // too close to start label
    if (x >= endLabelLeft - 4) return     // too close to end label
    if (x - lastLabelX < 30) return       // too close to previous
    ctx.setTextAlign('center')
    ctx.fillText(shortDate(p.date), x, padT + chartH + 14)
    lastLabelX = x
  })

  // Highlight overlay
  if (highlightIdx !== null && highlightIdx >= 0 && highlightIdx < pts.length) {
    const p = pts[highlightIdx]
    const hx = xAt(highlightIdx)
    const hy = yAt(p.cumulative)

    // Vertical hairline
    ctx.setStrokeStyle('rgba(26,115,232,0.4)')
    ctx.setLineWidth(1)
    ctx.beginPath()
    ctx.moveTo(hx, padT)
    ctx.lineTo(hx, padT + chartH)
    ctx.stroke()

    // Build tooltip lines
    const lines: string[] = []
    lines.push(shortDate(p.date))                           // date header
    for (const t of p.titles) {
      lines.push('  ' + t)                                  // indented session names
    }
    if (p.titles.length === 0) {
      lines.push('  (无归档)')
    }
    lines.push(`当日: ${p.dayNet >= 0 ? '+' : ''}${p.dayNet}`)
    lines.push(`累计: ${p.cumulative}`)

    const lineHeight = 14
    const tooltipPadX = 8
    const tooltipPadY = 8
    const tooltipW = 120
    const tooltipH = tooltipPadY * 2 + lines.length * lineHeight

    let tx = hx - tooltipW / 2
    if (tx < padL) tx = padL
    if (tx + tooltipW > padL + chartW) tx = padL + chartW - tooltipW
    let ty = hy - tooltipH - 12
    if (ty < 4) ty = hy + 12

    // Background with rounded feel
    ctx.setFillStyle('rgba(50,50,50,0.92)')
    ctx.fillRect(tx, ty, tooltipW, tooltipH)

    // Text
    ctx.setFontSize(10)
    ctx.setTextAlign('left')
    lines.forEach((line, li) => {
      // Date header in bold-ish white, session names slightly dimmer
      if (li === 0) {
        ctx.setFillStyle('#ffffff')
      } else if (li < lines.length - 2) {
        ctx.setFillStyle('#cccccc')
      } else {
        ctx.setFillStyle('#ffffff')
      }
      ctx.fillText(line, tx + tooltipPadX, ty + tooltipPadY + (li + 1) * lineHeight - 2)
    })
  }

  ctx.draw()
}

// Touch handlers
function findNearestIndex(touchX: number): number | null {
  const pts = props.points
  if (pts.length === 0) return null
  let closest = 0
  let minDist = Infinity
  for (let i = 0; i < pts.length; i++) {
    const d = Math.abs(xAt(i) - touchX)
    if (d < minDist) {
      minDist = d
      closest = i
    }
  }
  return closest
}

function onTouchStart(e: any) {
  const touch = e.touches?.[0]
  if (!touch) return
  const x = touch.x ?? touch.clientX ?? 0
  activePointIndex.value = findNearestIndex(x)
  draw(activePointIndex.value)
}

function onTouchMove(e: any) {
  const touch = e.touches?.[0]
  if (!touch) return
  const x = touch.x ?? touch.clientX ?? 0
  const idx = findNearestIndex(x)
  if (idx !== activePointIndex.value) {
    activePointIndex.value = idx
    draw(activePointIndex.value)
  }
}

function onTouchEnd() {
  activePointIndex.value = null
  draw(null)
}

async function redraw() {
  computeDimensions()
  await nextTick()
  setTimeout(() => draw(null), 150)
}

onMounted(() => {
  redraw()
})

watch(
  () => [props.points, props.startDate, props.endDate],
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
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
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
