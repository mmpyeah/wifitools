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

// ─── 类型 ───────────────────────────────────────────────
interface SavedWifi {
  ssid: string
  password: string | null
  visible: boolean
}

interface NearbyWifi {
  ssid: string
  signal: number
  band: string
  auth: string
  saved: boolean
}

// ─── 公共状态 ────────────────────────────────────────────
const activeTab = ref<'saved' | 'nearby' | 'status'>('saved')
const keyword = ref('')
const copiedSsid = ref('')

// ─── 已保存 Tab ──────────────────────────────────────────
const savedLoading = ref(true)
const savedError = ref('')
const wifiList = ref<SavedWifi[]>([])

const filteredSaved = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return wifiList.value
  return wifiList.value.filter(i => i.ssid.toLowerCase().includes(kw))
})

onMounted(() => {
  loadSaved()
})

function loadSaved() {
  savedLoading.value = true
  savedError.value = ''
  try {
    const ssids: string[] = window.services.listSavedWifi()
    wifiList.value = ssids.map(ssid => ({
      ssid,
      password: window.services.getWifiPassword(ssid),
      visible: false
    }))
  } catch (err: any) {
    savedError.value = err.message || '获取 WiFi 列表失败'
  } finally {
    savedLoading.value = false
  }
}

function toggleVisible(item: SavedWifi) {
  item.visible = !item.visible
}

function copyPassword(item: SavedWifi) {
  if (!item.password) return
  window.utools.copyText(item.password)
  copiedSsid.value = item.ssid
  setTimeout(() => { copiedSsid.value = '' }, 1500)
}

function showQrcode(item: SavedWifi) {
  props.navigateTo('wifi-qrcode', {
    ssid: item.ssid,
    password: item.password || ''
  })
}

// ─── 周边热点 Tab ────────────────────────────────────────
const nearbyLoading = ref(false)
const nearbyError = ref('')
const nearbyLocationRequired = ref(false)
const nearbyWifiOff = ref(false)
const nearbyList = ref<NearbyWifi[]>([])
const nearbyLoaded = ref(false)
const currentSsid = ref<string | null>(null)

const filteredNearby = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return nearbyList.value
  return nearbyList.value.filter(i => i.ssid.toLowerCase().includes(kw))
})

function switchTab(tab: 'saved' | 'nearby' | 'status') {
  activeTab.value = tab
  keyword.value = ''
  if (tab === 'nearby' && !nearbyLoaded.value) {
    scanNearby()
  }
  if (tab === 'status') {
    loadStatus()
  }
}

function scanNearby() {
  nearbyLoading.value = true
  nearbyError.value = ''
  nearbyLocationRequired.value = false
  nearbyWifiOff.value = false
  // 用 setTimeout 让 loading 状态先渲染出来，再执行耗时同步命令
  setTimeout(() => {
    try {
      currentSsid.value = window.services.getCurrentWifi()
      const savedSsids = wifiList.value.map(i => i.ssid)
      nearbyList.value = window.services.scanWifiNetworks(savedSsids)
      nearbyLoaded.value = true
    } catch (err: any) {
      if (err.code === 'LOCATION_REQUIRED') {
        nearbyLocationRequired.value = true
      } else if (err.code === 'WIFI_OFF') {
        nearbyWifiOff.value = true
      } else {
        nearbyError.value = err.message || '扫描失败'
      }
    } finally {
      nearbyLoading.value = false
    }
  }, 50)
}

function openWifiSettings() {
  window.utools.shellOpenExternal('ms-settings:network-wifi')
}

function openLocationSettings() {
  window.utools.shellOpenExternal('ms-settings:privacy-location')
}

// ─── 网络状态 Tab ────────────────────────────────────────
interface WifiStatus {
  ssid: string
  signal: string
  channel: string
  rxRate: string
  txRate: string
  auth: string
  adapter: string
  adapterName: string
  mac: string
  ipv4: string
  ipv6: string
}

