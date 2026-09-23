import { defineStore } from 'pinia'
import type { MediaItem, MediaType } from '@/types/media'
import { mediaUniqueKey } from '@/types/media'
import { storageGet, storageSet } from '@/storage/index'
import { V3_KEYS } from '@/storage/keys'
import { useToasts } from '@/composables/useToasts'

// v2 用户迁移上来后统一收藏上限 600 条（避免 localStorage 满）
export const UNIFIED_FAVORITES_MAX = 600

type ReorderDir = 'top' | 'up' | 'down' | 'bottom'

const readInitial = (): MediaItem[] => {
  const raw = storageGet<MediaItem[]>(V3_KEYS.UNIFIED_FAVORITES, [])
  if (!Array.isArray(raw)) return []
  return raw.slice(0, UNIFIED_FAVORITES_MAX)
}

export const useFavoritesStore = defineStore('favorites', {
  state: () => ({ items: readInitial() }),
  getters: {
    size: (s) => s.items.length,
    byUniqueKey(s): Map<string, MediaItem> {
      const m = new Map<string, MediaItem>()
      for (const it of s.items) m.set(mediaUniqueKey(it), it)
      return m
    }
  },
  actions: {
    _persist() {
      storageSet(V3_KEYS.UNIFIED_FAVORITES, this.items.slice())
    },
    has(item: MediaItem | Pick<MediaItem, 'type' | 'id'>): boolean {
      return this.byUniqueKey.has(`${item.type}:${item.id}`)
    },
    /** 返回 true 表示加入成功；false = 超限或已存在 */
    add(item: MediaItem): boolean {
      const key = `${item.type}:${item.id}`
      if (this.byUniqueKey.has(key)) return false
      if (this.items.length >= UNIFIED_FAVORITES_MAX) {
        useToasts().warn(`统一收藏已达上限 ${UNIFIED_FAVORITES_MAX} 条，请清理后再收藏`, 4500)
        return false
      }
      const patched: MediaItem = { ...item, orderIndex: this.items.length }
      this.items.push(patched)
      this._persist()
      return true
    },
    remove(type: MediaType, id: string) {
      const key = `${type}:${id}`
      const i = this.items.findIndex(x => mediaUniqueKey(x) === key)
      if (i < 0) return
      this.items.splice(i, 1)
      this._renumber()
      this._persist()
    },
    search(keyword = '', typeFilter?: MediaType): MediaItem[] {
      const kw = keyword.trim().toLowerCase()
      return this.items.filter(it => {
        if (typeFilter && it.type !== typeFilter) return false
        if (!kw) return true
        const blob = `${it.title} ${it.subtitle || ''} ${it.country || ''} ${it.language || ''} ${it.category || ''}`.toLowerCase()
        return blob.includes(kw)
      })
    },
    reorder(type: MediaType, id: string, dir: ReorderDir) {
      const key = `${type}:${id}`
      const idx = this.items.findIndex(x => mediaUniqueKey(x) === key)
      if (idx < 0) return
      const newIdx =
        dir === 'top' ? 0
          : dir === 'bottom' ? this.items.length - 1
            : dir === 'up' ? Math.max(0, idx - 1)
              : Math.min(this.items.length - 1, idx + 1)
      if (newIdx === idx) return
      const [it] = this.items.splice(idx, 1)
      this.items.splice(newIdx, 0, it)
      this._renumber()
      this._persist()
    },
    clearAll() {
      this.items.length = 0
      this._persist()
    },
    importJSON(str: string): { ok: number; skipped: number } {
      let parsed: unknown
      try { parsed = JSON.parse(str) } catch { return { ok: 0, skipped: 0 } }
      const list = Array.isArray(parsed) ? parsed : []
      let ok = 0, skipped = 0
      for (const raw of list) {
        const r = raw as Record<string, unknown>
        const t = r.type as MediaType | undefined
        const id = String(r.id ?? '')
        if (!t || !id || (t !== 'tv' && t !== 'fm' && t !== 'episode')) { skipped++; continue }
        const item = r as unknown as MediaItem
        if (!this.add(item)) skipped++
        else ok++
      }
      return { ok, skipped }
    },
    exportJSON(): string {
      return JSON.stringify(this.items.slice(), null, 0)
    },
    _renumber() {
      for (let i = 0; i < this.items.length; i++) this.items[i].orderIndex = i
    }
  }
})
