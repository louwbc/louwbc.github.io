<script setup lang="ts">
import VersionChip from './VersionChip.vue'
</script>

<template>
  <footer class="border-t border-[var(--border)] mt-10 pt-4 pb-6 text-muted text-xs">
    <div class="app-container flex flex-wrap items-center justify-between gap-2">
      <div>© {{ new Date().getFullYear() }} Solo Radio · 个人使用</div>
      <div class="flex items-center gap-2">
        <span>v3 重构版</span>
        <VersionChip />
      </div>
    </div>
  </footer>
</template>
