import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { clientsClaim } from 'workbox-core'

clientsClaim()

// Precache hashed assets (JS, CSS, images) for offline fallback
precacheAndRoute(self.__WB_MANIFEST)

// Network-first for all navigation — always fetch latest HTML from server
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: 'pages',
      networkTimeoutSeconds: 3,
    })
  )
)

// Network-first for Supabase API
registerRoute(
  /^https:\/\/enkhbhllkvvuykantdgv\.supabase\.co\/rest\/v1\/.*/i,
  new NetworkFirst({
    cacheName: 'supabase-api',
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 86400 }),
    ],
  })
)

// Activate waiting SW when the client requests it
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
