const CACHE_NAME = 'kmdlabs-codespace-v5';
const CORE_ASSETS = ['./','./index.html','./style.css','./script.js','./favicon.svg','./manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  if(event.request.mode === 'navigate'){
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put('./index.html',copy));
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => {
    const network = fetch(event.request).then(response => {
      if(response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request,response.clone()));
      return response;
    });
    return cached || network;
  }));
});
