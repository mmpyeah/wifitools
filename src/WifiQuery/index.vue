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
const deletingSSID = ref('')    // 当前正在确认删除的 SSID
const deleteError = ref('')     // 删除失败提示
const contextMenuItem = ref<SavedWifi | null>(null)  // 右键菜单目标
const contextMenuPos = ref({ x: 0, y: 0 })  // 右键菜单位置

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

function showCard(item: SavedWifi) {
  props.navigateTo('wifi-card', {
    ssid: item.ssid,
    password: item.password || ''
  })
}

function confirmDelete(item: SavedWifi) {
  deletingSSID.value = item.ssid
  deleteError.value = ''
}

function cancelDelete() {
  deletingSSID.value = ''
  deleteError.value = ''
}

function doDelete(item: SavedWifi) {
  if (!confirm(`确定要删除已保存的 WiFi「${item.ssid}」吗？`)) return
  try {
    window.services.deleteWifiProfile(item.ssid)
    wifiList.value = wifiList.value.filter(i => i.ssid !== item.ssid)
    deletingSSID.value = ''
    deleteError.value = ''
    contextMenuItem.value = null
  } catch (err: any) {
    deleteError.value = err.message || '删除失败'
  }
}

// 右键菜单
function showContextMenu(event: MouseEvent, item: SavedWifi) {
  event.preventDefault()
  contextMenuItem.value = item
  contextMenuPos.value = { x: event.clientX, y: event.clientY }
}

function hideContextMenu() {
  contextMenuItem.value = null
}

// 点击其他区域关闭右键菜单
onMounted(() => {
  document.addEventListener('click', hideContextMenu)
})

// ─── 周边热点 Tab ────────────────────────────────────────
const nearbyLoading = ref(false)
const nearbyError = ref('')
const nearbyLocationRequired = ref(false)
const nearbyWifiOff = ref(false)
const nearbyList = ref<NearbyWifi[]>([])
const nearbyLoaded = ref(false)
const currentSsid = ref<string | null>(null)

// 连接相关状态
const connectingSsid = ref<string | null>(null)  // 正在连接的 SSID
const connectError = ref('')
const passwordInput = ref('')  // 密码输入
const showPasswordModal = ref(false)  // 是否显示密码输入弹窗
const targetWifi = ref<NearbyWifi | null>(null)  // 目标 WiFi（用于密码输入弹窗）

const filteredNearby = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return nearbyList.value
  return nearbyList.value.filter(i => i.ssid.toLowerCase().includes(kw))
})

// 判断是否为开放网络
function isOpenNetwork(auth: string): boolean {
  if (!auth) return true
  const lower = auth.toLowerCase()
  return lower.includes('open') || lower.includes('开放') || lower.includes('nopass') || lower === 'none'
}

// 判断 SSID 是否与当前连接一致（忽略首尾空白）
function isCurrentSsid(ssid: string): boolean {
  if (!currentSsid.value || !ssid) return false
  return currentSsid.value.trim() === ssid.trim()
}

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

// 连接 WiFi
function handleConnect(item: NearbyWifi) {
  // 如果是已连接的网络，不处理
  if (item.ssid === currentSsid.value) return

  // 如果是已保存的网络，直接连接
  if (item.saved) {
    doConnect(item.ssid, null)
    return
  }

  // 如果是开放网络，直接连接
  if (isOpenNetwork(item.auth)) {
    doConnect(item.ssid, null)
    return
  }

  // 需要输入密码
  targetWifi.value = item
  passwordInput.value = ''
  connectError.value = ''
  showPasswordModal.value = true
}

function doConnect(ssid: string, password: string | null) {
  connectingSsid.value = ssid
  connectError.value = ''
  showPasswordModal.value = false

  try {
    window.services.connectWifi(ssid, password)
    // 连接命令发出后，提示用户等待
    window.utools.showNotification(`正在连接到 "${ssid}"...`)
    // 关闭弹窗
    targetWifi.value = null
    passwordInput.value = ''
  } catch (err: any) {
    connectError.value = err.message || '连接失败'
    showPasswordModal.value = true
    targetWifi.value = nearbyList.value.find(i => i.ssid === ssid) || null
  } finally {
    // 延迟清除连接状态，让用户看到反馈
    setTimeout(() => {
      connectingSsid.value = null
    }, 2000)
  }
}

function cancelConnect() {
  showPasswordModal.value = false
  targetWifi.value = null
  passwordInput.value = ''
  connectError.value = ''
}

