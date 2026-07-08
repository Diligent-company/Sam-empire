/* =============================================================================
   SAM EMPIRE — service-worker.js
   PWA offline support + push notifications.
   Strategy:
     • Precache the app shell on install.
     • HTML  → network-first (fresh content, offline fallback page).
     • CSS/JS/fonts/images → stale-while-revalidate (fast + self-healing).
     • Firebase/Google APIs → always network (never cached).
   Bump CACHE_VERSION whenever shell assets change to force an update.
   ============================================================================= */

const CACHE_VERSION = "sam-empire-v1.0.0";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const OFFLINE_URL = "/offline.html";

const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/offline.html",
  "/404.html",
  "/manifest.json",
  "/assets/css/style.css",
  "/assets/css/responsive.css",
  "/assets/css/animations.css",
  "/assets/icons/logo.svg",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/favicon.svg"
];

/* Never intercept these — let the network handle them directly. */
const BYPASS_HOSTS = [
  "firestore.googleapis.com",
  "firebasestorage.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "www.googleapis.com",
  "fcmregistrations.googleapis.com",
  "firebaseinstallations.googleapis.com",
  "maps.googleapis.com",
  "www.google-analytics.com"
];

/* ---- Install: precache shell ---------------------------------------------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

/* ---- Activate: clean old caches ------------------------------------------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---- Fetch routing -------------------------------------------------------- */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (BYPASS_HOSTS.some((host) => url.hostname.includes(host))) return;
  if (url.origin !== self.location.origin && !url.hostname.includes("gstatic")
      && !url.hostname.includes("googleapis") && !url.hostname.includes("fonts")) {
    // cross-origin (e.g. CDN fonts) → stale-while-revalidate below still applies
  }

  // HTML navigations → network-first with offline fallback
  if (request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets → stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    return cached || caches.match(OFFLINE_URL) || new Response("Offline", { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then((resp) => {
    if (resp && resp.status === 200 && resp.type !== "opaque") cache.put(request, resp.clone());
    return resp;
  }).catch(() => cached);
  return cached || network;
}

/* ---- Push notifications (Firebase Cloud Messaging payloads) ---------------- */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
  const n = data.notification || data;
  const title = n.title || "SAM EMPIRE";
  const options = {
    body: n.body || "Una taarifa mpya kuhusu viwanja.",
    icon: "/assets/icons/icon-192.png",
    badge: "/assets/icons/favicon-32.png",
    image: n.image || undefined,
    data: { url: (data.data && data.data.url) || n.click_action || "/account.html" },
    vibrate: [60, 30, 60],
    tag: n.tag || "sam-empire",
    renotify: true
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(target) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});

/* ---- Allow the page to trigger an immediate update ------------------------ */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
