// Service worker do rolê: só avisos (Web Push). A API simulada roda dentro da página, não aqui.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { body: e.data && e.data.text() } }
  const base = self.registration.scope
  e.waitUntil(self.registration.showNotification(d.title || 'rolê', {
    body: d.body || '', tag: d.tag, renotify: !!d.tag, data: { url: d.url || base },
    icon: base + 'icon.svg', badge: base + 'icon.svg',
  }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL(e.notification.data?.url || '', self.location.origin).href
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const same = all.find((c) => c.url.startsWith(self.registration.scope))
    if (same) { await same.focus(); return same.navigate(url) }
    return self.clients.openWindow(url)
  })())
})
