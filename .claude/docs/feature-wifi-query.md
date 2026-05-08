# 功能：wifi-query — WiFi 密码查询 + 周边热点

> 文件：`src/WifiQuery/index.vue`  
> 触发词：`WiFi密码` / `wifi密码` / `查询WiFi`  
> 首页默认功能（plugin.json features 第一项）

---

## 功能概述

双 Tab 首页：
- **已保存**：列出本机所有已保存 WiFi 的 SSID 和密码
- **周边热点**：扫描并列出周边可用热点，含信号强度、波段、加密方式

---

## Props

```ts
defineProps({
  enterAction: { type: Object, required: true },   // uTools action 对象
  navigateTo:  { type: Function, required: true }  // App.vue 注入的路由函数
})
```

---

## 核心状态

```ts
// 公共
const activeTab = ref<'saved' | 'nearby'>('saved')
const keyword   = ref('')           // 搜索关键字，两个 Tab 共用，切 Tab 时清空

// 已保存 Tab
const wifiList    = ref<SavedWifi[]>([])  // { ssid, password, visible }
const savedLoading = ref(true)
const copiedSsid   = ref('')             // 复制成功后高亮 1.5s

// 周边热点 Tab
const nearbyList            = ref<NearbyWifi[]>([])  // { ssid, signal, band, auth, saved }
const nearbyLoading         = ref(false)
const nearbyLoaded          = ref(false)             // 是否已加载过（懒加载标志）
const nearbyLocationRequired = ref(false)            // 位置权限不足标志
const currentSsid           = ref<string | null>(null)
```

---

## 关键逻辑

### 已保存 Tab 加载
```ts
// onMounted 同步执行，顺序：先取列表，再逐个取密码
onMounted(() => {
  const ssids = window.services.listSavedWifi()
  wifiList.value = ssids.map(ssid => ({
    ssid,
    password: window.services.getWifiPassword(ssid),
    visible: false
  }))
})
```

### 周边热点懒加载
```ts
function switchTab(tab) {
  activeTab.value = tab
  keyword.value = ''
  // 只有第一次切到 nearby 才自动触发，之后靠手动刷新
  if (tab === 'nearby' && !nearbyLoaded.value) scanNearby()
}

function scanNearby() {
  nearbyLoading.value = true
  // setTimeout 50ms：让 loading UI 先渲染，再执行阻塞的同步命令
  setTimeout(() => {
    try {
      currentSsid.value = window.services.getCurrentWifi()
      nearbyList.value = window.services.scanWifiNetworks(
        wifiList.value.map(i => i.ssid)  // 传入已保存列表用于标记
      )
      nearbyLoaded.value = true
      nearbyLocationRequired.value = false
    } catch (err) {
      if (err.code === 'LOCATION_REQUIRED') {
        nearbyLocationRequired.value = true   // 展示引导 UI
      } else {
        nearbyError.value = err.message
      }
    } finally {
      nearbyLoading.value = false
    }
  }, 50)
}
```

### 搜索过滤（computed）
```ts
const filteredSaved = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return kw ? wifiList.value.filter(i => i.ssid.toLowerCase().includes(kw))
            : wifiList.value
})
// filteredNearby 同理
```

### 信号可视化
```ts
function signalIcon(signal: number): string {
  if (signal >= 80) return '▂▄▆█'
  if (signal >= 60) return '▂▄▆░'
  if (signal >= 40) return '▂▄░░'
  if (signal >= 20) return '▂░░░'
  return '░░░░'
}
function signalClass(signal: number): string {
  if (signal >= 70) return 'signal--good'  // 绿
  if (signal >= 40) return 'signal--mid'   // 橙
  return 'signal--weak'                    // 红
}
```

### 位置权限引导
```html
<!-- nearbyLocationRequired 为 true 时展示 -->
<div class="wifi-query__location-tip">
  <div>📍</div>
  <div>需要位置服务权限</div>
  <div>Windows 11 扫描周边 WiFi 需要开启位置服务</div>
  <button @click="utools.shellOpenExternal('ms-settings:privacy-location')">
    打开位置设置
  </button>
  <button @click="scanNearby">已开启，重新扫描</button>
</div>
```

### 跳转二维码
```ts
function showQrcode(item: SavedWifi) {
  props.navigateTo('wifi-qrcode', {
    ssid: item.ssid,
    password: item.password || ''
  })
}
```

---

## 模板结构骨架

```html
<div class="wifi-query">
  <!-- 搜索框 -->
  <div class="wifi-query__search"> ... </div>

  <!-- Tab 切换 -->
  <div class="wifi-query__tabs">
    <button :class="{ active: activeTab==='saved' }"  @click="switchTab('saved')">已保存</button>
    <button :class="{ active: activeTab==='nearby' }" @click="switchTab('nearby')">周边热点</button>
  </div>

  <!-- 已保存 Tab -->
  <template v-if="activeTab === 'saved'">
    <div v-if="savedLoading">正在读取...</div>
    <ul v-else>
      <li v-for="item in filteredSaved">
        <!-- SSID + 操作按钮（显示/复制/二维码）-->
        <!-- 密码行 -->
      </li>
    </ul>
  </template>

  <!-- 周边热点 Tab -->
  <template v-if="activeTab === 'nearby'">
    <div v-if="nearbyLoading">扫描中...</div>
    <div v-else-if="nearbyLocationRequired">位置权限引导</div>
    <ul v-else>
      <li v-for="item in filteredNearby">
        <!-- 信号图标 + SSID + 已连接/已保存 badge -->
        <!-- 波段 + 加密方式 -->
      </li>
    </ul>
    <div class="footer">
      <button @click="scanNearby">刷新</button>
    </div>
  </template>
</div>
```

---

## 已知注意事项

- `scanWifiNetworks` 是同步阻塞调用，必须用 `setTimeout(fn, 50)` 包裹，否则 loading 状态无法渲染
- Windows 11 扫描周边热点需要系统开启位置服务，命令输出包含 `ms-settings:privacy-location` 时识别为权限错误
- 同一 SSID 可能有多个 BSSID（多频段路由器），services 层取最大信号值并去重
