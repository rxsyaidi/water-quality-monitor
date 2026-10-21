// Water Quality Monitor service worker. Pages come from the network first so readings are never stale,
// with the last copy as a fallback when offline; signed in pages under /app are never stored, so a shared
// phone cannot show one person's tank to the next. Built assets are cached as they load. Supabase calls
// go straight to the network.
const CACHE = "wqm-v2";
const OFFLINE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline</title><body style="margin:0;font:16px/1.5 system-ui,sans-serif;background:#0B4F8E;color:#fff;display:grid;place-items:center;min-height:100vh;padding:24px;text-align:center">
<div><p style="font-size:20px;font-weight:600;margin:0 0 6px">No connection</p><p style="margin:0;color:#B9D3EC">The board keeps protecting the tank on its own. Readings show again once this phone is back online.</p></div>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !url.pathname.startsWith("/app")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || new Response(OFFLINE, { headers: { "Content-Type": "text/html" } })),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|woff2?)$/.test(url.pathname)) {
    e.respondWith(
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

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).pathname.startsWith("/app"));
      return open ? open.focus() : self.clients.openWindow("/app/alerts");
    }),
  );
});
