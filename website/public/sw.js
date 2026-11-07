// Codecastic ExamHub Service Worker (PWA Offline Support)
const CACHE_NAME = 'codecastic-examhub-v1';
const CORE_ASSETS = [
    '/',
    '/index.html',
    '/manifest.webmanifest',
    '/icon.svg',
    '/lab-runner.html'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(CORE_ASSETS).catch((err) => {
                console.warn('[SW] Core precache partial fail:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((k) => {
                    if (k !== CACHE_NAME) {
                        return caches.delete(k);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Skip chrome extensions or non-http requests
    if (!url.protocol.startsWith('http')) return;

    // Handle HTML Navigation requests (Single Page App routing)
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req).catch(() => {
                return caches.match('/index.html') || caches.match('/');
            })
        );
        return;
    }

    // Do not cache mutable API requests in service worker cache (handled via IndexedDB)
    if (url.pathname.startsWith('/api/')) {
        return;
    }

    // Static Assets: Stale-While-Revalidate
    event.respondWith(
        caches.match(req).then((cached) => {
            const fetchPromise = fetch(req).then((networkRes) => {
                if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
                    const clone = networkRes.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(req, clone));
                }
                return networkRes;
            }).catch(() => cached);

            return cached || fetchPromise;
        })
    );
});
