// Minimal service worker: enables PWA install + Web Share Target. Network-first
// with a tiny app-shell fallback; intentionally lightweight (no aggressive
// caching of dynamic playlist data, which must stay live).
const SHELL_CACHE = "openshare-shell-v1";
const SHELL_ASSETS = ["/", "/install", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  event.respondWith(
    fetch(request)
      .then((response) => response)
      .catch(() => caches.match(request).then((hit) => hit || caches.match("/"))),
  );
});
