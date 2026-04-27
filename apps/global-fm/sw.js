const CACHE = 'global-fm-v1'
const ASSETS = [
  './',
  './index.html',
  './global-fm.css',
  './global-fm.js',
  './manifest.webmanifest',
  '../../assets/css/site.css',
  '../../icons/icon.svg'
]

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  const accept = request.headers.get('accept') || ''
  const isHtml = accept.includes('text/html')
  if (isHtml) {
    e.respondWith(networkFirst(request))
    return
  }
  e.respondWith(cacheFirst(request))
})

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const fresh = await fetch(request)
    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE)
      await cache.put(request, fresh.clone())
    }
    return fresh
  } catch (_) {
    return new Response('离线状态，无法加载', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
}

async function networkFirst(request) {
  try {
    const fresh = await fetch(request)
    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE)
      await cache.put(request, fresh.clone())
    }
    return fresh
  } catch (_) {
    const cached = await caches.match(request)
    return cached || new Response('离线状态，无法加载', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
}
