import {
  STORAGE_QUOTA_MB,
  STORAGE_QUOTA_WARN_RATIO,
  V3StorageKey
} from './keys'

/**
 * 统一 localStorage 封装层（AC-4 / G-4）
 * 所有读写走此 API；禁止业务代码直接调用 localStorage（ESLint restricted-globals 拦截）。
 * 功能：
 *  - try/catch 防 QuotaExceeded 抛错
 *  - 容量预警 (>90% 写日志；>100% dispatchEvent + emit toast)
 *  - 泛型；fallback 默认值；undefined 输入安全
 */

export interface StorageUsage {
  usedMB: number
  quotaMB: number
  ratio: number
}

const WARN_LOGGED_KEYS = new Set<string>()

function computeUsedMB(): number {
  try {
    const all = localStorage as unknown as Record<string, string>
    let total = 0
    // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-unused-vars
    for (const k in all) {
      const v = localStorage.getItem(k)
      if (typeof v === 'string') total += (k.length + v.length) * 2
    }
    return total / (1024 * 1024)
  } catch {
    return 0
  }
}

export function usage(): StorageUsage {
  const usedMB = computeUsedMB()
  return { usedMB, quotaMB: STORAGE_QUOTA_MB, ratio: usedMB / STORAGE_QUOTA_MB }
}

function emitQuota(msg: string) {
  try {
    window.dispatchEvent(new CustomEvent('storage:quota-exceed', { detail: { message: msg } }))
  } catch {
    /* noop */
  }
}

export function storageGet<T = unknown>(key: V3StorageKey, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function storageSet(key: V3StorageKey, value: unknown): boolean {
  const payload = JSON.stringify(value)
  try {
    localStorage.setItem(key, payload)
  } catch (err) {
    const u = usage()
    const msg = `[storage] 写入失败（${key}），已用 ${u.usedMB.toFixed(2)}MB / 上限 ~${u.quotaMB}MB。请清理收藏或导出备份后清空。`
    // eslint-disable-next-line no-console
    console.error(msg, err)
    emitQuota(msg)
    return false
  }

  const u = usage()
  if (u.ratio >= 1) {
    const msg = `[storage] 本地存储已满（${u.usedMB.toFixed(2)}MB），请清理收藏后再保存。`
    // eslint-disable-next-line no-console
    console.warn(msg)
    if (!WARN_LOGGED_KEYS.has('quota:100')) {
      WARN_LOGGED_KEYS.add('quota:100')
      emitQuota(msg)
    }
  } else if (u.ratio >= STORAGE_QUOTA_WARN_RATIO) {
    const msg = `[storage] WARN: 已用 ${u.usedMB.toFixed(2)}MB (>90%)，考虑清理收藏`
    if (!WARN_LOGGED_KEYS.has('quota:90')) {
      WARN_LOGGED_KEYS.add('quota:90')
      // eslint-disable-next-line no-console
      console.warn(msg)
      emitQuota(msg)
    }
  }
  return true
}

export function storageRemove(key: V3StorageKey): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* noop */
  }
}

export function storageKeys(): string[] {
  try {
    return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(
      (s): s is string => typeof s === 'string'
    )
  } catch {
    return []
  }
}

/** 原始读写（仅 migration 脚本用，避免 ESLint 到处禁用） */
export function storageRawGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
export function storageRawSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* noop */
  }
}
export function storageRawRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* noop */
  }
}
