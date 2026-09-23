// 复制图标（_legacy 的 v2 icon.svg 作为 favicon 与 manifest icon）
// src/test/setup.ts (vitest 初始化)

// Vitest 里 jsdom 没有 localStorage 时补一个 mock（vitest globals + jsdom 已配置）
import { vi, beforeEach, afterEach } from 'vitest'

const ls = new Map<string, string>()
beforeEach(() => {
  ls.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      get length() { return ls.size },
      getItem: (k: string) => (ls.has(k) ? (ls.get(k)!) : null),
      setItem: (k: string, v: string) => ls.set(k, String(v)),
      removeItem: (k: string) => { ls.delete(k) },
      clear: () => { ls.clear(); },
      key: (i: number) => Array.from(ls.keys())[i] ?? null
    } as Storage
  })
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllTimers()
})

export {}
