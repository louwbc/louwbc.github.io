<script setup lang="ts">
// 全站唯一版本号来源（AC-2 / G-2）：注入的 __APP_VERSION__ 常量
// 禁止在任何组件/页面内写死 "v2.18.0" 之类字符串
const version = __APP_VERSION__
</script>

<template>
  <span class="version-chip">v{{ version }}</span>
</template>
