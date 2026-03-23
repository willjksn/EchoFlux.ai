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

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// ------------------------------------------------------------
// Initialize Firebase
// ------------------------------------------------------------
const app = initializeApp(firebaseConfig);

// ------------------------------------------------------------
// Auth — **critical**
// - Use local persistence
// - Wait for onAuthStateChanged to refresh token before functions run
// ------------------------------------------------------------
export const auth = getAuth(app);
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
// Firestore: long-polling can avoid `Listen/channel` 400 errors
// in certain networks/browsers (proxies, strict privacy settings, etc.).
const FORCE_FIRESTORE_LONG_POLLING =
  import.meta.env.VITE_FIRESTORE_FORCE_LONG_POLLING === "true";
export const db = initializeFirestore(app, {
  ...(FORCE_FIRESTORE_LONG_POLLING ? { experimentalForceLongPolling: true } : {}),
  useFetchStreams: false,
});
export const storage = getStorage(app);

// ------------------------------------------------------------
// Cloud Functions — *must* be initialized after app & auth
// ------------------------------------------------------------
export const functions = getFunctions(app, "us-central1");

// ------------------------------------------------------------
// Analytics (Browser Only)
// ------------------------------------------------------------
const analyticsMeasurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;
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