function submitPassword() {
  if (!targetWifi.value || !passwordInput.value) return
  doConnect(targetWifi.value.ssid, passwordInput.value)
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
      <span class="wifi-query__search-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="wifi-query__search-svg">
          <circle cx="11" cy="11" r="7"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
      </span>
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
        <li
          v-for="item in filteredSaved"
          :key="item.ssid"
          class="wifi-query__item"
          @contextmenu="showContextMenu($event, item)"
        >
          <div class="wifi-query__item-header">
            <span class="wifi-query__ssid">
              <span class="wifi-query__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="wifi-query__wifi-svg">
                  <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
                  <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                  <circle cx="12" cy="20" r="1" fill="currentColor"/>
                </svg>
              </span>
              {{ item.ssid }}
            </span>
            <div class="wifi-query__actions">
              <button
                v-if="item.password"
                class="wifi-query__btn"
                :class="{ 'wifi-query__btn--copied': copiedSsid === item.ssid }"
                @click="copyPassword(item)"
              >{{ copiedSsid === item.ssid ? '已复制' : '复制' }}</button>
              <button class="wifi-query__btn wifi-query__btn--ghost" @click="showCard(item)">分享</button>
            </div>
          </div>
          <div class="wifi-query__password">
            <template v-if="item.password">
              <span class="wifi-query__pass-chip">
                <span v-if="item.visible">{{ item.password }}</span>
                <span v-else class="wifi-query__mask">••••••••••</span>
              </span>
              <button class="wifi-query__toggle-visibility" @click.stop="toggleVisible(item)">
                <svg v-if="item.visible" class="wifi-query__eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <svg v-else class="wifi-query__eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </template>
            <span v-else class="wifi-query__no-password">无密码 / 企业认证</span>
          </div>
        </li>
      </ul>
      <!-- 右键菜单 -->
      <Teleport to="body">
        <div
          v-if="contextMenuItem"
          class="wifi-query__context-menu"
          :style="{ left: contextMenuPos.x + 'px', top: contextMenuPos.y + 'px' }"
          @click.stop
        >
          <div class="wifi-query__context-item" @click="() => { copyPassword(contextMenuItem!); hideContextMenu() }">
            复制密码
          </div>
          <div class="wifi-query__context-item" @click="() => { showQrcode(contextMenuItem!); hideContextMenu() }">
            查看二维码
          </div>
          <div class="wifi-query__context-divider"></div>
          <div class="wifi-query__context-item wifi-query__context-item--danger" @click="() => { doDelete(contextMenuItem!); hideContextMenu() }">
            删除
          </div>
        </div>
      </Teleport>
      <div v-if="!savedLoading && !savedError && wifiList.length > 0" class="wifi-query__footer">
        <span>共 {{ wifiList.length }} 个已保存
          <template v-if="keyword && filteredSaved.length !== wifiList.length">
            ，显示 {{ filteredSaved.length }} 个
          </template>
        </span>
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
              <span class="signal-bars" :class="signalClass(item.signal)">
                <span></span><span></span><span></span><span></span>
              </span>
              <span class="wifi-query__ssid-text">
                {{ item.ssid }}
                <span v-if="isCurrentSsid(item.ssid)" class="wifi-query__badge wifi-query__badge--connected">已连接</span>
                <span v-else-if="item.saved" class="wifi-query__badge wifi-query__badge--saved">已保存</span>
              </span>
            </div>
            <div class="wifi-query__nearby-meta">
              <span class="wifi-query__signal-pct">{{ item.signal }}%</span>
              <button
                v-if="!isCurrentSsid(item.ssid)"
                class="wifi-query__btn"
                :class="{ 'wifi-query__btn--connecting': connectingSsid === item.ssid }"
                @click="handleConnect(item)"
              >
                {{ connectingSsid === item.ssid ? '连接中...' : '连接' }}
              </button>
            </div>
          </div>
          <div class="wifi-query__nearby-info">
            <span v-if="item.band">{{ item.band }}</span>
            <span v-if="item.band && item.auth"> · </span>
            <span v-if="item.auth">{{ item.auth }}</span>
          </div>
        </li>
      </ul>
      <!-- 密码输入弹窗 -->
      <Teleport to="body">
        <div v-if="showPasswordModal" class="wifi-query__modal-overlay" @click.self="cancelConnect">
          <div class="wifi-query__modal">
            <div class="wifi-query__modal-header">
              <span>连接到 WiFi</span>
              <button class="wifi-query__modal-close" @click="cancelConnect">&times;</button>
            </div>
            <div class="wifi-query__modal-body">
              <div class="wifi-query__modal-ssid">
                <span class="wifi-query__icon wifi-query__modal-wifi-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="wifi-query__wifi-svg">
                    <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
                    <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                    <circle cx="12" cy="20" r="1" fill="currentColor"/>
                  </svg>
                </span>
                <span>{{ targetWifi?.ssid }}</span>
              </div>
              <div class="wifi-query__modal-field">
                <label>密码</label>
                <div class="wifi-query__modal-input-wrap">
                  <input
                    v-model="passwordInput"
                    type="password"
                    class="wifi-query__modal-input"
                    placeholder="请输入 WiFi 密码"
                    @keyup.enter="submitPassword"
                  />
                </div>
              </div>
              <div v-if="connectError" class="wifi-query__modal-error">{{ connectError }}</div>
            </div>
            <div class="wifi-query__modal-footer">
              <button class="wifi-query__btn wifi-query__btn--ghost" @click="cancelConnect">取消</button>
              <button
                class="wifi-query__btn"
                :disabled="!passwordInput"
                @click="submitPassword"
              >连接</button>
            </div>
          </div>
        </div>
      </Teleport>
      <div v-if="!nearbyLoading" class="wifi-query__footer">
        <span v-if="nearbyLoaded">
          共发现 {{ nearbyList.length }} 个热点
          <template v-if="keyword && filteredNearby.length !== nearbyList.length">
            ，显示 {{ filteredNearby.length }} 个
          </template>
        </span>
        <span v-else></span>
        <button class="wifi-query__refresh" @click="scanNearby">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="wifi-query__refresh-icon">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M8 16H3v5"/>
          </svg>
          {{ nearbyLoading ? '扫描中...' : '刷新' }}
        </button>
      </div>
    </template>

    <!-- ══════════ 网络状态 Tab ══════════ -->
    <template v-if="activeTab === 'status'">
      <div v-if="statusLoading" class="wifi-query__status">正在读取网络状态...</div>
      <div v-else-if="!statusData" class="wifi-query__status">
        <div class="wifi-query__empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="wifi-query__empty-icon">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <circle cx="12" cy="20" r="1" fill="currentColor"/>
          </svg>
          <span>当前未连接 WiFi</span>
        </div>
      </div>
      <div v-else class="wifi-status">
        <!-- SSID + 信号 -->
        <div class="wifi-status__header">
          <span class="signal-bars" :class="signalClass(parseInt(statusData.signal))">
            <span></span><span></span><span></span><span></span>
          </span>
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
        <span></span>
        <button class="wifi-query__refresh" @click="loadStatus">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="wifi-query__refresh-icon">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M8 16H3v5"/>
          </svg>
          刷新
        </button>
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
  background: var(--bg-primary);
  color: var(--text-primary);
}

