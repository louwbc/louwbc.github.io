<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { computed } from 'vue'
import { appRoutes } from '@/router/routes'
import VersionChip from './VersionChip.vue'

const router = useRouter()
const route = useRoute()

const navItems = computed(() =>
  appRoutes
    .filter(r => r.meta.inNav)
    .sort((a, b) => a.meta.order - b.meta.order)
)

function isActive(p: string): boolean {
  if (p === '/') return route.path === '/'
  return route.path === p || route.path.startsWith(p + '/')
}

function go(p: string, replace = false) {
  if (route.path === p || route.path.startsWith(p + '/')) return
  if (replace) void router.replace(p)
  else void router.push(p)
}
</script>

<template>
  <header class="app-topbar bg-[var(--topbar-blur)]">
    <div class="app-container flex items-center gap-3 h-16">
      <button
        class="flex items-center gap-2 shrink-0 font-bold text-text no-underline select-none"
        @click="go('/', true)"
      >
        <span
          class="i-carbon-music-dot text-accent text-2xl"
          aria-hidden="true"
        />
        <span class="text-lg hidden sm:inline">Solo Radio</span>
      </button>

      <nav class="flex items-center gap-1 md:gap-2 overflow-x-auto hide-scroll grow min-w-0">
        <button
          v-for="r in navItems"
          :key="r.name"
          class="flex items-center gap-1.5 h-10 px-2.5 md:px-3 rounded-btn text-sm whitespace-nowrap transition shrink-0"
          :class="
            isActive(r.path)
              ? 'text-accent bg-[var(--accent-bg)] border border-[var(--accent-border)]'
              : 'text-muted hover:text-text hover:bg-[var(--surface)] border border-transparent'
          "
          @click="go(r.path)"
        >
          <span
            v-if="r.meta.icon"
            :class="r.meta.icon"
            aria-hidden="true"
          />
          <span>{{ r.meta.title }}</span>
        </button>
      </nav>

      <VersionChip />
    </div>
  </header>
</template>

<style scoped>
.hide-scroll::-webkit-scrollbar {
  display: none;
}
.hide-scroll {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
