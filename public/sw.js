// Service worker minimale — Fase 1 (MVP).
// Obiettivo: soddisfare i criteri di installabilità PWA (un fetch handler
// registrato) e fornire una shell offline di base. Niente strategie di
// caching sofisticate in questa fase: verranno aggiunte quando le API reali
// (Supabase) saranno collegate, per evitare di servire dati stantii.

const CACHE_NAME = "couples-app-shell-v1";
const SHELL_URLS = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => {
        // Non bloccare l'installazione se il precache fallisce (es. offline
        // durante il primo deploy): il SW verrà comunque registrato.
      }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

// -----------------------------------------------------------------------------
// Web Push (Fase 2, docs/PLAN.md) — vedi supabase/functions/send-push/ per il
// lato server (NON ancora deployato, vedi HANDOFF.md) e lib/push-actions.ts
// per la subscribe() lato client che registra questo service worker come
// destinatario. Questi due handler bastano perché una notifica arrivata
// venga effettivamente mostrata e il tap la porti al punto giusto dell'app
// — funzionano già ora anche prima del deploy della function (semplicemente
// non arriverà mai nessun evento "push" finché non lo è).
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Couples App", body: event.data.text() };
  }

  const title = payload.title || "Couples App";
  const options = {
    body: payload.body || "",
    // Nota iOS Safari (docs/PLAN.md): le push funzionano solo da iOS 16.4+ e
    // solo con la PWA installata da Home — nessuna gestione speciale
    // necessaria qui, è una limitazione della piattaforma, non del codice.
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          if (event.request.url.startsWith(self.location.origin)) {
            cache.put(event.request, copy).catch(() => {});
          }
        });
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? Response.error())),
  );
});
