<script lang="ts" setup>
import { ref, computed } from 'vue'
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

const saved = ref(false)

const ssid = computed(() => props.params.ssid || '')
const password = computed(() => props.params.password || '')

// 转义 WiFi 二维码特殊字符：\ ; , " :
function escapeWifi(str: string): string {
  return str.replace(/([\\;,":])/g, '\\$1')
}

// 生成标准 WiFi QR 字符串
const qrcodeValue = computed(() => {
  if (!ssid.value) return ''
  const type = password.value ? 'WPA' : 'nopass'
  return `WIFI:T:${type};S:${escapeWifi(ssid.value)};P:${escapeWifi(password.value)};;`
})

function goBack() {
  props.navigateTo('wifi-query')
}

function saveImage() {
  const canvas = document.querySelector('.wifi-qrcode__canvas canvas') as HTMLCanvasElement
  if (!canvas) return
  const dataUrl = canvas.toDataURL('image/png')
  try {
    const outputPath = window.services.writeImageFile(dataUrl)
    if (outputPath) {
      window.utools.shellShowItemInFolder(outputPath)
    }
    saved.value = true
    setTimeout(() => { saved.value = false }, 1500)
  } catch {
    window.utools.showNotification('保存失败')
  }
}
</script>

<template>
  <div class="wifi-qrcode">
    <!-- 顶部导航 -->
    <div class="wifi-qrcode__header">
      <button class="wifi-qrcode__back" @click="goBack">← 返回</button>
      <span class="wifi-qrcode__title">WiFi 二维码</span>
    </div>

    <div class="wifi-qrcode__body">
      <!-- 二维码 -->
      <div class="wifi-qrcode__canvas">
        <QrcodeCanvas
          :value="qrcodeValue"
          :size="200"
          level="M"
          :margin="2"
        />
      </div>

      <!-- WiFi 信息 -->
      <div class="wifi-qrcode__info">
        <div class="wifi-qrcode__info-row">
          <span class="wifi-qrcode__info-label">名称</span>
          <span class="wifi-qrcode__info-value">{{ ssid }}</span>
        </div>
        <div class="wifi-qrcode__info-row">
          <span class="wifi-qrcode__info-label">密码</span>
          <span class="wifi-qrcode__info-value wifi-qrcode__info-password">
            {{ password || '无' }}
          </span>
        </div>
        <div class="wifi-qrcode__info-row">
          <span class="wifi-qrcode__info-label">加密</span>
          <span class="wifi-qrcode__info-value">{{ password ? 'WPA/WPA2/WPA3' : '开放' }}</span>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="wifi-qrcode__actions">
        <button
          class="wifi-qrcode__btn"
          :class="{ 'wifi-qrcode__btn--saved': saved }"
          @click="saveImage"
        >
          {{ saved ? '已保存 ✓' : '保存图片' }}
        </button>
      </div>

      <p class="wifi-qrcode__tip">用手机相机扫描即可连接</p>
    </div>
  </div>
</template>

<style>
.wifi-qrcode {
  display: flex;
  flex-direction: column;
  height: 100vh;
  box-sizing: border-box;
  font-size: 14px;
}

.wifi-qrcode__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
  flex-shrink: 0;
}

.wifi-qrcode__back {
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

.wifi-qrcode__back:active {
  opacity: 0.6;
}

.wifi-qrcode__title {
  font-weight: 500;
  font-size: 14px;
}

.wifi-qrcode__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 16px;
  gap: 20px;
}

.wifi-qrcode__canvas {
  padding: 12px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  line-height: 0;
}

.wifi-qrcode__info {
  width: 100%;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wifi-qrcode__info-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.wifi-qrcode__info-label {
  font-size: 12px;
  opacity: 0.5;
  width: 28px;
  flex-shrink: 0;
}

.wifi-qrcode__info-value {
  font-size: 14px;
  font-weight: 500;
  word-break: break-all;
}

.wifi-qrcode__info-password {
  font-family: monospace;
  letter-spacing: 0.5px;
}

.wifi-qrcode__actions {
  display: flex;
  gap: 10px;
}

.wifi-qrcode__btn {
  padding: 6px 24px;
  font-size: 13px;
  border-radius: 6px;
  background: var(--blue);
  color: #fff;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s, background 0.2s;
  line-height: 1.8;
}

.wifi-qrcode__btn--saved {
  background: #48bb78;
}

.wifi-qrcode__btn:active {
  opacity: 0.7;
}

.wifi-qrcode__tip {
  font-size: 12px;
  opacity: 0.4;
  margin: 0;
}

@media (prefers-color-scheme: dark) {
  .wifi-qrcode__canvas {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  }
}
</style>
