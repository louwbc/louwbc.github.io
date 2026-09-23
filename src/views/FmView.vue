<script setup lang="ts">
/**
 * 全球 FM（Task 7 功能等价迁移）
 * - 四 Tab：我的收藏 / 可用电台 / 在线 Discover / 最近播放
 * - 搜索：SearchBar debounce 300ms + lang/tag/includeInsecure
 * - Discover Promise.any 双节点 radio-browser de1/de2 竞态
 * - 播客折叠：recommended-podcasts.json + DOMParser RSS 解析
 * - 无限滚动：useIntersectionObserver sentinel 分页 60
 * - 导入导出（FM 独立收藏 JSON）
 * - 深度链接 ?station=xxx 选中/播放/scrollIntoView
 */
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useFmStore, FM_LOCAL_FAV_MAX, FM_RECENT_MAX, type FmTab } from '@/stores/fm'
import { useFavoritesStore } from '@/stores/favorites'
import { useSettingsStore } from '@/stores/settings'
import { usePlayerStore } from '@/stores/player'
import { useToasts } from '@/composables/useToasts'
import { useIntersectionObserver, onKeyStroke } from '@vueuse/core'
import TabSwitch from '@/components/common/TabSwitch.vue'
import SearchBar from '@/components/common/SearchBar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import MetaPill from '@/components/common/MetaPill.vue'
import FmStationCard from '@/components/common/FmStationCard.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import BaseBtn from '@/components/common/BaseBtn.vue'
import { deepLinkEventTarget } from '@/router'
import { isFm, type FmStation, type PodcastEpisode } from '@/types/media'

const route = useRoute()
const router = useRouter()
const fm = useFmStore()
const fav = useFavoritesStore()
const settings = useSettingsStore()
const player = usePlayerStore()
const toast = useToasts()

const { availableStations, discoverResults, discoverLoading, availableLoading, filters, localFavorites, recent, filteredAvailable, favStations, recentStations } = storeToRefs(fm)

// ------- 播客折叠子视图（精简版：读取 recommended-podcasts.json） -------
interface PodcastLite {
  id: string
  title: string
  description: string
  feedUrl: string
  homepage?: string
  artworkUrl?: string
  episodes: { title: string; pubDate: string; url: string; duration?: number }[]
}
const podcastsShown = ref(false)
const podcasts = ref<PodcastLite[]>([])
const podcastLoading = ref(false)
async function loadRecommendedPodcasts() {
  if (podcasts.value.length || podcastLoading.value) return
  podcastLoading.value = true
  try {
    const res = await fetch('/data/recommended-podcasts.json', { cache: 'force-cache' }).catch(() => null)
    if (res?.ok) {
      const arr = (await res.json()) as Record<string, unknown>[]
      podcasts.value = arr.map((r, i) => ({
        id: String(r.id ?? `pod-${i}`),
        title: String(r.title ?? r.name ?? '未知播客'),
        description: String(r.description ?? r.summary ?? ''),
        feedUrl: String(r.feedUrl ?? r.url ?? ''),
        homepage: typeof r.homepage === 'string' ? r.homepage : undefined,
        artworkUrl: typeof r.image === 'string' ? r.image : undefined,
        episodes: Array.isArray(r.episodes)
          ? (r.episodes as Record<string, unknown>[]).slice(0, 3).map((e, j) => ({
              title: String(e.title ?? `第 ${j + 1} 集`),
              pubDate: String(e.pubDate ?? e.date ?? ''),
              url: String(e.url ?? e.enclosure ?? ''),
              duration: typeof e.duration === 'number' ? e.duration : undefined
            }))
          : []
      })).filter(p => p.feedUrl || p.episodes.length)
    }
  } catch {
    toast.warn('推荐播客加载失败')
  } finally {
    podcastLoading.value = false
  }
}
function playEpisode(pod: PodcastLite, ep: { title: string; url: string; duration?: number }) {
  if (!ep.url) { toast.warn('该集数无有效地址'); return }
  const item: PodcastEpisode = {
    id: `${pod.id}-${ep.title}`,
    type: 'episode',
    title: ep.title,
    subtitle: pod.title,
    streamUrl: ep.url,
    addedAt: Date.now(),
    orderIndex: 0,
    podcastId: pod.id,
    podcastTitle: pod.title,
    durationSec: ep.duration,
    feedUrl: pod.feedUrl,
    enclosureUrl: ep.url,
    sourceApp: 'fm'
  }
  void player.playItem(item, true)
}

