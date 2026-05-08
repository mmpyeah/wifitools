<script lang="ts" setup>
import { ref, computed, onMounted, watch } from 'vue'
import { QrcodeCanvas } from 'qrcode.vue'

const props = defineProps({
  params: {
    type: Object,
    required: true
  },
  navigateTo: {
    type: Function,
    required: true
  }
})

// ─── 基础数据 ────────────────────────────────────────────
const ssid     = computed(() => props.params.ssid     || '')
const password = computed(() => props.params.password || '')

function escapeWifi(str: string): string {
  return str.replace(/([\\;,":])/g, '\\$1')
}

const qrcodeValue = computed(() => {
  if (!ssid.value) return ''
  const type = password.value ? 'WPA' : 'nopass'
  return `WIFI:T:${type};S:${escapeWifi(ssid.value)};P:${escapeWifi(password.value)};;`
})

// ─── 卡片合成 ────────────────────────────────────────────
const cardCanvas = ref<HTMLCanvasElement | null>(null)
const saved      = ref(false)
const copied     = ref(false)

// QrcodeCanvas 渲染到隐藏 DOM 后，再绘制合成卡片
onMounted(() => { scheduleRender() })
watch(qrcodeValue, () => { scheduleRender() })

let renderTimer: ReturnType<typeof setTimeout> | null = null
function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer)
  renderTimer = setTimeout(() => drawCard(), 120)
}

// 卡片尺寸
const CARD_W  = 600
const CARD_H  = 300
const RADIUS  = 20
const PAD     = 32
const QR_SIZE = 180

function drawCard() {
  const canvas = cardCanvas.value
  if (!canvas || !ssid.value) return

  // ── DPR 高清处理：物理尺寸 × devicePixelRatio ──
  const DPR = window.devicePixelRatio || 2
  canvas.width  = CARD_W * DPR
  canvas.height = CARD_H * DPR
  canvas.style.width  = CARD_W + 'px'
  canvas.style.height = CARD_H + 'px'

  const ctx = canvas.getContext('2d')!
  ctx.scale(DPR, DPR)
  ctx.clearRect(0, 0, CARD_W, CARD_H)

  // ── 白卡主体 ──
  roundRect(ctx, 0, 0, CARD_W, CARD_H, RADIUS)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  // ── 顶部渐变蓝条 ──
  ctx.save()
  const grad = ctx.createLinearGradient(0, 0, CARD_W, 0)
  grad.addColorStop(0, '#2563eb')
  grad.addColorStop(1, '#60a5fa')
  roundRect(ctx, 0, 0, CARD_W, 7, { tl: RADIUS, tr: RADIUS, bl: 0, br: 0 })
  ctx.fillStyle = grad
  ctx.fill()
  ctx.restore()

  // ── 布局常量 ──
  const QR_AREA  = QR_SIZE + PAD * 2        // 右侧二维码区域总宽
  const textMaxX = CARD_W - QR_AREA         // 文字区右边界
  const FONT     = '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
  const MONO     = '"SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace'

  // ── 标题行 ──
  const ICON_BOX = 26                        // 图标容器边长
  const TITLE_Y  = 42                        // 标题基线 Y

  // 图标容器（圆角蓝底）
  ctx.save()
  roundRect(ctx, PAD, TITLE_Y - 18, ICON_BOX, ICON_BOX, 7)
  ctx.fillStyle = '#dbeafe'
  ctx.fill()
  ctx.restore()

  // WiFi 弧线图标
  ctx.save()
  ctx.strokeStyle = '#2563eb'
  ctx.lineCap = 'round'
  const cx = PAD + ICON_BOX / 2
  const cy = TITLE_Y - 18 + ICON_BOX / 2 + 1
  const wifiArcs: [number, number, number][] = [
    [4.5,  195, 345],
    [7.5,  210, 330],
    [10.5, 220, 320],
  ]
  for (const [r, startDeg, endDeg] of wifiArcs) {
    ctx.lineWidth = r < 6 ? 1.5 : 1.8
    ctx.beginPath()
    ctx.arc(cx, cy, r, (startDeg * Math.PI) / 180, (endDeg * Math.PI) / 180)
    ctx.stroke()
  }
  ctx.fillStyle = '#2563eb'
  ctx.beginPath()
  ctx.arc(cx, cy + 2, 1.8, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // 标题文字
  ctx.font = `600 15px ${FONT}`
  ctx.fillStyle = '#0f172a'
  ctx.fillText('WiFi 连接信息', PAD + ICON_BOX + 9, TITLE_Y)

  // 分隔线
  let lineY = TITLE_Y + 12
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 0.75
  ctx.beginPath()
  ctx.moveTo(PAD, lineY)
  ctx.lineTo(textMaxX - 8, lineY)
  ctx.stroke()

  // ── 字段列表 ──
  // 列对齐：label 列固定宽 40px，value 从固定 X 开始
  const LABEL_X   = PAD
  const LABEL_W   = 38
  const VALUE_X   = PAD + LABEL_W + 10
  const PILL_H    = 19
  const PILL_R    = 4
  const ROW_GAP   = 32
  let   rowY      = lineY + 26

  const fields = [
    { label: '名称', value: ssid.value,                                         mono: false },
    { label: '密码', value: password.value || '无需密码',                       mono: true  },
    { label: '加密', value: password.value ? 'WPA / WPA2 / WPA3' : '开放网络', mono: false },
  ]

  for (const field of fields) {
    // label pill
    ctx.save()
    roundRect(ctx, LABEL_X, rowY - PILL_H + 4, LABEL_W, PILL_H, PILL_R)
    ctx.fillStyle = '#f1f5f9'
    ctx.fill()
    ctx.restore()

    ctx.font = `11px ${FONT}`
    ctx.fillStyle = '#64748b'
    ctx.textAlign = 'center'
    ctx.fillText(field.label, LABEL_X + LABEL_W / 2, rowY)
    ctx.textAlign = 'left'

    // value
    ctx.font = field.mono ? `500 13px ${MONO}` : `500 13.5px ${FONT}`
    ctx.fillStyle = '#1e293b'
    const maxW   = textMaxX - VALUE_X - 8
    const valStr = truncateText(ctx, field.value, maxW)
    ctx.fillText(valStr, VALUE_X, rowY)

    rowY += ROW_GAP
  }

  // 底部提示
  ctx.font = `11px ${FONT}`
  ctx.fillStyle = '#94a3b8'
  ctx.fillText('扫描右侧二维码即可连接', PAD, CARD_H - 16)

  // ── 右侧二维码 ──
  const qrCanvas = document.querySelector('.wifi-card__qr canvas') as HTMLCanvasElement
  if (qrCanvas) {
    const qrX = CARD_W - QR_SIZE - PAD
    const qrY = (CARD_H - QR_SIZE) / 2 + 4

    // 背景框
    ctx.save()
    roundRect(ctx, qrX - 10, qrY - 10, QR_SIZE + 20, QR_SIZE + 20, 10)
    ctx.fillStyle = '#f8fafc'
    ctx.fill()
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 0.75
    ctx.stroke()
    ctx.restore()

    ctx.drawImage(qrCanvas, qrX, qrY, QR_SIZE, QR_SIZE)
  }
}

// 工具：带独立角半径的圆角矩形路径
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  r: number | { tl: number; tr: number; bl: number; br: number }
) {
  const { tl, tr, bl, br } = typeof r === 'number'
    ? { tl: r, tr: r, bl: r, br: r } : r
  ctx.beginPath()
  ctx.moveTo(x + tl, y)
  ctx.lineTo(x + w - tr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr)
  ctx.lineTo(x + w, y + h - br)
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h)
  ctx.lineTo(x + bl, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl)
  ctx.lineTo(x, y + tl)
  ctx.quadraticCurveTo(x, y, x + tl, y)
  ctx.closePath()
}

