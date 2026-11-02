// Service worker: lets SpinFlipRoll open offline once it has been visited.
// Pages are fetched network-first so new versions show up straight away; the hashed
// scripts and styles never change, so they're served from the cache.

const CACHE = "spinfliproll-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png"];
const ASSET_PATTERN = /(?:src|href)="(\.\/assets\/[^"]+)"/g;

function assetUrls(html) {
  return [...html.matchAll(ASSET_PATTERN)].map((match) => new URL(match[1], self.registration.scope).href);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      const page = await cache.match("./index.html");
      if (page) await cache.addAll(assetUrls(await page.text()));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })()
  );
});

/** Drops scripts and styles from older versions that the current page no longer uses. */
async function pruneAssets(html) {
  const keep = new Set(assetUrls(html));
  const cache = await caches.open(CACHE);
  for (const request of await cache.keys()) {
    if (request.url.includes("/assets/") && !keep.has(request.url)) await cache.delete(request);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE);
            await cache.put("./index.html", response.clone());
            pruneAssets(await response.clone().text()).catch(() => undefined);
          }
          return response;
        } catch {
          return (await caches.match("./index.html")) || (await caches.match("./")) || Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && url.pathname.includes("/assets/")) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    })()
  );
});
