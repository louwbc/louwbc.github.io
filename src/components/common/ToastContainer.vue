<script setup lang="ts">
import { useToasts } from '@/composables/useToasts'
const toasts = useToasts()
</script>

<template>
  <div
    id="toast-container"
    class="fixed z-50 right-3 left-3 sm:left-auto sm:right-4 top-[72px] sm:top-4 flex flex-col gap-2 pointer-events-none max-w-sm ml-auto"
  >
    <transition-group name="toast">
      <div
        v-for="t in toasts.items"
        :key="t.id"
        class="pointer-events-auto px-3.5 py-2.5 rounded-btn border shadow-card text-sm flex items-start gap-2"
        :class="{
          'bg-white border-[var(--border)] text-text': t.level === 'info',
          'bg-green-50 border-green-200 text-green-700': t.level === 'success',
          'bg-amber-50 border-amber-200 text-amber-800': t.level === 'warn',
          'bg-red-50 border-red-200 text-red-700': t.level === 'error'
        }"
      >
        <span
          :class="{
            'i-carbon-information text-accent': t.level === 'info',
            'i-carbon-checkmark-filled text-green-600': t.level === 'success',
            'i-carbon-warning-alt-filled text-amber-600': t.level === 'warn',
            'i-carbon-error-filled text-red-600': t.level === 'error'
          }"
          class="mt-0.5 text-lg shrink-0"
        />
        <span class="flex-1 whitespace-pre-wrap leading-snug">{{ t.message }}</span>
        <button
          class="text-muted hover:text-text w-6 h-6 inline-flex items-center justify-center rounded-md -mr-1 -mt-0.5"
          aria-label="关闭"
          @click="toasts.dismiss(t.id)"
        >
          <span class="i-carbon-close" />
        </button>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-move,
.toast-enter-active,
.toast-leave-active {
  transition: all 180ms ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
