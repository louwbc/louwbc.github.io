/**
 * v2 -> v3 schema 迁移器（AC-3 / AC-14）
 * - 扫描 V2_LEGACY_KEYS 中的所有数据，转成新的 MediaItem + settings
 * - 幂等：solo-radio:v3:migrated:v2 标记后跳过
 * - 去重：(type, id) 联合唯一，保留 addedAt 更旧的
 * - 回退：rollback() 清除 v3 key，恢复备份
 */

import type { MediaItem, TvChannel, FmStation } from '@/types/media'
import {
  V2_LEGACY_KEYS,
  V3_KEYS
} from '@/storage/keys'
import {
  storageGet,
  storageRawGet,
  storageRawRemove,
  storageRawSet,
  storageSet
} from '@/storage/index'

interface V3SettingsShape {
  tvDefaultPlaybackMode: 'audio' | 'video'
  tvSubtitleEnabled: boolean
  fmIncludeInsecure: boolean
  fmPreferredLanguage: string
  fmPreferredTag: string
}

const DEFAULT_SETTINGS: V3SettingsShape = {
  tvDefaultPlaybackMode: 'audio',
  tvSubtitleEnabled: false,
  fmIncludeInsecure: false,
  fmPreferredLanguage: '',
  fmPreferredTag: ''
}

