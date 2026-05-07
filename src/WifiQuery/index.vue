<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  enterAction: {
    type: Object,
    required: true
  },
  navigateTo: {
    type: Function,
    required: true
  }
})

interface WifiItem {
  ssid: string
  password: string | null
  visible: boolean
}

const loading = ref(true)
const error = ref('')
const keyword = ref('')
const wifiList = ref<WifiItem[]>([])
const copiedSsid = ref('')

const filteredList = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return wifiList.value
  return wifiList.value.filter(item => item.ssid.toLowerCase().includes(kw))
})

onMounted(() => {
  try {
    const ssids: string[] = window.services.listSavedWifi()
    wifiList.value = ssids.map(ssid => ({
      ssid,
      password: window.services.getWifiPassword(ssid),
      visible: false
    }))
  } catch (err: any) {
    error.value = err.message || '获取 WiFi 列表失败'
  } finally {
    loading.value = false
  }
})

function toggleVisible(item: WifiItem) {
  item.visible = !item.visible
}

function copyPassword(item: WifiItem) {
  if (!item.password) return
  window.utools.copyText(item.password)
  copiedSsid.value = item.ssid
  setTimeout(() => { copiedSsid.value = '' }, 1500)
}

function showQrcode(item: WifiItem) {
  props.navigateTo('wifi-qrcode', {
    ssid: item.ssid,
    password: item.password || ''
  })
}
</script>

<template>
  <div class="wifi-query">
    <!-- 搜索框 -->
    <div class="wifi-query__search">
      <span class="wifi-query__search-icon">🔍</span>
      <input
        v-model="keyword"
        class="wifi-query__input"
        type="text"
        placeholder="搜索 WiFi 名称..."
        autofocus
      />
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="wifi-query__status">
      正在读取 WiFi 列表...
    </div>

    <!-- 错误 -->
    <div v-else-if="error" class="wifi-query__error">
      {{ error }}
    </div>

    <!-- 空结果 -->
    <div v-else-if="filteredList.length === 0" class="wifi-query__status">
      {{ keyword ? '没有匹配的 WiFi' : '未找到已保存的 WiFi' }}
    </div>

    <!-- WiFi 列表 -->
    <ul v-else class="wifi-query__list">
      <li
        v-for="item in filteredList"
        :key="item.ssid"
        class="wifi-query__item"
      >
        <div class="wifi-query__item-header">
          <span class="wifi-query__ssid">
            <span class="wifi-query__icon">📶</span>
            {{ item.ssid }}
          </span>
          <div class="wifi-query__actions">
            <button
              v-if="item.password"
              class="wifi-query__btn wifi-query__btn--ghost"
              @click="toggleVisible(item)"
            >
              {{ item.visible ? '隐藏' : '显示' }}
            </button>
            <button
              v-if="item.password"
              class="wifi-query__btn"
              :class="{ 'wifi-query__btn--copied': copiedSsid === item.ssid }"
              @click="copyPassword(item)"
            >
              {{ copiedSsid === item.ssid ? '已复制' : '复制' }}
            </button>
            <button
              class="wifi-query__btn wifi-query__btn--qr"
              @click="showQrcode(item)"
            >
              二维码
            </button>
          </div>
        </div>
        <div class="wifi-query__password">
          <template v-if="item.password">
            <span v-if="item.visible">{{ item.password }}</span>
            <span v-else class="wifi-query__mask">••••••••••</span>
          </template>
          <span v-else class="wifi-query__no-password">无密码 / 企业认证</span>
        </div>
      </li>
    </ul>

    <!-- 底部统计 -->
    <div v-if="!loading && !error && wifiList.length > 0" class="wifi-query__footer">
      共 {{ wifiList.length }} 个已保存的 WiFi
      <template v-if="keyword && filteredList.length !== wifiList.length">
        ，当前显示 {{ filteredList.length }} 个
      </template>
    </div>
  </div>
</template>

<style>
.wifi-query {
  display: flex;
  flex-direction: column;
  height: 100vh;
  box-sizing: border-box;
  font-size: 14px;
}

.wifi-query__search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
  flex-shrink: 0;
}

.wifi-query__search-icon {
  font-size: 15px;
  opacity: 0.6;
}

.wifi-query__input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 14px;
  color: inherit;
}

.wifi-query__input::placeholder {
  opacity: 0.4;
}

.wifi-query__status {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
}

.wifi-query__error {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f56565;
  padding: 20px;
  text-align: center;
}

.wifi-query__list {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 8px 0;
  list-style: none;
}

.wifi-query__item {
  padding: 10px 16px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.1);
  transition: background 0.15s;
}

.wifi-query__item:last-child {
  border-bottom: none;
}

.wifi-query__item:hover {
  background: rgba(128, 128, 128, 0.07);
}

.wifi-query__item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.wifi-query__ssid {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wifi-query__icon {
  flex-shrink: 0;
}

.wifi-query__actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.wifi-query__password {
  margin-top: 4px;
  padding-left: 22px;
  font-size: 13px;
  opacity: 0.7;
  font-family: monospace;
  letter-spacing: 0.5px;
}

.wifi-query__mask {
  letter-spacing: 2px;
  opacity: 0.5;
}

.wifi-query__no-password {
  font-family: inherit;
  font-style: italic;
  opacity: 0.5;
}

.wifi-query__btn {
  padding: 2px 10px;
  font-size: 12px;
  border-radius: 4px;
  line-height: 1.8;
  background: var(--blue);
  color: #fff;
  cursor: pointer;
  border: none;
  transition: opacity 0.15s;
}

.wifi-query__btn--ghost {
  background: transparent;
  color: var(--blue);
  border: 1px solid var(--blue);
}

.wifi-query__btn--copied {
  background: #48bb78;
}

.wifi-query__btn--qr {
  background: transparent;
  color: var(--blue);
  border: 1px solid var(--blue);
}

.wifi-query__btn:active {
  opacity: 0.7;
}

.wifi-query__footer {
  padding: 8px 16px;
  font-size: 12px;
  opacity: 0.4;
  text-align: right;
  border-top: 1px solid rgba(128, 128, 128, 0.15);
  flex-shrink: 0;
}

@media (prefers-color-scheme: dark) {
  .wifi-query__item:hover {
    background: rgba(255, 255, 255, 0.05);
  }
}
</style>
