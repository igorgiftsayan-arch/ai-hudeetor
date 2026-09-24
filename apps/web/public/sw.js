const CACHE_NAME = 'atlas-shell-v2';
const SAFE_SHELL = ['/', '/offline', '/icon.svg', '/maskable-icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SAFE_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || !SAFE_SHELL.includes(url.pathname))
    return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(
        async () =>
          (await caches.match(request)) ?? (await caches.match('/offline')),
      ),
  );
});

// Store only opaque delivery IDs, never notification bodies or account data.
function deliveryStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('atlas-push-receipts', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('received', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function receiveOnce(id) {
  const db = await deliveryStore();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('received', 'readwrite');
    const store = transaction.objectStore('received');
    let fresh = false;
    const read = store.get(id);
    read.onsuccess = () => {
      if (read.result) return;
      fresh = true;
      store.put({ id, at: Date.now() });
      const all = store.getAll();
      all.onsuccess = () =>
        all.result
          .sort((a, b) => b.at - a.at)
          .slice(100)
          .forEach((row) => store.delete(row.id));
    };
    transaction.oncomplete = () => {
      db.close();
      resolve(fresh);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let payload;
      try {
        payload = event.data?.json();
      } catch {
        return;
      }
      if (
        !payload ||
        typeof payload.deliveryId !== 'string' ||
        !/^[a-zA-Z0-9-]{1,100}$/.test(payload.deliveryId)
      )
        return;
      if (!(await receiveOnce(payload.deliveryId))) return;
      // Fixed, private-free text; untrusted payloads cannot put health data on a lock screen.
      await self.registration.showNotification('AI-друг', {
        body: 'Пора ненадолго заглянуть в приложение.',
        icon: '/icon.svg',
        tag: `atlas-reminder-${payload.deliveryId}`,
        renotify: false,
        data: { url: payload.url === '/today' ? '/today' : '/marathon' },
      });
    })(),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path =
    event.notification.data?.url === '/today' ? '/today' : '/marathon';
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const existing = windows.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (existing) {
        await existing.navigate(target);
        await existing.focus();
      } else await self.clients.openWindow(target);
    })(),
  );
});
