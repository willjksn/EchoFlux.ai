import admin from "firebase-admin";

let app: admin.app.App | null = null;

export function getAdminApp(): admin.app.App {
  if (app) return app;

  // Fix for ESM: check existing apps
  try {
    const existingApps = admin.apps && admin.apps.length > 0 ? admin.apps : [];

    if (existingApps.length > 0) {
      app = existingApps[0] as admin.app.App;
      if (app) return app;
    }
  } catch (e) {
    console.warn('Error checking existing apps:', e);
    // Continue to initialize new app
  }

  // Load base64 key (support multiple env names)
  const base64 =
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 ||
    process.env.FIREBASE_ADMIN_KEY || // common fallback name
    null;
  if (!base64) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 (or FIREBASE_ADMIN_KEY) env var for Firebase Admin.");
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
  try {
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    
    if (!app) {
      throw new Error("Failed to initialize Firebase Admin app");
    }
    
    return app;
  } catch (initError: any) {
    console.error("Firebase Admin initialization error:", initError);
    // If app already exists error, try to get it
    if (initError?.code === 'app/duplicate-app' || initError?.message?.includes('already exists')) {
      const existingApps = admin.apps;
      if (existingApps && existingApps.length > 0) {
        app = existingApps[0] as admin.app.App;
        return app;
      }
    }
    throw initError;
  }
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
  try {
    const adminApp = getAdminApp();
    if (!adminApp) {
      throw new Error("Firebase Admin app is not initialized");
    }
    const db = adminApp.firestore();
    if (!db) {
      throw new Error("Failed to get Firestore instance");
    }
    return db;
  } catch (error: any) {
    console.error("Error getting admin database:", error);
    throw error;
  }
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
} as unknown;