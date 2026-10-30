// Service worker de la app instalable. Siempre intenta la red primero para que
// los datos y la web estén al día; la copia guardada solo se usa sin conexión.
const CACHE = "truc-jlf-v2";
const SHELL = ["/", "/styles.css", "/app.js", "/config.js", "/vendor/supabase.js", "/favicon.png", "/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.mode === "navigate" ? "/" : req, copy)); }
      return res;
    }).catch(() => caches.match(req.mode === "navigate" ? "/" : req).then((r) => r || caches.match("/")))
  );
});

// Notificaciones del campeonato.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Campionat de Truc", {
    body: d.body || "",
    icon: "/icon-192.png",
    badge: "/badge-96.png",
    tag: d.tag || "truc",
    renotify: true,
    lang: "es",
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (new URL(c.url).origin === self.location.origin && "focus" in c) { c.navigate(target).catch(() => {}); return c.focus(); }
    }
    return self.clients.openWindow(target);
  }));
});
