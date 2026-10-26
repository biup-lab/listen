const CACHE = 'listen-v4';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('listen', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
      if (!db.objectStoreNames.contains('inbox')) db.createObjectStore('inbox', { autoIncrement: true });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/share')) {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const files = form.getAll('audio');
        const db = await idb();
        await new Promise((res, rej) => {
          const tx = db.transaction('inbox', 'readwrite');
          files.forEach(f => tx.objectStore('inbox').add({ name: f.name, type: f.type, blob: f }));
          tx.oncomplete = res; tx.onerror = () => rej(tx.error);
        });
      } catch (err) {}
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
