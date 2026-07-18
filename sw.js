const CACHE_NAME = 'travel-pwa-cache-v0.0.0.0.2';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './js/config.js',
  './js/utils.js',
  './js/ui.js',
  './js/api.js',
  './js/auth.js',
  './js/permission.js',
  './js/modules/map.js',
  './js/modules/weather.js',
  './js/modules/record.js',
  './js/app.js'
];

// 安裝 Service Worker 並快取基本資源
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
    );
    self.skipWaiting();
});

// 清除舊版本快取
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// 攔截網路請求，採 Network First 策略確保資料即時性 (GAS 請求不予快取)
self.addEventListener('fetch', event => {
    // 忽略外部 API 請求與 GAS 請求
    if (event.request.url.includes('script.google.com') || 
        event.request.url.includes('maps.googleapis.com')) {
        return;
    }

    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
