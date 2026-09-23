import { defineStore } from 'pinia'
import type { FmStation } from '@/types/media'
import { storageGet, storageSet } from '@/storage/index'
import { V3_KEYS } from '@/storage/keys'
import { useToasts } from '@/composables/useToasts'

export const FM_LOCAL_FAV_MAX = 100
export const FM_RECENT_MAX = 20

export type FmTab = 'fav' | 'available' | 'discover' | 'recent'

export interface FmFilters {
  q: string
  tag: string
  lang: string
  includeInsecure: boolean
  tab: FmTab
}

const INITIAL_FILTERS: FmFilters = { q: '', tag: '', lang: '', includeInsecure: false, tab: 'available' }

export const useFmStore = defineStore('fm', {
  state: () => ({
    availableStations: [] as FmStation[],
    discoverResults: [] as FmStation[],
    discoverLoading: false,
    availableLoading: false,
    filters: {
      ...INITIAL_FILTERS,
      ...(storageGet<Partial<FmFilters>>(V3_KEYS.FM_LAST_FILTERS, {}) || {})
    },
    recent: storageGet<string[]>(V3_KEYS.FM_RECENT, []).slice(0, FM_RECENT_MAX),
    localFavorites: storageGet<string[]>(V3_KEYS.FM_LOCAL_FAVORITES, []).slice(0, FM_LOCAL_FAV_MAX)
  }),
  getters: {
    favStations(s): FmStation[] {
      const idx = new Map<string, FmStation>()
      for (const st of [...s.availableStations, ...s.discoverResults]) idx.set(st.id, st)
      return s.localFavorites.map(id => idx.get(id)).filter((x): x is FmStation => Boolean(x))
    },
    recentStations(s): FmStation[] {
      const idx = new Map<string, FmStation>()
      for (const st of [...s.availableStations, ...s.discoverResults]) idx.set(st.id, st)
      return s.recent.map(id => idx.get(id)).filter((x): x is FmStation => Boolean(x))
    },
    filteredAvailable(s): FmStation[] {
      const kw = s.filters.q.trim().toLowerCase()
      return s.availableStations.filter(st => {
        if (s.filters.lang && st.language !== s.filters.lang) return false
        if (s.filters.tag) {
          const tags = (st.tags ?? []).map(t => t.toLowerCase()).join(',')
          if (!tags.includes(s.filters.tag.toLowerCase())) return false
        }
        if (kw) {
          const blob = `${st.title} ${st.country ?? ''} ${st.language ?? ''} ${(st.tags ?? []).join(',')}`.toLowerCase()
          if (!blob.includes(kw)) return false
        }
        return true
      })
    }
  },
  actions: {
    async loadAvailableStationsCached() {
      if (this.availableStations.length) return
      this.availableLoading = true
      try {
        // 先尝试从内置 JSON 加载
        const res = await fetch('/data/available-stations.json', { cache: 'force-cache' }).catch(() => null)
        if (res?.ok) {
          const arr = (await res.json()) as unknown[]
          this.availableStations = arr.map(
            r => normalizeFm(r as Record<string, unknown>)
          ).filter(s => s.id || s.streamUrl)
        }
      } finally {
        this.availableLoading = false
      }
    },
    async searchOnline(keyword: string, tag = '', lang = '', includeInsecure = false, page = 1) {
      this.discoverLoading = true
      const params = new URLSearchParams({
        name: keyword,
        limit: String(Math.min(120, page * 60)),
        hidebroken: String(true)
      })
      if (tag) params.set('tag', tag)
      if (lang) params.set('language', lang)
      if (!includeInsecure) params.set('is_https', String(true))
      const qs = params.toString()
      // 竞态请求两个节点，返回先到的（AC-7/Task-7 Discover）
      try {
        const urls = [
          `https://de1.api.radio-browser.info/json/stations/search?${qs}`,
          `https://de2.api.radio-browser.info/json/stations/search?${qs}`
        ]
        const res = await Promise.any(urls.map(u => fetch(u)))
        const arr = (await res.json()) as unknown[]
        this.discoverResults = arr.map(r => normalizeFm(r as Record<string, unknown>)).filter(s => s.id || s.streamUrl)
      } catch {
        useToasts().warn('在线搜索失败，请稍后再试', 4000)
      } finally {
        this.discoverLoading = false
      }
    },
    pushRecent(stationId: string) {
      this.recent = [stationId, ...this.recent.filter(x => x !== stationId)].slice(0, FM_RECENT_MAX)
      storageSet(V3_KEYS.FM_RECENT, this.recent)
    },
    toggleLocalFavorite(stationId: string): boolean {
      const i = this.localFavorites.indexOf(stationId)
      if (i >= 0) {
        this.localFavorites.splice(i, 1)
        storageSet(V3_KEYS.FM_LOCAL_FAVORITES, this.localFavorites)
        return false
      }
      if (this.localFavorites.length >= FM_LOCAL_FAV_MAX) {
        useToasts().warn(`FM 独立收藏已达上限 ${FM_LOCAL_FAV_MAX} 条`, 4000)
        return false
      }
      this.localFavorites.push(stationId)
      storageSet(V3_KEYS.FM_LOCAL_FAVORITES, this.localFavorites)
      return true
    },
    setFilter<K extends keyof FmFilters>(k: K, v: FmFilters[K]) {
      (this.filters as unknown as Record<string, unknown>)[k] = v
      storageSet(V3_KEYS.FM_LAST_FILTERS, { ...this.filters })
    }
  }
})

function normalizeFm(r: Record<string, unknown>): FmStation {
  const uuid = String(r.stationuuid || r.id || '')
  const stream = String(r.streamUrl ?? r.url_resolved ?? r.url ?? r.homepage ?? '')
  return {
    id: uuid || stream,
    type: 'fm',
    title: String(r.name || r.title || (uuid ? `FM电台${uuid.slice(0, 6)}` : '未知电台')),
    country: typeof r.country === 'string' ? r.country : undefined,
    language: typeof r.language === 'string' ? r.language : undefined,
    category: Array.isArray(r.tags) ? (r.tags as string[]).join(', ') : typeof r.category === 'string' ? r.category : undefined,
    streamUrl: stream,
    homepage: typeof r.homepage === 'string' ? r.homepage : undefined,
    addedAt: typeof r.addedAt === 'number' ? r.addedAt : Date.now(),
    orderIndex: 0,
    sourceApp: 'fm',
    stationuuid: uuid || undefined,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : (typeof r.tags === 'string' ? r.tags.split(',').map(s => s.trim()).filter(Boolean) : undefined),
    favicon: typeof r.favicon === 'string' ? r.favicon : undefined,
    votes: typeof r.votes === 'number' ? r.votes : undefined,
    codec: typeof r.codec === 'string' ? r.codec : undefined,
    bitrate: typeof r.bitrate === 'number' ? r.bitrate : undefined,
    meta: r
  }
}
