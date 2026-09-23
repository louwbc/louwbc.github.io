<script setup lang="ts">
defineProps<{ text: string; tone?: 'neutral' | 'accent' | 'success' | 'danger' }>()
</script>

<template>
  <span
    class="inline-flex items-center px-2 h-6 rounded-chip text-xs border whitespace-nowrap"
    :class="{
      'bg-surface border-border text-muted': !tone || tone === 'neutral',
      'bg-[var(--accent-bg)] border-[var(--accent-border)] text-accent': tone === 'accent',
      'bg-green-50 border-green-200 text-green-700': tone === 'success',
      'bg-red-50 border-red-200 text-red-700': tone === 'danger'
    }"
  >
    {{ text }}
  </span>
</template>
