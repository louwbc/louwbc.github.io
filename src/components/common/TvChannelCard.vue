<script setup lang="ts">
import { computed } from 'vue'
import type { TvChannel } from '@/types/media'
import { useFavoritesStore } from '@/stores/favorites'
import { useTvStore, TV_LOCAL_FAV_MAX } from '@/stores/tv'
import { usePlayerStore } from '@/stores/player'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import { useToasts } from '@/composables/useToasts'
import { isTv } from '@/types/media'

const props = defineProps<{ channel: TvChannel; showRank?: number }>()
const favStore = useFavoritesStore()
const tvStore = useTvStore()
const player = usePlayerStore()
const settings = useSettingsStore()
const router = useRouter()
const toast = useToasts()

const inLocal = computed(() => tvStore.localFavorites.includes(props.channel.id))
const inUnified = computed(() => favStore.has(props.channel))

function playChannel() {
  if (props.channel.availability !== 'external' && props.channel.streamUrl) {
    player.playItem(props.channel, true)
    tvStore.pushRecent(props.channel.id)
  } else if (props.channel.watchUrl) {
    window.open(props.channel.watchUrl, '_blank', 'noopener')
  }
}
function openHomepage() {
  if (props.channel.homepage) window.open(props.channel.homepage, '_blank', 'noopener')
  else if (props.channel.watchUrl) window.open(props.channel.watchUrl, '_blank', 'noopener')
}
function toggleLocal() {
  const ok = tvStore.toggleLocalFavorite(props.channel.id)
  if (ok) toast.success('已加入 TV 独立收藏')
  else if (inLocal.value) toast.info('已移出 TV 独立收藏')
  else if (tvStore.localFavorites.length >= TV_LOCAL_FAV_MAX) toast.warn(`TV 独立收藏已达上限 ${TV_LOCAL_FAV_MAX}`)
  // 自动镜像到统一收藏（设置里开关）
  if (ok && settings.autoMirrorLocalFavoritesToUnified && !inUnified.value) favStore.add(props.channel)
}
function addUnified() {
  const ok = favStore.add(props.channel)
  if (ok) toast.success('已加入统一收藏')
  else if (inUnified.value) toast.info('已在统一收藏中')
}
</script>

<template>
  <article
    class="base-card !p-3 md:!p-4 hover:bg-[var(--surface)] transition active:translate-y-px flex flex-col gap-3"
    :data-channel-id="channel.id"
  >
    <header class="flex items-start gap-3 min-w-0">
      <div class="flex items-center justify-center w-11 h-11 rounded-btn bg-[var(--accent-bg)] border border-[var(--accent-border)] text-accent shrink-0">
        <span class="i-carbon-screen text-xl" />
      </div>
      <div class="min-w-0 grow">
        <div class="flex items-center gap-2">
          <h3 class="font-semibold text-text truncate">
            {{ channel.title }}
          </h3>
          <span
            v-if="typeof showRank === 'number' && showRank > 0"
            class="text-xs text-muted"
          >#{{ showRank }}</span>
          <span
            v-if="channel.availability === 'external'"
            class="ml-auto shrink-0"
          >
            <MetaPill
              tone="neutral"
              text="外链播放"
            />
          </span>
        </div>
        <div class="mt-1 flex flex-wrap gap-1.5 text-xs">
          <MetaPill
            v-if="channel.country"
            :text="channel.country"
            tone="accent"
          />
          <MetaPill
            v-if="channel.language"
            :text="channel.language"
          />
          <MetaPill
            v-if="channel.category"
            :text="channel.category"
          />
          <MetaPill
            v-if="channel.hasSubtitle"
            text="字幕轨"
            tone="success"
          />
        </div>
        <p
          v-if="channel.subtitle"
          class="mt-1.5 text-xs text-muted line-clamp-2"
        >
          {{ channel.subtitle }}
        </p>
      </div>
    </header>

    <div class="grid grid-cols-2 gap-2">
      <button
        class="base-btn"
        @click="playChannel"
      >
        <span :class="channel.availability === 'external' ? 'i-carbon-launch' : 'i-carbon-play-filled'" />
        {{ channel.availability === 'external' ? '官网观看' : '播放' }}
      </button>
      <button
        class="base-btn"
        :disabled="!channel.homepage && !channel.watchUrl"
        @click="openHomepage"
      >
        <span class="i-carbon-globe" />
        官网
      </button>
      <button
        class="base-btn"
        :class="inLocal ? 'base-btn-primary' : ''"
        :aria-pressed="inLocal || undefined"
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
