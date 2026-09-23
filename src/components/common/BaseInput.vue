<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  placeholder?: string
  type?: 'text' | 'search' | 'email' | 'number'
  disabled?: boolean
  debounceMs?: number
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'input', v: string): void
  (e: 'submit', v: string): void
}>()
const input = (e: Event) => {
  const v = (e.target as HTMLInputElement).value
  emit('update:modelValue', v); emit('input', v)
}
</script>

<template>
  <input
    class="base-input"
    :type="type || 'text'"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    @input="input"
    @keydown.enter.stop="(e) => { e.preventDefault(); emit('submit', (e.target as HTMLInputElement).value) }"
  >
</template>