const statusLoading = ref(false)
const statusData = ref<WifiStatus | null>(null)
const copiedIP = ref(false)

function loadStatus() {
  statusLoading.value = true
  setTimeout(() => {
    statusData.value = window.services.getWifiStatus()
    statusLoading.value = false
  }, 50)
}

function copyIP() {
  if (!statusData.value?.ipv4) return
  window.utools.copyText(statusData.value.ipv4)
  copiedIP.value = true
  setTimeout(() => { copiedIP.value = false }, 1500)
}

// 信号强度 → 格数图标、颜色（与周边热点 Tab 共用）
function signalIcon(signal: number): string {
  if (signal >= 80) return '▂▄▆█'
  if (signal >= 60) return '▂▄▆░'
  if (signal >= 40) return '▂▄░░'
  if (signal >= 20) return '▂░░░'
  return '░░░░'
}

function signalClass(signal: number): string {
  if (signal >= 70) return 'signal--good'
  if (signal >= 40) return 'signal--mid'
  return 'signal--weak'
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
        :placeholder="activeTab === 'saved' ? '搜索已保存的 WiFi...' : '搜索周边热点...'"
        autofocus
      />
    </div>

    <!-- Tab 切换 -->
    <div class="wifi-query__tabs">
      <button
        class="wifi-query__tab"
        :class="{ 'wifi-query__tab--active': activeTab === 'saved' }"
        @click="switchTab('saved')"
      >
        已保存
        <span v-if="wifiList.length" class="wifi-query__tab-count">{{ wifiList.length }}</span>
      </button>
      <button
        class="wifi-query__tab"
        :class="{ 'wifi-query__tab--active': activeTab === 'nearby' }"
        @click="switchTab('nearby')"
      >
        周边热点
        <span v-if="nearbyLoaded && nearbyList.length" class="wifi-query__tab-count">{{ nearbyList.length }}</span>
      </button>
      <button
        class="wifi-query__tab"
        :class="{ 'wifi-query__tab--active': activeTab === 'status' }"
        @click="switchTab('status')"
      >
        网络状态
      </button>
    </div>

    <!-- ══════════ 已保存 Tab ══════════ -->
    <template v-if="activeTab === 'saved'">
      <div v-if="savedLoading" class="wifi-query__status">正在读取...</div>
      <div v-else-if="savedError" class="wifi-query__error">{{ savedError }}</div>
      <div v-else-if="filteredSaved.length === 0" class="wifi-query__status">
        {{ keyword ? '没有匹配的 WiFi' : '未找到已保存的 WiFi' }}
      </div>
      <ul v-else class="wifi-query__list">
        <li v-for="item in filteredSaved" :key="item.ssid" class="wifi-query__item">
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
              >{{ item.visible ? '隐藏' : '显示' }}</button>
              <button
                v-if="item.password"
                class="wifi-query__btn"
                :class="{ 'wifi-query__btn--copied': copiedSsid === item.ssid }"
                @click="copyPassword(item)"
              >{{ copiedSsid === item.ssid ? '已复制' : '复制' }}</button>
              <button class="wifi-query__btn wifi-query__btn--ghost" @click="showQrcode(item)">二维码</button>
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
      <div v-if="!savedLoading && !savedError && wifiList.length > 0" class="wifi-query__footer">
        共 {{ wifiList.length }} 个已保存
        <template v-if="keyword && filteredSaved.length !== wifiList.length">
          ，显示 {{ filteredSaved.length }} 个
        </template>
      </div>
    </template>

    <!-- ══════════ 周边热点 Tab ══════════ -->
    <template v-if="activeTab === 'nearby'">
      <div v-if="nearbyLoading" class="wifi-query__status">正在扫描周边热点...</div>

      <!-- WiFi 未开启 -->
      <div v-else-if="nearbyWifiOff" class="wifi-query__location-tip">
        <div class="wifi-query__location-icon">📵</div>
        <div class="wifi-query__location-title">WiFi 未开启</div>
        <div class="wifi-query__location-desc">请先开启 WiFi，再来扫描周边热点</div>
        <button class="wifi-query__location-btn" @click="openWifiSettings">打开 WiFi 设置</button>
        <button class="wifi-query__refresh" style="margin-top:8px" @click="scanNearby">已开启，重新扫描</button>
      </div>

      <!-- 需要位置权限 -->
      <div v-else-if="nearbyLocationRequired" class="wifi-query__location-tip">
        <div class="wifi-query__location-icon">📍</div>
        <div class="wifi-query__location-title">需要位置服务权限</div>
        <div class="wifi-query__location-desc">请在位置设置页中，开启「位置服务」并打开「允许桌面应用访问你的位置」</div>
        <button class="wifi-query__location-btn" @click="openLocationSettings">打开位置设置</button>
        <button class="wifi-query__refresh" style="margin-top:8px" @click="scanNearby">已开启，重新扫描</button>
      </div>

      <!-- 其他错误 -->
      <div v-else-if="nearbyError" class="wifi-query__error">{{ nearbyError }}</div>

      <div v-else-if="!nearbyLoaded" class="wifi-query__status">准备扫描</div>
      <div v-else-if="filteredNearby.length === 0" class="wifi-query__status">
        {{ keyword ? '没有匹配的热点' : '未找到周边热点' }}
      </div>
      <ul v-else class="wifi-query__list">
        <li v-for="item in filteredNearby" :key="item.ssid" class="wifi-query__item wifi-query__item--nearby">
          <div class="wifi-query__item-header">
            <div class="wifi-query__ssid">
              <span class="signal-bars" :class="signalClass(item.signal)">{{ signalIcon(item.signal) }}</span>
              <span class="wifi-query__ssid-text">
                {{ item.ssid }}
                <span v-if="item.ssid === currentSsid" class="wifi-query__badge wifi-query__badge--connected">已连接</span>
                <span v-else-if="item.saved" class="wifi-query__badge wifi-query__badge--saved">已保存</span>
              </span>
            </div>
            <div class="wifi-query__nearby-meta">
              <span class="wifi-query__signal-pct">{{ item.signal }}%</span>
            </div>
          </div>
          <div class="wifi-query__nearby-info">
            <span v-if="item.band">{{ item.band }}</span>
            <span v-if="item.band && item.auth"> · </span>
            <span v-if="item.auth">{{ item.auth }}</span>
          </div>
        </li>
      </ul>
      <div v-if="!nearbyLoading" class="wifi-query__footer">
        <template v-if="nearbyLoaded">
          共发现 {{ nearbyList.length }} 个热点
          <template v-if="keyword && filteredNearby.length !== nearbyList.length">
            ，显示 {{ filteredNearby.length }} 个
          </template>
          <span class="wifi-query__footer-sep"> · </span>
        </template>
        <button class="wifi-query__refresh" @click="scanNearby">{{ nearbyLoading ? '扫描中...' : '刷新' }}</button>
      </div>
    </template>

    <!-- ══════════ 网络状态 Tab ══════════ -->
    <template v-if="activeTab === 'status'">
      <div v-if="statusLoading" class="wifi-query__status">正在读取网络状态...</div>
      <div v-else-if="!statusData" class="wifi-query__status">
        <div style="text-align:center">
          <div style="font-size:32px;margin-bottom:8px">📵</div>
          <div>当前未连接 WiFi</div>
        </div>
      </div>
      <div v-else class="wifi-status">
        <!-- SSID + 信号 -->
        <div class="wifi-status__header">
          <span class="signal-bars" :class="signalClass(parseInt(statusData.signal))">{{ signalIcon(parseInt(statusData.signal)) }}</span>
          <span class="wifi-status__ssid">{{ statusData.ssid }}</span>
          <span class="wifi-status__signal">{{ statusData.signal }}%</span>
        </div>
        <!-- 信息表格 -->
        <div class="wifi-status__table">
          <div v-if="statusData.ipv4" class="wifi-status__row">
            <span class="wifi-status__label">IPv4</span>
            <span class="wifi-status__value wifi-status__value--ip">{{ statusData.ipv4 }}</span>
            <button class="wifi-status__copy" :class="{ 'wifi-status__copy--done': copiedIP }" @click="copyIP">
              {{ copiedIP ? '✓' : '复制' }}
            </button>
          </div>
          <div v-if="statusData.ipv6" class="wifi-status__row">
            <span class="wifi-status__label">IPv6</span>
            <span class="wifi-status__value wifi-status__value--small">{{ statusData.ipv6 }}</span>
          </div>
          <div v-if="statusData.channel" class="wifi-status__row">
            <span class="wifi-status__label">频道</span>
            <span class="wifi-status__value">{{ statusData.channel }}</span>
          </div>
          <div v-if="statusData.rxRate || statusData.txRate" class="wifi-status__row">
            <span class="wifi-status__label">速率</span>
            <span class="wifi-status__value">收 {{ statusData.rxRate }} / 发 {{ statusData.txRate }} Mbps</span>
          </div>
          <div v-if="statusData.auth" class="wifi-status__row">
            <span class="wifi-status__label">加密</span>
            <span class="wifi-status__value">{{ statusData.auth }}</span>
          </div>
          <div v-if="statusData.mac" class="wifi-status__row">
            <span class="wifi-status__label">MAC</span>
            <span class="wifi-status__value wifi-status__value--small">{{ statusData.mac }}</span>
          </div>
          <div v-if="statusData.adapter" class="wifi-status__row">
            <span class="wifi-status__label">网卡</span>
            <span class="wifi-status__value wifi-status__value--small">{{ statusData.adapter }}</span>
          </div>
        </div>
      </div>
      <div v-if="!statusLoading" class="wifi-query__footer">
        <button class="wifi-query__refresh" @click="loadStatus">刷新</button>
      </div>
    </template>

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

/* 搜索框 */
.wifi-query__search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
  flex-shrink: 0;
}
.wifi-query__search-icon { font-size: 15px; opacity: 0.6; }
.wifi-query__input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 14px;
  color: inherit;
}
.wifi-query__input::placeholder { opacity: 0.4; }

