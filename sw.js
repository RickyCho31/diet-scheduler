/* Diet Scheduler service worker: 네트워크 우선 + 캐시 폴백 (오프라인 대비). 배포 시 VERSION 올리면 옛 캐시 삭제 */
const VERSION = 'ds-v2';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/store.js', './js/nutrition.js', './js/plans.js', './js/menu.js', './js/foods.js', './js/hangul.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-512-maskable.png', './icons/icon-180.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const isData = url.pathname.includes('/data/');
  if (isData) {
    // 네트워크 우선: 식단표/DB 갱신 반영, 오프라인이면 캐시
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request)));
  } else {
    // 앱 셸도 네트워크 우선: 배포 직후 바로 최신 반영, 오프라인이면 캐시
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request)));
  }
});
