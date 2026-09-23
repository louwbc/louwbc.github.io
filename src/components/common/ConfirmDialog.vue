<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: 'primary' | 'danger'
  open: boolean
  loading?: boolean
}>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()
const open = computed({
  get: () => props.open,
  set: (v) => { emit('update:open', v); }
})
function closeConfirm() { open.value = false; emit('confirm') }
function closeCancel() { open.value = false; emit('cancel') }
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        @click.self="closeCancel"
      >
        <div
          role="dialog"
          aria-modal="true"
          class="w-full max-w-md base-card !p-0 overflow-hidden"
        >
          <header class="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
            <span
              class="i-carbon-warning-alt-filled text-xl text-amber-600 shrink-0"
              aria-hidden="true"
            />
            <h3 class="font-semibold text-text grow truncate">
              {{ title }}
            </h3>
          </header>
          <div class="px-4 py-4 text-sm text-text whitespace-pre-wrap leading-relaxed">
            {{ message }}
          </div>
          <footer class="px-4 py-3 border-t border-[var(--border)] flex items-center justify-end gap-2">
            <button
              class="base-btn"
              @click="closeCancel"
            >
              {{ cancelLabel ?? '取消' }}
            </button>
            <button
              class="base-btn"
              :class="confirmVariant === 'danger' ? 'base-btn-danger' : 'base-btn-primary'"
              :disabled="loading"
              @click="closeConfirm"
            >
              <span
                v-if="loading"
                class="i-carbon-loading animate-spin"
                aria-hidden="true"
              />
              {{ confirmLabel ?? '确定' }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
