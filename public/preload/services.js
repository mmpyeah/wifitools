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
  }
}
