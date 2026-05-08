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
const CARD_H  = 280
const RADIUS  = 20
const PAD     = 32
const QR_SIZE = 180

function drawCard() {
  const canvas = cardCanvas.value
  if (!canvas || !ssid.value) return

  const ctx = canvas.getContext('2d')!
  canvas.width  = CARD_W
  canvas.height = CARD_H

  // ── 背景白色圆角卡 ──
  ctx.clearRect(0, 0, CARD_W, CARD_H)
  roundRect(ctx, 0, 0, CARD_W, CARD_H, RADIUS)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  // ── 顶部蓝色装饰条 ──
  ctx.save()
  roundRect(ctx, 0, 0, CARD_W, 6, { tl: RADIUS, tr: RADIUS, bl: 0, br: 0 })
  ctx.fillStyle = '#4A9FE4'
  ctx.fill()
  ctx.restore()

  // ── 左侧文字区 ──
  const textMaxX = CARD_W - QR_SIZE - PAD * 2  // 文字区右边界
  let textY = PAD + 30

  ctx.font = 'bold 20px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillStyle = '#1a1a1a'
  ctx.fillText('📶  WiFi 连接信息', PAD, textY)
  textY += 30

  ctx.strokeStyle = 'rgba(0,0,0,0.08)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, textY)
  ctx.lineTo(textMaxX - 8, textY)
  ctx.stroke()
  textY += 24

  const fields = [
    { label: '名  称', value: ssid.value,                       mono: false },
    { label: '密  码', value: password.value || '无需密码',     mono: true  },
    { label: '加  密', value: password.value ? 'WPA / WPA2 / WPA3' : '开放网络', mono: false },
  ]

  for (const field of fields) {
    // 标签
    ctx.font = '12px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillStyle = 'rgba(0,0,0,0.38)'
    ctx.fillText(field.label, PAD, textY)

    // 值
    ctx.font = field.mono
      ? '500 13px "Courier New", monospace'
      : '500 13px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillStyle = '#1a1a1a'
    const maxW   = textMaxX - PAD - 52
    const valStr = truncateText(ctx, field.value, maxW)
    ctx.fillText(valStr, PAD + 52, textY)
    textY += 32
  }

  // 底部提示文字
  ctx.font = '11px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.fillText('扫描右侧二维码即可连接', PAD, CARD_H - PAD + 6)

  // ── 右侧二维码 ──
  const qrCanvas = document.querySelector('.wifi-card__qr canvas') as HTMLCanvasElement
  if (qrCanvas) {
    const qrX = CARD_W - QR_SIZE - PAD
    const qrY = (CARD_H - QR_SIZE) / 2 + 3
    // 白底衬底
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(qrX - 6, qrY - 6, QR_SIZE + 12, QR_SIZE + 12)
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

function goBack() {
  props.navigateTo('wifi-query')
}
</script>

<template>
  <div class="wifi-card">
    <!-- 顶部导航 -->
    <div class="wifi-card__header">
      <button class="wifi-card__back" @click="goBack">← 返回</button>
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
          class="wifi-card__btn"
          :class="{ 'wifi-card__btn--saved': saved }"
          :disabled="!ssid"
          @click="saveImage"
        >
          {{ saved ? '已保存 ✓' : '保存图片' }}
        </button>
      </div>

      <p class="wifi-card__tip">图片保存到下载目录，可直接打印或发送给他人</p>
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
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
  flex-shrink: 0;
}
.wifi-card__back {
  background: transparent;
  border: none;
  color: var(--blue);
  cursor: pointer;
  font-size: 13px;
  padding: 2px 6px;
  line-height: 1.8;
  border-radius: 4px;
  transition: opacity 0.15s;
}
.wifi-card__back:active { opacity: 0.6; }
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
  padding: 7px 28px;
  font-size: 13px;
  border-radius: 6px;
  background: var(--blue);
  color: #fff;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s, background 0.2s;
  line-height: 1.8;
}
.wifi-card__btn--saved   { background: #48bb78; }
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