// 工具：文字超长截断
function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 0 && ctx.measureText(t + '…').width > maxWidth) {
    t = t.slice(0, -1)
  }
  return t + '…'
}

// ─── 保存图片 ─────────────────────────────────────────────
function saveImage() {
  const canvas = cardCanvas.value
  if (!canvas) return
  const dataUrl = canvas.toDataURL('image/png')
  try {
    const outputPath = window.services.writeImageFile(dataUrl)
    if (outputPath) window.utools.shellShowItemInFolder(outputPath)
    saved.value = true
    setTimeout(() => { saved.value = false }, 1500)
  } catch {
    window.utools.showNotification('保存失败')
  }
}

// ─── 复制密码 ─────────────────────────────────────────────
function copyPassword() {
  if (!password.value) return
  window.utools.copyText(password.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}

function goBack() {
  props.navigateTo('wifi-query')
}
</script>

<template>
  <div class="wifi-card">
    <!-- 顶部导航 -->
    <div class="wifi-card__header">
      <button class="wifi-card__back" @click="goBack">
        <svg class="wifi-card__back-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        返回
      </button>
      <span class="wifi-card__title">WiFi 分享卡片</span>
    </div>

    <div class="wifi-card__body">
      <!-- 卡片预览 -->
      <div class="wifi-card__preview-wrap">
        <canvas ref="cardCanvas" class="wifi-card__canvas" />
      </div>

      <!-- 操作按钮 -->
      <div class="wifi-card__actions">
        <button
          class="wifi-card__btn wifi-card__btn--ghost"
          :class="{ 'wifi-card__btn--copied': copied }"
          :disabled="!password"
          @click="copyPassword"
        >
          {{ copied ? '已复制 ✓' : '复制密码' }}
        </button>
        <button
          class="wifi-card__btn wifi-card__btn--primary"
          :class="{ 'wifi-card__btn--saved': saved }"
          :disabled="!ssid"
          @click="saveImage"
        >
          {{ saved ? '已保存 ✓' : '保存图片' }}
        </button>
      </div>
    </div>

    <!-- 离屏 QrcodeCanvas，供 canvas drawImage 合成用 -->
    <div class="wifi-card__qr" aria-hidden="true">
      <QrcodeCanvas
        :value="qrcodeValue"
        :size="200"
        level="M"
        :margin="2"
      />
    </div>
  </div>
</template>

<style>
.wifi-card {
  display: flex;
  flex-direction: column;
  height: 100vh;
  box-sizing: border-box;
  font-size: 14px;
}

/* 顶部导航 */
.wifi-card__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 0.5px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-primary);
}
.wifi-card__back {
  background: transparent;
  border: none;
  color: var(--blue);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  padding: 3px 8px 3px 4px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  gap: 2px;
  transition: background var(--transition);
}
.wifi-card__back:hover { background: var(--blue-light); }
.wifi-card__back:active { opacity: 0.7; }
.wifi-card__back-icon { width: 16px; height: 16px; flex-shrink: 0; }
.wifi-card__title {
  font-weight: 500;
  font-size: 14px;
}

