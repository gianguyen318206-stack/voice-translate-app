const CACHE_NAME = 'translator-cache-v16';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json'
];

// Cài đặt Service Worker và lưu cache các tệp cơ bản
self.addEventListener('install', event => {
  self.skipWaiting(); // Bắt buộc cập nhật ngay, không chờ tab cũ đóng
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Xóa TẤT CẢ cache cũ khi phiên bản mới được kích hoạt
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
                  .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim()) // Chiếm quyền điều khiển tất cả tab ngay
  );
});

// CHIẾN LƯỢC: NETWORK FIRST (Ưu tiên mạng, cache chỉ là dự phòng)
// → Luôn tải bản MỚI NHẤT từ server khi có mạng
// → Chỉ dùng cache khi KHÔNG có mạng (offline)
self.addEventListener('fetch', event => {
  // Không can thiệp các lệnh gọi API bên ngoài (Google Translate, TTS, Tesseract...)
  if (event.request.url.includes('googleapis.com') || 
      event.request.url.includes('google.com') ||
      event.request.url.includes('tesseract')) {
      return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Tải thành công từ mạng → lưu vào cache để dùng offline
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Không có mạng → trả về bản cache dự phòng
        return caches.match(event.request);
      })
  );
});
