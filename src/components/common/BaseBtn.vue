<script setup lang="ts">
const props = defineProps<{
  variant?: 'default' | 'primary' | 'danger' | 'ghost' | 'icon' | 'tiny'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
  block?: boolean
  title?: string
}>()
defineEmits<(e: 'click', ev: MouseEvent) => void>()
</script>

<template>
  <button
    :type="type || 'button'"
    :disabled="disabled || loading"
    :title="title"
    class="base-btn"
    :class="[
      variant === 'primary' ? 'base-btn-primary' : null,
      variant === 'danger' ? 'base-btn-danger' : null,
      variant === 'icon' ? 'base-btn-icon' : null,
      variant === 'tiny' ? 'base-btn-tiny' : null,
      variant === 'ghost' ? '!bg-transparent !border-transparent hover:bg-[var(--surface)]' : null,
      block ? 'w-full' : null,
      loading ? 'opacity-80 cursor-wait' : null
    ]"
    @click="(e: MouseEvent) => $emit('click', e)"
  >
    <span
      v-if="loading"
      class="i-carbon-loading animate-spin text-lg"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>
