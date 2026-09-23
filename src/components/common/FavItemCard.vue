<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MediaItem } from '@/types/media'
import { isFm, isTv } from '@/types/media'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { useFavoritesStore } from '@/stores/favorites'
import { useTvStore } from '@/stores/tv'
import { useFmStore } from '@/stores/fm'
import { useToasts } from '@/composables/useToasts'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'

const props = defineProps<{ item: MediaItem; showRank?: number }>()
const router = useRouter()
const player = usePlayerStore()
const fav = useFavoritesStore()
const tv = useTvStore()
const fm = useFmStore()
const toast = useToasts()

const confirmRemove = ref(false)

const icon = computed(() => isTv(props.item) ? 'i-carbon-screen' : isFm(props.item) ? 'i-carbon-network-4' : 'i-carbon-music-notes')
const sourcePath = computed(() => isTv(props.item) ? '/tv' : '/fm')
const titleExtra = computed(() => [props.item.country, props.item.language, props.item.category].filter(Boolean).join(' · '))

// 流地址健康度诊断（用于徽标颜色 + 提示 tooltip）
type StreamHealth = 'ok' | 'warn' | 'bad'
const streamHealth = computed<{ level: StreamHealth; label: string }>(() => {
  const s = props.item.streamUrl
  const h = props.item.homepage
  if (!s) return { level: 'bad', label: '无流地址' }
  if (!/^https?:\/\//i.test(s)) return { level: 'bad', label: '流地址非法' }
  if (h && s === h) return { level: 'warn', label: '流=官网，可能无法直接播' }
  if (/homepage|landing/i.test(s)) return { level: 'warn', label: '疑似官网页面' }
  return { level: 'ok', label: '流地址正常' }
})
const healthBadgeTone = computed(() =>
  streamHealth.value.level === 'ok' ? 'bg-[var(--accent-bg)] text-accent border-[var(--accent-border)]'
    : streamHealth.value.level === 'warn' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/40'
      : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/40'
)

function play() {
  if (!props.item.streamUrl || !/^https?:\/\//i.test(props.item.streamUrl)) {
    toast.warn(`${props.item.title} 无可用流地址，建议跳官网或移除`)
    return
  }
  player.playItem(props.item, true)
  if (isTv(props.item)) tv.pushRecent(props.item.id)
  if (isFm(props.item)) fm.pushRecent(props.item.id)
}
function jumpSource() {
  void router.push({ path: sourcePath.value, query: isTv(props.item) ? { channel: props.item.id } : isFm(props.item) ? { station: props.item.id } : undefined })
}
function openHomepage() {
  const u = props.item.homepage || props.item.streamUrl
  if (!u) { toast.warn('无官网链接'); return }
  window.open(u, '_blank', 'noopener')
}
function requestRemove() { confirmRemove.value = true }
function doRemove() {
  fav.remove(props.item.type, props.item.id)
  toast.info(`已从统一收藏移除：${props.item.title}`)
  confirmRemove.value = false
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
    class="base-card !p-3 md:!p-4 flex flex-col gap-3 relative"
    :data-fav-key="`${item.type}:${item.id}`"
  >
    <!-- 右上角 hover 删除 X（醒目） -->
    <button
      type="button"
      class="absolute top-2 right-2 z-10 w-7 h-7 rounded-btn flex items-center justify-center
             text-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10
             opacity-60 md:opacity-0 group-hover:opacity-100 transition"
      aria-label="从收藏移除"
      :title="`从收藏移除「${item.title}」`"
      @click="requestRemove"
    >
      <span class="i-carbon-close text-lg" />
    </button>

    <header class="flex items-start gap-3 min-w-0 pr-9">
      <div class="w-11 h-11 shrink-0 rounded-btn bg-[var(--accent-bg)] border border-[var(--accent-border)] text-accent inline-flex items-center justify-center">
        <span
          :class="icon"
          class="text-xl"
        />
      </div>
      <div class="min-w-0 grow">
        <div class="flex items-center gap-2 flex-wrap">
          <h3 class="font-semibold text-text truncate">
            {{ item.title }}
          </h3>
          <span
            v-if="typeof showRank === 'number' && showRank > 0"
            class="text-xs text-muted"
          >#{{ showRank }}</span>
          <!-- 流地址健康度徽标（让用户一眼看出不能播的原因） -->
          <span
            class="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] leading-none border"
            :class="healthBadgeTone"
            :title="streamHealth.label + '：' + (item.streamUrl || '(无)')"
          >
            <span
              :class="streamHealth.level === 'ok' ? 'i-carbon-checkmark-filled'
                         : streamHealth.level === 'warn' ? 'i-carbon-warning-alt-filled'
                         : 'i-carbon-error-filled'"
            />
            {{ streamHealth.label }}
          </span>
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
        :class="{ 'opacity-60': streamHealth.level === 'bad' }"
        @click="play"
      >
        <span class="i-carbon-play-filled" />
        播放
      </button>
      <button
        class="base-btn"
        @click="openHomepage"
        :title="item.homepage || item.streamUrl || '无官网链接'"
      >
        <span class="i-carbon-earth" />
        官网
      </button>
      <button
        class="base-btn"
        @click="jumpSource"
      >
        <span :class="isTv(item) ? 'i-carbon-screen' : 'i-carbon-network-4'" />
        定位
      </button>
      <button
        class="base-btn base-btn-danger"
        @click="requestRemove"
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

    <!-- 删除二次确认 -->
    <ConfirmDialog
      v-model:open="confirmRemove"
      title="从收藏中移除？"
      :message="`即将从我的收藏移除「${item.title}」。${(item.homepage || item.streamUrl) ? '\nTip：如果不能播，可先试「官网」按钮通过浏览器原生打开，确认源仍有效后再决定是否移除。' : ''}`"
      confirm-variant="danger"
      confirm-label="移除"
      cancel-label="保留"
      @confirm="doRemove"
    />
  </article>
</template>
