// Skills2Careers Compass — Service Worker
//
// Strategy: stale-while-revalidate for the app shell and JSON data.
//   1. On install, precache the shell (HTML, JS, CSS, manifest).
//   2. On fetch, serve the cached copy IMMEDIATELY (so the app works
//      offline and feels instant) and in parallel fetch a fresh copy
//      to update the cache for next time.
//   3. On activate, delete any old cache versions whose name doesn't
//      match the current SW_VERSION.
//
// To force ALL users to re-download fresh assets, bump SW_VERSION.
// To clear a single user's cache (e.g. they're seeing stale data after
// a content update), the in-app "Reset App Cache" button now also
// clears every CacheStorage entry and unregisters this worker.
//
// What this means in practice for Carmela's data updates:
//   - User opens app today  -> sees cached version + bg-fetches fresh
//   - Carmela updates courses.json on GitHub at noon
//   - User opens app at 2pm -> sees yesterday's cache + bg-fetches new
//   - User opens app at 5pm -> sees noon's data (cache updated in bg)
// One visit of latency, then they're fresh. For instant freshness:
// hit the Reset App Cache button.

const SW_VERSION = 's2c-cache-v1';

// The app shell. These are precached on install so the page works
// offline even on a cold start. Keep the list short — the bulk of the
// caching happens lazily via stale-while-revalidate on each fetch.
const SHELL_URLS = [
    './',
    './index.html',
    './app.js',
    './data.js',
    './style.css',
    './manifest.json',
    './404.html'
];

// Files we want to cache aggressively when fetched. JSON data + the
// shell extensions above. (CDN scripts like Tailwind are NOT cached
// here — they're cross-origin and the browser handles them.)
const CACHEABLE_PATTERNS = [
    /\.json$/,       // courses.json, wages.json, ventures.json etc.
    /\.html$/,       // index.html, 404.html
    /\.js$/,         // app.js, data.js
    /\.css$/,        // style.css
];

// ─── Install: precache the shell ───────────────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SW_VERSION).then((cache) => {
            return cache.addAll(SHELL_URLS).catch((err) => {
                // If any single URL fails to precache, swallow and log.
                // Don't let the whole install fail.
                console.warn('[SW] shell precache partial failure:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// ─── Activate: delete old caches ───────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((k) => k !== SW_VERSION).map((k) => caches.delete(k))
            );
        }).then(() => self.clients.claim())
    );
});

// ─── Fetch: stale-while-revalidate ─────────────────────────────────
self.addEventListener('fetch', (event) => {
    const req = event.request;

    // Only handle GET. POST/PUT/DELETE never get cached.
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Only handle same-origin requests. Cross-origin CDN scripts
    // (Tailwind, Lucide, Chart.js, jsPDF) are left to the browser.
    if (url.origin !== self.location.origin) return;

    // Decide if this URL is something we want to cache.
    const isShell = SHELL_URLS.some((s) => url.pathname.endsWith(s.replace('./', '')));
    const isCacheable = isShell || CACHEABLE_PATTERNS.some((re) => re.test(url.pathname));
    if (!isCacheable) return;

    event.respondWith(
        caches.open(SW_VERSION).then(async (cache) => {
            const cachedResponse = await cache.match(req);
            // Kick off the network fetch in parallel — update cache when done.
            const networkFetch = fetch(req).then((response) => {
                if (response && response.status === 200 && response.type === 'basic') {
                    cache.put(req, response.clone()).catch(() => {});
                }
                return response;
            }).catch(() => {
                // Network failed; return whatever we had cached (or undefined).
                return cachedResponse;
            });
            // Serve cached version immediately if we have one, otherwise wait for network.
            return cachedResponse || networkFetch;
        })
    );
});

// ─── Message handler: let the page tell the SW to clear caches ─────
// The in-app "Reset App Cache" button posts { type: 'CLEAR_CACHES' }
// to trigger a full cache wipe + re-fetch on next load.
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CLEAR_CACHES') {
        event.waitUntil(
            caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
                .then(() => {
                    // Notify the caller it's done
                    if (event.source) event.source.postMessage({ type: 'CACHES_CLEARED' });
                })
        );
    }
});
