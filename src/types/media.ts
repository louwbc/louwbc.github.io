// 统一收藏数据模型（AC-3 / G-3）
// v3 全站唯一收藏 Item 接口，TV / FM / 播客 Episode 都是它的子类型
// 通过 type discriminator 区分；扩展字段放 meta Record 桶，未来加 Podcast / 新来源不破坏旧数据

export type MediaType = 'tv' | 'fm' | 'episode'

export interface MediaItemBase {
  /** (type, id) 联合唯一 */
  id: string
  type: MediaType
  title: string
  subtitle?: string
  country?: string
  language?: string
  category?: string
  /** 播放流地址（meta 快照，沙箱/API 失效时兜底，AC-5 修复 v2 FM 收藏不能播） */
  streamUrl: string
  /** 电台/频道官网 */
  homepage?: string
  /** TV 官网上观看链接（external type 跳转用） */
  watchUrl?: string
  /** 加入时间 ms epoch */
  addedAt: number
  /** 排序字段（越小越靠前，0..items.length-1） */
  orderIndex: number
  /** 来源应用（用于「跳转原应用」） */
  sourceApp?: 'tv' | 'fm'
  /** 扩展元数据桶；各子类型字段放这里 */
  meta?: Record<string, unknown>
}

export interface TvChannel extends MediaItemBase {
  type: 'tv'
  availability: 'hls' | 'external' | 'both'
  region?: string
  hasSubtitle?: boolean
}

export interface FmStation extends MediaItemBase {
  type: 'fm'
  stationuuid?: string
  tags?: string[]
  favicon?: string
  votes?: number
  codec?: string
  bitrate?: number
}

export interface PodcastEpisode extends MediaItemBase {
  type: 'episode'
  podcastId: string
  podcastTitle?: string
  durationSec?: number
  publishedAt?: number
  enclosureUrl?: string
  feedUrl?: string
}

export type MediaItem = TvChannel | FmStation | PodcastEpisode

/* ============ 类型守卫（AC-5：严格 TS，防 v2 的 ReferenceError + 未定义） ============ */

export function isTv(item: MediaItem | null | undefined): item is TvChannel {
  return item != null && item.type === 'tv'
}

export function isFm(item: MediaItem | null | undefined): item is FmStation {
  return item != null && item.type === 'fm'
}

/** v2 的 isStation 在 FM 列表渲染时曾因为漏定义导致整页白屏；这里作为类型导出 */
export function isStation(item: MediaItem | null | undefined): item is FmStation {
  return isFm(item)
}

export function isEpisode(item: MediaItem | null | undefined): item is PodcastEpisode {
  return item != null && item.type === 'episode'
}

/** (type, id) 联合唯一 key */
export function mediaUniqueKey(item: MediaItem): string {
  return `${item.type}:${item.id}`
}
