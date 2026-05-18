const CACHE_NAME = 'translator-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json'
];

// Cài đặt Service Worker và lưu cache các tệp cơ bản
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Chặn các request để lấy từ cache nếu mất mạng (Ngoại trừ các API Google)
self.addEventListener('fetch', event => {
  // Không cache các lệnh gọi API dịch và OCR (vì chúng cần mạng thực tế)
  if (event.request.url.includes('googleapis.com') || 
      event.request.url.includes('google.com') ||
      event.request.url.includes('tesseract')) {
      return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
            return response; // Trả về file từ Cache nếu có
        }
        return fetch(event.request);
      })
  );
});
