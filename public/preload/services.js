const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

// 执行命令，强制 UTF-8 输出（chcp 65001）
function execUTF8(cmd) {
  return execSync(`chcp 65001 >nul && ${cmd}`, { encoding: 'utf8', shell: 'cmd.exe' })
}

// 通过 window 对象向渲染进程注入 nodejs 能力
window.services = {
  // 读文件
  readFile (file) {
    return fs.readFileSync(file, { encoding: 'utf-8' })
  },
  // 文本写入到下载目录
  writeTextFile (text) {
    const filePath = path.join(window.utools.getPath('downloads'), Date.now().toString() + '.txt')
    fs.writeFileSync(filePath, text, { encoding: 'utf-8' })
    return filePath
  },
  // 图片写入到下载目录
  writeImageFile (base64Url) {
    const matchs = /^data:image\/([a-z]{1,20});base64,/i.exec(base64Url)
    if (!matchs) return
    const filePath = path.join(window.utools.getPath('downloads'), Date.now().toString() + '.' + matchs[1])
    fs.writeFileSync(filePath, base64Url.substring(matchs[0].length), { encoding: 'base64' })
    return filePath
  },

  // 获取所有已保存的 WiFi SSID 列表
  listSavedWifi () {
    const text = execUTF8('netsh wlan show profiles')
    const results = []
    const regex = /(?:All User Profile|所有用户配置文件)\s*:\s*(.+)/g
    let match
    while ((match = regex.exec(text)) !== null) {
      const ssid = match[1].trim()
      if (ssid) results.push(ssid)
    }
    return results
  },

  // 查询指定 SSID 的已保存密码，无密码或企业认证返回 null
  getWifiPassword (ssid) {
    try {
      const text = execUTF8(`netsh wlan show profile name="${ssid}" key=clear`)
      const match = /(?:Key Content|关键内容)\s*:\s*(.+)/.exec(text)
      return match ? match[1].trim() : null
    } catch {
      return null
    }
  },

  // 获取当前已连接的 WiFi SSID，未连接返回 null
  getCurrentWifi () {
    try {
      const text = execUTF8('netsh wlan show interfaces')
      const lines = text.split('\n')
      for (const line of lines) {
        // 跳过含 BSSID 的行
        if (/BSSID/i.test(line)) continue
        const m = /^\s+(?:SSID)\s*:\s*(.+)$/.exec(line)
        if (m) return m[1].trim()
      }
      return null
    } catch {
      return null
    }
  },

  // 获取当前 WiFi 连接详情
  // 返回 { ssid, signal, channel, band, rxRate, txRate, auth, adapter, ipv4, ipv6, mac } 或 null
  getWifiStatus () {
    try {
      const wlanText = execUTF8('netsh wlan show interfaces')

      // 未连接判断（中英文）
      if (/(?:已断开连接|disconnected|not connected)/i.test(wlanText)) return null

      const pick = (re) => {
        const m = re.exec(wlanText)
        return m ? m[1].trim() : ''
      }

      // SSID：精确匹配“SSID”字段，排除 BSSID 行（含 AP BSSID / BSSID 字样）
      const ssid = pick(/^[ \t]+SSID[ \t]*:[ \t]*(.+)$/m)
      if (!ssid) return null

      const signal  = pick(/(?:信号|Signal)\s*:\s*(\d+)%/i)
      const channel = pick(/(?:信道|频道|Channel)\s*:\s*(\d+)/i)
      const rxRate  = pick(/(?:接收速率|Receive rate)\s*\([Mm]bps\)\s*:\s*([\d.]+)/i)
      const txRate  = pick(/(?:传输速率|Transmit rate)\s*\([Mm]bps\)\s*:\s*([\d.]+)/i)
      const auth    = pick(/(?:身份验证|Authentication)\s*:\s*(.+)/i)
      const adapter = pick(/(?:描述|Description)\s*:\s*(.+)/i)
      const mac     = pick(/(?:物理地址|Physical address)\s*:\s*([\da-fA-F:-]+)/i)

      // 适配器名称（中英文）
      const adapterName = pick(/(?:^|\n)[ \t]*(?:名称|Name)[ \t]*:[ \t]*(.+)/i)

      // IP 地址：按适配器标题行分割，精确匹配 adapterName
      let ipv4 = '', ipv6 = ''
      try {
        const ipcfg = execUTF8('ipconfig')
        // 按适配器标题行分割（如 "Wireless LAN adapter WLAN:"）
        const sections = ipcfg.split(/\r?\n(?=\S)/)
        // 找标题行末尾包含 adapterName: 的块，精确匹配避免 WLAN 匹配到 WLAN 3
        const block = sections.find(s => {
          const title = s.split(/\r?\n/)[0]
          return new RegExp(`\\b${adapterName}\\s*:`).test(title)
        }) || ''
        const ipv4m = /IPv4[^:]*:\s*([\d.]+)/.exec(block)
        const ipv6m = /IPv6 Address[^:]*:\s*([\da-f:]+)(?!\S*%)/i.exec(block)
        if (ipv4m) ipv4 = ipv4m[1].trim()
        if (ipv6m) ipv6 = ipv6m[1].trim()
      } catch { /* IP 获取失败不影响主体 */ }

      return { ssid, signal, channel, rxRate, txRate, auth, adapter, adapterName, mac, ipv4, ipv6 }
    } catch {
      return null
    }
  },

  // 删除已保存的 WiFi 配置文件，成功返回 true，失败抛出错误
  deleteWifiProfile (ssid) {
    execUTF8(`netsh wlan delete profile name="${ssid}"`)
    return true
  },

  // 扫描周边可用 WiFi 列表，按信号强度降序
  // 返回 [{ ssid, signal, band, auth, saved }]
  // 若系统未开启位置服务，抛出 { code: 'LOCATION_REQUIRED' }
  scanWifiNetworks (savedSsids) {
    let text
    try {
      text = execUTF8('netsh wlan show networks mode=bssid')
    } catch (e) {
      // execSync 在命令退出码非 0 时直接 throw，stdout/stderr 里含有位置权限提示
      const output = (e.stdout || '') + (e.stderr || '') + (e.message || '')
      if (
        output.includes('ms-settings:privacy-location') ||
        output.includes('位置权限') ||
        output.includes('location permission') ||
        output.includes('拒绝访问') ||
        output.includes('Access is denied')
      ) {
        const err = new Error('需要开启位置服务')
        err.code = 'LOCATION_REQUIRED'
        throw err
      }
      if (
        output.includes('电源关闭') ||
        output.includes('power') ||
        output.includes('不支持请求的操作') ||
        output.includes('The request is not supported')
      ) {
        const err = new Error('无线网卡已关闭，请先开启 WiFi')
        err.code = 'WIFI_OFF'
        throw err
      }
      throw e
    }

    // 命令成功但输出中仍含位置权限提示（部分 Windows 版本混在正文里输出）
    if (
      text.includes('ms-settings:privacy-location') ||
      text.includes('位置权限') ||
      text.includes('拒绝访问')
    ) {
      const err = new Error('需要开启位置服务')
      err.code = 'LOCATION_REQUIRED'
      throw err
    }

    const results = []
    const savedSet = new Set((savedSsids || []).map(s => s.toLowerCase()))

    // 按 "SSID N :" 切块，每块对应一个网络
    const blocks = text.split(/(?=^SSID \d+\s*:)/im)

    for (const block of blocks) {
      // 提取 SSID 名称；值在冒号后，可能为空（隐藏 SSID）
      const ssidMatch = /^SSID \d+\s*:\s*(.*)$/im.exec(block)
      if (!ssidMatch) continue
      const ssid = ssidMatch[1].trim()
      if (!ssid) continue  // 隐藏 SSID，整块跳过

      // 同一 SSID 可能有多个 BSSID，取最大信号值
      // 部分 BSSID 块可能没有信号字段（如隐藏 AP），过滤后取最大值
      const signalMatches = [...block.matchAll(/(?:信号|Signal)\s*:\s*(\d+)%/gi)]
      const validSignals = signalMatches.map(m => parseInt(m[1])).filter(n => !isNaN(n))
      const signal = validSignals.length > 0 ? Math.max(...validSignals) : 0

      // 波段：取第一个匹配（中英文）
      const bandMatch = /(?:波段|Band)\s*:\s*(.+)/i.exec(block)
      const band = bandMatch ? bandMatch[1].trim() : ''

      // 加密认证（中英文）
      const authMatch = /(?:身份验证|Authentication)\s*:\s*(.+)/i.exec(block)
      const auth = authMatch ? authMatch[1].trim() : ''

      results.push({
        ssid,
        signal,
        band,
        auth,
        saved: savedSet.has(ssid.toLowerCase())
      })
    }

    // 去重（同 SSID 保留信号最强的）并按信号降序
    const deduped = []
    const seen = new Set()
    for (const item of results.sort((a, b) => b.signal - a.signal)) {
      if (!seen.has(item.ssid)) {
        seen.add(item.ssid)
        deduped.push(item)
      }
    }
    return deduped
  }
}
