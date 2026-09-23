import { ref, readonly, onBeforeUnmount } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { useToasts } from '@/composables/useToasts'

/**
 * 全局 audio 单例（index.html 中的 <audio id="global-audio">）
 * 只 attach 一次事件，跨路由不卸载 DOM，保证 currentTime 连续（AC-6）。
 */
export function useAudioEngine() {
  const audio = (typeof document !== 'undefined' ? document.getElementById('global-audio') as HTMLAudioElement | null : null)
  const attached = ref(false)
  const toasts = useToasts()
  const player = usePlayerStore()

  if (audio && !(audio as unknown as { __attached?: boolean }).__attached) {
    (audio as unknown as { __attached: boolean }).__attached = true
    attached.value = true

    audio.addEventListener('play', () => { player.isPlaying = true })
    audio.addEventListener('playing', () => { player.isPlaying = !audio.paused })
    audio.addEventListener('pause', () => { player.isPlaying = false })
    audio.addEventListener('ended', () => { player.isPlaying = false })
    audio.addEventListener('error', () => {
      const e = audio.error
      const codes = ['', 'ABORTED', 'NETWORK', 'DECODE', 'SRC_NOT_SUPPORTED']
      toasts.error(`音频播放错误：${codes[e?.code ?? 0] || 'UNKNOWN'}`)
    })
    audio.addEventListener('volumechange', () => { /* volume 以 store 单一为主，这里不做双向同步 */ })
    // 初始化 volume
    try { audio.volume = player.volume } catch { /* noop */ }
  }

  onBeforeUnmount(() => {
    // 不 detach audio：单例常驻（跨路由不中断）
  })

  return {
    audio: readonly(ref(audio)),
    attached: readonly(attached)
  }
}
