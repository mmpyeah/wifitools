# WiFi助手 — 架构总览

> 项目路径：`D:\webstorm_workspace\WiFi助手`  
> 平台：uTools 插件 | 技术栈：Vue 3 + Vite 6 + TypeScript

---

## 目录结构

```
WiFi助手/
├── public/
│   ├── plugin.json              # uTools 插件配置
│   ├── logo.png
│   └── preload/
│       ├── package.json         # type: commonjs
│       └── services.js          # Node.js 能力注入层
├── src/
│   ├── main.js                  # Vue 应用入口
│   ├── main.css                 # 全局样式 + CSS 变量
│   ├── App.vue                  # 根组件：路由调度 + 页面传参
│   ├── WifiQuery/index.vue      # 首页：已保存密码 + 周边热点（双 Tab）
│   ├── WifiQrcode/index.vue     # 二维码页
│   ├── Hello/index.vue          # 模板示例（可删）
│   ├── Read/index.vue           # 模板示例（可删）
│   └── Write/index.vue          # 模板示例（可删）
└── .claude/
    ├── CLAUDE.md                # 开发规范
    └── docs/
        ├── OVERVIEW.md          # 本文件
        ├── feature-wifi-query.md
        ├── feature-wifi-qrcode.md
        ├── feature-wifi-nearby.md
        └── layer-services.md
```

---

## 整体架构

```
┌─────────────────────────────────────────────┐
│                  uTools 宿主                 │
│  onPluginEnter(action) → action.code 路由    │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│               App.vue（路由层）               │
│  route ref + routeParams ref                 │
│  navigateTo(name, params) 页面间跳转         │
└──┬───────────┬──────────────────────────────┘
   │           │
   ▼           ▼
WifiQuery   WifiQrcode   ...其他功能页
(首页)      (二维码页)
   │
   ├── Tab: 已保存密码
   └── Tab: 周边热点
                   │
┌──────────────────▼──────────────────────────┐
│           preload/services.js（系统层）       │
│  window.services = { ... }                   │
│  execUTF8() → chcp 65001 + cmd.exe           │
│  所有 netsh 命令在此封装                      │
└─────────────────────────────────────────────┘
```

---

## 路由机制

`App.vue` 通过 `route ref` 控制显示哪个页面，`routeParams ref` 传递页面参数。

```ts
// 外部触发（uTools）
window.utools.onPluginEnter((action) => {
  route.value = action.code       // 对应 plugin.json features[].code
  enterAction.value = action
})

// 内部跳转（页面间）
function navigateTo(name: string, params: Record<string, string> = {}) {
  routeParams.value = params
  route.value = name
}
```

**新增功能的三步联动：**
1. `plugin.json` → `features[]` 添加 `{ code, explain, cmds }`
2. `src/` → 新建 `功能名/index.vue`
3. `App.vue` → 新增 `v-if="route === 'xxx'"` 分支

---

## services.js 层

所有 Node.js / 系统调用统一在 `preload/services.js` 中，通过 `window.services` 暴露给 Vue 组件。**Vue 组件禁止直接 `require`。**

| 方法 | 说明 |
|------|------|
| `readFile(file)` | 读取文件内容（UTF-8） |
| `writeTextFile(text)` | 写文本到下载目录，返回路径 |
| `writeImageFile(base64Url)` | 写图片到下载目录，返回路径 |
| `listSavedWifi()` | 获取所有已保存 SSID 列表 |
| `getWifiPassword(ssid)` | 获取指定 SSID 的密码，无则返回 null |
| `getCurrentWifi()` | 获取当前连接的 SSID，未连接返回 null |
| `scanWifiNetworks(savedSsids)` | 扫描周边热点，返回按信号排序的列表 |

**编码方案：**
```js
function execUTF8(cmd) {
  return execSync(`chcp 65001 >nul && ${cmd}`, { encoding: 'utf8', shell: 'cmd.exe' })
}
```
> Windows netsh 输出默认 GBK，`TextDecoder('gbk')` 在 Electron 不可靠，统一用 `chcp 65001` + `shell: 'cmd.exe'` 强制 UTF-8。

---

## 已实现功能

| code | 触发词 | 入口组件 | 说明 |
|------|--------|----------|------|
| `wifi-query` | WiFi密码 / 查询WiFi | `WifiQuery` | 首页，双 Tab（已保存 + 周边热点） |
| `wifi-qrcode` | WiFi二维码 | `WifiQrcode` | 从 wifi-query 跳转或独立触发 |
| `wifi-list` | — | `WifiQuery` 周边热点 Tab | 内嵌在首页，无独立入口 |

---

## 待开发功能

### 优先（改动小、价值高）

| code | 说明 | 实现思路 |
|------|------|----------|
| `wifi-status` | 当前连接详情：SSID、IP、信号、频道、速率、网卡 | `netsh wlan show interfaces`，新页面或首页新 Tab |
| `wifi-forget` | 删除已保存的 WiFi | 已保存列表各行加删除按钮，`netsh wlan delete profile name="xxx"` |
| `wifi-card` | WiFi 分享卡片 | SSID+密码+二维码 canvas 合成图片，复用 `writeImageFile` |

### 后续

| code | 说明 | 实现思路 |
|------|------|----------|
| `wifi-diagnose` | 网络诊断一键修复 | ping 网关/DNS/外网，分层判断断网原因，提供修复命令按钮 |
| `wifi-dns` | DNS 快速切换 | 一键切换自动/114/阿里/Google/Cloudflare DNS |

### WifiQuery 首页双 Tab

```
Tab 1：已保存
  - onMounted 同步加载全部 SSID + 密码
  - 搜索过滤 / 显示隐藏 / 复制密码 / 跳转二维码

Tab 2：周边热点
  - 切换 Tab 时懒加载（setTimeout 50ms 让 loading 先渲染）
  - 信号强度可视化（▂▄▆█ 四格 + 绿/橙/红三色）
  - 标记：已连接（绿）/ 已保存（蓝）
  - 位置权限不足时展示引导 UI + 一键打开系统设置
  - 底部「刷新」按钮支持重新扫描
```

### WifiQrcode 二维码页

```
- 从 routeParams 接收 { ssid, password }
- 生成标准格式：WIFI:T:WPA;S:xxx;P:xxx;;
- 特殊字符转义：\ ; , " :
- 渲染 canvas 二维码（qrcode.vue QrcodeCanvas）
- 保存图片：canvas.toDataURL → writeImageFile → shellShowItemInFolder
```

---

## 样式规范

- BEM 命名：`.组件名__元素--修饰符`
- CSS 变量：`--blue`（主色）、`--light`（背景）来自 `main.css`
- 深色模式：`@media (prefers-color-scheme: dark)`
- 每个组件样式写在自己的 `<style>` 块，不使用 `scoped`（uTools 窗口单页面无污染风险）

---

## 开发调试

```bash
npm run dev   # 启动 http://localhost:5173，uTools 开发者工具加载此地址
```

- **Vue 源码改动**：Vite HMR 自动热更新，无需操作
- **preload/services.js 改动**：必须在 uTools 开发者工具中点「重新加载」才生效
- **打开控制台**：触发插件后 `Ctrl+D` 弹出独立窗口 → `F12`
