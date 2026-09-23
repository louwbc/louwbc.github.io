import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  runV2ToV3Migration,
  rollbackMigration
} from '@/migration/v2-to-v3'
import { storageGet, storageRawSet, storageSet, storageRawRemove, usage, storageKeys, storageRawGet } from '@/storage/index'
import { V3_KEYS, V2_LEGACY_KEYS } from '@/storage/keys'

// 确保测试环境用 setup.ts 的 mock localStorage
beforeEach(() => {
  for (const k of storageKeys()) storageRawRemove(k)
  storageRawRemove(V3_KEYS.V2_MIGRATED)
})

describe('TR-2.1: 类型守卫类型窄化（编译期验证，此处只做 runtime 守卫行为）', () => {
  it('isFm / isTv / isStation 正确区分子类型', async () => {
    const { isTv, isFm, isStation, isEpisode } = await import('@/types/media')
    const tv = { id: '1', type: 'tv' as const, title: 'CNN', streamUrl: 'x', addedAt: 1, orderIndex: 0, availability: 'both' as const }
    const fm = { id: '2', type: 'fm' as const, title: 'BBC', streamUrl: 'x', addedAt: 1, orderIndex: 0 }
    const ep = { id: '3', type: 'episode' as const, title: 'E', streamUrl: 'x', addedAt: 1, orderIndex: 0, podcastId: 'p' }
    expect(isTv(tv)).toBe(true)
    expect(isFm(tv)).toBe(false)
    expect(isStation(fm)).toBe(true)
    expect(isEpisode(ep)).toBe(true)
  })
})

describe('TR-2.2: v2 旧 key → v3 迁移（4 TV + 3 FM + 2 重复 → 7 条，streamUrl 非空，保留 unified 原 order）', () => {
  beforeEach(() => {
    // 4 TV
    storageRawSet(V2_LEGACY_KEYS[0] /* global-tv:favorites */, JSON.stringify([
      { id: 'cnn', title: 'CNN', country: 'US', streamUrl: 'https://cnn.m3u8', addedAt: 100, url: 'ignore' },
      { id: 'bbc', title: 'BBC', country: 'UK', streamUrl: 'https://bbc.m3u8', addedAt: 200 },
      { id: 'nhk', title: 'NHK', country: 'JP', streamUrl: '', addedAt: 300 }, // 空 stream；保留
      { id: 'cctv', title: 'CCTV', country: 'CN', streamUrl: 'cctv.m3u8', addedAt: 400 }
    ]))
    // 3 FM （其中一个无 streamUrl，url_resolved 兜底）
    storageRawSet(V2_LEGACY_KEYS[4] /* global-fm:favorites */, JSON.stringify([
      { stationuuid: 's1', name: 'FM A', country: 'UK', url: 'https://fm-a/stream', url_resolved: undefined, addedAt: 150 },
      { stationuuid: 's2', name: 'FM B', country: 'DE', url: 'https://fm-b/wrong', url_resolved: 'https://fm-b/ok', addedAt: 250 },
      { stationuuid: 's3', name: 'FM C', country: 'US', url: undefined, url_resolved: undefined, streamUrl: 'FM C direct', addedAt: 350 }
    ]))
    // unified 中放 2 条重复（与 TV cnn、FM s1 重复），orderIndex 设为有意顺序
    storageRawSet('solo-radio:unified-favorites', JSON.stringify([
      { type: 'fm', id: 's1', title: 'FM A', addedAt: 999, orderIndex: 1, streamUrl: 'https://fm-a/unified', country: 'UK', homepage: 'http://fma/' },
      { type: 'tv', id: 'bbc', title: 'BBC World', addedAt: 998, orderIndex: 0, streamUrl: 'https://bbc/unified.m3u8' }
    ]))
  })

  it('迁移幂等，去重保留 addedAt 更小的，FM 缺失的 streamUrl 从 url 或 url_resolved 回填，保留 unified 原 order', async () => {
    await runV2ToV3Migration()
    const merged = storageGet<unknown[]>(V3_KEYS.UNIFIED_FAVORITES, [])
    expect(Array.isArray(merged)).toBe(true)
    expect(merged.length).toBe(7) // 4+3 - 2 重复 = 5? 等等 4+3=7，unified 2 条和 cnn/s1 重复... 哦 unified 的是 bbc 和 s1：
    // TV: cnn, bbc, nhk, cctv (4)
    // FM: s1, s2, s3 (3)
    // unified: bbc (重复TV), s1 (重复FM)
    // 所以不重 = 7。正确 ✅
    const tvOrder = merged.find(x => (x as Record<string, unknown>).title === 'BBC World')
    const fmOrder = merged.find(x => (x as Record<string, unknown>).title === 'FM A' && (x as Record<string, unknown>).country === 'UK')
    const s2 = merged.find(x => (x as Record<string, unknown>).id === 's2') as Record<string, unknown>
    const s1 = fmOrder as Record<string, unknown>
    // orderIndex：unified 原顺序 bbc=0，FM A=1，其他按 tv+fm 顺序追加
    expect((tvOrder as Record<string, unknown>).orderIndex).toBe(0)
    expect(s1.orderIndex).toBe(1)
    // 非空 streamUrl 检查：3 FM
    const fms = merged.filter(x => (x as Record<string, unknown>).type === 'fm') as Record<string, unknown>[]
    expect(fms.every(f => typeof f.streamUrl === 'string' && String(f.streamUrl).length > 0)).toBe(true)
    // s2 的 streamUrl 应该 = url_resolved
    expect(s2.streamUrl).toBe('https://fm-b/ok')

    // 幂等：再跑一次，数量不变
    await runV2ToV3Migration()
    const again = storageGet<unknown[]>(V3_KEYS.UNIFIED_FAVORITES, [])
    expect(again.length).toBe(7)

    // rollback：清 v3 key，备份恢复
    rollbackMigration()
    expect(storageRawGet(V3_KEYS.V2_MIGRATED)).toBeNull()
    expect(storageRawGet(V2_LEGACY_KEYS[0])).toBeTruthy() // global-tv:favorites 还在
  })
})

