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

  const DPR = Math.min(window.devicePixelRatio || 2, 3)
  canvas.width  = CARD_W * DPR
  canvas.height = CARD_H * DPR
  canvas.style.width  = CARD_W + 'px'
  canvas.style.height = CARD_H + 'px'

  const ctx = canvas.getContext('2d')!
  ctx.scale(DPR, DPR)
  ctx.clearRect(0, 0, CARD_W, CARD_H)

  const FONT = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif'
  const MONO = '"SF Mono","Fira Code",Consolas,monospace'

  // ── 白卡底色 ──
  roundRect(ctx, 0, 0, CARD_W, CARD_H, RADIUS)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  // ── 左侧背景块（亮蓝色调） ──
  const LEFT_W = 220
  ctx.save()
  roundRect(ctx, 0, 0, LEFT_W, CARD_H, { tl: RADIUS, tr: 0, bl: RADIUS, br: 0 })
  const lgBg = ctx.createLinearGradient(0, 0, LEFT_W, CARD_H)
  lgBg.addColorStop(0, '#3b82f6')
  lgBg.addColorStop(1, '#60a5fa')
  ctx.fillStyle = lgBg
  ctx.fill()
  ctx.restore()

  // 左侧斜纹装饰
  ctx.save()
  ctx.beginPath()
  roundRect(ctx, 0, 0, LEFT_W, CARD_H, { tl: RADIUS, tr: 0, bl: RADIUS, br: 0 })
  ctx.clip()
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 14
  for (let x = -CARD_H; x < LEFT_W + CARD_H; x += 32) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + CARD_H, CARD_H)
    ctx.stroke()
  }
  ctx.restore()

  // 左侧内容
  const LX = 28
  ctx.font = `700 26px ${FONT}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText('Wi-Fi', LX, 68)

  ctx.font = `400 11px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.fillText('连接信息', LX, 86)

  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 0.75
  ctx.beginPath()
  ctx.moveTo(LX, 102)
  ctx.lineTo(LEFT_W - LX, 102)
  ctx.stroke()

  // 名称
  ctx.font = `400 10px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.fillText('网络名称', LX, 126)
  ctx.font = `600 13px ${FONT}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(truncateText(ctx, ssid.value, LEFT_W - LX * 2), LX, 144)

  // 密码
  ctx.font = `400 10px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.fillText('连接密码', LX, 174)
  ctx.font = password.value ? `600 13px ${MONO}` : `400 13px ${FONT}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(truncateText(ctx, password.value || '无需密码', LEFT_W - LX * 2), LX, 192)

  // 底部提示
  ctx.font = `400 10px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.fillText('扫描右侧二维码快速连接', LX, CARD_H - 20)

  // ── 右侧二维码：撑满右侧区域，留小内边距 ──
  const qrCanvas = document.querySelector('.wifi-card__qr canvas') as HTMLCanvasElement
  if (qrCanvas) {
    const RIGHT_W   = CARD_W - LEFT_W
    const INSET     = 18                              // 四周内边距
    const QR_DRAW   = Math.min(RIGHT_W, CARD_H) - INSET * 2
    const QR_X      = LEFT_W + (RIGHT_W - QR_DRAW) / 2
    const QR_Y      = (CARD_H - QR_DRAW) / 2

    // 圆角白底衬板
    const PAD_QR = 8
    ctx.save()
    roundRect(ctx, QR_X - PAD_QR, QR_Y - PAD_QR, QR_DRAW + PAD_QR * 2, QR_DRAW + PAD_QR * 2, 10)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 0.75
    ctx.stroke()
    ctx.restore()

    ctx.drawImage(qrCanvas, QR_X, QR_Y, QR_DRAW, QR_DRAW)
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
