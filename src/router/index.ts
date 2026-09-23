import { createRouter, createWebHashHistory, type RouteLocationNormalized, type RouteRecordRaw } from 'vue-router'
import { appRoutes } from './routes'

const history = createWebHashHistory()

const router = createRouter({
  history,
  routes: appRoutes as unknown as RouteRecordRaw[],
  scrollBehavior() {
    return { top: 0, behavior: 'smooth' }
  }
})

/**
 * 深度链接处理（AC-7 深度链接行为：
 * - `/tv?channel=xxx` 进入 TV 页后自动选中 + 播放 + 滚动定位
 * - `/fm?station=uuid` 同理
 * 具体 store 初始化完成在各自 onMounted 内（或通过 pinia action 订阅，避免循环依赖）
 *
 * 这里只把 query 写进全局状态浅层传递
 */
interface DeepLinkPayload {
  fullPath: string
  channel?: string
  station?: string
}
export const deepLinkEventTarget = {
  _cb: null as null | ((p: DeepLinkPayload) => void),
  once(cb: (p: DeepLinkPayload) => void) {
    this._cb = cb
  }
}

router.afterEach((to) => {
  const channel = typeof to.query.channel === 'string' ? to.query.channel : undefined
  const station = typeof to.query.station === 'string' ? to.query.station : undefined
  if (channel || station) {
    deepLinkEventTarget._cb?.({
      fullPath: to.fullPath,
      channel,
      station
    })
  }
  // 动态设置文档标题
  const title = (to.meta.title as string) || 'Solo Radio'
  document.title = `${title} - Solo Radio`
})

export default router