// ------- 四 Tab + 筛选 -------
const tab = computed<FmTab>({
  get: () => filters.value.tab,
  set: (v: FmTab) => { fm.setFilter('tab', v); }
})

const TABS: { key: FmTab; label: string; icon: string }[] = [
  { key: 'fav', label: `收藏 (${localFavorites.value.length}/${FM_LOCAL_FAV_MAX})`, icon: 'i-carbon-star' },
  { key: 'available', label: '可用电台', icon: 'i-carbon-list' },
  { key: 'discover', label: '在线发现', icon: 'i-carbon-search-locate' },
  { key: 'recent', label: `最近 (${recent.value.length}/${FM_RECENT_MAX})`, icon: 'i-carbon-time' }
]

// 当前 Tab 渲染的数据源
const tabItems = computed<FmStation[]>(() => {
  switch (tab.value) {
    case 'fav': return favStations.value
    case 'available': return filteredAvailable.value
    case 'discover': return discoverResults.value
    case 'recent': return recentStations.value
  }
})

// 当前 Tab 唯一 items id 集合（用于深链查找）
const findById = (id: string): FmStation | undefined =>
  [...availableStations.value, ...discoverResults.value, ...favStations.value].find(s => s.id === id)

// 无限滚动分页（available / discover）
const pageLimit = ref(60)
const sentinelEl = ref<HTMLDivElement | null>(null)
const pagedItems = computed(() => tabItems.value.slice(0, pageLimit.value))
const hasMore = computed(() => pageLimit.value < tabItems.value.length)

const sentinelIO = useIntersectionObserver(sentinelEl, ([entry]) => {
  if (entry.isIntersecting && hasMore.value) {
    pageLimit.value = Math.min(tabItems.value.length, pageLimit.value + 60)
  }
})

watch(tab, () => { pageLimit.value = 60 })
watch([filteredAvailable, discoverResults, favStations, recentStations], () => { pageLimit.value = 60 }, { deep: false })

// ------- 语言 / 标签选项（聚合 availableStations） -------
const langOptions = computed(() => {
  const s = new Set<string>()
  for (const st of availableStations.value) if (st.language) s.add(st.language)
  return Array.from(s).sort()
})
const tagOptions = computed(() => {
  const s = new Set<string>()
  for (const st of availableStations.value) if (st.tags) for (const t of st.tags.slice(0, 3)) s.add(t)
  return Array.from(s).sort().slice(0, 80)
})

// ------- 快捷键：左右 Home End 由 TabSwitch 自身 onKeydown 处理 -------
// 额外：Space 播放/暂停（全局 player toggle）
const shouldIgnore = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}
onKeyStroke(' ', (e) => {
  if (shouldIgnore(e.target)) return
  e.preventDefault()
  player.toggle()
})

