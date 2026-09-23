<script setup lang="ts">
import { computed } from 'vue'
import type { MediaItem } from '@/types/media'
import { isFm, isTv } from '@/types/media'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { useFavoritesStore } from '@/stores/favorites'
import { useTvStore } from '@/stores/tv'
import { useFmStore } from '@/stores/fm'
import { useToasts } from '@/composables/useToasts'

const props = defineProps<{ item: MediaItem; showRank?: number }>()
const router = useRouter()
const player = usePlayerStore()
const fav = useFavoritesStore()
const tv = useTvStore()
const fm = useFmStore()
const toast = useToasts()

const icon = computed(() => isTv(props.item) ? 'i-carbon-screen' : isFm(props.item) ? 'i-carbon-network-4' : 'i-carbon-music-notes')
const sourcePath = computed(() => isTv(props.item) ? '/tv' : '/fm')
const titleExtra = computed(() => [props.item.country, props.item.language, props.item.category].filter(Boolean).join(' · '))

function play() {
  if (!props.item.streamUrl) { toast.warn('该条目无流地址'); return }
  player.playItem(props.item, true)
  if (isTv(props.item)) tv.pushRecent(props.item.id)
  if (isFm(props.item)) fm.pushRecent(props.item.id)
}
function jumpSource() {
  void router.push({ path: sourcePath.value, query: isTv(props.item) ? { channel: props.item.id } : isFm(props.item) ? { station: props.item.id } : undefined })
}
function remove() {
  fav.remove(props.item.type, props.item.id)
  toast.info(`已从统一收藏移除：${props.item.title}`)
}
const dirs: { key: 'top' | 'up' | 'down' | 'bottom'; icon: string; label: string }[] = [
  { key: 'top', icon: 'i-carbon-chevron-top--double', label: '置顶' },
  { key: 'up', icon: 'i-carbon-chevron-up', label: '上移' },
  { key: 'down', icon: 'i-carbon-chevron-down', label: '下移' },
  { key: 'bottom', icon: 'i-carbon-chevron-bottom--double', label: '置底' }
]
</script>

<template>
  <article
    class="base-card !p-3 md:!p-4 flex flex-col gap-3"
    :data-fav-key="`${item.type}:${item.id}`"
  >
    <header class="flex items-start gap-3 min-w-0">
      <div class="w-11 h-11 shrink-0 rounded-btn bg-[var(--accent-bg)] border border-[var(--accent-border)] text-accent inline-flex items-center justify-center">
        <span
          :class="icon"
          class="text-xl"
        />
      </div>
      <div class="min-w-0 grow">
        <div class="flex items-center gap-2">
          <h3 class="font-semibold text-text truncate">
            {{ item.title }}
          </h3>
          <span
            v-if="typeof showRank === 'number' && showRank > 0"
            class="text-xs text-muted"
          >#{{ showRank }}</span>
          <span
            v-if="item.orderIndex != null"
            class="ml-auto text-xs text-muted"
          >排序 {{ item.orderIndex + 1 }}</span>
        </div>
        <p
          v-if="titleExtra"
          class="mt-1 text-xs text-muted"
        >
          {{ titleExtra }}
        </p>
        <p
          v-if="item.subtitle"
          class="mt-1 text-xs text-muted line-clamp-2"
        >
          {{ item.subtitle }}
        </p>
      </div>
    </header>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
      <button
        class="base-btn base-btn-primary"
        @click="play"
      >
        <span class="i-carbon-play-filled" />
        播放
      </button>
      <button
        class="base-btn"
        @click="jumpSource"
      >
        <span :class="isTv(item) ? 'i-carbon-screen' : 'i-carbon-network-4'" />
        原应用
      </button>
      <button
        class="base-btn"
        @click="router.push(sourcePath)"
      >
        <span class="i-carbon-launch" />
        打开列表
      </button>
      <button
        class="base-btn base-btn-danger"
        @click="remove"
      >
        <span class="i-carbon-trash-can" />
        移除
      </button>
    </div>

    <div
      class="flex items-center justify-center gap-2 pt-2 border-t border-dashed border-[var(--border)]"
      aria-label="四向排序"
    >
      <button
        v-for="d in dirs"
        :key="d.key"
        class="base-btn base-btn-tiny"
        :title="d.label"
        :aria-label="d.label"
        @click="fav.reorder(item.type, item.id, d.key)"
      >
        <span :class="d.icon" />
        {{ d.label }}
      </button>
    </div>
  </article>
</template>
