/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope

// ── Workbox precaching (injected by VitePWA at build time) ──────────────────
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// ── Lifecycle ───────────────────────────────────────────────────────────────
self.addEventListener('install', () => { self.skipWaiting() })
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// ── Navigation fallback (SPA) ───────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/index.html').then((r) => r ?? fetch(event.request))
      )
    )
  }
})

// ── Push notifications ──────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const title = data.title ?? 'Padel Players'
  const options: NotificationOptions = {
    body: data.message ?? data.body ?? '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    data: { url: data.url ?? '/' },
    tag: data.tag ?? 'ppa-notification',
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// ── Notification click → open app at the relevant URL ───────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if one is open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(url)
    })
  )
})
