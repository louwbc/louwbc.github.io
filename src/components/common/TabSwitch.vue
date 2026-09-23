<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
const props = defineProps<{ tabs: { key: string; label: string; icon?: string }[]; modelValue: string; size?: 'sm' | 'md' }>()
const emit = defineEmits<(e: 'update:modelValue', v: string) => void>()
const route = useRoute(); const router = useRouter()
// v-model 双向绑定；按下左右键 / Home / End 切换（v2 TV/FM Tab 行为）
function onKeydown(e: KeyboardEvent) {
  const idx = props.tabs.findIndex(t => t.key === props.modelValue)
  if (idx < 0) return
  let next = idx
  if (e.key === 'ArrowRight') next = Math.min(props.tabs.length - 1, idx + 1)
  else if (e.key === 'ArrowLeft') next = Math.max(0, idx - 1)
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = props.tabs.length - 1
  else return
  e.preventDefault()
  emit('update:modelValue', props.tabs[next].key)
  void router.replace({ path: route.path, query: { ...route.query, tab: props.tabs[next].key } })
}
</script>

<template>
  <div
    role="tablist"
    class="inline-flex items-center p-1 rounded-btn bg-[var(--surface)] border border-[var(--border)]"
    @keydown="onKeydown"
  >
    <button
      v-for="t in tabs"
      :key="t.key"
      role="tab"
      :aria-selected="modelValue === t.key"
      :tabindex="modelValue === t.key ? 0 : -1"
      class="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-sm transition outline-none focus-visible:ring-2 ring-offset-0 ring-[var(--accent-outline)]"
      :class="
        modelValue === t.key
          ? 'bg-white shadow-card border border-[var(--border)] text-accent font-medium'
          : 'text-muted hover:text-text hover:bg-white/60'
      "
      @click="emit('update:modelValue', t.key)"
    >
      <span
        v-if="t.icon"
        :class="t.icon"
        aria-hidden="true"
      />
      <span>{{ t.label }}</span>
    </button>
  </div>
</template>
