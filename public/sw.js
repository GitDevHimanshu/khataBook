/* ─────────────────────────────────────────
   Khata — Service Worker (sw.js)
   Enables PWA installation & offline app shell.
   API requests to /api/* ALWAYS bypass cache
   to preserve real-time MongoDB database sync.
───────────────────────────────────────── */

const CACHE_NAME = "khata-shell-v1";

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// Install: Cache the static app shell
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up old caches and take control
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strategy for requests
self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Any non-GET request (POST, PUT, DELETE) -> Always Network
  if (req.method !== "GET") {
    return;
  }

  // 2. Any API call to /api/* or /health -> Always Network
  if (url.pathname.startsWith("/api/") || url.pathname === "/health") {
    return;
  }

  // 3. Static assets & Navigation -> Network-First with Cache Fallback
  event.respondWith(
    fetch(req)
      .then(networkResponse => {
        // If response is valid, clone and update cache
        if (networkResponse && networkResponse.status === 200) {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        }
        return networkResponse;
      })
      .catch(() => {
        // Network failed (offline) -> serve from cache
        return caches.match(req).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If navigating, fall back to index.html
          if (req.mode === "navigate") {
            return caches.match("/index.html");
          }
          return new Response("Offline", { status: 503, statusText: "Offline" });
        });
      })
  );
});
