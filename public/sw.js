const CACHE_NAME = 'aerochat-cache-v3';
const STATIC_ASSETS = [
    '/',
    '/login.html',
    '/register.html',
    '/chat.html',
    '/dashboard.html',
    '/style.css',
    '/app.js',
    '/theme.js',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Only intercept GET requests
    if (event.request.method !== 'GET') return;
    
    // Skip API calls and socket.io requests
    if (event.request.url.includes('/api/') || event.request.url.includes('/socket.io/')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Return cached version, but update in background
                event.waitUntil(
                    fetch(event.request).then((networkResponse) => {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse.clone());
                        });
                    }).catch(() => {})
                );
                return cachedResponse;
            }

            // If not cached, fetch from network
            return fetch(event.request).then((networkResponse) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            }).catch(() => {
                // Optional: return a fallback offline page here if needed
            });
        })
    );
});
