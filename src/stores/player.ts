import { defineStore } from 'pinia'
import { V3_KEYS } from '@/storage/keys'
import { storageGet, storageSet } from '@/storage/index'
import type { MediaItem } from '@/types/media'
import { mediaUniqueKey } from '@/types/media'

export interface PlayerState {
  /** 统一类型（tv/fm/episode/null），null 表示空闲 */
  mediaType: 'tv' | 'fm' | 'episode' | null
  currentItem: MediaItem | null
  currentStreamUrl: string
  isPlaying: boolean
  currentTitle: string
  currentSubtitle: string
  volume: number
}

const initial = (): PlayerState => {
  const vol = storageGet<number>(V3_KEYS.VOLUME, 1)
  return {
    mediaType: null,
    currentItem: null,
    currentStreamUrl: '',
    isPlaying: false,
    currentTitle: '',
    currentSubtitle: '',
    volume: Number.isFinite(vol) ? Math.max(0, Math.min(1, vol)) : 1
  }
}

function ensureAudioEl(): HTMLAudioElement {
  const a = document.getElementById('global-audio') as HTMLAudioElement | null
  if (!a) throw new Error('global-audio 未挂载，请检查 index.html')
  return a
}

export const usePlayerStore = defineStore('player', {
  state: initial,
  actions: {
    async playItem(item: MediaItem, autoplay = true) {
      this.mediaType = item.type
      this.currentItem = item
      this.currentStreamUrl = item.streamUrl
      this.currentTitle = item.title
      this.currentSubtitle = [item.country, item.category].filter(Boolean).join(' · ')
      try {
        const audio = ensureAudioEl()
        audio.volume = this.volume
        audio.crossOrigin = 'anonymous'
        audio.src = item.streamUrl
        if (autoplay) {
          await audio.play().catch(() => {
            this.isPlaying = false
          })
          this.isPlaying = !audio.paused
        }
      } catch {
        this.isPlaying = false
      }
    },
    playUrl(url: string, type: PlayerState['mediaType'], title = '', subtitle = '') {
      this.mediaType = type
      this.currentStreamUrl = url
      this.currentTitle = title
      this.currentSubtitle = subtitle
      const audio = ensureAudioEl()
      audio.src = url
      audio.volume = this.volume
      void audio.play()
        .then(() => (this.isPlaying = true))
        .catch(() => (this.isPlaying = false))
    },
    toggle() {
      const audio = ensureAudioEl()
      if (!audio.src || audio.paused) {
        void audio.play()
          .then(() => (this.isPlaying = true))
          .catch(() => (this.isPlaying = false))
      } else {
        audio.pause()
        this.isPlaying = false
      }
    },
    setVolume(v: number) {
      const vv = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1))
      this.volume = vv
      storageSet(V3_KEYS.VOLUME, vv)
      try {
        ensureAudioEl().volume = vv
      } catch {
        /* noop */
      }
    },
    stop() {
      const audio = ensureAudioEl()
      try {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      } catch {
        /* noop */
      }
      this.isPlaying = false
      this.currentStreamUrl = ''
      this.currentItem = null
      this.currentTitle = ''
      this.currentSubtitle = ''
      this.mediaType = null
    },
    getCurrentUniqueKey() {
      return this.currentItem ? mediaUniqueKey(this.currentItem) : ''
    }
  }
})
