<script setup lang="ts">
/**
 * 全球电视（Task 6 功能等价迁移 + 单一导航 + 单一收藏源）
 * - 左 Player（#global-video Teleport 到 TV Top Dock / 全屏 stage）+ 右 ChannelList
 * - 5 维筛选：keyword/country/language/category/availability + 3 Tab（all/fav/recent）
 * - 快捷键 N 下一台 / P 上一台 / Space 播放暂停 / F 全屏 / C 字幕开关 (VueUse onKeyStroke + shouldIgnore(input focus))
 * - HLS 动态 import('hls.js')（useHls.ts）；Safari 原生 HLS
 * - 独立收藏上限 100 (useTvStore)；统一收藏 ✚ 独立按钮双写
 * - 深度链接 ?channel=xxx：onMounted 后选中、播放并 smooth scrollIntoView
 */
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useTvStore, TV_LOCAL_FAV_MAX } from '@/stores/tv'
import { useFavoritesStore } from '@/stores/favorites'
import { useSettingsStore } from '@/stores/settings'
import { usePlayerStore } from '@/stores/player'
import { useHls } from '@/composables/useHls'
import { onKeyStroke, useIntersectionObserver } from '@vueuse/core'
import TabSwitch from '@/components/common/TabSwitch.vue'
import SearchBar from '@/components/common/SearchBar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import MetaPill from '@/components/common/MetaPill.vue'
import TvChannelCard from '@/components/common/TvChannelCard.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import BaseBtn from '@/components/common/BaseBtn.vue'
import { useToasts } from '@/composables/useToasts'
import { deepLinkEventTarget } from '@/router'
import { isTv } from '@/types/media'
import type { TvFilters } from '@/stores/tv'

const route = useRoute()
const router = useRouter()
const tv = useTvStore()
const fav = useFavoritesStore()
const settings = useSettingsStore()
const player = usePlayerStore()
const toast = useToasts()
const { attach, detach } = useHls()

const { loading, channels, filteredChannels, countryOptions, languageOptions, categoryOptions, filters, recent, localFavorites } = storeToRefs(tv)

const miniPlayerShown = ref(false)
const stageEl = ref<HTMLDivElement | null>(null)
const video = (typeof document !== 'undefined' ? document.getElementById('global-video') as HTMLVideoElement | null : null)
const miniPlayerEl = ref<HTMLDivElement | null>(null)
const videoVisible = ref(false)
const showVideo = computed(() => settings.tvDefaultPlaybackMode === 'video' || videoVisible.value)
const toggleVideoVisible = () => { videoVisible.value = !videoVisible.value; applyVideoPosition() }

const tab = computed({
  get: () => filters.value.tab,
  set: (v) => { tv.setFilter('tab', v); }
})

// 三 Tab：all/fav/recent
const TABS = [
  { key: 'all' as const, label: '全部', icon: 'i-carbon-list' },
  { key: 'fav' as const, label: `收藏 (${localFavorites.value.length}/${TV_LOCAL_FAV_MAX})`, icon: 'i-carbon-star' },
  { key: 'recent' as const, label: '最近', icon: 'i-carbon-time' }
]

// 键盘：N/P/Space/F/C + ignore input focus
const shouldIgnore = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || target.isContentEditable
}

const nextChannel = (step = 1) => {
  if (!filteredChannels.value.length) return
  const cur = player.currentItem && isTv(player.currentItem) ? filteredChannels.value.findIndex(c => c.id === player.currentItem!.id) : -1
  const total = filteredChannels.value.length
  const next = cur < 0 ? 0 : (cur + step + total) % total
  selectAndPlay(filteredChannels.value[next].id, { scroll: true })
}

