// Service worker minimo, só pra push notification + instalabilidade do PWA.
// Sem cache/offline (Workbox) de propósito — não é necessário pro caso de uso
// (CRM sempre precisa de rede) e simplifica bastante.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "CRM Hinode", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Nova mensagem";
  const options = {
    body: data.body || "",
    icon: "/backend/pwa-192x192.png",
    badge: "/backend/pwa-192x192.png",
    tag: data.tag || "crm-oka",
    renotify: true,
    data: { url: data.url || "/conversas" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/conversas";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (clients.length > 0 && "focus" in clients[0]) {
        clients[0].navigate(url);
        return clients[0].focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
