import admin from "firebase-admin";

let app: admin.app.App | null = null;

export function getAdminApp(): admin.app.App {
  if (app) return app;

  // Fix for ESM: check existing apps
  const existingApps = admin.apps?.length ? admin.apps : [];

  if (existingApps.length > 0) {
    app = existingApps[0];
    return app;
  }

  // Load base64 key
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64;
  if (!base64) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 env var for Firebase Admin.");
  }

  let serviceAccountJson: string;
  try {
    serviceAccountJson = Buffer.from(base64, "base64").toString("utf8");
  } catch (e) {
    console.error("Base64 decode error:", e);
    throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 value.");
  }

  let serviceAccount: admin.ServiceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch (e) {
    console.error("JSON parse error:", e);
    throw new Error("Decoded service account JSON is invalid.");
  }

  // Initialize Admin SDK
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return app;
}

export async function verifyIdToken(authHeader?: string) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  const token = authHeader.split(" ")[1];
  const app = getAdminApp();

  return app.auth().verifyIdToken(token);
}

export function getAdminDb() {
  return getAdminApp().firestore();
}

// Lazy export for backward compatibility - use getAdminDb() instead
// This Proxy export can cause issues in serverless environments
// Use getAdminDb() function instead
export const adminDb = {
  collection: (path: string) => getAdminDb().collection(path),
  doc: (path: string) => getAdminDb().doc(path),
  batch: () => getAdminDb().batch(),
  runTransaction: (updateFunction: any) => getAdminDb().runTransaction(updateFunction),
  FieldPath: admin.firestore.FieldPath,
  FieldValue: admin.firestore.FieldValue,
  Timestamp: admin.firestore.Timestamp,
  GeoPoint: admin.firestore.GeoPoint,
} as admin.firestore.Firestore;