onKeyStroke('KeyN', (e) => { if (shouldIgnore(e.target)) return; nextChannel(1) })
onKeyStroke('KeyP', (e) => { if (shouldIgnore(e.target)) return; nextChannel(-1) })
onKeyStroke(' ', (e) => {
  if (shouldIgnore(e.target)) return
  e.preventDefault()
  const audio = document.getElementById('global-audio') as HTMLAudioElement | null
  if (audio) {
    if (audio.paused) { void audio.play().then(() => (player.isPlaying = true)).catch(() => {}) }
    else { audio.pause(); player.isPlaying = false }
  }
})
onKeyStroke('KeyF', async (e) => {
  if (shouldIgnore(e.target)) return
  if (!showVideo.value) { toast.info('「看画面」模式下按 F 全屏（当前为音频优先）'); return }
  const el = (stageEl.value ?? video ?? document.documentElement)
  try {
    if (!document.fullscreenElement) { await (el.requestFullscreen || (el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen).call(el) }
    else { await document.exitFullscreen() }
  } catch { /* noop */ }
})
onKeyStroke('KeyC', (e) => {
  if (shouldIgnore(e.target)) return
  if (!video) return
  const tt = video.textTracks
  if (!tt.length) { toast.info('当前频道无字幕轨'); return }
  const onCount = Array.from(tt).filter(t => t.mode === 'showing').length
  const target = onCount === 0 ? 'showing' : 'disabled'
  for (let i = 0; i < tt.length; i++) (tt[i]).mode = (target === 'showing' && i === 0 ? 'showing' : 'disabled') as TextTrackMode
  settings.tvSubtitleEnabled = target === 'showing'
  toast.success(`字幕 ${target === 'showing' ? '已开启' : '已关闭'}`)
})

// 应用视频位置（Top Dock / 全屏模式下隐藏 dock）
function applyVideoPosition() {
  if (!video) return
  if (!showVideo.value) { video.hidden = true; return }
  video.hidden = false
  // 把 #global-video 从 body 根移到 miniPlayerEl stage（Teleport 需要 DOM 移动）
  const target = miniPlayerEl.value
  if (target && video.parentNode !== target) target.appendChild(video)
  // 类
  video.classList.add('w-full', 'h-full', 'rounded', 'bg-black')
  video.classList.remove('hidden')
  if (video.hasAttribute('controls')) { /* keep */ }
  miniPlayerShown.value = true
}

async function selectAndPlay(id: string, opts: { scroll?: boolean } = {}) {
  const ch = tv.findById(id)
  if (!ch) return
  // 最近
  tv.pushRecent(id)
  // 独立收藏 Tab 时自动同步到统一收藏？开关 control settings.autoMirror
  const hasStream = ch.availability !== 'external' && ch.streamUrl
  if (hasStream) {
    if (showVideo.value) {
      // 用视频：HLS attach
      await nextTick()
      applyVideoPosition()
      if (video) {
        const ok = await attach(video, ch.streamUrl)
        if (ok) {
          try {
            const vv = video
            vv.volume = player.volume
            await vv.play().catch(() => {})
            player.isPlaying = !vv.paused
            player.currentStreamUrl = ch.streamUrl
            player.currentTitle = ch.title
            player.currentSubtitle = [ch.country, ch.category].filter(Boolean).join(' · ')
            player.mediaType = 'tv'
          } catch { /* noop */ }
        }
      }
    } else {
      // 音频优先
      void player.playItem(ch, true)
    }
  } else if (ch.watchUrl) {
    window.open(ch.watchUrl, '_blank', 'noopener')
  }
  if (opts.scroll) {
    await nextTick()
    const el = document.querySelector(`[data-channel-id="${CSS.escape(id)}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

// 导入导出
const importInput = ref<HTMLInputElement | null>(null)
const confirmClear = ref(false)
const importing = ref(false)
function triggerImport() { importInput.value?.click() }
async function onImportFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  importing.value = true
  try {
    const t = await f.text()
    const arr = JSON.parse(t) as unknown[]
    let ok = 0
    for (const r of arr) {
      const id = String((r as Record<string, unknown>).id ?? '')
      if (!id) continue
      if (tv.findById(id)) {
        if (tv.toggleLocalFavorite(id)) ok++
      } else {
        if (localFavorites.value.length < TV_LOCAL_FAV_MAX) {
          localFavorites.value.push(id)
          ok++
        }
      }
    }
    // persist：通过动态 import 直接调用（避免 storage 顶层循环依赖）
    (await import('@/storage/index')).storageSet(
      (await import('@/storage/keys')).V3_KEYS.TV_LOCAL_FAVORITES,
      tv.localFavorites.slice()
    )
    toast.success(`导入成功：新增 ${ok} 条`)
  } catch {
    toast.error('导入失败：文件格式错误')
  } finally {
    importing.value = false
    if (importInput.value) importInput.value.value = ''
  }
}
function doExport() {
  const ids = tv.localFavorites.map(id => tv.findById(id)).filter(Boolean)
  const blob = new Blob([JSON.stringify(ids, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `global-tv-favorites-v3-${new Date().toISOString().slice(0,10)}.json`
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); }, 2000)
}
function doClearAll() {
  tv.localFavorites.length = 0
  import('@/storage/index').then(m =>
    import('@/storage/keys').then(k => m.storageSet(k.V3_KEYS.TV_LOCAL_FAVORITES, []))
  )
  toast.info('已清空 TV 独立收藏')
  confirmClear.value = false
}

// 深度链接选中处理
deepLinkEventTarget.once(async (p) => {
  if (route.path !== '/tv') return
  const id = p.channel
  if (!id) return
  await tv.loadChannels()
  await nextTick()
  selectAndPlay(id, { scroll: true })
})

// IntersectionObserver：stage 滚出视口时显示 FloatingMiniPlayer
const stageIO = useIntersectionObserver(stageEl, ([entry]) => {
  miniPlayerShown.value = showVideo.value ? true : !entry.isIntersecting && Boolean(player.currentTitle)
})

onMounted(async () => {
  await tv.loadChannels()
  // 自动读 query channel
  const id = typeof route.query.channel === 'string' ? route.query.channel : undefined
  if (id) { await nextTick(); selectAndPlay(id, { scroll: true }) }
  // 若在视频模式且正在播放 global-audio 时，按设置把视频挂出来
  if (showVideo.value && video) {
    applyVideoPosition()
  }
})
onBeforeUnmount(() => {
  detach()
  if (video) {
    video.hidden = true
    video.pause()
    try { video.removeAttribute('src'); video.load() } catch { /* noop */ }
    // 还原回 body
    if (video.parentNode && video.parentNode !== document.body) document.body.appendChild(video)
  }
})

// 同步 query.tab <-> store.tab
watch(() => route.query.tab, (t) => { if (typeof t === 'string' && ['all', 'fav', 'recent'].includes(t)) tv.setFilter('tab', t as 'all' | 'fav' | 'recent') }, { immediate: true })
watch(tab, (t) => { if (route.query.tab !== t) void router.replace({ query: { ...route.query, tab: t } }) })
</script>

<template>
  <section class="mt-4 md:mt-6 space-y-4">
    <header class="base-card flex flex-wrap items-end justify-between gap-3 !p-4">
      <div>
        <h1 class="text-2xl font-bold text-text flex items-center gap-2">
          <span class="i-carbon-screen text-accent" /> 全球电视
          <span
            v-if="!loading"
            class="text-sm font-normal text-muted ml-1"
          >共 {{ channels.length }} 台</span>
        </h1>
        <p class="mt-1 text-xs text-muted">
          英语频道 800+ · 音频优先 · 快捷键 N/P/Space/F/C
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <BaseBtn
          variant="tiny"
          @click="triggerImport()"
        >
          <span class="i-carbon-upload" /> 导入
        </BaseBtn>
        <input
          ref="importInput"
          type="file"
          accept="application/json,.json"
          class="hidden"
          :disabled="importing"
          @change="onImportFile"
        >
        <BaseBtn
          variant="tiny"
          :disabled="!localFavorites.length"
          @click="doExport"
        >
          <span class="i-carbon-download" /> 导出
        </BaseBtn>
        <BaseBtn
          variant="tiny"
          :disabled="!localFavorites.length"
          @click="confirmClear = true"
        >
          <span class="i-carbon-trash-can" /> 清空
        </BaseBtn>
        <BaseBtn
          variant="tiny"
          :class="settings.tvDefaultPlaybackMode === 'video' ? 'base-btn-primary' : ''"
          @click="settings.togglePlaybackMode()"
        >
          <span :class="settings.tvDefaultPlaybackMode === 'video' ? 'i-carbon-video-player-play' : 'i-carbon-headphones'" />
          {{ settings.tvDefaultPlaybackMode === 'video' ? '看电视' : '听音频' }}
        </BaseBtn>
        <BaseBtn
          variant="tiny"
          :class="showVideo ? 'base-btn-primary' : ''"
          :disabled="settings.tvDefaultPlaybackMode === 'audio' && !videoVisible"
          @click="toggleVideoVisible"
        >
          <span :class="showVideo ? 'i-carbon-screen' : 'i-carbon-screen-off'" />
          画面
        </BaseBtn>
      </div>
    </header>

    <!-- 5 维筛选 -->
    <div class="base-card grid grid-cols-1 md:grid-cols-6 gap-3">
      <div class="md:col-span-2">
        <SearchBar
          v-model="filters.keyword"
          placeholder="搜索频道名 / 国家 / 语言..."
          @search="(v) => tv.setFilter('keyword', v)"
        />
      </div>
      <select
        v-model="filters.country"
        class="base-input"
        @change="(e) => tv.setFilter('country', (e.target as HTMLSelectElement).value)"
      >
        <option value="">
          全部国家
        </option>
        <option
          v-for="c in countryOptions"
          :key="c"
          :value="c"
        >
          {{ c }}
        </option>
      </select>
      <select
        v-model="filters.language"
        class="base-input"
        @change="(e) => tv.setFilter('language', (e.target as HTMLSelectElement).value)"
      >
        <option value="">
          全部语言
        </option>
        <option
          v-for="l in languageOptions"
          :key="l"
          :value="l"
        >
          {{ l }}
        </option>
      </select>
      <select
        v-model="filters.category"
        class="base-input"
        @change="(e) => tv.setFilter('category', (e.target as HTMLSelectElement).value)"
      >
        <option value="">
          全部分类
        </option>
        <option
          v-for="c in categoryOptions"
          :key="c"
          :value="c"
        >
          {{ c }}
        </option>
      </select>
      <select
        v-model="filters.availability"
        class="base-input"
        @change="(e) => tv.setFilter('availability', (e.target as HTMLSelectElement).value as TvFilters['availability'])"
      >
        <option value="all">
          全部可用性
        </option>
        <option value="hls">
          可站内 HLS 播放
        </option>
        <option value="external">
          仅外链观看
        </option>
      </select>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <TabSwitch
        v-model="tab"
        :tabs="TABS as Array<{key: string; label: string; icon?: string}>"
      />
      <div class="text-xs text-muted ml-auto">
        结果：<span class="font-semibold text-text">{{ filteredChannels.length }}</span>
        <span v-if="filters.country || filters.language || filters.category || filters.keyword || filters.availability !== 'all'">
          ·
          <button
            class="underline"
            @click="() => { tv.setFilter('keyword', ''); tv.setFilter('country', ''); tv.setFilter('language', ''); tv.setFilter('category', ''); tv.setFilter('availability', 'all') }"
          >
            清除筛选
          </button>
        </span>
      </div>
    </div>

    <!-- Layout: 双栏 (左 player，右 channel list grid 2 col) -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div class="lg:col-span-5 space-y-3">
        <div
          ref="stageEl"
          class="base-card !p-2 md:!p-3 space-y-3"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-sm text-text font-medium min-w-0">
              <span
                class="i-carbon-media-library text-accent"
                aria-hidden="true"
              />
              <span class="truncate">{{ player.currentTitle || '选择频道开始播放' }}</span>
              <MetaPill
                v-if="player.currentSubtitle"
                :text="player.currentSubtitle"
              />
            </div>
            <div class="flex items-center gap-1">
              <BaseBtn
                variant="icon"
                title="上一台 (P)"
                @click="nextChannel(-1)"
              >
                <span class="i-carbon-skip-back-filled" />
              </BaseBtn>
              <BaseBtn
                variant="icon"
                :class="player.isPlaying ? 'base-btn-primary' : ''"
                :title="player.isPlaying ? '暂停 (Space)' : '播放 (Space)'"
                @click="player.toggle()"
              >
                <span :class="player.isPlaying ? 'i-carbon-pause-filled' : 'i-carbon-play-filled'" />
              </BaseBtn>
              <BaseBtn
                variant="icon"
                title="下一台 (N)"
                @click="nextChannel(1)"
              >
                <span class="i-carbon-skip-forward-filled" />
              </BaseBtn>
              <BaseBtn
                variant="icon"
                :disabled="!video && showVideo"
                title="全屏 (F)"
                @click="selectAndPlay(player.currentItem?.id || channels[0]?.id, {})"
              >
                <span class="i-carbon-fit-to-screen" />
              </BaseBtn>
            </div>
          </div>
          <div
            ref="miniPlayerEl"
            class="relative w-full aspect-video bg-black rounded-card overflow-hidden"
          >
            <EmptyState
              v-if="!showVideo"
              :title="player.currentTitle ? '音频优先模式' : '尚未开始播放'"
              :description="player.currentTitle ? '切换到「看电视」模式可显示视频画面 + 字幕' : '从右侧列表选一个频道开始（也可以直接听音频）'"
              icon="i-carbon-headphones"
            />
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <div class="flex items-center gap-2">
              <label class="flex items-center gap-1.5 cursor-pointer"><input
                type="checkbox"
                class="accent-[var(--accent)]"
                :checked="settings.tvSubtitleEnabled"
                @change="() => settings.toggleSubtitle()"
              > 字幕 (C)</label>
              <MetaPill
                v-if="player.mediaType === 'tv'"
                tone="accent"
                text="TV"
              />
            </div>
            <div class="flex items-center gap-2">
              <span class="i-carbon-volume-up" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                :value="player.volume"
                class="accent-[var(--accent)] w-40"
                @input="(e) => player.setVolume(Number((e.target as HTMLInputElement).value))"
              >
              <span class="tabular-nums w-10 text-right">{{ Math.round(player.volume * 100) }}%</span>
            </div>
          </div>
        </div>
      </div>

      <div class="lg:col-span-7">
        <EmptyState
          v-if="loading && !channels.length"
          title="正在加载电视列表..."
          description="约 800 频道"
        />
        <EmptyState
          v-else-if="!filteredChannels.length"
          title="无匹配频道"
          description="换关键词或清除筛选条件"
        />
        <div
          v-else
          class="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <TvChannelCard
            v-for="c in filteredChannels"
            :key="c.id"
            :channel="c"
            @dblclick="() => selectAndPlay(c.id, { scroll: false })"
          />
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-model:open="confirmClear"
      title="确认清空 TV 独立收藏？"
      message="该操作不会影响统一收藏，只清空本地 TV Tab 独立收藏列表，且无法撤销。"
      confirm-label="清空"
      confirm-variant="danger"
      :loading="importing"
      @confirm="doClearAll"
    />
  </section>
</template>
