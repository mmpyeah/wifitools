# WiFi助手 - 项目文档

## 项目简介

基于 **uTools** 平台的 WiFi 助手插件，使用 Vue 3 + Vite 构建。
核心目标：在 uTools 中快速查询 WiFi 密码、展示 WiFi 二维码、管理已保存的 WiFi 信息。

**项目路径：** `D:\WebstormProjects\wifitools`

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Vue 3（Composition API + `<script setup>`） |
| 构建 | Vite 6 |
| 平台 | uTools（`window.utools` API） |
| 系统能力 | Node.js（通过 `preload/services.js` 注入 `window.services`） |
| 二维码 | qrcode.vue（`QrcodeCanvas` 具名导入，渲染为 canvas） |
| 样式 | 原生 CSS，支持深色模式（`prefers-color-scheme`） |

---

## 目录结构

```
wifitools/
├── public/
│   ├── plugin.json          # uTools 插件配置（功能指令、入口）
│   ├── logo.png
│   └── preload/
│       ├── package.json     # type: commonjs
│       └── services.js      # Node.js 预加载，注入 window.services
├── src/
│   ├── main.js              # Vue 应用入口
│   ├── main.css             # 全局样式
│   ├── App.vue              # 根组件，路由 + 页面间传参（routeParams）
│   ├── Hello/index.vue
│   ├── Read/index.vue
│   ├── Write/index.vue
│   ├── WifiQuery/index.vue  # WiFi 密码列表（首页）
│   └── WifiQrcode/index.vue # WiFi 二维码展示
├── .claude/
│   └── CLAUDE.md            # 本文件
├── index.html
├── vite.config.js
└── package.json
```

---

## 路由机制

uTools 通过 `action.code` 触发对应功能，`App.vue` 负责路由分发。
页面间跳转通过 `navigateTo(routeName, params)` 函数实现，params 存在 `routeParams` ref 中。

```js
// App.vue 核心逻辑
function navigateTo(name, params = {}) {
  routeParams.value = params
  route.value = name
}
```

每新增一个功能，需要同步：
1. `plugin.json` → `features` 数组中添加功能配置
2. `src/` → 新建 `[功能名]/index.vue`
3. `App.vue` → 添加对应的 `v-if` 路由分支，按需传入 `navigateTo` 和 `routeParams`

---

## window.services 扩展规范

所有 Node.js 系统调用统一在 `public/preload/services.js` 中扩展，禁止在 Vue 组件内直接 `require`。

### 编码注意事项（Windows）

Windows `netsh` 命令输出默认 GBK，Node.js 的 `TextDecoder('gbk')` 在 Electron 环境不可靠。
统一使用 `chcp 65001` 前缀强制 UTF-8 输出：

```js
function execUTF8(cmd) {
  return execSync(`chcp 65001 >nul && ${cmd}`, { encoding: 'utf8' })
}
```

---

## WiFi 二维码格式

标准格式（ZXing 规范，iOS/Android 通用）：

```
WIFI:T:<加密类型>;S:<SSID>;P:<密码>;;
```

- 加密类型：`WPA`（兼容 WPA/WPA2/WPA3）、`WEP`、`nopass`
- 特殊字符 `\ ; , " :` 需用反斜杠转义
- 末尾双分号 `;;` 必须保留
- import 使用具名导出：`import { QrcodeCanvas } from 'qrcode.vue'`，不用默认导出（避免 ref hoisting warning）

---

## 开发规范

### Vue 组件
- 统一使用 `<script lang="ts" setup>` + Composition API
- 每个功能一个独立目录，入口文件为 `index.vue`
- Props 必须声明类型和 `required`
- 不引入第三方 UI 组件库，保持轻量

### 样式
- 每个组件样式写在 `<style>` 块内，使用 `.组件名__元素` BEM 命名防止污染
- 颜色使用 `main.css` 中定义的 CSS 变量（`--blue`、`--light`）
- 深色模式统一通过 `@media (prefers-color-scheme: dark)` 处理

### plugin.json
- `code` 字段与组件目录名保持一致（全小写加连字符）
- 新增功能必须填写 `explain` 字段
- `features` 第一项为默认进入功能

### preload/services.js
- 只写同步方法，保持调用简洁
- 错误不在 services 内捕获，由调用方负责 try/catch
- Windows 命令行统一使用 `execUTF8()` 封装

### 调试方式
- Vue 源码（`src/`）：Vite 热更新自动生效
- `preload/services.js`：必须在 uTools 开发者工具中「重新加载」才生效
- 打开控制台：`Ctrl+D` 弹出独立窗口 → `F12`

### 命名
- 组件目录/文件：大写开头（`WifiQuery/`、`WifiQrcode/`）
- CSS 类名：BEM kebab-case（`.wifi-qrcode__canvas`）
- JS 变量/函数：camelCase
- plugin.json 的 code：全小写加连字符（`wifi-qrcode`）

---

## 本地开发

```bash
npm install
npm run dev    # 启动开发服务器 http://localhost:5173
npm run build  # 构建生产包
```

---

## 功能列表

- [x] `wifi-query` — 查询系统已保存的 WiFi 密码
- [x] `wifi-qrcode` — 生成 WiFi 二维码，供手机扫码连接
- [ ] `wifi-list` — 列出当前环境可用 WiFi 列表及信号强度
