const CACHE = 'solo-radio-v9'
const ASSETS = [
  '/',
  '/index.html',
  '/blog/',
  '/blog/index.html',
  '/blog/post.html',
  '/blog/write.html',
  '/blog/posts/index.json',
  '/blog/posts/welcome.html',
  '/tools/pomodoro.html',
  '/assets/css/styles.css',
  '/assets/js/app.js',
  '/assets/js/blog.js',
  '/assets/js/pomodoro.js',
  '/manifest.webmanifest',
  '/icons/icon.svg'
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
  e.respondWith(
    caches.match(request).then(cached => cached || fetch(request).catch(() =>
      new Response('离线状态，无法加载', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    ))
  )
})
