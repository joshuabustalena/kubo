// Kainan sa Kubo service worker.
// Pages are always loaded fresh from the network (menus, prices, stock, orders and the
// POS must never be stale). Only build files and images, which never change at the same
// URL, are cached. When there is no internet, page loads show /offline.html.
const VERSION = "kubo-v1";
const CACHE = `${VERSION}-static`;
const PRECACHE = ["/offline.html", "/brand/kubo-emblem.png", "/pwa/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isStaticAsset = (url) =>
  url.pathname.startsWith("/_next/static/") || /^\/(brand|pwa|POS|Image)\//.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // orders, payments, logins: always straight to the server
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase and other services untouched

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
