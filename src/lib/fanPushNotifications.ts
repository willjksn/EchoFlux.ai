import { getMessaging, getToken, isSupported, onMessage, type Messaging } from "firebase/messaging";
import app, { auth } from "../../firebaseConfig";
import { resolveApiUrl } from "./resolveApiUrl";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
const PUSH_DECLINED_KEY = "echoflux:push-declined";
const PUSH_REGISTERED_KEY = "echoflux:push-token-registered";
const SW_READY_MS = 20_000;
const FCM_TOKEN_MS = 20_000;

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

async function registerTokenWithServer(token: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const idToken = await user.getIdToken();
  const res = await fetch(resolveApiUrl("/api/fanPushToken"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ action: "register", token }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Failed to register push token (${res.status})`);
  }
  localStorage.setItem(PUSH_REGISTERED_KEY, token.slice(0, 24));
}

async function waitForActiveServiceWorker(registration: ServiceWorkerRegistration): Promise<ServiceWorkerRegistration> {
  if (registration.active) return registration;
  await withTimeout(
    new Promise<ServiceWorkerRegistration>((resolve, reject) => {
      const sw = registration.installing || registration.waiting;
      if (!sw) {
        reject(new Error("Service worker did not install"));
        return;
      }
      const onStateChange = () => {
        if (sw.state === "activated") {
          sw.removeEventListener("statechange", onStateChange);
          resolve(registration);
        } else if (sw.state === "redundant") {
          sw.removeEventListener("statechange", onStateChange);
          reject(new Error("Service worker became redundant"));
        }
      };
      sw.addEventListener("statechange", onStateChange);
      if (sw.state === "activated") {
        sw.removeEventListener("statechange", onStateChange);
        resolve(registration);
      }
    }),
    SW_READY_MS,
    "Service worker activation",
  );
  return registration;
}

/**
 * Request browser permission and register FCM token for the signed-in user.
 * Throws on configuration or network errors so callers can show actionable messages.
 */
export async function registerMemberWebPush(options?: { force?: boolean }): Promise<string | null> {
  if (!(await isWebPushSupported())) {
    throw new Error("Web push is not supported in this browser");
  }
  if (!VAPID_KEY?.trim()) {
    throw new Error("Push is not configured (missing VITE_FIREBASE_VAPID_KEY)");
  }
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
    registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    registration = await waitForActiveServiceWorker(registration);
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
        vapidKey: VAPID_KEY.trim(),
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
    throw new Error(`Could not get push token: ${msg}`);
  }

  if (!token) {
    throw new Error("FCM returned no token — check VAPID key and service worker config");
  }

  await registerTokenWithServer(token);
  return token;
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
    const title = payload.notification?.title || "EchoFlux";
    const body = payload.notification?.body || "";
    onPayload?.(title, body);
    if (Notification.permission === "granted" && document.visibilityState === "visible") {
      try {
        new Notification(title, { body, icon: "/favicon.ico" });
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