/* Tab */
.wifi-query__tabs {
  display: flex;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
  flex-shrink: 0;
}
.wifi-query__tab {
  flex: 1;
  padding: 8px 0;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: inherit;
  font-size: 13px;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.15s, border-color 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.wifi-query__tab--active {
  opacity: 1;
  border-bottom-color: var(--blue);
  color: var(--blue);
}
.wifi-query__tab-count {
  background: var(--blue);
  color: #fff;
  font-size: 11px;
  padding: 0 5px;
  border-radius: 8px;
  line-height: 1.6;
}

/* 状态 */
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

/* 列表 */
.wifi-query__list {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 6px 0;
  list-style: none;
}
.wifi-query__item {
  padding: 9px 16px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.1);
  transition: background 0.15s;
}
.wifi-query__item:last-child { border-bottom: none; }
.wifi-query__item:hover { background: rgba(128, 128, 128, 0.07); }
.wifi-query__item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.wifi-query__ssid {
  display: flex;
  align-items: center;
  gap: 7px;
  font-weight: 500;
  overflow: hidden;
  min-width: 0;
}
.wifi-query__ssid-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 5px;
}
.wifi-query__icon { flex-shrink: 0; }
.wifi-query__actions { display: flex; gap: 6px; flex-shrink: 0; }

