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

// Force token refresh on page load — prevents 401 from Cloud Functions
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      await user.getIdToken(true); // refresh token
      console.log("🔥 Firebase Auth Ready — Token refreshed");
    } catch (e) {
      console.error("Failed refreshing token:", e);
    }
  }
});

// ------------------------------------------------------------
// Firestore & Storage
// ------------------------------------------------------------
// Firestore: enable long-polling auto-detect to avoid `Listen/channel` 400 errors
// in certain networks/browsers (proxies, strict privacy settings, etc.).
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  // Some environments (enterprise networks, privacy tools) still fail auto-detect.
  // For reliability, force long-polling and avoid fetch streaming.
  experimentalForceLongPolling: true,
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
isSupported().then((supported) => {
  if (supported) getAnalytics(app);
});

export default app;