.wifi-query__search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 0.5px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-primary);
}
.wifi-query__search-icon {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 13px;
  opacity: 0.7;
}
.wifi-query__input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  color: var(--text-primary);
  font-family: inherit;
}
.wifi-query__input::placeholder { color: var(--text-tertiary); }

.wifi-query__tabs {
  display: flex;
  border-bottom: 0.5px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-primary);
  padding: 0 4px;
}
.wifi-query__tab {
  flex: 1;
  padding: 9px 0;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: color var(--transition), border-color var(--transition);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.wifi-query__tab--active {
  color: var(--blue);
  border-bottom-color: var(--blue);
}
.wifi-query__tab-count {
  background: var(--blue-badge);
  color: var(--blue);
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 10px;
  line-height: 1.6;
}

.wifi-query__status {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 13px;
}
.wifi-query__error {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--danger);
  padding: 20px;
  text-align: center;
  font-size: 13px;
}

.wifi-query__list {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 4px 0;
  list-style: none;
}
.wifi-query__item {
  padding: 10px 14px;
  border-bottom: 0.5px solid var(--border);
  transition: background var(--transition);
}
.wifi-query__item:last-child { border-bottom: none; }
.wifi-query__item:hover { background: var(--bg-secondary); }
.wifi-query__item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.wifi-query__ssid {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  overflow: hidden;
  min-width: 0;
  flex: 1;
}
.wifi-query__ssid-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-primary);
}
.wifi-query__icon {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--blue-badge);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--blue);
  line-height: 0;
}
.wifi-query__wifi-svg {
  width: 15px;
  height: 15px;
  stroke: var(--blue);
}
.wifi-query__search-svg {
  width: 14px;
  height: 14px;
  stroke: var(--text-tertiary);
}
.wifi-query__refresh-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}
.wifi-query__modal-wifi-icon {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
}
.wifi-query__actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  align-items: center;
  margin-left: auto;
}

