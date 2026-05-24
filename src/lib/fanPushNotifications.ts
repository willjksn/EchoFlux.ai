import { getMessaging, getToken, deleteToken, isSupported, onMessage, type Messaging } from "firebase/messaging";
import app, { auth } from "../../firebaseConfig";
import { resolveApiUrl } from "./resolveApiUrl";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
const PUSH_DECLINED_KEY = "echoflux:push-declined";
const PUSH_REGISTERED_KEY = "echoflux:push-token-registered";
const PUSH_TOKEN_KEY = "echoflux:push-fcm-token";
export const PUSH_STATE_EVENT = "echoflux:push-state-changed";
const SW_READY_MS = 25_000;
const FCM_TOKEN_MS = 25_000;
const AUTH_TOKEN_MS = 15_000;
const API_REGISTER_MS = 15_000;
const SW_PING_MS = 12_000;

function cleanEnv(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/^["']|["']$/g, "");
  return trimmed || undefined;
}

function getFirebaseMessagingConfigFromEnv(): Record<string, string> | null {
  const config = {
    apiKey: cleanEnv(import.meta.env.VITE_FIREBASE_API_KEY),
    authDomain: cleanEnv(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: cleanEnv(import.meta.env.VITE_FIREBASE_PROJECT_ID),
    storageBucket: cleanEnv(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: cleanEnv(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    appId: cleanEnv(import.meta.env.VITE_FIREBASE_APP_ID),
  };
  if (!config.apiKey || !config.projectId || !config.messagingSenderId || !config.appId) {
    return null;
  }
  return config as Record<string, string>;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    }),
  ]);
}

export async function isWebPushSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

async function assertPushConfigAvailable(): Promise<void> {
  if (!VAPID_KEY?.trim()) {
    throw new Error("Push is not configured (missing VITE_FIREBASE_VAPID_KEY)");
  }
  try {
    const res = await withTimeout(
      fetch("/firebase-messaging-config.json", { cache: "no-store" }),
      8000,
      "FCM config check",
    );
    if (!res.ok) {
      throw new Error("Push service worker config is missing on this site — redeploy with VITE_FIREBASE_* set");
    }
    const cfg = (await res.json()) as { apiKey?: string; projectId?: string };
    if (!cfg?.apiKey || !cfg?.projectId) {
      throw new Error("Push service worker config is incomplete — check VITE_FIREBASE_* on the deployment");
    }
  } catch (e) {
    if (e instanceof Error && /timed out|missing|incomplete/i.test(e.message)) {
      throw e;
    }
    throw new Error("Could not verify push configuration — try again or redeploy the app");
  }
}

