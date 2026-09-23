<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { storeToRefs } from 'pinia'

const player = usePlayerStore()
const { currentTitle, currentSubtitle, isPlaying, mediaType } = storeToRefs(player)
const hasCurrent = computed(() => Boolean(player.currentItem || player.currentStreamUrl))
</script>

<template>
  <div
    id="global-player-bar"
    class="fixed z-30 left-0 right-0 bottom-0 border-t border-[var(--border)] bg-[var(--surface)] backdrop-blur-md transition-all duration-200"
    :class="hasCurrent ? 'translate-y-0' : 'translate-y-full pointer-events-none'"
    style="padding-bottom: env(safe-area-inset-bottom, 0);"
  >
    <div class="app-container h-16 flex items-center gap-3">
      <div class="flex items-center justify-center w-11 h-11 rounded-btn bg-[var(--accent-bg)] border border-[var(--accent-border)] text-accent shrink-0">
        <span
          v-if="mediaType === 'tv'"
          class="i-carbon-screen text-xl"
        />
        <span
          v-else-if="mediaType === 'fm'"
          class="i-carbon-network-4 text-xl"
        />
        <span
          v-else
          class="i-carbon-music text-xl"
        />
      </div>
      <div class="min-w-0 grow">
        <div class="truncate font-medium text-text text-sm">
          {{ currentTitle || '未选择频道 / 电台' }}
        </div>
        <div class="truncate text-muted text-xs">
          {{ currentSubtitle || '从「全球电视 / 全球FM」选择一个频道开始' }}
        </div>
      </div>
      <button
        class="base-btn base-btn-primary base-btn-icon"
        :disabled="!hasCurrent"
        :aria-label="isPlaying ? '暂停' : '播放'"
        @click="player.toggle()"
      >
        <span
          v-if="isPlaying"
          class="i-carbon-pause-filled"
        />
        <span
          v-else
          class="i-carbon-play-filled"
        />
      </button>
    </div>
  </div>
</template>
