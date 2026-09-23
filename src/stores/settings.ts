import { defineStore } from 'pinia'
import { storageGet, storageSet } from '@/storage/index'
import { V3_KEYS } from '@/storage/keys'

export interface SettingsShape {
  tvDefaultPlaybackMode: 'audio' | 'video'
  tvSubtitleEnabled: boolean
  fmIncludeInsecure: boolean
  fmPreferredLanguage: string
  fmPreferredTag: string
  /** 独立收藏是否自动镜像到统一收藏（默认关，尊重 v2 双收藏习惯） */
  autoMirrorLocalFavoritesToUnified: boolean
}

const DEFAULTS: SettingsShape = {
  tvDefaultPlaybackMode: 'audio',
  tvSubtitleEnabled: false,
  fmIncludeInsecure: false,
  fmPreferredLanguage: '',
  fmPreferredTag: '',
  autoMirrorLocalFavoritesToUnified: false
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsShape => ({ ...DEFAULTS, ...(storageGet<Partial<SettingsShape>>(V3_KEYS.SETTINGS, {}) || {}) }),
  actions: {
    _persist() {
      storageSet(V3_KEYS.SETTINGS, { ...this.$state })
    },
    set(key: keyof SettingsShape, value: unknown) {
      (this as unknown as Record<string, unknown>)[key] = value
      this._persist()
    },
    toggleSubtitle() {
      this.tvSubtitleEnabled = !this.tvSubtitleEnabled
      this._persist()
    },
    togglePlaybackMode() {
      this.tvDefaultPlaybackMode = this.tvDefaultPlaybackMode === 'video' ? 'audio' : 'video'
      this._persist()
    }
  }
})
