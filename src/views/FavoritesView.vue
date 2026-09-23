<script setup lang="ts">
/**
 * 我的收藏（Task 8 统一收藏中心）
 * - Hero 概览：总数 / TV / FM / Episode 分类计数
 * - 搜索（SearchBar）+ 类型过滤（All / TV / FM / Episode）
 * - 导入 JSON（匹配 type id 联合唯一）/ 导出 / 清空（ConfirmDialog）
 * - Grid 列表 FavItemCard：播放 / 跳转原应用 / 移除 / 四向排序（置顶/上/下/置底）
 * - TV Top Dock：<Teleport to="#global-video"> 当在看视频时显示悬浮全屏/关闭按钮
 * - 深度链接：兼容 channel / station（先定位到卡片再滚动）
 */
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useFavoritesStore, UNIFIED_FAVORITES_MAX } from '@/stores/favorites'
import { useTvStore } from '@/stores/tv'
import { useFmStore } from '@/stores/fm'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { useHls } from '@/composables/useHls'
import { useToasts } from '@/composables/useToasts'
import { useIntersectionObserver } from '@vueuse/core'
import SearchBar from '@/components/common/SearchBar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import MetaPill from '@/components/common/MetaPill.vue'
import FavItemCard from '@/components/common/FavItemCard.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import BaseBtn from '@/components/common/BaseBtn.vue'
import { deepLinkEventTarget } from '@/router'
import { isTv, type MediaType } from '@/types/media'

const route = useRoute()
const router = useRouter()
const fav = useFavoritesStore()
const tv = useTvStore()
const fm = useFmStore()
const player = usePlayerStore()
const settings = useSettingsStore()
const toast = useToasts()
const { attach, detach } = useHls()

const { items, size, byUniqueKey } = storeToRefs(fav)

// Hero 统计
const counts = computed(() => {
  const c = { tv: 0, fm: 0, episode: 0 }
  for (const it of items.value) c[it.type]++
  return c
})
const usagePct = computed(() => Math.min(100, Math.round((size.value / UNIFIED_FAVORITES_MAX) * 100)))
const usageTone = computed(() => (usagePct.value >= 90 ? 'danger' : usagePct.value >= 70 ? 'warn' : 'ok'))

// 搜索 + 类型过滤
const typeFilter = ref<'all' | MediaType>('all')
const keyword = ref('')
const matched = computed(() => {
  const arr = fav.search(keyword.value, typeFilter.value === 'all' ? undefined : typeFilter.value)
  // 按 orderIndex 升序（0 为最前）
  return [...arr].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
})

// 分页（避免一次渲染 600 条卡顿）
const pageLimit = ref(60)
const sentinelEl = ref<HTMLDivElement | null>(null)
const pagedItems = computed(() => matched.value.slice(0, pageLimit.value))
const hasMore = computed(() => pageLimit.value < matched.value.length)

const sentinelIO = useIntersectionObserver(sentinelEl, ([entry]) => {
  if (entry.isIntersecting && hasMore.value) {
    pageLimit.value = Math.min(matched.value.length, pageLimit.value + 60)
  }
})
watch([typeFilter, keyword], () => { pageLimit.value = 60 })

