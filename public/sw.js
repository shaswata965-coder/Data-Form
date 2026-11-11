/*
 * Service worker for the Oral Health data form.
 *
 *  - Keeps the form page and its static assets cached so the form opens and
 *    works with no connection (after it has been opened online once).
 *  - Uploads queued submissions in the background (Background Sync) using the
 *    same IndexedDB outbox as the page (src/lib/client/outbox.ts).
 *  - Never caches /api or /admin – admin data is always fetched live.
 */
const CACHE = "ohsi-shell-v1";
const SHELL_URL = "/";
const STATIC_PREFIX = "/_next/static/";
const EXTRA_ASSETS = [
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon.svg",
];
const NAV_TIMEOUT_MS = 4000;

const OUTBOX_DB = "ohsi-data-form";
const OUTBOX_STORE = "outbox";
const OUTBOX_LOCK = "ohsi-outbox-flush";
const OUTBOX_SYNC_TAG = "ohsi-outbox";
const SUBMIT_URL = "/api/submissions";

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>
<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:32px 16px;text-align:center}
main{max-width:420px;margin:0 auto}button{font:inherit;padding:12px 20px;border-radius:12px;border:0;background:#0f766e;color:#fff;margin-top:16px}</style>
</head><body><main><h1>You are offline</h1><p>The form has not been saved on this device yet. Connect to the internet once and open this page again – after that it works offline.</p>
<p lang="bn">আপনি অফলাইনে আছেন। একবার ইন্টারনেটে সংযুক্ত হয়ে পেজটি খুলুন, এরপর এটি অফলাইনেও কাজ করবে।</p>
<button onclick="location.reload()">Try again</button></main></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.allSettled(EXTRA_ASSETS.map((u) => cache.add(u)));
      await refreshShell(cache).catch(() => {});
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("ohsi-shell-") && k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Collect every /_next/static asset referenced by the HTML. */
function extractAssets(html) {
  const found = new Set();
  const re = /\/_next\/static\/[^"'\\\s<>()]+/g;
  let m;
  while ((m = re.exec(html))) found.add(m[0]);
  return [...found];
}

async function cacheStatic(cache, urls) {
  await Promise.all(
    urls.map(async (url) => {
      if (await cache.match(url, { ignoreVary: true })) return;
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`asset ${res.status}`);
      await cache.put(url, res);
    }),
  );
}

/**
 * Store a fresh copy of the form page – but only after every asset it needs
 * is cached, so the cached page can always boot offline.
 */
async function refreshShell(cache, response) {
  const res = response || (await fetch(SHELL_URL, { cache: "no-store", credentials: "same-origin" }));
  if (!res.ok || res.redirected) throw new Error(`shell ${res.status}`);
  const html = await res.clone().text();
  await cacheStatic(cache, extractAssets(html));
  await cache.put(SHELL_URL, res);
}

function timeout(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

async function handleShell(event) {
  const cache = await caches.open(CACHE);
  const network = fetch(event.request).catch(() => null);
  const res = await Promise.race([network, timeout(NAV_TIMEOUT_MS)]);
  if (res && res.ok) {
    event.waitUntil(refreshShell(cache, res.clone()).catch(() => {}));
    return res;
  }
  // Slow or no network: answer from cache, but still refresh it if the
  // network eventually responds.
  event.waitUntil(
    network.then((late) => (late && late.ok ? refreshShell(cache, late) : null)).catch(() => {}),
  );
  const cached = await cache.match(SHELL_URL, { ignoreVary: true });
  if (cached) return cached;
  const late = await network;
  if (late) return late;
  return new Response(OFFLINE_HTML, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request.url, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request.url, res.clone()).catch(() => {});
  return res;
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(event.request.url, { ignoreVary: true });
  const network = fetch(event.request)
    .then((res) => {
      if (res.ok) cache.put(event.request.url, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(network);
    return hit;
  }
  return (await network) || new Response("", { status: 504 });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin")) return;

  if (req.mode === "navigate" && url.pathname === SHELL_URL) {
    event.respondWith(handleShell(event));
  } else if (url.pathname.startsWith(STATIC_PREFIX)) {
    event.respondWith(cacheFirst(req));
  } else if (EXTRA_ASSETS.includes(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event));
  }
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "CACHE_URLS" && Array.isArray(data.urls)) {
    const urls = data.urls.filter((u) => typeof u === "string" && u.startsWith(STATIC_PREFIX));
    event.waitUntil(caches.open(CACHE).then((c) => cacheStatic(c, urls)).catch(() => {}));
  } else if (data.type === "FLUSH_OUTBOX") {
    event.waitUntil(flushOutbox().catch(() => {}));
  }
});

/* ------------------------- background upload --------------------------- */

self.addEventListener("sync", (event) => {
  if (event.tag === OUTBOX_SYNC_TAG) {
    // Rejecting makes the browser retry the sync later with back-off.
    event.waitUntil(
      flushOutbox().then((r) => {
        if (r.networkError) throw new Error("still offline");
      }),
    );
  }
});

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(OUTBOX_STORE)) {
        req.result.createObjectStore(OUTBOX_STORE, { keyPath: "clientId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idb(db, mode, run) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, mode);
    const req = run(tx.objectStore(OUTBOX_STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function notifyClients() {
  const all = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of all) c.postMessage({ type: "OUTBOX_CHANGED" });
}

async function doFlush() {
  const db = await openDb();
  try {
    const items = (await idb(db, "readonly", (s) => s.getAll()))
      .filter((i) => i.status === "pending")
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    let networkError = false;
    let changed = false;
    for (const item of items) {
      let res = null;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 25000);
        res = await fetch(SUBMIT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.payload),
          signal: controller.signal,
          cache: "no-store",
        });
        clearTimeout(timer);
      } catch {
        res = null;
      }
      changed = true;
      if (res && res.ok) {
        await idb(db, "readwrite", (s) => s.delete(item.clientId));
        continue;
      }
      const rejected = res && [400, 413, 415, 422].includes(res.status);
      let message = res ? `Server error ${res.status}` : "No internet connection";
      if (res) {
        try {
          const body = await res.json();
          if (body && body.message) message = body.message;
        } catch {
          /* not JSON */
        }
      }
      await idb(db, "readwrite", (s) =>
        s.put({
          ...item,
          attempts: (item.attempts || 0) + 1,
          lastAttemptAt: new Date().toISOString(),
          lastError: message,
          status: rejected ? "rejected" : "pending",
        }),
      );
      if (!rejected) {
        networkError = true;
        break;
      }
    }
    if (changed) await notifyClients();
    return { networkError };
  } finally {
    db.close();
  }
}

function flushOutbox() {
  if (self.navigator.locks && self.navigator.locks.request) {
    return self.navigator.locks.request(OUTBOX_LOCK, doFlush);
  }
  return doFlush();
}
