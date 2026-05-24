/* Firebase Cloud Messaging service worker — background push for Fan Hub members. */
importScripts("https://www.gstatic.com/firebasejs/12.12.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.12.1/firebase-messaging-compat.js");

/*__FIREBASE_MESSAGING_CONFIG__*/
const FIREBASE_MESSAGING_CONFIG = null;

let messagingReady = false;
let configLoadPromise = null;

function configFromInline() {
  if (FIREBASE_MESSAGING_CONFIG && typeof FIREBASE_MESSAGING_CONFIG === "object") {
    return FIREBASE_MESSAGING_CONFIG;
  }
  return null;
}

async function loadFirebaseConfig() {
  const inline = configFromInline();
  if (inline) return inline;

  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, 5000);

  try {
    const res = await fetch("/firebase-messaging-config.json", {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && typeof data === "object" && data.apiKey && data.projectId) {
      return data;
    }
    return null;
  } catch (err) {
    console.warn("[FCM SW] config fetch failed:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureMessaging() {
  if (messagingReady) return;
  if (!configLoadPromise) {
    configLoadPromise = loadFirebaseConfig();
  }
  const config = await configLoadPromise;
  if (!config) {
    throw new Error("FCM service worker config missing — rebuild with VITE_FIREBASE_* env vars");
  }
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

self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(
    ensureMessaging().catch(function (err) {
      console.error("[FCM SW] install init failed:", err);
    }),
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      ensureMessaging().catch(function (err) {
        console.error("[FCM SW] activate init failed:", err);
      }),
    ]),
  );
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
