import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFavoritesStore, UNIFIED_FAVORITES_MAX } from '@/stores/favorites'
import type { MediaItem } from '@/types/media'
import { storageKeys, storageRawRemove } from '@/storage/index'

beforeEach(() => {
  setActivePinia(createPinia())
  for (const k of storageKeys()) storageRawRemove(k)
})

function makeTv(id: string, title = id, addedAt = 1): MediaItem {
  return {
    id, type: 'tv', title, streamUrl: `https://${id}`, addedAt, orderIndex: 0,
    availability: 'both'
  }
}

describe('Task2 / Task3: useFavoritesStore 行为', () => {
  it('TR-3.3: add() 达到 601 返回 false，不写入 storage', () => {
    const s = useFavoritesStore()
    // 写入到上限
    for (let i = 0; i < UNIFIED_FAVORITES_MAX; i++) {
      const ok = s.add(makeTv(`c${i}`))
      expect(ok).toBe(true)
    }
    expect(s.size).toBe(UNIFIED_FAVORITES_MAX)
    // 第 601 条失败
    const over = s.add(makeTv('over'))
    expect(over).toBe(false)
    expect(s.size).toBe(UNIFIED_FAVORITES_MAX)
  })

  it('reorder (up/down/top/bottom) + renumber orderIndex 连续', () => {
    const s = useFavoritesStore()
    s.add(makeTv('a')); s.add(makeTv('b')); s.add(makeTv('c')); s.add(makeTv('d'))
    // a(0) b(1) c(2) d(3)
    s.reorder('tv', 'c', 'up')     // a c b d
    expect(s.items.map(x => x.id)).toEqual(['a', 'c', 'b', 'd'])
    s.reorder('tv', 'a', 'bottom') // c b d a
    expect(s.items.map(x => x.id)).toEqual(['c', 'b', 'd', 'a'])
    s.reorder('tv', 'a', 'top')    // a c b d
    expect(s.items.map(x => x.id)).toEqual(['a', 'c', 'b', 'd'])
    // orderIndex 必须 0..N-1 连续
    expect(s.items.map(x => x.orderIndex)).toEqual([0, 1, 2, 3])
  })

  it('has / remove + import JSON 兼容数组', () => {
    const s = useFavoritesStore()
    const item = makeTv('imported-a')
    const r = s.importJSON(JSON.stringify([item, { type: 'unknown-bad', id: 'x' }]))
    expect(r.ok).toBe(1); expect(r.skipped).toBe(1)
    expect(s.has(item)).toBe(true)
    s.remove('tv', 'imported-a')
    expect(s.size).toBe(0)
  })
})
