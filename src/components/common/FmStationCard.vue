<script setup lang="ts">
import { computed } from 'vue'
import type { FmStation } from '@/types/media'
import { useFavoritesStore } from '@/stores/favorites'
import { useFmStore, FM_LOCAL_FAV_MAX } from '@/stores/fm'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { useToasts } from '@/composables/useToasts'

const props = defineProps<{ station: FmStation; showRank?: number }>()
const fav = useFavoritesStore()
const fm = useFmStore()
const player = usePlayerStore()
const settings = useSettingsStore()
const toast = useToasts()
const inLocal = computed(() => fm.localFavorites.includes(props.station.id))
const inUnified = computed(() => fav.has(props.station))

function play() {
  if (!props.station.streamUrl) { toast.warn('该电台无可用流地址'); return }
  player.playItem(props.station, true)
  fm.pushRecent(props.station.id)
  // MediaSession
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      const ms = navigator.mediaSession
      ms.metadata = new MediaMetadata({ title: props.station.title, artist: props.station.country || 'Solo Radio', album: props.station.category, artwork: props.station.favicon ? [{ src: props.station.favicon }] : undefined })
    } catch { /* noop */ }
  }
}
function openHomepage() {
  if (props.station.homepage) window.open(props.station.homepage, '_blank', 'noopener')
}
function toggleLocal() {
  const ok = fm.toggleLocalFavorite(props.station.id)
  if (ok) {
    toast.success('已加入 FM 独立收藏')
    if (settings.autoMirrorLocalFavoritesToUnified && !inUnified.value) fav.add(props.station)
  } else if (inLocal.value) toast.info('已移出 FM 独立收藏')
  else if (fm.localFavorites.length >= FM_LOCAL_FAV_MAX) toast.warn(`FM 独立收藏已达上限 ${FM_LOCAL_FAV_MAX}`)
}
function addUnified() {
  const ok = fav.add(props.station)
  if (ok) toast.success('已加入统一收藏')
  else if (inUnified.value) toast.info('已在统一收藏中')
}
</script>

<template>
  <article
    class="base-card !p-3 md:!p-4 hover:bg-[var(--surface)] transition active:translate-y-px flex flex-col gap-3"
    :data-station-id="station.id"
  >
    <header class="flex items-start gap-3 min-w-0">
      <div class="flex items-center justify-center w-11 h-11 rounded-btn bg-[var(--accent-bg)] border border-[var(--accent-border)] text-accent shrink-0 overflow-hidden">
        <img
          v-if="station.favicon"
          :src="station.favicon"
          :alt="station.title"
          referrerpolicy="no-referrer"
          loading="lazy"
          class="w-9 h-9 object-contain"
          @error="($event.target as HTMLImageElement).style.display = 'none'"
        >
        <span
          v-else
          class="i-carbon-network-4 text-xl"
        />
      </div>
      <div class="min-w-0 grow">
        <div class="flex items-center gap-2">
          <h3 class="font-semibold text-text truncate">
            {{ station.title }}
          </h3>
          <span
            v-if="typeof showRank === 'number' && showRank > 0"
            class="text-xs text-muted"
          >#{{ showRank }}</span>
        </div>
        <div class="mt-1 flex flex-wrap gap-1.5 text-xs">
          <MetaPill
            v-if="station.country"
            :text="station.country"
            tone="accent"
          />
          <MetaPill
            v-if="station.language"
            :text="station.language"
          />
          <MetaPill
            v-if="station.tags?.[0]"
            :text="station.tags[0]"
          />
          <MetaPill
            v-if="station.bitrate"
            :text="`${station.bitrate}kbps`"
          />
        </div>
      </div>
    </header>

    <div class="grid grid-cols-2 gap-2">
      <button
        class="base-btn base-btn-primary"
        @click="play"
      >
        <span class="i-carbon-play-filled" />
        播放
      </button>
      <button
        class="base-btn"
        :disabled="!station.homepage"
        @click="openHomepage"
      >
        <span class="i-carbon-globe" />
        官网
      </button>
      <button
        class="base-btn"
        :class="inLocal ? 'base-btn-primary' : ''"
        :aria-pressed="inLocal"
        @click="toggleLocal"
      >
        <span :class="inLocal ? 'i-carbon-star-filled' : 'i-carbon-star'" />
        {{ inLocal ? '已收藏' : '独立收藏' }}
      </button>
      <button
        class="base-btn"
        :class="inUnified ? 'base-btn-primary' : ''"
        :disabled="inUnified"
        @click="addUnified"
      >
        <span :class="inUnified ? 'i-carbon-favorite-filled' : 'i-carbon-favorite'" />
        统一收藏
      </button>
    </div>
  </article>
</template>
