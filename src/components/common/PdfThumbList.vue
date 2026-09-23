<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{
  thumbnails: { id: string; dataUrl?: string; label?: string; selected?: boolean }[]
  selectedIndex?: number
}>()
const emit = defineEmits<{
  (e: 'select', idx: number): void
  (e: 'rotate', idx: number): void
  (e: 'remove', idx: number): void
}>()
const sel = computed(() => typeof props.selectedIndex === 'number' ? props.selectedIndex : -1)
</script>

<template>
  <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
    <div
      v-for="(t, i) in thumbnails"
      :key="t.id"
      class="relative rounded-card border border-[var(--border)] bg-card overflow-hidden"
      :class="sel === i ? 'ring-2 ring-[var(--accent-outline)] border-[var(--accent-border)]' : ''"
      @click="emit('select', i)"
    >
      <div class="aspect-[3/4] bg-[var(--surface)] flex items-center justify-center text-muted overflow-hidden">
        <img
          v-if="t.dataUrl"
          :src="t.dataUrl"
          class="w-full h-full object-contain pointer-events-none"
        >
        <span
          v-else
          class="text-3xl i-carbon-document-pdf"
        />
      </div>
      <div class="px-2 py-1.5 flex items-center justify-between gap-1 border-t border-[var(--border)] bg-[var(--surface)]">
        <span class="text-xs text-muted truncate">{{ t.label ?? `#${i + 1}` }}</span>
        <div class="flex items-center gap-0.5">
          <button
            class="base-btn base-btn-tiny !h-7 !w-7 !p-0"
            title="旋转 90°"
            @click.stop="emit('rotate', i)"
          >
            <span class="i-carbon-rotate-clockwise" />
          </button>
          <button
            class="base-btn base-btn-tiny base-btn-danger !h-7 !w-7 !p-0"
            title="删除"
            @click.stop="emit('remove', i)"
          >
            <span class="i-carbon-trash-can" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