async function registerTokenWithServer(token: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const idToken = await withTimeout(user.getIdToken(), AUTH_TOKEN_MS, "Auth token");
  const res = await withTimeout(
    fetch(resolveApiUrl("/api/fanPushToken"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ action: "register", token }),
    }),
    API_REGISTER_MS,
    "Push token registration",
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Failed to register push token (${res.status})`);
  }
  localStorage.setItem(PUSH_REGISTERED_KEY, token.slice(0, 24));
  localStorage.setItem(PUSH_TOKEN_KEY, token);
  emitPushStateChanged();
}

function emitPushStateChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PUSH_STATE_EVENT));
}

async function assertServiceWorkerScriptAvailable(): Promise<void> {
  const res = await withTimeout(
    fetch("/firebase-messaging-sw.js", { cache: "no-store" }),
    8000,
    "Service worker script check",
  );
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok || contentType.includes("text/html")) {
    throw new Error(
      "Push service worker is not available on this site yet. Wait for the latest deploy to finish, then hard-refresh (Ctrl+Shift+R) and try again.",
    );
  }
}

async function primeMessagingServiceWorker(registration: ServiceWorkerRegistration): Promise<void> {
  const worker = registration.active || registration.waiting || registration.installing;
  if (!worker) {
    throw new Error("Service worker did not activate");
  }

  const config = getFirebaseMessagingConfigFromEnv();
  if (config) {
    worker.postMessage({ type: "INIT_FCM_CONFIG", config });
  }

  await withTimeout(
    new Promise<void>((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        const data = event.data as { type?: string; ok?: boolean; error?: string } | null;
        if (!data || data.type !== "PONG_FCM") return;
        navigator.serviceWorker.removeEventListener("message", onMessage);
        if (data.ok) {
          resolve();
        } else {
          reject(new Error(data.error || "FCM service worker failed to initialize"));
        }
      };
      navigator.serviceWorker.addEventListener("message", onMessage);
      worker.postMessage({ type: "PING_FCM" });
    }),
    SW_PING_MS,
    "FCM service worker init",
  );
}

async function getMessagingServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  await assertServiceWorkerScriptAvailable();
  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  try {
    await registration.update();
  } catch {
    /* ignore — offline or throttled */
  }
  const ready = await withTimeout(navigator.serviceWorker.ready, SW_READY_MS, "Service worker ready");
  await primeMessagingServiceWorker(ready);
  return ready;
}

/**
 * Request browser permission and register FCM token for the signed-in user.
 * Throws on configuration or network errors so callers can show actionable messages.
 */
export async function registerMemberWebPush(options?: { force?: boolean }): Promise<string | null> {
  if (!(await isWebPushSupported())) {
    throw new Error("Web push is not supported in this browser");
  }
  await assertPushConfigAvailable();
  if (!options?.force && localStorage.getItem(PUSH_DECLINED_KEY) === "1") {
    return null;
  }
  if (!auth.currentUser) {
    throw new Error("Sign in to enable push notifications");
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    if (permission === "denied") localStorage.setItem(PUSH_DECLINED_KEY, "1");
    return null;
  }

  let registration: ServiceWorkerRegistration;
  try {
    registration = await getMessagingServiceWorkerRegistration();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Could not start notification service worker: ${msg}`);
  }

  let messaging: Messaging;
  try {
    messaging = getMessaging(app);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Firebase messaging unavailable: ${msg}`);
  }

  let token: string | undefined;
  try {
    token = await withTimeout(
      getToken(messaging, {
        vapidKey: VAPID_KEY!.trim(),
        serviceWorkerRegistration: registration,
      }),
      FCM_TOKEN_MS,
      "FCM token request",
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/vapid|401|403|permission/i.test(msg)) {
      throw new Error(`Invalid push key or permission issue: ${msg}`);
    }
    if (/service worker|push service|not supported|failed-service-worker|text\/html/i.test(msg)) {
      throw new Error(
        msg.includes("not available on this site")
          ? msg
          : "Notification service worker failed to start. Wait for deploy to finish, hard-refresh (Ctrl+Shift+R), and try again.",
      );
    }
    throw new Error(`Could not get push token: ${msg}`);
  }

  if (!token) {
    throw new Error("FCM returned no token — check VAPID key and service worker config");
  }

  await registerTokenWithServer(token);
  return token;
}

/** Turn off browser push for this account on the server and clear local registration state. */
export async function disableWebPush(): Promise<void> {
  const storedToken = localStorage.getItem(PUSH_TOKEN_KEY)?.trim() || "";
  const user = auth.currentUser;
  if (user) {
    const idToken = await withTimeout(user.getIdToken(), AUTH_TOKEN_MS, "Auth token");
    const res = await withTimeout(
      fetch(resolveApiUrl("/api/fanPushToken"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: "disable",
          ...(storedToken ? { token: storedToken } : {}),
        }),
      }),
      API_REGISTER_MS,
      "Push disable",
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || `Failed to disable push (${res.status})`);
    }
  }

  if (VAPID_KEY?.trim()) {
    try {
      const messaging = getMessaging(app);
      await deleteToken(messaging);
    } catch {
      /* ignore — token may already be gone */
    }
  }

  localStorage.removeItem(PUSH_REGISTERED_KEY);
  localStorage.removeItem(PUSH_TOKEN_KEY);
  localStorage.removeItem(PUSH_DECLINED_KEY);
  emitPushStateChanged();
}

export function isBrowserPushEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (!hasRegisteredPushToken()) return false;
  if (typeof Notification !== "undefined" && Notification.permission !== "granted") return false;
  return true;
}

/** Foreground push — show a native notification when the tab is open. */
export function listenForForegroundPush(onPayload?: (title: string, body: string) => void): (() => void) | null {
  if (typeof window === "undefined" || !VAPID_KEY?.trim()) return null;
  let messaging: Messaging;
  try {
    messaging = getMessaging(app);
  } catch {
    return null;
  }
  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title || payload.data?.title || "EchoFlux";
    const body = payload.notification?.body || payload.data?.body || "";
    const url = typeof payload.data?.url === "string" ? payload.data.url.trim() : "";
    onPayload?.(title, body);
    if (Notification.permission === "granted" && document.visibilityState === "visible") {
      try {
        const n = new Notification(title, { body, icon: "/favicon.ico", data: { url } });
        n.onclick = () => {
          n.close();
          window.focus();
          if (url) window.location.assign(url);
        };
      } catch {
        /* ignore */
      }
    }
  });
}

export function hasRegisteredPushToken(): boolean {
  return !!localStorage.getItem(PUSH_REGISTERED_KEY);
}

export function clearPushDeclined(): void {
  localStorage.removeItem(PUSH_DECLINED_KEY);
}

/** Same registration path for creators, members, and admins. */
export const registerWebPush = registerMemberWebPush;
