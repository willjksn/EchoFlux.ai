/// <reference types="vite/client" />

import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence,
} from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFunctions } from "firebase/functions";

function cleanEnv(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/^["']|["']$/g, "");
  return trimmed || undefined;
}

const firebaseConfig = {
  apiKey: cleanEnv(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: cleanEnv(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  databaseURL: cleanEnv(import.meta.env.VITE_FIREBASE_DATABASE_URL),
  projectId: cleanEnv(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: cleanEnv(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: cleanEnv(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: cleanEnv(import.meta.env.VITE_FIREBASE_APP_ID),
  measurementId: cleanEnv(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID),
};

// Missing keys: index.tsx only loads the main app when VITE_FIREBASE_API_KEY is non-empty,
// so this module is not imported in that case. If this file is imported without a key (e.g. tests),
// initializeApp would fail — fail loudly with a clear message.
if (!firebaseConfig.apiKey) {
  throw new Error(
    "[Firebase] VITE_FIREBASE_API_KEY is missing. Add Web SDK keys to .env.local. See ENV_SETUP_GUIDE.md.",
  );
}

function logInvalidApiKeyHint() {
  if (!import.meta.env.DEV) return;
  console.error(
    "[Firebase] auth/invalid-api-key usually means VITE_FIREBASE_API_KEY does not match your Firebase project. " +
      "Copy the full config from Firebase Console → Project settings → General → Your apps (Web). " +
      "All VITE_FIREBASE_* values must be from the same Web app. If the key has HTTP referrer restrictions, allow http://localhost:3000/* — see docs/LOCAL_DEV.md",
  );
}

// ------------------------------------------------------------
// Initialize Firebase
// ------------------------------------------------------------
let app: ReturnType<typeof initializeApp>;
try {
  app = initializeApp(firebaseConfig);
} catch (e: unknown) {
  const code = e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code) : "";
  if (code.includes("invalid-api-key")) logInvalidApiKeyHint();
  throw e;
}

// ------------------------------------------------------------
// Auth — **critical**
// - Use local persistence
// - Wait for onAuthStateChanged to refresh token before functions run
// ------------------------------------------------------------
let auth: ReturnType<typeof getAuth>;
try {
  auth = getAuth(app);
} catch (e: unknown) {
  const code = e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code) : "";
  if (code.includes("invalid-api-key")) logInvalidApiKeyHint();
  throw e;
}
export { auth };
setPersistence(auth, browserLocalPersistence);

// Warm the ID token cache on sign-in. Do **not** use getIdToken(true) here — it hits
// securetoken.googleapis.com on every callback and can exhaust Firebase Auth quotas
// (auth/quota-exceeded), especially with React dev + many components also forcing refresh.
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      await user.getIdToken(); // use cached token; SDK refreshes when expired
      if (import.meta.env.DEV) {
        console.log("🔥 Firebase Auth ready (ID token cached)");
      }
    } catch (e) {
      console.error("Failed to get ID token:", e);
    }
  }
});

// ------------------------------------------------------------
// Firestore & Storage
// ------------------------------------------------------------
// Firestore transport:
// - WebChannel `Listen/channel` can 400 in localhost/Electron/proxied environments.
// - In dev we force long-polling and also enable auto-detect fallback.
// - Override with VITE_FIRESTORE_FORCE_LONG_POLLING=false only when debugging transport.
const envLongPoll = String(import.meta.env.VITE_FIRESTORE_FORCE_LONG_POLLING || "").toLowerCase();
const forceLongPolling =
  envLongPoll === "true" ||
  (import.meta.env.DEV && envLongPoll !== "false");
export const db = initializeFirestore(app, {
  ...(forceLongPolling
    ? {
        experimentalForceLongPolling: true,
      }
    : {}),
});
export const storage = getStorage(app);

/** Configured default bucket id (for Storage URL checks). */
export const firebaseStorageBucket = firebaseConfig.storageBucket ?? "";

// ------------------------------------------------------------
// Cloud Functions — *must* be initialized after app & auth
// ------------------------------------------------------------
export const functions = getFunctions(app, "us-central1");

// ------------------------------------------------------------
// Analytics (Browser Only)
// ------------------------------------------------------------
const analyticsMeasurementId = cleanEnv(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID);
const analyticsDisabled = String(import.meta.env.VITE_DISABLE_ANALYTICS || '').toLowerCase() === 'true';

if (analyticsMeasurementId && !analyticsDisabled) {
  isSupported()
    .then((supported) => {
      if (supported) getAnalytics(app);
    })
    .catch((err) => {
      console.warn('Firebase Analytics initialization skipped:', err);
    });
} else {
  console.warn('Firebase Analytics disabled or measurement ID missing; skipping analytics init');
}

export default app;


