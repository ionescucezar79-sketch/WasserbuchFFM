// sw.js — v3.2 | Service Worker for Brunnen Tagebuch PWA
//
// Caching strategy by resource type:
//   • Navigation (HTML)        → network-first, cache fallback, index fallback
//   • Same-origin static       → stale-while-revalidate (instant + auto-update)
//   • Versioned CDN (Chart.js, Firebase SDK)
//                              → cache-first (URLs contain version)
//   • Firebase backend API     → passthrough (Firebase has own offline layer)
//   • Anything else            → passthrough (don't intercept)
//
// Update flow:
//   • New sw.js byte-different from old → install fires
//   • install: precache CORE_ASSETS (strict) + CDN_ASSETS (best-effort)
//   • skipWaiting → activate fires immediately
//   • activate: delete old caches
//   • First install (no old caches): clients.claim → control current page
//   • Subsequent updates: do NOT claim → let running tabs finish naturally,
//     new SW takes over on next reload (avoids JS/cache version mismatch)

const VERSION    = 'v3.2.0';
const CACHE_NAME = `brunnen-${VERSION}`;

// ── Same-origin assets (strict precache — fail install if any missing) ──
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/404.html',
  '/app.js',
  '/db.js',
  '/charts.js',
  '/firebase.js',
  '/firebase-config.js',
  '/i18n.js',
  '/style.css',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.png',
];

// ── Cross-origin CDN assets (best-effort precache) ──
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js',
];

// ── Firebase backend hosts — NEVER intercept ──
// Firestore SDK has its own offline persistence via IndexedDB; intercepting
// these requests would break sync, auth refresh, and real-time listeners.
const PASSTHROUGH_HOSTS = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
];

// ═══════════════════════════════════════════════════
// INSTALL
// ═══════════════════════════════════════════════════
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Core: strict. If any of these fail, install fails — by design,
    // surfaces bugs early (e.g. forgot to commit a file).
    await cache.addAll(CORE_ASSETS);

    // CDN: best-effort. CDN downtime shouldn't break our PWA install.
    await Promise.allSettled(
      CDN_ASSETS.map(url => cache.add(url).catch(() => null))
    );

    // Activate this new SW as soon as install completes.
    self.skipWaiting();
  })());
});

// ═══════════════════════════════════════════════════
// ACTIVATE
// ═══════════════════════════════════════════════════
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const oldCaches = keys.filter(k => k !== CACHE_NAME);
    await Promise.all(oldCaches.map(k => caches.delete(k)));

    // First-ever install: take control of the page so user doesn't
    // need to reload to get SW benefits.
    // Update (had old caches): hands-off — existing tabs keep their
    // current SW, new SW takes over only on next reload. Prevents
    // running-page JS from getting mismatched cache contents.
    if (oldCaches.length === 0) {
      await self.clients.claim();
    }
  })());
});

// ═══════════════════════════════════════════════════
// FETCH
// ═══════════════════════════════════════════════════
self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle GET. Anything else (POST to Firestore, etc.) goes to network.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Firebase backend → never intercept
  if (PASSTHROUGH_HOSTS.some(h => url.hostname.endsWith(h))) return;

  // Navigation (HTML document load) → network-first
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  // Same-origin static asset → stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Precached versioned CDN → cache-first
  if (CDN_ASSETS.includes(req.url)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Anything else (Firebase auth iframes, dynamic gstatic, etc.) → passthrough
});

// ═══════════════════════════════════════════════════
// STRATEGIES
// ═══════════════════════════════════════════════════

// Network-first: try network, fall back to cache, then to index.html
async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    const fallback = await cache.match('/index.html');
    if (fallback) return fallback;
    throw e;
  }
}

// Stale-while-revalidate: serve cached immediately, refresh in background
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);  // offline: keep serving cached
  return cached || fetchPromise;
}

// Cache-first: serve cached if present, else fetch and cache
async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;
  const fresh = await fetch(req);
  if (fresh.ok) cache.put(req, fresh.clone());
  return fresh;
}

// ═══════════════════════════════════════════════════
// MESSAGE (allow page to trigger update)
// ═══════════════════════════════════════════════════
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
