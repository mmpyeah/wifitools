# 功能：wifi-qrcode — WiFi 二维码生成

> 文件：`src/WifiQrcode/index.vue`  
> 触发词：`WiFi二维码` / `wifi二维码`（也可从 wifi-query 列表点击跳转）  
> 依赖：`qrcode.vue`（`npm install qrcode.vue`）

---

## 功能概述

根据 SSID 和密码生成标准 WiFi 二维码，手机相机直接扫描即可连接，支持保存图片到下载目录。

---

## Props

```ts
defineProps({
  params:     { type: Object,   required: true },  // { ssid, password } 来自 routeParams
  navigateTo: { type: Function, required: true }   // 返回上一页用
})
```

---

## WiFi 二维码标准格式

ZXing 规范，iOS / Android 相机通用：

```
WIFI:T:<加密类型>;S:<SSID>;P:<密码>;;
```

| 字段 | 说明 |
|------|------|
| T | 加密类型：`WPA`（兼容 WPA/WPA2/WPA3）、`WEP`、`nopass` |
| S | SSID 名称 |
| P | 密码（nopass 时为空） |
| 末尾 `;;` | 必须保留，标准要求 |

**特殊字符转义**（`\ ; , " :` 需加反斜杠）：
```ts
function escapeWifi(str: string): string {
  return str.replace(/([\\;,":])/g, '\\$1')
}
```

**完整生成逻辑：**
```ts
const qrcodeValue = computed(() => {
  if (!ssid.value) return ''
  const type = password.value ? 'WPA' : 'nopass'
  return `WIFI:T:${type};S:${escapeWifi(ssid.value)};P:${escapeWifi(password.value)};;`
})
```

---

## 二维码渲染

使用 `qrcode.vue` 的具名导出 `QrcodeCanvas`（不用默认导出，避免 ref hoisting warning）：

```ts
import { QrcodeCanvas } from 'qrcode.vue'
```

```html
<QrcodeCanvas
  :value="qrcodeValue"
  :size="200"
  level="M"
  :margin="2"
/>
```

> ⚠️ 不要给 `QrcodeCanvas` 绑 `ref`，会触发 Vue warn。如需获取 canvas 元素用 `document.querySelector`。

---

## 保存图片

```ts
function saveImage() {
  // 通过 DOM 查询获取 canvas，不用 ref
  const canvas = document.querySelector('.wifi-qrcode__canvas canvas') as HTMLCanvasElement
  const dataUrl = canvas.toDataURL('image/png')
  // 调用 services 层写入下载目录
  const outputPath = window.services.writeImageFile(dataUrl)
  // 写完后在文件管理器中定位该文件
  window.utools.shellShowItemInFolder(outputPath)
}
```

---

## 模板结构骨架

```html
<div class="wifi-qrcode">
  <!-- 顶部导航栏 -->
  <div class="wifi-qrcode__header">
    <button @click="navigateTo('wifi-query')">← 返回</button>
    <span>WiFi 二维码</span>
  </div>

  <div class="wifi-qrcode__body">
    <!-- 二维码（白底圆角卡片） -->
    <div class="wifi-qrcode__canvas">
      <QrcodeCanvas :value="qrcodeValue" :size="200" level="M" :margin="2" />
    </div>

    <!-- WiFi 信息展示 -->
    <div class="wifi-qrcode__info">
      <div>名称：{{ ssid }}</div>
      <div>密码：{{ password || '无' }}</div>
      <div>加密：{{ password ? 'WPA/WPA2/WPA3' : '开放' }}</div>
    </div>

    <!-- 保存按钮 -->
    <button @click="saveImage">
      {{ saved ? '已保存 ✓' : '保存图片' }}
    </button>

    <p>用手机相机扫描即可连接</p>
  </div>
</div>
```

---

## 核心状态

```ts
const saved = ref(false)  // 保存成功后变绿 1.5s，之后复原

const ssid     = computed(() => props.params.ssid || '')
const password = computed(() => props.params.password || '')
```

---

## 进入方式

**方式一：从 wifi-query 列表跳转（主要路径）**
```ts
// WifiQuery 中
props.navigateTo('wifi-qrcode', { ssid: item.ssid, password: item.password || '' })
```

**方式二：独立触发词进入**

用户输入 `WiFi二维码` 直接进入，此时 `routeParams` 为空，`ssid` 为空字符串，`qrcodeValue` 返回空，二维码不渲染（组件应处理此情况，可后续加手动输入表单）。