.wifi-query__password {
  margin-top: 6px;
  padding-left: 36px;
  font-size: 12px;
  font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
  display: flex;
  align-items: center;
  gap: 8px;
}
.wifi-query__pass-chip {
  background: var(--bg-secondary);
  border: 0.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  color: var(--text-secondary);
  letter-spacing: 0.4px;
  font-size: 12px;
}
.wifi-query__mask { letter-spacing: 2px; color: var(--text-tertiary); }
.wifi-query__no-password { font-family: inherit; font-style: italic; color: var(--text-tertiary); font-size: 12px; }
.wifi-query__toggle-visibility {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  color: var(--text-tertiary);
  transition: color var(--transition);
  display: flex;
  align-items: center;
}
.wifi-query__toggle-visibility:hover { color: var(--text-secondary); }
.wifi-query__eye-icon { width: 14px; height: 14px; }
.wifi-query__wifi-svg { width: 15px; height: 15px; display: block; }
.wifi-query__search-svg { width: 14px; height: 14px; display: block; }

.wifi-query__btn {
  padding: 3px 11px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  border-radius: var(--radius-sm);
  line-height: 1.8;
  background: var(--blue);
  color: #fff;
  border: 0.5px solid var(--blue);
  cursor: pointer;
  transition: background var(--transition), opacity var(--transition);
  white-space: nowrap;
}
.wifi-query__btn:hover { background: var(--blue-hover); }
.wifi-query__btn:active { opacity: 0.8; }
.wifi-query__btn--ghost {
  background: transparent;
  color: var(--blue);
  border: 0.5px solid var(--border-mid);
}
.wifi-query__btn--ghost:hover { background: var(--blue-light); }
.wifi-query__btn--copied { background: var(--success); border-color: var(--success); color: #fff; }
.wifi-query__btn--danger { background: transparent; color: var(--danger); border: 0.5px solid var(--border-mid); }
.wifi-query__btn--danger:hover { background: rgba(220,38,38,0.07); }
.wifi-query__btn--connecting { opacity: 0.55; cursor: not-allowed; }

.wifi-query__delete-confirm {
  margin-top: 8px;
  padding: 8px 10px;
  background: rgba(220,38,38,0.06);
  border: 0.5px solid rgba(220,38,38,0.2);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.wifi-query__delete-tip { font-size: 12px; color: var(--danger); }
.wifi-query__delete-actions { display: flex; gap: 6px; }
.wifi-query__delete-error { font-size: 11px; color: var(--danger); opacity: 0.8; }

.wifi-query__footer {
  padding: 7px 14px;
  font-size: 11px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  border-top: 0.5px solid var(--border);
  background: var(--bg-secondary);
  flex-shrink: 0;
}
.wifi-query__footer-sep { opacity: 0.5; }
.wifi-query__refresh {
  background: transparent;
  border: none;
  color: var(--blue);
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
  font-weight: 500;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: opacity var(--transition);
}
.wifi-query__refresh:active { opacity: 0.6; }

.wifi-query__nearby-meta { flex-shrink: 0; display: flex; align-items: center; gap: 6px; margin-left: auto; }
.wifi-query__signal-pct { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--text-tertiary); min-width: 30px; text-align: right; }
.wifi-query__nearby-info { margin-top: 4px; padding-left: 36px; font-size: 11px; color: var(--text-tertiary); }

.signal-bars {
  display: inline-flex;
  gap: 2px;
  align-items: flex-end;
  flex-shrink: 0;
  width: 18px;
  height: 16px;
}
.signal-bars span {
  display: block;
  width: 3px;
  border-radius: 1px;
  background: var(--border-mid);
}
.signal-bars span:nth-child(1) { height: 5px; }
.signal-bars span:nth-child(2) { height: 8px; }
.signal-bars span:nth-child(3) { height: 11px; }
.signal-bars span:nth-child(4) { height: 15px; }
.signal--good span { background: var(--success); }
.signal--mid  span:nth-child(1),
.signal--mid  span:nth-child(2),
.signal--mid  span:nth-child(3) { background: #d97706; }
.signal--weak span:nth-child(1) { background: var(--danger); }

.wifi-query__badge {
  font-size: 10px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}
.wifi-query__badge--connected { background: rgba(22,163,74,0.12); color: var(--success); }
.wifi-query__badge--saved { background: var(--blue-badge); color: var(--blue); }

.wifi-query__location-tip {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
}
.wifi-query__location-icon { font-size: 36px; line-height: 1; }
.wifi-query__location-title { font-weight: 600; font-size: 14px; color: var(--text-primary); }
.wifi-query__location-desc { font-size: 12px; color: var(--text-tertiary); max-width: 240px; line-height: 1.7; }
.wifi-query__location-btn {
  margin-top: 4px;
  padding: 6px 20px;
  background: var(--blue);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--transition);
}
.wifi-query__location-btn:hover { background: var(--blue-hover); }

.wifi-status {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 14px;
  gap: 10px;
  overflow-y: auto;
}
.wifi-status__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  border: 0.5px solid var(--border);
}
.wifi-status__ssid {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}
.wifi-status__signal { font-size: 11px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.wifi-status__table {
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  border: 0.5px solid var(--border);
  overflow: hidden;
}
.wifi-status__row {
  display: flex;
  align-items: center;
  padding: 9px 14px;
  border-bottom: 0.5px solid var(--border);
  gap: 10px;
}
.wifi-status__row:last-child { border-bottom: none; }
.wifi-status__label { font-size: 11px; color: var(--text-tertiary); width: 40px; flex-shrink: 0; }
.wifi-status__value { flex: 1; font-size: 13px; font-weight: 500; color: var(--text-primary); }
.wifi-status__value--small { font-size: 12px; font-weight: 400; color: var(--text-secondary); word-break: break-all; }
.wifi-status__value--ip { font-family: "SF Mono", "Fira Code", monospace; letter-spacing: 0.3px; }
.wifi-status__copy {
  flex-shrink: 0;
  padding: 2px 9px;
  font-size: 11px;
  font-weight: 500;
  font-family: inherit;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--blue);
  border: 0.5px solid var(--border-mid);
  cursor: pointer;
  transition: background var(--transition);
  line-height: 1.9;
}
.wifi-status__copy:hover { background: var(--blue-light); }
.wifi-status__copy--done { background: var(--success); border-color: var(--success); color: #fff; }

.wifi-query__context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--bg-primary);
  border: 0.5px solid var(--border-mid);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  padding: 5px 0;
  min-width: 148px;
  font-size: 13px;
}
.wifi-query__context-item { padding: 8px 14px; cursor: pointer; color: var(--text-primary); transition: background var(--transition); }
.wifi-query__context-item:hover { background: var(--bg-secondary); }
.wifi-query__context-item--danger { color: var(--danger); }
.wifi-query__context-item--danger:hover { background: rgba(220,38,38,0.07); }
.wifi-query__context-divider { height: 0.5px; background: var(--border); margin: 4px 0; }

