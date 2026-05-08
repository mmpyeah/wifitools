# 功能：wifi-nearby — 周边热点扫描

> 实现位置：`src/WifiQuery/index.vue`（Tab 2，非独立页面）  
> 系统命令：`netsh wlan show networks mode=bssid`

---

## 功能概述

扫描当前环境可见的 WiFi 热点，展示信号强度、波段（2.4G/5G）、加密类型，并标记哪些已保存在本机。

---

## services 层关键方法

### getCurrentWifi()

```js
getCurrentWifi() {
  const text = execUTF8('netsh wlan show interfaces')
  const lines = text.split('\n')
  for (const line of lines) {
    if (/BSSID/i.test(line)) continue          // 跳过 BSSID 行
    const m = /^\s+(?:SSID)\s*:\s*(.+)$/.exec(line)
    if (m) return m[1].trim()
  }
  return null
}
```

### scanWifiNetworks(savedSsids)

```js
scanWifiNetworks(savedSsids) {
  const text = execUTF8('netsh wlan show networks mode=bssid')

  // 1. 位置权限检测
  if (text.includes('ms-settings:privacy-location') || text.includes('拒绝访问')) {
    const err = new Error('需要开启位置服务')
    err.code = 'LOCATION_REQUIRED'
    throw err
  }

  // 2. 按 "SSID N :" 分块解析
  const blocks = text.split(/(?=SSID \d+\s*:)/i)
  const savedSet = new Set(savedSsids.map(s => s.toLowerCase()))
  const results = []

  for (const block of blocks) {
    const ssid   = /^SSID \d+\s*:\s*(.+)$/im.exec(block)?.[1]?.trim()
    if (!ssid) continue

    // 同一 SSID 多 BSSID 时取最大信号
    const signals = [...block.matchAll(/(?:信号|Signal)\s*:\s*(\d+)%/gi)]
    const signal  = Math.max(...signals.map(m => parseInt(m[1])))

    const band = /(?:波段|Band)\s*:\s*(.+)/i.exec(block)?.[1]?.trim() || ''
    const auth = /(?:身份验证|Authentication)\s*:\s*(.+)/i.exec(block)?.[1]?.trim() || ''

    results.push({ ssid, signal, band, auth, saved: savedSet.has(ssid.toLowerCase()) })
  }

  // 3. 去重 + 按信号降序
  const seen = new Set()
  return results
    .sort((a, b) => b.signal - a.signal)
    .filter(item => !seen.has(item.ssid) && seen.add(item.ssid))
}
```

---

## 数据结构

```ts
interface NearbyWifi {
  ssid:   string   // WiFi 名称
  signal: number   // 信号强度 0-100
  band:   string   // '2.4 GHz' | '5 GHz' | ''
  auth:   string   // 'WPA2 - 个人' 等
  saved:  boolean  // 是否已保存在本机
}
```

---

## 关键注意事项

### 1. Windows 11 位置权限
Windows 11 扫描周边热点需开启系统位置服务，否则 `netsh` 输出包含：
```
网络 shell 命令需要位置权限才能访问 WLAN 信息。
ms-settings:privacy-location
拒绝访问。
```
代码检测这些关键字，抛出 `err.code = 'LOCATION_REQUIRED'`，前端展示引导 UI：
```ts
// 一键跳转系统设置
window.utools.shellOpenExternal('ms-settings:privacy-location')
```

### 2. netsh 缓存问题
`netsh wlan show networks` 返回的是系统缓存，不会主动触发新扫描。数据可能滞后数十秒。
处理方式：提供「刷新」按钮 + footer 提示，不强制触发扫描（会产生副作用）。

### 3. 同步阻塞与 loading 渲染
`execSync` 是同步阻塞调用，会冻结 JS 线程，必须用 `setTimeout(fn, 50)` 包裹：
```ts
nearbyLoading.value = true
setTimeout(() => {
  // 执行耗时的 execSync
  nearbyLoading.value = false
}, 50)
```

### 4. 多 BSSID 去重
同一 SSID 可能由多个接入点广播（企业网、mesh 路由），`mode=bssid` 会列出每个 BSSID。实际测试中出现过一个 SSID 包含 25 个 BSSID 的情况。
部分 BSSID 块可能没有信号字段（隐藏 AP），处理方式：过滤无信号的 BSSID，只要有一个有信号就保留，全部没有则显示 0%。最终按 SSID 去重。

```js
const validSignals = signalMatches.map(m => parseInt(m[1])).filter(n => !isNaN(n))
const signal = validSignals.length > 0 ? Math.max(...validSignals) : 0
```

### 5. 中英文兼容
| 字段 | 中文系统 | 英文系统 |
|------|---------|---------|
| SSID 行 | `SSID 1 :` | `SSID 1 :` |
| 信号 | `信号 :` | `Signal :` |
| 波段 | `波段 :` | `Band :` |
| 加密 | `身份验证 :` | `Authentication :` |

正则使用 `(?:中文\|英文)` 同时匹配。
