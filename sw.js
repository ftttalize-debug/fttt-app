// Service worker FTTT : réseau d'abord (revalidation à chaque chargement, donc jamais d'ancienne version
// après une mise à jour), copie locale en secours (coquille de l'app uniquement).
// Les données (Supabase, autre domaine) ne sont jamais mises en cache.
const CACHE = 'fttt-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)); }
    return res;
  }).catch(() => caches.match(r).then(m => m || caches.match('/index.html'))));
});

// Notifications push : alerte générale de rappel d'inscription.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.titre || 'FTTT', {
    body: d.texte || '', icon: 'assets/icon-192.png', data: { url: d.url || '/' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