.wifi-query__modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}
.wifi-query__modal {
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  border: 0.5px solid var(--border-mid);
  width: 300px;
  box-shadow: 0 12px 36px rgba(0,0,0,0.18);
  overflow: hidden;
}
.wifi-query__modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 16px;
  font-weight: 600;
  font-size: 13px;
  border-bottom: 0.5px solid var(--border);
}
.wifi-query__modal-close {
  background: var(--bg-secondary);
  border: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition);
  padding: 0;
}
.wifi-query__modal-close:hover { background: var(--bg-tertiary); color: var(--text-primary); }
.wifi-query__modal-body { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.wifi-query__modal-ssid { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; color: var(--text-primary); }
.wifi-query__modal-icon { font-size: 16px; }
.wifi-query__modal-field { display: flex; flex-direction: column; gap: 6px; }
.wifi-query__modal-field label { font-size: 11px; font-weight: 500; color: var(--text-tertiary); }
.wifi-query__modal-input-wrap { position: relative; }
.wifi-query__modal-input {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 0.5px solid var(--border-mid);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-family: inherit;
  color: var(--text-primary);
  outline: none;
  box-sizing: border-box;
  transition: border-color var(--transition);
}
.wifi-query__modal-input:focus { border-color: var(--blue); }
.wifi-query__modal-error { font-size: 12px; color: var(--danger); }
.wifi-query__modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 0.5px solid var(--border);
  background: var(--bg-secondary);
}

.wifi-query__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--text-tertiary);
  font-size: 13px;
}
.wifi-query__empty-icon {
  width: 36px;
  height: 36px;
  opacity: 0.45;
}
</style>
