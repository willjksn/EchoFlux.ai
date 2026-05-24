import { getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage, type Messaging } from "firebase/messaging";
import { auth } from "../../firebaseConfig";
import { resolveApiUrl } from "./resolveApiUrl";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
const PUSH_DECLINED_KEY = "echoflux:push-declined";
const PUSH_REGISTERED_KEY = "echoflux:push-token-registered";

function messagingApp() {
  const existing = getApps();
  if (existing.length > 0) return existing[0];
  return initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });
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
  if (!user) return;
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
    throw new Error(data.error || "Failed to register push token");
  }
  localStorage.setItem(PUSH_REGISTERED_KEY, token.slice(0, 24));
}

/**
 * Request browser permission and register FCM token for the signed-in member.
 * Returns null when unsupported, denied, or not configured.
 */
export async function registerMemberWebPush(options?: { force?: boolean }): Promise<string | null> {
  if (!(await isWebPushSupported())) return null;
  if (!VAPID_KEY?.trim()) {
    console.warn("[push] VITE_FIREBASE_VAPID_KEY is not set");
    return null;
  }
  if (!options?.force && localStorage.getItem(PUSH_DECLINED_KEY) === "1") {
    return null;
  }
  if (!auth.currentUser) return null;

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    if (permission === "denied") localStorage.setItem(PUSH_DECLINED_KEY, "1");
    return null;
  }

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  await navigator.serviceWorker.ready;

  const messaging: Messaging = getMessaging(messagingApp());
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY.trim(),
    serviceWorkerRegistration: registration,
  });
  if (!token) return null;

  await registerTokenWithServer(token);
  return token;
}

/** Foreground push — show a native notification when the tab is open. */
export function listenForForegroundPush(onPayload?: (title: string, body: string) => void): (() => void) | null {
  if (typeof window === "undefined" || !VAPID_KEY?.trim()) return null;
  let messaging: Messaging;
  try {
    messaging = getMessaging(messagingApp());
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
