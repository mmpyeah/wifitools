# 服务层：preload/services.js

> 文件：`public/preload/services.js`  
> 类型：CommonJS（`public/preload/package.json` 中 `"type": "commonjs"`）  
> 注入方式：`window.services = { ... }`，Vue 组件通过 `window.services.xxx()` 调用

---

## 核心约定

- **只写同步方法**（`fs.xxxSync`、`execSync`），不用 Promise / async
- **不捕获错误**（`getWifiPassword` 除外），由 Vue 组件负责 try/catch
- **不直接在 Vue 组件里 require**，所有 Node.js 能力统一在此扩展
- **新增方法追加**到 `window.services = { ... }` 对象内

---

## 编码工具函数

```js
const { execSync } = require('node:child_process')

function execUTF8(cmd) {
  // chcp 65001：切换 cmd 代码页为 UTF-8，解决中文乱码
  // shell: 'cmd.exe'：Electron 默认 shell 不识别 && 语法，必须显式指定
  return execSync(`chcp 65001 >nul && ${cmd}`, {
    encoding: 'utf8',
    shell: 'cmd.exe'
  })
}
```

> **踩坑记录：**
> - `TextDecoder('gbk')` 在 uTools Electron 环境不可用（ICU 不含 GBK）
> - 不加 `shell: 'cmd.exe'` 时 `&&` 语法报错（Electron 默认 shell 为 PowerShell）

---

## 方法清单

### readFile(file)
```js
readFile(file) {
  return fs.readFileSync(file, { encoding: 'utf-8' })
}
```

### writeTextFile(text)
```js
writeTextFile(text) {
  const filePath = path.join(
    window.utools.getPath('downloads'),
    Date.now().toString() + '.txt'
  )
  fs.writeFileSync(filePath, text, { encoding: 'utf-8' })
  return filePath
}
```

### writeImageFile(base64Url)
```js
writeImageFile(base64Url) {
  // base64Url 格式：data:image/png;base64,xxxxx
  const matchs = /^data:image\/([a-z]{1,20});base64,/i.exec(base64Url)
  if (!matchs) return
  const filePath = path.join(
    window.utools.getPath('downloads'),
    Date.now().toString() + '.' + matchs[1]
  )
  fs.writeFileSync(filePath, base64Url.substring(matchs[0].length), { encoding: 'base64' })
  return filePath
}
```

### listSavedWifi()
```js
listSavedWifi() {
  const text = execUTF8('netsh wlan show profiles')
  const results = []
  const regex = /(?:All User Profile|所有用户配置文件)\s*:\s*(.+)/g
  let match
  while ((match = regex.exec(text)) !== null) {
    const ssid = match[1].trim()
    if (ssid) results.push(ssid)
  }
  return results  // string[]
}
```

### getWifiPassword(ssid)
```js
getWifiPassword(ssid) {
  try {
    const text = execUTF8(`netsh wlan show profile name="${ssid}" key=clear`)
    const match = /(?:Key Content|关键内容)\s*:\s*(.+)/.exec(text)
    return match ? match[1].trim() : null  // 无密码或企业认证返回 null
  } catch {
    return null  // 此方法内部捕获错误，返回 null
  }
}
```

### getCurrentWifi()
```js
getCurrentWifi() {
  try {
    const text = execUTF8('netsh wlan show interfaces')
    const lines = text.split('\n')
    for (const line of lines) {
      if (/BSSID/i.test(line)) continue  // 排除 BSSID 行
      const m = /^\s+(?:SSID)\s*:\s*(.+)$/.exec(line)
      if (m) return m[1].trim()
    }
    return null
  } catch {
    return null
  }
}
```

### scanWifiNetworks(savedSsids)
```js
// savedSsids: string[] — 已保存 SSID 列表，用于标记 saved 字段
// 返回: { ssid, signal, band, auth, saved }[]，按 signal 降序，已去重
scanWifiNetworks(savedSsids) {
  const text = execUTF8('netsh wlan show networks mode=bssid')

  // 位置权限检测（Windows 11）
  if (text.includes('ms-settings:privacy-location') || text.includes('拒绝访问')) {
    const err = new Error('需要开启位置服务')
    err.code = 'LOCATION_REQUIRED'
    throw err
  }

  const savedSet = new Set((savedSsids || []).map(s => s.toLowerCase()))
  const blocks = text.split(/(?=SSID \d+\s*:)/i)
  const results = []

  for (const block of blocks) {
    const ssid = /^SSID \d+\s*:\s*(.+)$/im.exec(block)?.[1]?.trim()
    if (!ssid) continue
    const signals = [...block.matchAll(/(?:信号|Signal)\s*:\s*(\d+)%/gi)]
    if (!signals.length) continue
    const signal = Math.max(...signals.map(m => parseInt(m[1])))
    const band   = /(?:波段|Band)\s*:\s*(.+)/i.exec(block)?.[1]?.trim() || ''
    const auth   = /(?:身份验证|Authentication)\s*:\s*(.+)/i.exec(block)?.[1]?.trim() || ''
    results.push({ ssid, signal, band, auth, saved: savedSet.has(ssid.toLowerCase()) })
  }

  const seen = new Set()
  return results
    .sort((a, b) => b.signal - a.signal)
    .filter(item => !seen.has(item.ssid) && seen.add(item.ssid))
}
```

---

## 扩展新方法模板

```js
// 在 window.services = { ... } 对象内追加
methodName(param) {
  const text = execUTF8('netsh ...')
  // 解析 text
  return result
}
```

---

## 常用 netsh 命令速查

| 用途 | 命令 |
|------|------|
| 已保存 WiFi 列表 | `netsh wlan show profiles` |
| 指定 WiFi 密码 | `netsh wlan show profile name="xxx" key=clear` |
| 当前连接信息 | `netsh wlan show interfaces` |
| 周边热点（需位置权限） | `netsh wlan show networks mode=bssid` |
| 连接指定 WiFi | `netsh wlan connect name="xxx"` |
| 断开 WiFi | `netsh wlan disconnect` |
