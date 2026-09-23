<script setup lang="ts">
import { ref, watch } from 'vue'
const props = defineProps<{
  modelValue: string
  placeholder?: string
  debounceMs?: number
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'search', v: string): void
}>()
const local = ref(props.modelValue)
watch(() => props.modelValue, (v) => { local.value = v })
let timer: number | null = null
const fire = () => {
  emit('update:modelValue', local.value)
  emit('search', local.value)
}
const onInput = (e: Event) => {
  const v = (e.target as HTMLInputElement).value
  local.value = v
  emit('update:modelValue', v)
  if (timer) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    emit('search', local.value)
  }, props.debounceMs ?? 300)
}
</script>

<template>
  <div class="relative">
    <span
      class="i-carbon-search absolute left-3 top-1/2 -translate-y-1/2 text-muted text-lg pointer-events-none"
      aria-hidden="true"
    />
    <input
      ref="inputRef"
      class="base-input pl-9 pr-9"
      type="search"
      :value="local"
      :placeholder="placeholder"
      @input="onInput"
      @keydown.enter.prevent="fire"
    >
    <button
      v-if="local"
      type="button"
      aria-label="清除搜索"
      class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-btn text-muted hover:text-text hover:bg-[var(--surface)] inline-flex items-center justify-center"
      @click="() => { local = ''; fire() }"
    >
      <span class="i-carbon-close" />
    </button>
  </div>
</template>
