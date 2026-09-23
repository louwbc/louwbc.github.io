/**
 * 封装动态 import('hls.js')（NFR-3：只有 TV/FM 路由使用时才拉 chunk，不在首屏 bundle）
 * Safari 原生 HLS 支持可直接用 <video>
 */
import type HlsImpl from 'hls.js'
import { onBeforeUnmount, ref } from 'vue'
import { useToasts } from '@/composables/useToasts'

let HlsCtor: typeof HlsImpl | null = null
let loadPromise: Promise<typeof HlsImpl | null> | null = null

async function loadHlsCtor(): Promise<typeof HlsImpl | null> {
  if (HlsCtor) return HlsCtor
  if (!loadPromise) {
    loadPromise = import('hls.js').then(m => {
      HlsCtor = m.default ?? (m as unknown as typeof HlsImpl)
      return HlsCtor
    }).catch(() => null)
  }
  return loadPromise
}

export function useHls() {
  const instance = ref<HlsImpl | null>(null)
  const attaching = ref(false)
  const toast = useToasts()

  async function attach(videoEl: HTMLVideoElement, streamUrl: string): Promise<HlsImpl | HTMLVideoElement | null> {
    if (!videoEl || !streamUrl) return null
    detach()
    attaching.value = true
    try {
      if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari / iOS：原生 HLS
        videoEl.src = streamUrl
        return videoEl
      }
      const Ctor = await loadHlsCtor()
      if (!Ctor?.isSupported()) {
        toast.warn('浏览器不支持 HLS 播放，请改用外链模式')
        return null
      }
      const hls = new Ctor({ enableWorker: true })
      hls.attachMedia(videoEl)
      hls.on(Ctor.Events.MEDIA_ATTACHED, () => { hls.loadSource(streamUrl); })
      hls.on(Ctor.Events.ERROR, (_e, data) => {
        if (!data.fatal) return
        // eslint-disable-next-line no-console
        console.error('[HLS] fatal:', data.type, data.details)
        switch (data.type) {
          case Ctor.ErrorTypes.NETWORK_ERROR:
            try { hls.startLoad() } catch { toast.error('网络错误：HLS 加载失败') }
            break
          case Ctor.ErrorTypes.MEDIA_ERROR:
            try { hls.recoverMediaError() } catch { toast.error('媒体错误：无法解码流') }
            break
          default:
            toast.error('HLS 播放失败，请尝试外链观看')
            hls.destroy()
            instance.value = null
        }
      })
      instance.value = hls
      return hls
    } finally {
      attaching.value = false
    }
  }

  function detach() {
    try {
      if (instance.value) {
        try { instance.value.destroy() } catch { /* noop */ }
        instance.value = null
      }
    } catch { /* noop */ }
  }

  onBeforeUnmount(detach)

  return { attach, detach, attaching, hlsInstance: instance }
}