function tryParse<T = unknown>(raw: string | null, fallback: T): T {
  if (raw == null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function backupOldKeys(): void {
  for (const k of V2_LEGACY_KEYS) {
    const v = storageRawGet(k)
    if (v != null) storageRawSet(V3_KEYS.BACKUP_PREFIX + k, v)
  }
}

function normalizeTvFromV2LocalFavorites(tvFavs: unknown[]): TvChannel[] {
  if (!Array.isArray(tvFavs)) return []
  const out: TvChannel[] = []
  for (const raw of tvFavs) {
    const r = raw as Record<string, unknown>
    const id = String(r.id ?? r.channelId ?? '')
    if (!id) continue
    out.push({
      id,
      type: 'tv',
      title: String(r.title ?? r.name ?? id),
      subtitle: typeof r.subtitle ? String(r.subtitle) : undefined,
      country: typeof r.country === 'string' ? r.country : undefined,
      language: typeof r.language === 'string' ? r.language : undefined,
      category: typeof r.category === 'string' ? r.category : undefined,
      streamUrl: String(r.streamUrl ?? r.url ?? ''),
      homepage: typeof r.homepage === 'string' ? r.homepage : undefined,
      watchUrl: typeof r.watchUrl === 'string' ? r.watchUrl : undefined,
      addedAt: typeof r.addedAt === 'number' ? r.addedAt : Date.now(),
      orderIndex: 0,
      sourceApp: 'tv',
      availability: r.availability === 'external' ? 'external' : r.kind === 'external' ? 'hls' : 'both',
      region: typeof r.region === 'string' ? r.region : undefined,
      hasSubtitle: r.hasSubtitle === true,
      meta: r
    })
  }
  return out
}

function normalizeFmFromV2(fmFavs: unknown[]): FmStation[] {
  if (!Array.isArray(fmFavs)) return []
  const out: FmStation[] = []
  for (const raw of fmFavs) {
    const r = raw as Record<string, unknown>
    const uuid = String(r.stationuuid || r.id || '')
    // v2 收藏 FM 时部分条目可能缺少 streamUrl（导致沙箱无法播（的 BUG）
    // 修复：url_resolved || url 写入 streamUrl
    const stream = String(r.streamUrl ?? r.url_resolved ?? r.url ?? r.homepage ?? '')
    if (!uuid && !stream) continue
    out.push({
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
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : undefined,
      favicon: typeof r.favicon === 'string' ? r.favicon : undefined,
      votes: typeof r.votes === 'number' ? r.votes : undefined,
      codec: typeof r.codec === 'string' ? r.codec : undefined,
      bitrate: typeof r.bitrate === 'number' ? r.bitrate : undefined,
      meta: r
    })
  }
  return out
}

function normalizeUnifiedFromV2(list: unknown[]): MediaItem[] {
  if (!Array.isArray(list)) return []
  const out: MediaItem[] = []
  for (const raw of list) {
    const r = raw as Record<string, unknown>
    const type = r.type as 'tv' | 'fm'
    const id = String(r.id ?? '')
    const meta = (r.meta ?? {}) as Record<string, unknown>
    if (!id || (type !== 'tv' && type !== 'fm')) continue
    // 沙箱兜底：meta.streamUrl 优先
    const stream =
      String(r.streamUrl ?? meta.streamUrl ?? r.url ?? '')
    const common = {
      id,
      title: String(r.title ?? meta.title ?? id),
      subtitle: typeof meta.subtitle === 'string' ? meta.subtitle : undefined,
      country: typeof r.country === 'string' ? r.country : typeof meta.country === 'string' ? meta.country : undefined,
      language: typeof r.language === 'string' ? r.language : typeof meta.language === 'string' ? meta.language : undefined,
      category: typeof r.category === 'string' ? r.category : typeof meta.category === 'string' ? meta.category : undefined,
      streamUrl: stream,
      homepage: typeof r.homepage === 'string' ? r.homepage : typeof meta.homepage === 'string' ? meta.homepage : undefined,
      watchUrl: typeof r.watchUrl === 'string' ? r.watchUrl : typeof meta.watchUrl === 'string' ? meta.watchUrl : undefined,
      addedAt: typeof r.addedAt === 'number' ? r.addedAt : Date.now(),
      orderIndex: typeof r.orderIndex === 'number' ? r.orderIndex : 0,
      sourceApp: type
    }
    if (type === 'tv') {
      out.push({
        ...common,
        type: 'tv',
        availability: 'both',
        meta
      } as TvChannel)
    } else {
      out.push({
        ...common,
        type: 'fm',
        stationuuid: typeof r.stationuuid === 'string' ? r.stationuuid : undefined,
        meta
      } as FmStation)
    }
  }
  return out
}

export async function runV2ToV3Migration(): Promise<void> {
  try {
    if (storageGet(V3_KEYS.V2_MIGRATED, false)) return

    backupOldKeys()

    // 1) 合并 3 类收藏数据
    const tvLocal = normalizeTvFromV2LocalFavorites(tryParse(storageRawGet(V2_LEGACY_KEYS[0]), []))
    const fmLocal = normalizeFmFromV2(tryParse(storageRawGet(V2_LEGACY_KEYS[4]), []))
    const unified = normalizeUnifiedFromV2(tryParse(storageRawGet('solo-radio:unified-favorites'), []))

    // 2) 按 (type, id) 去重，保留 addedAt 更小的
    const map = new Map<string, MediaItem>()
    const add = (items: MediaItem[]) => {
      for (const it of items) {
        const k = `${it.type}:${it.id}`
        const prev = map.get(k)
        if (!prev || it.addedAt < prev.addedAt) map.set(k, it)
      }
    }
    // 优先 unified（orderIndex 信息更准确）→ tvLocal → fmLocal
    add(unified)
    add(tvLocal)
    add(fmLocal)

    const merged = Array.from(map.values())
    // 3) 重算 orderIndex：unified 中的 order + 其余按原顺序追加
    {
      const unifiedSet = new Set(unified.map(u => `${u.type}:${u.id}`))
      const order = [
        ...unified.slice().sort((a, b) => a.orderIndex - b.orderIndex),
        ...merged.filter(x => !unifiedSet.has(`${x.type}:${x.id}`))
      ]
      for (let i = 0; i < order.length; i++) order[i].orderIndex = i
      merged.length = 0
      merged.push(...order)
    }
    if (merged.length > 600) merged.length = 600
    storageSet(V3_KEYS.UNIFIED_FAVORITES, merged)

    // 4) 最近播放（保留 20 个
    const tvRecent = tryParse<string[]>(storageRawGet(V2_LEGACY_KEYS[1]), []).slice(0, 20)
    storageSet(V3_KEYS.TV_RECENT, tvRecent)
    const fmRecent = tryParse<string[]>(storageRawGet(V2_LEGACY_KEYS[5]), []).slice(0, 20)
    storageSet(V3_KEYS.FM_RECENT, fmRecent)

    // 5) 设置
    const s: V3SettingsShape = { ...DEFAULT_SETTINGS }
    const tvMode = tryParse<'audio' | 'video'>(storageRawGet(V2_LEGACY_KEYS[2]), 'audio')
    s.tvDefaultPlaybackMode = tvMode === 'video' ? 'video' : 'audio'
    s.tvSubtitleEnabled = tryParse<boolean>(storageRawGet(V2_LEGACY_KEYS[3]), false)
    s.fmIncludeInsecure = tryParse<boolean>(storageRawGet(V2_LEGACY_KEYS[11]), false)
    s.fmPreferredLanguage = tryParse<string>(storageRawGet(V2_LEGACY_KEYS[12]), '')
    s.fmPreferredTag = tryParse<string>(storageRawGet(V2_LEGACY_KEYS[13]), '')
    storageSet(V3_KEYS.SETTINGS, s)

    // 6) FM volume
    const fmVol = tryParse<number>(storageRawGet(V2_LEGACY_KEYS[6]), 1)
    storageSet(V3_KEYS.VOLUME, Number.isFinite(fmVol) ? fmVol : 1)

    // 7) Pomodoro（保持原样键直接搬运
    const pom = storageRawGet(V2_LEGACY_KEYS[15])
    if (pom != null) storageRawSet(V3_KEYS.POMODORO, pom)
    // FM 本地收藏上限 100
    storageSet(V3_KEYS.TV_LOCAL_FAVORITES, tvLocal.map(c => c.id).slice(0, 100))
    storageSet(V3_KEYS.FM_LOCAL_FAVORITES, fmLocal.map(s => s.id).slice(0, 100))

    storageSet(V3_KEYS.V2_MIGRATED, true)
  } catch (e) {
    // 迁移失败不阻塞主流程（错误但打印日志
    // eslint-disable-next-line no-console
    console.warn('[migration] v2->v3 failed (non-fatal):', e)
  }
}

export function rollbackMigration(): void {
  // 清 v3 key
  for (const k of Object.values(V3_KEYS)) {
    if (k === V3_KEYS.BACKUP_PREFIX) continue
    storageRawRemove(k)
  }
  // 从备份恢复 v2 key
  for (const oldK of V2_LEGACY_KEYS) {
    const b = storageRawGet(V3_KEYS.BACKUP_PREFIX + oldK)
    if (b != null) storageRawSet(oldK, b)
  }
  // eslint-disable-next-line no-console
  console.info('[migration] rollback 完成，请刷新页面')
}

export function dumpStorage(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of Object.values(V3_KEYS)) {
    out[k] = storageGet(k, null)
  }
  return out
}
