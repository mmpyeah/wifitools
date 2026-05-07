# WiFi助手 - 项目文档

## 项目简介

基于 **uTools** 平台的 WiFi 助手插件，使用 Vue 3 + Vite 构建。
核心目标：在 uTools 中快速查询 WiFi 密码、展示 WiFi 二维码、管理已保存的 WiFi 信息。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Vue 3（Composition API + `<script setup>`） |
| 构建 | Vite 6 |
| 平台 | uTools（`window.utools` API） |
| 系统能力 | Node.js（通过 `preload/services.js` 注入 `window.services`） |
| 样式 | 原生 CSS，支持深色模式（`prefers-color-scheme`） |

---

## 目录结构

```
WiFi助手/
├── public/
│   ├── plugin.json          # uTools 插件配置（功能指令、入口）
│   ├── logo.png
│   └── preload/
│       ├── package.json     # type: commonjs
│       └── services.js      # Node.js 预加载，注入 window.services
├── src/
│   ├── main.js              # Vue 应用入口
│   ├── main.css             # 全局样式
│   ├── App.vue              # 根组件，按 action.code 路由到各功能页
│   └── [功能名]/
│       └── index.vue        # 各功能页组件
├── .claude/
│   └── CLAUDE.md            # 本文件
├── index.html
├── vite.config.js
└── package.json
```

---

## 路由机制

uTools 通过 `action.code` 触发对应功能，`App.vue` 负责路由分发：

```js
// App.vue 核心逻辑
window.utools.onPluginEnter((action) => {
  route.value = action.code   // 对应 plugin.json 中的 code 字段
  enterAction.value = action
})
```

每新增一个功能，需要同步：
1. `plugin.json` → `features` 数组中添加功能配置
2. `src/` → 新建 `[功能名]/index.vue`
3. `App.vue` → 添加对应的 `v-if` 路由分支

---

## window.services 扩展规范

所有 Node.js 系统调用统一在 `public/preload/services.js` 中扩展，禁止在 Vue 组件内直接 `require`。

```js
// preload/services.js 扩展示例
window.services = {
  // 已有
  readFile(file) { ... },
  writeTextFile(text) { ... },
  writeImageFile(base64Url) { ... },
  listSavedWifi() { ... },
  getWifiPassword(ssid) { ... },
}
```

### 编码注意事项（Windows）

Windows `netsh` 命令输出默认 GBK 编码，Node.js 的 `TextDecoder('gbk')` 在 Electron 环境不可靠。
统一使用 `chcp 65001` 前缀强制 UTF-8 输出：

```js
function execUTF8(cmd) {
  return execSync(`chcp 65001 >nul && ${cmd}`, { encoding: 'utf8' })
}
```

---

## 开发规范

### Vue 组件
- 统一使用 `<script lang="ts" setup>` + Composition API
- 每个功能一个独立目录，入口文件为 `index.vue`
- Props 必须声明类型和 `required`，不使用默认值覆盖必填项
- 不引入第三方 UI 组件库，保持轻量

### 样式
- 每个组件样式写在 `<style>` 块内，使用 `.组件名` 作为根选择器防止污染
- 颜色使用 `main.css` 中定义的 CSS 变量（`--blue`、`--light`）
- 深色模式统一通过 `@media (prefers-color-scheme: dark)` 处理

### plugin.json
- `code` 字段与组件目录名保持一致（全小写）
- 新增功能必须填写 `explain` 字段
- 涉及文件匹配的功能使用标准 `cmds` 对象格式
- `features` 第一项为默认进入功能

### preload/services.js
- 只写同步方法（`sync` 版本的 fs/child_process API），保持调用简洁
- 错误不在 services 内捕获，由调用方（Vue 组件）负责 try/catch（getWifiPassword 除外，失败返回 null）
- 文件路径相关操作统一使用 `path.join`
- Windows 命令行调用统一使用 `execUTF8()` 封装，避免中文乱码

### 调试方式
- Vue 源码（`src/`）修改：Vite 热更新自动生效
- `preload/services.js` 修改：必须在 uTools 开发者工具中点击「重新加载」才生效
- 打开控制台：插件触发后 `Ctrl+D` 弹出独立窗口，再按 `F12`

### 命名
- 组件目录/文件：大写开头（`Hello/`、`WifiQuery/`）
- CSS 类名：kebab-case（`.wifi-query__item`）
- JS 变量/函数：camelCase
- plugin.json 的 code：全小写加连字符（`wifi-query`）

---

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器（uTools 中加载 http://localhost:5173）
npm run dev

# 构建生产包
npm run build
```

uTools 开发模式：`plugin.json` 中 `development.main` 指向 `http://localhost:5173`，生产环境自动切换到 `index.html`。

---

## 功能列表

- [x] `wifi-query` — 查询系统已保存的 WiFi 密码（调用 netsh 命令）
- [ ] `wifi-qrcode` — 根据 SSID/密码生成二维码，供手机扫码连接
- [ ] `wifi-list` — 列出当前环境可用 WiFi 列表及信号强度
