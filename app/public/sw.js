/*
 * Clean Proof Guard Staff — app-shell service worker.
 *
 * Caches ONLY the staff app shell and immutable static assets:
 *  - /staff navigations fall back to the cached shell when offline
 *  - hashed build files under /assets/ and the PWA icons are cache-first
 *
 * Deliberately NOT cached: anything under /admin, any non-GET request, and all
 * cross-origin traffic (the Supabase API) — no admin or business data ever
 * lands in the cache. Offline task submissions are queued by the app itself
 * (localStorage outbox), not by this worker.
 */
const CACHE = 'cpg-staff-shell-v1'
const SHELL = [
  '/staff',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/favicon.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // Supabase & co: straight to network
  if (url.pathname.startsWith('/admin')) return // admin is online-only, never cached

  // Staff navigations: network first, cached shell when offline.
  if (req.mode === 'navigate') {
    if (!url.pathname.startsWith('/staff')) return
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put('/staff', copy))
          return res
        })
        .catch(() => caches.match('/staff')),
    )
    return
  }

  // Immutable static assets (hashed filenames) + icons: cache first.
  const isStatic =
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.svg' ||
    url.pathname === '/manifest.webmanifest'
  if (isStatic) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((cache) => cache.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})
