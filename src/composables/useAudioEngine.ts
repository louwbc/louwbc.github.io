import { ref, readonly, onBeforeUnmount } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { useToasts } from '@/composables/useToasts'

/**
 * 全局 audio 单例（index.html 中的 <audio id="global-audio">）
 * 只 attach 一次事件，跨路由不卸载 DOM，保证 currentTime 连续（AC-6）。
 * 当播放失败（NETWORK / DECODE / SRC_NOT_SUPPORTED）时：
 *   - 弹出 error toast，并提示「打开官网 / 从收藏移除」建议（若当前来自收藏）
 */
export function useAudioEngine() {
  const audio = (typeof document !== 'undefined' ? document.getElementById('global-audio') as HTMLAudioElement | null : null)
  const video = (typeof document !== 'undefined' ? document.getElementById('global-video') as HTMLVideoElement | null : null)
  const attached = ref(false)
  const toasts = useToasts()
  const player = usePlayerStore()

  const ERROR_CODES = ['', 'ABORTED', 'NETWORK', 'DECODE', 'SRC_NOT_SUPPORTED']
  const ERROR_CN: Record<string, string> = {
    ABORTED: '播放被取消',
    NETWORK: '网络或跨域错误（源站可能失效）',
    DECODE: '媒体解码失败（码流损坏）',
    SRC_NOT_SUPPORTED: '该格式不支持（需要 HLS/Flash 等）'
  }

  function describeError(code?: number | null, src = ''): { title: string; tip: string } {
    const name = ERROR_CODES[code ?? 0] || 'UNKNOWN'
    const reason = ERROR_CN[name] || '未知播放错误'
    const isHttp = /^https?:\/\//i.test(src)
    if (!isHttp) {
      return {
        title: `音频播放错误（${name}）：${reason}`,
        tip: '流地址缺失或非合法 http(s) URL，建议移除该收藏项并重新添加。'
      }
    }
    if (code === 2 /* NETWORK */ || code === 4 /* SRC_NOT_SUPPORTED */) {
      return {
        title: `音频播放错误（${name}）：${reason}`,
        tip: '可能是源站失效 / CORS 限制。可点击卡片的「官网」按钮通过浏览器原生打开确认；如长期不可用建议从收藏移除。'
      }
    }
    return {
      title: `音频播放错误（${name}）：${reason}`,
      tip: '可重试播放；如持续失败请从收藏移除后重新添加，或打开官网查看源是否仍可用。'
    }
  }

  function attachErrorHandler(
    el: HTMLMediaElement,
    kind: 'audio' | 'video',
    playBtnLabel: string,
  ) {
    if ((el as unknown as { __attached?: boolean }).__attached) return
    ;(el as unknown as { __attached: boolean }).__attached = true

    el.addEventListener('play', () => { player.isPlaying = true })
    el.addEventListener('playing', () => { player.isPlaying = !el.paused })
    el.addEventListener('pause', () => { player.isPlaying = false })
    el.addEventListener('ended', () => { player.isPlaying = false })
    el.addEventListener('error', () => {
      const code = el.error?.code ?? 0
      if (code === 1 /* ABORTED (user cancel) */) return
      const current = player.currentItem
      const { title, tip } = describeError(code, el.currentSrc || player.currentStreamUrl)
      const parts: string[] = [`${kind.toUpperCase()}：${title}`, tip]
      if (current?.homepage) parts.push(`▶︎ 点击卡片「官网」按钮可原生打开确认（右键此处复制：${current.homepage}）`)
      if (current?.meta && current.meta.fromFavorites === true) {
        parts.push(`✕ 若长期失效：点击卡片右上角 X 或底部「移除」删除该收藏`)
      }
      toasts.error(parts.join('\n'), 12000)
      void playBtnLabel
    })
    // 初始化 volume（audio 单例；video 走外部默认 1）
    try { if (kind === 'audio') el.volume = player.volume } catch { /* noop */ }
  }

  if (audio) attachErrorHandler(audio, 'audio', 'AudioPlayer')
  if (video) attachErrorHandler(video, 'video', 'VideoPlayer')
  attached.value = Boolean(audio || video)

  onBeforeUnmount(() => {
    // 不 detach media：单例常驻（跨路由不中断）
  })

  return {
    audio: readonly(ref(audio)),
    video: readonly(ref(video)),
    attached: readonly(attached)
  }
}
