/* Firebase Cloud Messaging service worker — background push for Fan Hub members. */
importScripts("https://www.gstatic.com/firebasejs/12.12.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.12.1/firebase-messaging-compat.js");

let messagingReady = false;

async function ensureMessaging() {
  if (messagingReady) return;
  const res = await fetch("/firebase-messaging-config.json");
  if (!res.ok) throw new Error("Missing firebase-messaging-config.json");
  const config = await res.json();
  if (!firebase.apps.length) {
    firebase.initializeApp(config);
  }
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage(function (payload) {
    const title = payload.notification?.title || payload.data?.title || "EchoFlux";
    const body = payload.notification?.body || payload.data?.body || "";
    const link = payload.fcmOptions?.link || payload.data?.url;
    self.registration.showNotification(title, {
      body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      data: { ...payload.data, url: link },
    });
  });
  messagingReady = true;
}

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(ensureMessaging().then(function () { return self.clients.claim(); }));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = event.notification?.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});

ensureMessaging().catch(function (err) {
  console.error("[FCM SW] init failed:", err);
});