// 导入导出清空
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
    const { ok, skipped } = fav.importJSON(t)
    toast.success(`导入完成：新增 ${ok} 条${skipped ? `，跳过 ${skipped} 条（重复/超上限/格式错误）` : ''}`)
  } catch {
    toast.error('导入失败：文件格式错误')
  } finally {
    importing.value = false
    if (importInput.value) importInput.value.value = ''
  }
}
function doExport() {
  const blob = new Blob([fav.exportJSON()], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `solo-radio-unified-favorites-v3-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); }, 2000)
}
function doClearAll() {
  const n = fav.size
  fav.clearAll()
  toast.info(`已清空 ${n} 条统一收藏`)
  confirmClear.value = false
}

// TV Top Dock（播放 TV 视频时，把 #global-video 移到本页可见的容器 + 全屏/关闭按钮）
const video = typeof document !== 'undefined' ? (document.getElementById('global-video') as HTMLVideoElement | null) : null
const videoDockEl = ref<HTMLDivElement | null>(null)
const showVideoDock = computed(() => player.mediaType === 'tv' && settings.tvDefaultPlaybackMode === 'video')

function applyDockPosition() {
  if (!video || !videoDockEl.value) return
  if (!showVideoDock.value) { video.hidden = true; return }
  video.hidden = false
  if (video.parentNode !== videoDockEl.value) videoDockEl.value.appendChild(video)
  video.classList.add('w-full', 'h-full', 'rounded-card', 'bg-black')
}
watch(showVideoDock, () => nextTick().then(applyDockPosition))
async function toggleDockFullscreen() {
  const el = (videoDockEl.value ?? video ?? document.documentElement)
  try {
    if (!document.fullscreenElement) await (el.requestFullscreen || (el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen).call(el)
    else await document.exitFullscreen()
  } catch { /* noop */ }
}
function closeDockVideo() {
  if (video) {
    video.pause()
    try { video.removeAttribute('src'); video.load() } catch { /* noop */ }
    video.hidden = true
  }
  player.stop()
  if (video?.parentNode && video.parentNode !== document.body) document.body.appendChild(video)
}

// 深度链接（?channel 或 ?station → 找到对应 MediaItem 并 scrollIntoView + 播放）
async function locateDeepLink(opts: { channel?: string; station?: string } = {}) {
  const id = opts.channel || opts.station
  const type: MediaType | undefined = opts.channel ? 'tv' : opts.station ? 'fm' : undefined
  if (!id || !type) return
  // 确保 channels / available-stations 已加载（卡片播放时可能需要完整信息）
  await Promise.all([tv.loadChannels(), fm.loadAvailableStationsCached()])
  const key = `${type}:${id}`
  const it = byUniqueKey.value.get(key)
  if (!it) { toast.warn(`收藏中未找到：${key}`); return }
  await nextTick()
  const el = document.querySelector(`[data-fav-key="${CSS.escape(key)}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if (player.currentItem && player.currentItem.type === it.type && player.currentItem.id === it.id) return
  if (isTv(it) && settings.tvDefaultPlaybackMode === 'video' && video) {
    // TV 视频模式：HLS attach 到 global-video
    await nextTick()
    applyDockPosition()
    const ok = await attach(video, it.streamUrl)
    if (ok) {
      try {
        video.volume = player.volume
        await video.play().catch(() => {})
        player.isPlaying = !video.paused
        player.currentStreamUrl = it.streamUrl
        player.currentTitle = it.title
        player.currentSubtitle = [it.country, it.category].filter(Boolean).join(' · ')
        player.mediaType = 'tv'
      } catch { /* noop */ }
    }
  } else {
    void player.playItem(it, true)
    if (type === 'tv') tv.pushRecent(id)
    if (type === 'fm') fm.pushRecent(id)
  }
}
deepLinkEventTarget.once((p) => {
  if (route.path !== '/favorites') return
  void locateDeepLink(p)
})

onMounted(async () => {
  await Promise.all([tv.loadChannels(), fm.loadAvailableStationsCached()])
  const ch = typeof route.query.channel === 'string' ? route.query.channel : undefined
  const st = typeof route.query.station === 'string' ? route.query.station : undefined
  if (ch || st) { await nextTick(); void locateDeepLink({ channel: ch, station: st }) }
  nextTick().then(applyDockPosition)
})
onBeforeUnmount(() => {
  detach()
  // 把 global-video 还原回 body
  if (video?.parentNode && video.parentNode !== document.body) {
    video.hidden = true
    try { document.body.appendChild(video) } catch { /* noop */ }
  }
  sentinelIO.stop()
})
</script>

<template>
  <section class="mt-4 md:mt-6 space-y-4">
    <!-- TV Top Dock（Teleport-like：直接把 DOM 从 body 移到 videoDockEl） -->
    <Transition name="fade">
      <div
        v-if="showVideoDock"
        class="base-card !p-2 md:!p-3 space-y-2 sticky top-[64px] z-20 shadow-card backdrop-blur"
      >
        <div class="flex items-center justify-between gap-2 text-sm">
          <div class="flex items-center gap-2 min-w-0">
            <span class="i-carbon-media-library text-accent shrink-0" />
            <span class="font-medium truncate">{{ player.currentTitle || 'TV 画面' }}</span>
            <MetaPill
              v-if="player.currentSubtitle"
              :text="player.currentSubtitle"
            />
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <BaseBtn
              variant="icon"
              :title="player.isPlaying ? '暂停' : '播放'"
              @click="player.toggle()"
            >
              <span :class="player.isPlaying ? 'i-carbon-pause-filled' : 'i-carbon-play-filled'" />
            </BaseBtn>
            <BaseBtn
              variant="icon"
              title="全屏"
              @click="toggleDockFullscreen"
            >
              <span class="i-carbon-fit-to-screen" />
            </BaseBtn>
            <BaseBtn
              variant="icon"
              class="base-btn-danger"
              title="关闭画面"
              @click="closeDockVideo"
            >
              <span class="i-carbon-close" />
            </BaseBtn>
          </div>
        </div>
        <div
          ref="videoDockEl"
          class="w-full aspect-video bg-black rounded-card overflow-hidden min-h-[240px]"
        />
        <div class="flex items-center justify-between text-xs text-muted">
          <span>Top Dock · 跨路由继续播放（跳转 TV/FM 页仍会保持）</span>
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
    </Transition>

    <!-- Hero 概览 -->
    <header class="base-card !p-4 md:!p-5 relative overflow-hidden">
      <div
        class="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-[var(--accent-bg)] opacity-40 blur-3xl pointer-events-none"
        aria-hidden="true"
      />
      <div class="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl md:text-3xl font-bold text-text flex items-center gap-2">
            <span class="i-carbon-favorite text-accent" /> 我的收藏
          </h1>
          <p class="mt-1 text-sm text-muted">
            上限 {{ UNIFIED_FAVORITES_MAX }} 条 · 统一来源：全球电视 / 全球 FM / 播客集数
          </p>
          <div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl">
            <div class="rounded-card border border-[var(--border)] bg-[var(--surface)] p-3">
              <div class="text-xs text-muted">
                总数
              </div>
              <div class="mt-0.5 text-2xl font-bold text-text tabular-nums">
                {{ size }}<span class="text-sm font-normal text-muted"> / {{ UNIFIED_FAVORITES_MAX }}</span>
              </div>
            </div>
            <div class="rounded-card border border-[var(--border)] bg-[var(--surface)] p-3">
              <div class="text-xs text-muted inline-flex items-center gap-1">
                <span class="i-carbon-screen" /> 电视
              </div>
              <div class="mt-0.5 text-2xl font-bold text-text tabular-nums">
                {{ counts.tv }}
              </div>
            </div>
            <div class="rounded-card border border-[var(--border)] bg-[var(--surface)] p-3">
              <div class="text-xs text-muted inline-flex items-center gap-1">
                <span class="i-carbon-network-4" /> 电台
              </div>
              <div class="mt-0.5 text-2xl font-bold text-text tabular-nums">
                {{ counts.fm }}
              </div>
            </div>
            <div class="rounded-card border border-[var(--border)] bg-[var(--surface)] p-3">
              <div class="text-xs text-muted inline-flex items-center gap-1">
                <span class="i-carbon-music-notes" /> 集数
              </div>
              <div class="mt-0.5 text-2xl font-bold text-text tabular-nums">
                {{ counts.episode }}
              </div>
            </div>
          </div>
        </div>
        <div class="w-full sm:w-64 space-y-2">
          <div class="text-xs text-muted flex items-center justify-between">
            <span>容量使用</span>
            <span :class="usageTone === 'danger' ? 'text-red-600 font-semibold' : usageTone === 'warn' ? 'text-amber-600 font-semibold' : 'text-emerald-600 font-semibold'">{{ usagePct }}%</span>
          </div>
          <div class="h-2 rounded-full bg-[var(--surface)] overflow-hidden border border-[var(--border)]">
            <div
              class="h-full transition-all"
              :class="usageTone === 'danger' ? 'bg-red-500' : usageTone === 'warn' ? 'bg-amber-500' : 'bg-[var(--accent)]'"
              :style="{ width: `${usagePct}%` }"
            />
          </div>
          <div class="flex items-center gap-2 pt-1">
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
              :disabled="!size"
              @click="doExport"
            >
              <span class="i-carbon-download" /> 导出
            </BaseBtn>
            <BaseBtn
              variant="tiny"
              class="base-btn-danger"
              :disabled="!size"
              @click="confirmClear = true"
            >
              <span class="i-carbon-trash-can" /> 清空
            </BaseBtn>
          </div>
        </div>
      </div>
    </header>

    <!-- 搜索 + 类型过滤 -->
    <div class="base-card flex flex-col md:flex-row items-stretch md:items-center gap-3 !p-3">
      <div class="grow md:max-w-md">
        <SearchBar
          v-model="keyword"
          placeholder="在收藏中搜索名称、国家、语言、分类..."
        />
      </div>
      <div
        role="tablist"
        class="inline-flex items-center p-1 rounded-btn bg-[var(--surface)] border border-[var(--border)]"
      >
        <button
          v-for="t in [{k:'all',l:'全部',i:'i-carbon-list'},{k:'tv',l:`电视 ${counts.tv}`,i:'i-carbon-screen'},{k:'fm',l:`电台 ${counts.fm}`,i:'i-carbon-network-4'},{k:'episode',l:`集数 ${counts.episode}`,i:'i-carbon-music-notes'}] as const"
          :key="t.k"
          role="tab"
          :aria-selected="typeFilter === t.k"
          class="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-sm transition outline-none"
          :class="typeFilter === t.k ? 'bg-white shadow-card border border-[var(--border)] text-accent font-medium' : 'text-muted hover:text-text hover:bg-white/60'"
          @click="typeFilter = t.k"
        >
          <span :class="t.i" /> {{ t.l }}
        </button>
      </div>
      <div class="text-xs text-muted md:ml-auto">
        匹配：<span class="font-semibold text-text">{{ matched.length }}</span>
        <span v-if="keyword || typeFilter !== 'all'"> · </span>
        <button
          v-if="keyword || typeFilter !== 'all'"
          class="underline"
          @click="() => { keyword = ''; typeFilter = 'all' }"
        >
          重置
        </button>
      </div>
    </div>

    <!-- 空状态 -->
    <EmptyState
      v-if="!size"
      title="还没有收藏任何内容"
      description="从全球电视或全球 FM 的卡片点击「统一收藏」，或从右上角导入历史备份"
      icon="i-carbon-favorite"
    />
    <EmptyState
      v-else-if="!matched.length"
      title="筛选无匹配"
      description="换一个关键词或清除类型过滤"
    />

    <!-- Grid FavItemCard -->
    <div
      v-else
      class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
    >
      <FavItemCard
        v-for="(it, i) in pagedItems"
        :key="`${it.type}:${it.id}`"
        :item="it"
        :show-rank="i + 1"
      />
    </div>

    <!-- Sentinel 无限滚动 -->
    <div
      v-if="hasMore"
      ref="sentinelEl"
      class="py-6 text-center text-xs text-muted inline-flex items-center gap-2 w-full justify-center"
    >
      <span class="i-carbon-loading animate-spin" /> 滚动加载更多（已 {{ pagedItems.length }} / {{ matched.length }}）
    </div>

    <!-- 清空确认框 -->
    <ConfirmDialog
      v-model:open="confirmClear"
      title="确认清空全部统一收藏？"
      :message="`当前共有 ${fav.size} 条统一收藏（电视 ${counts.tv} / 电台 ${counts.fm} / 集数 ${counts.episode}）。\n\n该操作不可恢复！强烈建议先点击「导出」备份 JSON 文件后再清空。`"
      confirm-label="我已备份，确认清空"
      confirm-variant="danger"
      :loading="importing"
      @confirm="doClearAll"
    />
  </section>
</template>