describe('TR-2.3: storage 容量告警：>90% 日志；>100% emit quota-exceed event & set 返回 false', () => {
  it('模拟大值存储触发事件', () => {
    let firedCount = 0
    let lastMsg = ''
    const handler = (e: Event) => {
      firedCount++
      lastMsg = (e as CustomEvent).detail?.message ?? ''
    }
    window.addEventListener('storage:quota-exceed', handler)

    // 模拟 usage() 被覆写成高值（真实环境下 jsdom 容量很大，我们用 stub）
    const bigPayload = 'x'.repeat(4_700_000) // ~9.4MB (2x bytes/char)
    // 但 setup mock localStorage 没做 quota 限制，因此需要手动 mock 抛错
    // 这里改用：直接调用 storage API 的行为验证其不抛
    const ok = storageSet('big-key' as never, bigPayload)
    // 因为 jsdom 实现无真实 quota，这里只验证 set 本身返回 boolean + try/catch 安全
    expect(typeof ok).toBe('boolean')

    // 手动触发一个模拟 QuotaExceeded 场景：patch localStorage.setItem
    const origSet = (globalThis as unknown as { localStorage: Storage }).localStorage.setItem
    try {
      (globalThis as unknown as { localStorage: Storage }).localStorage.setItem = () => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      }
      const fail = storageSet('another', 1)
      expect(fail).toBe(false)
      expect(firedCount).toBeGreaterThanOrEqual(1)
      expect(lastMsg).toContain('写入失败')
    } finally {
      (globalThis as unknown as { localStorage: Storage }).localStorage.setItem = origSet
    }
    window.removeEventListener('storage:quota-exceed', handler)
  })

  it('usage() 返回 0..quotaMB 的 ratio', () => {
    const u = usage()
    expect(typeof u.usedMB).toBe('number')
    expect(u.quotaMB).toBe(5)
    expect(u.ratio).toBeGreaterThanOrEqual(0)
  })
})
