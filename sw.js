/**
 * ================================================================
 *  Service Worker — رنيم فاي | التعلم الممتع
 *  Version  : 1.0
 *  Strategy : Cache First for assets, Network First for pages
 *  Developer: Samira Abdessadok "رنيم فاي"
 * ================================================================
 */

const CACHE_NAME    = 'ranimfay-v1';
const OFFLINE_PAGE  = '/';

// الملفات الأساسية التي تُحفظ فور التثبيت
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/og-image.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png'
];

// ── التثبيت: حفظ الملفات الأساسية ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── التفعيل: حذف الكاش القديم ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── الاعتراض: استراتيجية Cache First ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // تجاهل الطلبات غير HTTP
  if (!request.url.startsWith('http')) return;

  // تجاهل طلبات APIs خارجية
  if (url.hostname !== self.location.hostname) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        // إرجاع من الكاش + تحديث في الخلفية (Stale While Revalidate)
        const fetchPromise = fetch(request)
          .then(response => {
            if (response && response.status === 200) {
              const cloned = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(request, cloned));
            }
            return response;
          })
          .catch(() => cached);

        return cached;
      }

      // غير موجود في الكاش — اجلب من الشبكة
      return fetch(request)
        .then(response => {
          if (!response || response.status !== 200) return response;

          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, cloned));
          return response;
        })
        .catch(() => {
          // بدون اتصال — أرجع الصفحة الرئيسية
          if (request.destination === 'document') {
            return caches.match(OFFLINE_PAGE);
          }
        });
    })
  );
});

// ── استقبال رسائل من الصفحة ──
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0].postMessage({ cleared: true });
    });
  }
});
