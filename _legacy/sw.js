self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.map(k => caches.delete(k)))
    try { await self.registration.unregister() } catch (_) {}
    const clientsList = await self.clients.matchAll({ type: 'window' })
    await Promise.all(clientsList.map(c => c.navigate(c.url)))
  })())
  self.clients.claim()
})
