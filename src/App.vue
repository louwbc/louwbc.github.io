<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppTopBar from '@/components/common/AppTopBar.vue'
import AppFooter from '@/components/common/AppFooter.vue'
import GlobalPlayerBar from '@/components/common/GlobalPlayerBar.vue'
import ToastContainer from '@/components/common/ToastContainer.vue'
import { useToasts } from '@/composables/useToasts'

const toasts = useToasts()
// storage 层超限时触发 toast（AC-4）
window.addEventListener('storage:quota-exceed', (e) => {
  toasts.show((e as CustomEvent).detail?.message || '本地存储已满，请清理收藏', 'warn')
})
</script>

<template>
  <!-- 单一 AppShell：导航 / 内容 / 底部全局播放条 / toast -->
  <div
    id="app-shell"
    class="min-h-screen flex flex-col"
  >
    <!-- 唯一导航源（从 routes.ts 渲染，AC-1） -->
    <AppTopBar />

    <main class="flex-1 app-container">
      <RouterView v-slot="{ Component }">
        <transition
          name="fade"
          mode="out-in"
        >
          <component :is="Component" />
        </transition>
      </RouterView>
    </main>

    <AppFooter />

    <!-- 全局持久播放条（AC-6：跨路由不中断） -->
    <GlobalPlayerBar />

    <ToastContainer />
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 120ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
