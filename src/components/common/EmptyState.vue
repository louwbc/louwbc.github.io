<script setup lang="ts">
defineProps<{ title?: string; description?: string; icon?: string }>()
</script>

<template>
  <div class="base-card flex flex-col items-center justify-center text-center py-10">
    <div class="w-14 h-14 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-muted inline-flex items-center justify-center mb-3">
      <span
        :class="icon || 'i-carbon-database' || 'i-carbon-inbox'"
        class="text-3xl"
      />
    </div>
    <div class="font-semibold text-text">
      {{ title || '暂无可展示内容' }}
    </div>
    <p class="mt-1 text-muted text-sm max-w-sm">
      {{ description || '可以尝试调整筛选条件或稍后再试。' }}
    </p>
    <slot name="action" />
  </div>
</template>
