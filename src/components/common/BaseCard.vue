<script setup lang="ts">
defineProps<{ title?: string; padded?: boolean }>()
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Vue 3 defineSlots generic requires return type
const slots = defineSlots<{ default?: any; header?: any; footer?: any }>()
</script>

<template>
  <section
    class="base-card"
    :class="{ '!p-0': padded === false }"
  >
    <header
      v-if="title || slots.header"
      class="flex items-center justify-between gap-3 px-0 md:px-0 mb-3 pb-2 border-b border-[var(--border)]"
    >
      <slot name="header">
        <h3
          v-if="title"
          class="font-semibold text-text"
        >
          {{ title }}
        </h3>
      </slot>
    </header>
    <div class="p-4">
      <slot />
    </div>
    <footer
      v-if="slots.footer"
      class="mt-3 pt-3 border-t border-[var(--border)]"
    >
      <slot name="footer" />
    </footer>
  </section>
</template>