/* 已保存密码行 */
.wifi-query__password {
  margin-top: 3px;
  padding-left: 22px;
  font-size: 13px;
  opacity: 0.7;
  font-family: monospace;
  letter-spacing: 0.5px;
}
.wifi-query__mask { letter-spacing: 2px; opacity: 0.5; }
.wifi-query__no-password { font-family: inherit; font-style: italic; opacity: 0.5; }

/* 周边热点附加信息 */
.wifi-query__nearby-meta {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.wifi-query__signal-pct {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  opacity: 0.6;
  min-width: 34px;
  text-align: right;
}
.wifi-query__nearby-info {
  margin-top: 3px;
  padding-left: 30px;
  font-size: 12px;
  opacity: 0.45;
}

/* 信号格数图标 */
.signal-bars {
  font-family: monospace;
  font-size: 13px;
  letter-spacing: -1px;
  flex-shrink: 0;
}
.signal--good { color: #48bb78; }
.signal--mid  { color: #ed8936; }
.signal--weak { color: #fc8181; }

/* 标记 badge */
.wifi-query__badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: normal;
  white-space: nowrap;
  flex-shrink: 0;
}
.wifi-query__badge--connected { background: #48bb78; color: #fff; }
.wifi-query__badge--saved     { background: rgba(88,164,246,0.15); color: var(--blue); }

/* 按钮 */
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
.wifi-query__btn--copied { background: #48bb78; }
.wifi-query__btn:active { opacity: 0.7; }

/* 底部 */
.wifi-query__footer {
  padding: 7px 16px;
  font-size: 12px;
  opacity: 0.45;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  border-top: 1px solid rgba(128, 128, 128, 0.15);
  flex-shrink: 0;
}
.wifi-query__footer-sep { opacity: 0.5; }
.wifi-query__refresh {
  background: transparent;
  border: none;
  color: var(--blue);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  opacity: 1;
  transition: opacity 0.15s;
}
.wifi-query__refresh:active { opacity: 0.6; }

/* 引导提示（位置权限 / WiFi 未开启）*/
.wifi-query__location-tip {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  text-align: center;
}
.wifi-query__location-icon { font-size: 32px; }
.wifi-query__location-title { font-weight: 600; font-size: 14px; }
.wifi-query__location-desc { font-size: 12px; opacity: 0.5; max-width: 240px; line-height: 1.6; }
.wifi-query__location-btn {
  margin-top: 4px;
  padding: 6px 20px;
  background: var(--blue);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.15s;
}
.wifi-query__location-btn:active { opacity: 0.7; }

@media (prefers-color-scheme: dark) {
  .wifi-query__item:hover { background: rgba(255, 255, 255, 0.05); }
  .wifi-query__badge--saved { background: rgba(88,164,246,0.2); }
}

/* 网络状态 Tab */
.wifi-status {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 12px;
  overflow-y: auto;
}
.wifi-status__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(128,128,128,0.15);
}
.wifi-status__ssid {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wifi-status__signal {
  font-size: 12px;
  opacity: 0.5;
  font-variant-numeric: tabular-nums;
}
.wifi-status__table {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.wifi-status__row {
  display: flex;
  align-items: center;
  padding: 7px 0;
  border-bottom: 1px solid rgba(128,128,128,0.08);
  gap: 8px;
}
.wifi-status__row:last-child { border-bottom: none; }
.wifi-status__label {
  font-size: 12px;
  opacity: 0.45;
  width: 36px;
  flex-shrink: 0;
}
.wifi-status__value {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
}
.wifi-status__value--small {
  font-size: 12px;
  font-weight: normal;
  opacity: 0.75;
  word-break: break-all;
}
.wifi-status__value--ip {
  font-family: monospace;
  letter-spacing: 0.3px;
}
.wifi-status__copy {
  flex-shrink: 0;
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 4px;
  background: transparent;
  color: var(--blue);
  border: 1px solid var(--blue);
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1.8;
}
.wifi-status__copy--done {
  background: #48bb78;
  border-color: #48bb78;
  color: #fff;
}
</style>