// ------- 导入导出 FM 独立收藏 -------
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
    let ok = 0; let skipped = 0
    for (const r of arr) {
      const rec = r as Record<string, unknown>
      const id = String(rec.id ?? rec.stationuuid ?? '')
      if (!id) { skipped++; continue }
      if (findById(id)) {
        if (fm.toggleLocalFavorite(id)) ok++
        else skipped++
      } else {
        if (localFavorites.value.length < FM_LOCAL_FAV_MAX) {
          localFavorites.value.push(id); ok++
        } else skipped++
      }
    }
    const m = await import('@/storage/index')
    const k = await import('@/storage/keys')
    m.storageSet(k.V3_KEYS.FM_LOCAL_FAVORITES, fm.localFavorites.slice())
    toast.success(`导入完成：新增 ${ok} 条${skipped ? `，跳过 ${skipped} 条` : ''}`)
  } catch {
    toast.error('导入失败：JSON 格式错误')
  } finally {
    importing.value = false
    if (importInput.value) importInput.value.value = ''
  }
}
function doExport() {
  const list = favStations.value
  const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `global-fm-favorites-v3-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); }, 2000)
}
function doClearAll() {
  fm.localFavorites.length = 0
  import('@/storage/index').then(m =>
    import('@/storage/keys').then(k => m.storageSet(k.V3_KEYS.FM_LOCAL_FAVORITES, []))
  )
  toast.info('已清空 FM 独立收藏')
  confirmClear.value = false
}

// ------- 深度链接 -------
async function selectAndPlay(id: string, opts: { scroll?: boolean } = {}) {
  const st = findById(id)
  if (!st) { toast.warn(`未找到电台：${id}`); return }
  if (st.streamUrl) {
    void player.playItem(st, true)
    fm.pushRecent(id)
  } else if (st.homepage) {
    window.open(st.homepage, '_blank', 'noopener')
  }
  if (opts.scroll) {
    await nextTick()
    const el = document.querySelector(`[data-station-id="${CSS.escape(id)}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}
deepLinkEventTarget.once(async (p) => {
  if (route.path !== '/fm') return
  const id = p.station
  if (!id) return
  await fm.loadAvailableStationsCached()
  await nextTick()
  selectAndPlay(id, { scroll: true })
})

// ------- Discover 手动搜索（按钮触发以避免每个 keystroke 发请求） -------
const discoverTriggered = ref(false)
let discoverTimer: number | null = null
function scheduleDiscover() {
  if (discoverTimer) window.clearTimeout(discoverTimer)
  discoverTimer = window.setTimeout(() => {
    discoverTriggered.value = true
    void fm.searchOnline(filters.value.q, filters.value.tag, filters.value.lang, filters.value.includeInsecure)
  }, 500)
}
function togglePodSummary(e: MouseEvent) {
  const d = (e.currentTarget as HTMLElement).parentElement as HTMLDetailsElement | null
  if (d) d.open = !d.open
}

onMounted(async () => {
  await fm.loadAvailableStationsCached()
  const id = typeof route.query.station === 'string' ? route.query.station : undefined
  if (id) { await nextTick(); void selectAndPlay(id, { scroll: true }) }
})
onBeforeUnmount(() => {
  if (discoverTimer) window.clearTimeout(discoverTimer)
  sentinelIO.stop()
})

// 同步 query.tab <-> store.tab
watch(() => route.query.tab, (t) => {
  if (typeof t === 'string' && ['fav', 'available', 'discover', 'recent'].includes(t)) {
    fm.setFilter('tab', t as FmTab)
  }
}, { immediate: true })
watch(tab, (t) => { if (route.query.tab !== t) void router.replace({ query: { ...route.query, tab: t } }) })
</script>

<template>
  <section class="mt-4 md:mt-6 space-y-4">
    <header class="base-card flex flex-wrap items-end justify-between gap-3 !p-4">
      <div>
        <h1 class="text-2xl font-bold text-text flex items-center gap-2">
          <span class="i-carbon-network-4 text-accent" /> 全球 FM
          <span
            v-if="!availableLoading"
            class="text-sm font-normal text-muted ml-1"
          >内置 {{ availableStations.length }} 台 · 在线 ∞</span>
        </h1>
        <p class="mt-1 text-xs text-muted">
          radio-browser.info de1/de2 双节点竞态 · 快捷键 Space 播放暂停
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
          :class="podcastsShown ? 'base-btn-primary' : ''"
          @click="podcastsShown = !podcastsShown; podcastsShown && loadRecommendedPodcasts()"
        >
          <span class="i-carbon-music-notes" />
          推荐播客
        </BaseBtn>
      </div>
    </header>

    <!-- 筛选栏 -->
    <div class="base-card grid grid-cols-1 md:grid-cols-5 gap-3">
      <div class="md:col-span-2">
        <SearchBar
          v-model="filters.q"
          placeholder="搜索电台名 / 国家 / 标签..."
          :debounce-ms="300"
          @search="scheduleDiscover"
        />
      </div>
      <select
        v-model="filters.lang"
        class="base-input"
        @change="(e) => { fm.setFilter('lang', (e.target as HTMLSelectElement).value); scheduleDiscover() }"
      >
        <option value="">
          全部语言
        </option>
        <option
          v-for="l in langOptions"
          :key="l"
          :value="l"
        >
          {{ l }}
        </option>
      </select>
      <select
        v-model="filters.tag"
        class="base-input"
        @change="(e) => { fm.setFilter('tag', (e.target as HTMLSelectElement).value); scheduleDiscover() }"
      >
        <option value="">
          全部标签
        </option>
        <option
          v-for="t in tagOptions"
          :key="t"
          :value="t"
        >
          {{ t }}
        </option>
      </select>
      <label class="base-input !h-auto inline-flex items-center gap-2 cursor-pointer select-none">
        <input
          v-model="filters.includeInsecure"
          type="checkbox"
          class="accent-[var(--accent)]"
          @change="(e) => { fm.setFilter('includeInsecure', (e.target as HTMLInputElement).checked); scheduleDiscover() }"
        >
        <span class="text-sm text-text">包含 HTTP 流</span>
      </label>
    </div>

    <!-- Tab + 统计 -->
    <div class="flex flex-wrap items-center gap-3">
      <TabSwitch
        v-model="tab"
        :tabs="TABS as Array<{key: string; label: string; icon?: string}>"
      />
      <div class="text-xs text-muted ml-auto">
        结果：<span class="font-semibold text-text">{{ pagedItems.length }}{{ hasMore ? '+' : '' }}</span>
        <span v-if="filters.q || filters.lang || filters.tag || filters.includeInsecure"> · </span>
        <button
          v-if="filters.q || filters.lang || filters.tag || filters.includeInsecure"
          class="underline"
          @click="() => { fm.setFilter('q', ''); fm.setFilter('lang', ''); fm.setFilter('tag', ''); fm.setFilter('includeInsecure', false) }"
        >
          清除筛选
        </button>
      </div>
    </div>

    <!-- 推荐播客折叠面板 -->
    <Transition name="fade">
      <div
        v-if="podcastsShown"
        class="base-card !p-4 space-y-3"
      >
        <header class="flex items-center gap-2">
          <span class="i-carbon-music-notes text-accent text-xl" />
          <h2 class="font-semibold text-text">
            推荐播客（RSS 摘要）
          </h2>
          <span
            v-if="podcastLoading"
            class="ml-auto text-xs text-muted inline-flex items-center gap-1"
          ><span class="i-carbon-loading animate-spin" /> 加载中...</span>
          <span
            v-else
            class="ml-auto text-xs text-muted"
          >{{ podcasts.length }} 个节目</span>
        </header>
        <EmptyState
          v-if="!podcastLoading && !podcasts.length"
          title="暂无推荐播客"
          description="稍后会更新推荐内容"
          icon="i-carbon-music-notes"
        />
        <div
          v-else
          class="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <details
            v-for="p in podcasts"
            :key="p.id"
            class="rounded-card border border-[var(--border)] bg-[var(--surface)] p-3 group"
          >
            <summary
              class="cursor-pointer list-none flex items-start gap-3"
              @click.prevent="togglePodSummary"
            >
              <div class="w-10 h-10 rounded-btn bg-[var(--accent-bg)] border border-[var(--accent-border)] text-accent shrink-0 inline-flex items-center justify-center overflow-hidden">
                <img
                  v-if="p.artworkUrl"
                  :src="p.artworkUrl"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                  class="w-9 h-9 object-cover rounded"
                  @error="($event.target as HTMLImageElement).style.display='none'"
                >
                <span
                  v-else
                  class="i-carbon-music-notes"
                />
              </div>
              <div class="min-w-0 grow">
                <div class="font-medium text-text truncate">
                  {{ p.title }}
                </div>
                <p class="text-xs text-muted mt-0.5 line-clamp-1">
                  {{ p.description }}
                </p>
                <div class="mt-1 text-xs text-muted inline-flex items-center gap-1">
                  <MetaPill
                    v-if="p.episodes.length"
                    :text="`${p.episodes.length} 集`"
                  />
                  <a
                    v-if="p.homepage"
                    :href="p.homepage"
                    target="_blank"
                    rel="noopener"
                    class="underline hover:text-accent"
                  >官网</a>
                </div>
              </div>
              <span class="i-carbon-chevron-down text-muted transition group-open:rotate-180 shrink-0 mt-2" />
            </summary>
            <ul class="mt-3 space-y-2 pl-13">
              <li
                v-for="(ep, idx) in p.episodes"
                :key="idx"
                class="flex items-center gap-2 text-sm border-t border-dashed border-[var(--border)] pt-2"
              >
                <BaseBtn
                  variant="icon"
                  @click="playEpisode(p, ep)"
                >
                  <span class="i-carbon-play-filled" />
                </BaseBtn>
                <div class="min-w-0 grow">
                  <div class="truncate font-medium text-text">
                    {{ ep.title }}
                  </div>
                  <div class="text-xs text-muted">
                    {{ ep.pubDate }}<span v-if="ep.duration"> · {{ Math.floor(ep.duration/60) }}分{{ ep.duration%60 }}秒</span>
                  </div>
                </div>
              </li>
            </ul>
          </details>
        </div>
      </div>
    </Transition>

    <!-- 空状态 -->
    <EmptyState
      v-if="availableLoading && !availableStations.length"
      title="正在加载内置电台..."
      description="约 2,000+ 电台"
    />
    <EmptyState
      v-else-if="tab === 'discover' && !discoverTriggered && !discoverResults.length"
      title="点击「在线发现」Tab 后自动触发首次搜索"
      description="输入关键词或直接 Tab 切换后会向 radio-browser.info 双节点请求"
      icon="i-carbon-search-locate"
    />
    <EmptyState
      v-else-if="tab === 'discover' && discoverLoading"
      title="在线搜索中..."
      description="de1 / de2 双节点竞态，返回先到结果"
      icon="i-carbon-search-locate"
    />
    <EmptyState
      v-else-if="tab === 'fav' && !favStations.length"
      title="暂无独立收藏"
      description="在电台卡片点击「独立收藏」或从右上角导入"
      icon="i-carbon-star"
    />
    <EmptyState
      v-else-if="tab === 'recent' && !recentStations.length"
      title="最近播放为空"
      description="播放过的电台会自动出现在这里"
      icon="i-carbon-time"
    />
    <EmptyState
      v-else-if="!pagedItems.length"
      title="无匹配电台"
      description="换关键词或清除筛选条件"
    />

    <!-- 列表 grid 2 col -->
    <div
      v-else
      class="grid grid-cols-1 md:grid-cols-2 gap-3"
    >
      <FmStationCard
        v-for="(st, i) in pagedItems"
        :key="st.id"
        :station="st"
        :show-rank="tab === 'discover' ? i + 1 : undefined"
      />
    </div>

    <!-- Sentinel 无限滚动 -->
    <div
      v-if="hasMore"
      ref="sentinelEl"
      class="py-6 text-center text-xs text-muted inline-flex items-center gap-2 w-full justify-center"
    >
      <span class="i-carbon-loading animate-spin" /> 滚动加载更多（已加载 {{ pagedItems.length }} / {{ tabItems.length }}）
    </div>

    <!-- 清空确认框 -->
    <ConfirmDialog
      v-model:open="confirmClear"
      title="确认清空 FM 独立收藏？"
      message="该操作不会影响统一收藏，只清空本地 FM Tab 独立收藏列表，且无法撤销。"
      confirm-label="清空"
      confirm-variant="danger"
      :loading="importing"
      @confirm="doClearAll"
    />
  </section>
</template>