/* 内容区 */
.wifi-card__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  gap: 20px;
}

/* 卡片预览容器 */
.wifi-card__preview-wrap {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  line-height: 0;
  max-width: 100%;
}
.wifi-card__canvas {
  display: block;
  max-width: 100%;
  height: auto;
}

/* 按钮 */
.wifi-card__actions { display: flex; gap: 10px; }
.wifi-card__btn {
  padding: 6px 22px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition), opacity var(--transition);
  line-height: 1.8;
}
.wifi-card__btn--primary {
  background: var(--blue);
  color: #fff;
  border: 0.5px solid var(--blue);
}
.wifi-card__btn--primary:hover { background: var(--blue-hover); }
.wifi-card__btn--ghost {
  background: transparent;
  color: var(--blue);
  border: 0.5px solid var(--border-mid);
}
.wifi-card__btn--ghost:hover { background: var(--blue-light); }
.wifi-card__btn--copied { background: var(--success); border-color: var(--success); color: #fff; }
.wifi-card__btn--saved  { background: var(--success); border-color: var(--success); }
.wifi-card__btn:disabled { opacity: 0.4; cursor: default; }
.wifi-card__btn:not(:disabled):active { opacity: 0.7; }

.wifi-card__tip {
  font-size: 12px;
  opacity: 0.4;
  margin: 0;
  text-align: center;
}

/* 离屏隐藏容器 */
.wifi-card__qr {
  position: fixed;
  left: -9999px;
  top: -9999px;
  pointer-events: none;
}

@media (prefers-color-scheme: dark) {
  .wifi-card__preview-wrap {
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  }
}
</style>
