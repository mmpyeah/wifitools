const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

// 执行命令，强制 UTF-8 输出（chcp 65001）
function execUTF8(cmd) {
  return execSync(`chcp 65001 >nul && ${cmd}`, { encoding: 'utf8' })
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
      // 兼容中英文：SSID 字段（注意排除 BSSID 行）
      const match = /^\s+(?:SSID|SSID)\s*:\s*(?!.+(?:BSSID))(.+)$/m.exec(text)
      // 更精确：只匹配 "   SSID  : xxx" 而非 BSSID 行
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

  // 扫描周边可用 WiFi 列表，按信号强度降序
  // 返回 [{ ssid, signal, band, auth, saved }]
  scanWifiNetworks (savedSsids) {
    const text = execUTF8('netsh wlan show networks mode=bssid')
    const results = []
    const savedSet = new Set((savedSsids || []).map(s => s.toLowerCase()))

    // 按 SSID 块分割：每个 "SSID N :" 开头算一个网络块
    const blocks = text.split(/(?=SSID \d+\s*:)/i)

    for (const block of blocks) {
      // 提取 SSID 名称（兼容中英文，跳过空 SSID）
      const ssidMatch = /^SSID \d+\s*:\s*(.+)$/im.exec(block)
      if (!ssidMatch) continue
      const ssid = ssidMatch[1].trim()
      if (!ssid) continue

      // 同一 SSID 可能有多个 BSSID，取最大信号值
      const signalMatches = [...block.matchAll(/(?:信号|Signal)\s*:\s*(\d+)%/gi)]
      if (signalMatches.length === 0) continue
      const signal = Math.max(...signalMatches.map(m => parseInt(m[1])))

      // 波段：取第一个 BSSID 的波段
      const bandMatch = /(?:波段|Band)\s*:\s*(.+)/i.exec(block)
      const band = bandMatch ? bandMatch[1].trim() : ''

      // 加密认证
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
