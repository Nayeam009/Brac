const CACHE_NAME = "tb-fo-assistant-v20260515-1935";
const APP_SHELL = ["/manifest.webmanifest", "/icon.svg"];
const MAX_ASSET_CACHE_ITEMS = 48;

const cacheResponse = async (request, response) => {
  if (!response || !response.ok) return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());

  if (typeof request === "object" && new URL(request.url).pathname.startsWith("/assets/")) {
    const keys = await cache.keys();
    const assetKeys = keys.filter((key) => new URL(key.url).pathname.startsWith("/assets/"));
    const staleAssetKeys = assetKeys.slice(0, Math.max(0, assetKeys.length - MAX_ASSET_CACHE_ITEMS));
    await Promise.all(staleAssetKeys.map((key) => cache.delete(key)));
  }

  return response;
};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => cacheResponse("/index.html", response))
        .catch(() => caches.match("/index.html")),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => cacheResponse(request, response))));
    return;
  }

  event.respondWith(fetch(request).then((response) => cacheResponse(request, response)).catch(() => caches.match(request)));
});
