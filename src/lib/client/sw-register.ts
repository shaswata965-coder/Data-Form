/** Registers the offline service worker (production builds only). */
export async function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production") return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    const ready = await navigator.serviceWorker.ready;
    // Make sure every script/style this page loaded is cached for offline use
    // (on the very first visit the worker was not yet controlling the page).
    const urls = performance
      .getEntriesByType("resource")
      .map((e) => new URL(e.name))
      .filter((u) => u.origin === location.origin && u.pathname.startsWith("/_next/static/"))
      .map((u) => u.pathname + u.search);
    ready.active?.postMessage({ type: "CACHE_URLS", urls });
  } catch {
    /* offline support is a progressive enhancement */
  }
}
