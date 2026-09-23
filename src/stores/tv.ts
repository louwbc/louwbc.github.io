import { defineStore } from 'pinia'
import type { TvChannel } from '@/types/media'
import { storageGet, storageSet } from '@/storage/index'
import { V3_KEYS } from '@/storage/keys'
import { useToasts } from '@/composables/useToasts'

export const TV_LOCAL_FAV_MAX = 100
export const TV_RECENT_MAX = 20

export interface TvFilters {
  keyword: string
  country: string
  language: string
  category: string
  availability: 'all' | 'hls' | 'external'
  tab: 'all' | 'fav' | 'recent'
}

const INITIAL_FILTERS: TvFilters = { keyword: '', country: '', language: '', category: '', availability: 'all', tab: 'all' }

export const useTvStore = defineStore('tv', {
  state: () => ({
    channels: [] as TvChannel[],
    loading: false,
    filters: { ...INITIAL_FILTERS, ...(storageGet<Partial<TvFilters>>(V3_KEYS.TV_LAST_FILTERS, {}) || {}) },
    recent: storageGet<string[]>(V3_KEYS.TV_RECENT, []).slice(0, TV_RECENT_MAX),
    localFavorites: storageGet<string[]>(V3_KEYS.TV_LOCAL_FAVORITES, []).slice(0, TV_LOCAL_FAV_MAX)
  }),
  getters: {
    filteredChannels(s): TvChannel[] {
      const kw = s.filters.keyword.trim().toLowerCase()
      const tab = s.filters.tab
      const favSet = new Set(s.localFavorites)
      const recentSet = new Set(s.recent)
      return s.channels.filter(c => {
        if (tab === 'fav' && !favSet.has(c.id)) return false
        if (tab === 'recent' && !recentSet.has(c.id)) return false
        if (s.filters.country && c.country !== s.filters.country) return false
        if (s.filters.language && c.language !== s.filters.language) return false
        if (s.filters.category && c.category !== s.filters.category) return false
        if (s.filters.availability !== 'all' && c.availability !== s.filters.availability && c.availability !== 'both') {
          if (c.availability !== s.filters.availability) return false
        }
        if (kw) {
          const blob = `${c.title} ${c.subtitle ?? ''} ${c.country ?? ''} ${c.language ?? ''} ${c.category ?? ''}`.toLowerCase()
          if (!blob.includes(kw)) return false
        }
        return true
      })
    },
    countryOptions(s): string[] { return Array.from(new Set(s.channels.map(c => c.country).filter(Boolean) as string[])).sort() },
    languageOptions(s): string[] { return Array.from(new Set(s.channels.map(c => c.language).filter(Boolean) as string[])).sort() },
    categoryOptions(s): string[] { return Array.from(new Set(s.channels.map(c => c.category).filter(Boolean) as string[])).sort() }
  },
  actions: {
    async loadChannels() {
      if (this.channels.length) return
      this.loading = true
      try {
        const res = await fetch('/data/channels.json', { cache: 'force-cache' })
        const raw = (await res.json()) as unknown[]
        this.channels = raw.map((r) => {
          const rec = (r ?? {}) as Record<string, unknown>
          return {
            id: String(rec.id ?? rec.channelId ?? rec.slug ?? ''),
            type: 'tv',
            title: String(rec.title ?? rec.name ?? ''),
            subtitle: typeof rec.subtitle === 'string' ? rec.subtitle : undefined,
            country: typeof rec.country === 'string' ? rec.country : undefined,
            language: typeof rec.language === 'string' ? rec.language : undefined,
            category: typeof rec.category === 'string' ? rec.category : undefined,
            streamUrl: String(rec.streamUrl ?? rec.url ?? ''),
            homepage: typeof rec.homepage === 'string' ? rec.homepage : undefined,
            watchUrl: typeof rec.watchUrl === 'string' ? rec.watchUrl : undefined,
            addedAt: typeof rec.addedAt === 'number' ? rec.addedAt : Date.now(),
            orderIndex: 0,
            sourceApp: 'tv',
            availability: (rec.availability === 'external' ? 'external' : rec.kind === 'external' ? 'hls' : 'both'),
            region: typeof rec.region === 'string' ? rec.region : undefined,
            hasSubtitle: rec.hasSubtitle === true,
            meta: rec
          } as TvChannel
        }).filter(c => c.id && c.title)
      } catch (e) {
        useToasts().warn('电视频道列表加载失败', 5000)
      } finally {
        this.loading = false
      }
    },
    pushRecent(channelId: string) {
      this.recent = [channelId, ...this.recent.filter(x => x !== channelId)].slice(0, TV_RECENT_MAX)
      storageSet(V3_KEYS.TV_RECENT, this.recent)
    },
    toggleLocalFavorite(channelId: string): boolean {
      const i = this.localFavorites.indexOf(channelId)
      if (i >= 0) {
        this.localFavorites.splice(i, 1)
        storageSet(V3_KEYS.TV_LOCAL_FAVORITES, this.localFavorites)
        return false
      }
      if (this.localFavorites.length >= TV_LOCAL_FAV_MAX) {
        useToasts().warn(`TV 独立收藏已达上限 ${TV_LOCAL_FAV_MAX} 条`, 4000)
        return false
      }
      this.localFavorites.push(channelId)
      storageSet(V3_KEYS.TV_LOCAL_FAVORITES, this.localFavorites)
      return true
    },
    setFilter<K extends keyof TvFilters>(k: K, v: TvFilters[K]) {
      (this.filters as unknown as Record<string, unknown>)[k] = v
      storageSet(V3_KEYS.TV_LAST_FILTERS, { ...this.filters })
    },
    findById(id: string) { return this.channels.find(c => c.id === id) }
  }
})
