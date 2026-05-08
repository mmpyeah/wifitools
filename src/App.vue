<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import Hello from './Hello/index.vue'
import Read from './Read/index.vue'
import Write from './Write/index.vue'
import WifiQuery from './WifiQuery/index.vue'
import WifiQrcode from './WifiQrcode/index.vue'
import WifiCard from './WifiCard/index.vue'

const route = ref('')
const enterAction = ref({})
// 页面间传参：wifi-query 点击二维码按钮时写入，WifiQrcode 读取
const routeParams = ref<Record<string, string>>({})

function navigateTo(name: string, params: Record<string, string> = {}) {
  routeParams.value = params
  route.value = name
}

onMounted(() => {
  window.utools.onPluginEnter((action) => {
    routeParams.value = {}
    route.value = action.code
    enterAction.value = action
  })
  window.utools.onPluginOut(() => {
    route.value = ''
    routeParams.value = {}
  })
})
</script>

<template>
  <template v-if="route === 'hello'">
    <Hello :enterAction="enterAction"></Hello>
  </template>
  <template v-if="route === 'read'">
    <Read :enterAction="enterAction"></Read>
  </template>
  <template v-if="route === 'write'">
    <Write :enterAction="enterAction"></Write>
  </template>
  <template v-if="route === 'wifi-query'">
    <WifiQuery :enterAction="enterAction" :navigateTo="navigateTo"></WifiQuery>
  </template>
  <template v-if="route === 'wifi-qrcode'">
    <WifiQrcode :params="routeParams" :navigateTo="navigateTo"></WifiQrcode>
  </template>
  <template v-if="route === 'wifi-card'">
    <WifiCard :params="routeParams" :navigateTo="navigateTo"></WifiCard>
  </template>
</template>
