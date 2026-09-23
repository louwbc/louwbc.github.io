// v3 全部 localStorage key 集中定义（单一入口，AC-4 / G-4）
// 如需新增 key，请只在此文件加注释说明用途

export const V3_KEYS = {
  // 标记：v2->v3 schema 迁移已执行过（幂等）
  V2_MIGRATED: 'solo-radio:v3:migrated:v2',
  // 迁移备份前缀（回退用，保留 30 天）
  BACKUP_PREFIX: 'solo-radio:v3:backup:',

  // —— 统一收藏（唯一 schema，AC-3 / G-3）——
  UNIFIED_FAVORITES: 'solo-radio:v3:unified-favorites', // MediaItem[]

  // —— 全局设置（useSettingsStore）——
  SETTINGS: 'solo-radio:v3:settings',
  VOLUME: 'solo-radio:v3:volume', // 0-1，单一音量源

  // —— TV 模块（useTvStore）——
  TV_RECENT: 'solo-radio:v3:tv:recent', // string[] id，上限 20
  TV_LOCAL_FAVORITES: 'solo-radio:v3:tv:local-favorites', // string[] id，上限 100
  TV_LAST_FILTERS: 'solo-radio:v3:tv:last-filters',

  // —— FM 模块（useFmStore）——
  FM_RECENT: 'solo-radio:v3:fm:recent',
  FM_LOCAL_FAVORITES: 'solo-radio:v3:fm:local-favorites',
  FM_LAST_FILTERS: 'solo-radio:v3:fm:last-filters',
  FM_DISCOVER_CACHE: 'solo-radio:v3:fm:discover-cache',

  // —— 番茄钟（usePomodoroStore）——
  POMODORO: 'solo-radio:v3:pomodoro'
} as const

export type V3StorageKey = (typeof V3_KEYS)[keyof typeof V3_KEYS] | string

// v2 需要迁移的旧 key 白名单（migration 用）
export const V2_LEGACY_KEYS = [
  'global-tv:favorites',
  'global-tv:recent',
  'global-tv:playbackMode',
  'global-tv:subtitleEnabled',
  'global-fm:favorites',
  'global-fm:recent',
  'global-fm:volume',
  'global-fm:podcasts',
  'global-fm:recommendedCache',
  'global-fm:recommendedCacheMeta',
  'global-fm:availableStationsCache',
  'global-fm:availableStationsMeta',
  'global-fm:includeInsecure',
  'global-fm:preferredLanguage',
  'global-fm:preferredTag',
  'solo-radio:unified-favorites',
  'pomodoro-v1'
] as const

export const STORAGE_QUOTA_MB = 5
export const STORAGE_QUOTA_WARN_RATIO = 0.9
