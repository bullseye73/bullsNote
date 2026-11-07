// BullsNote PWA Service Worker (Network-First with Offline App Shell Fallback)
const CACHE_NAME = 'bullsnote-pwa-v1';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icon.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {}),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Google API / 외부 OAuth 요청은 절대 캐싱하지 않고 항상 실시간 네트워크로 전달
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('accounts.google.com') ||
    url.protocol === 'chrome-extension:'
  ) {
    return;
  }

  // 정적 리소스 및 앱 쉘: Network-First (최신 배포본 우선 제공, 오프라인 시 캐시 폴백)
  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200 && url.origin === self.location.origin) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return networkRes;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html'))),
  );
});

