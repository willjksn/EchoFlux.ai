import admin from "firebase-admin";

let app: admin.app.App | null = null;
/** Firestore rejects `undefined` in writes; settings() must run once before other Firestore use. */
let firestoreSettingsApplied = false;

function ensureFirestoreIgnoreUndefined(appInstance: admin.app.App) {
  if (firestoreSettingsApplied) return;
  try {
    appInstance.firestore().settings({ ignoreUndefinedProperties: true });
    firestoreSettingsApplied = true;
  } catch (e) {
    console.warn("Firestore settings(ignoreUndefinedProperties):", e);
  }
}

export function getAdminApp(): admin.app.App {
  if (app) {
    ensureFirestoreIgnoreUndefined(app);
    return app;
  }

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

  const base64 =
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 ||
    process.env.FIREBASE_ADMIN_KEY ||
    null;

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  const privateKey =
    typeof privateKeyRaw === "string" && privateKeyRaw.length > 0
      ? privateKeyRaw.replace(/\\n/g, "\n")
      : null;

  // Initialize Admin SDK (base64 JSON **or** PEM-style vars — match stripeWebhook / purchaseVideoMinutes)
  try {
    if (base64) {
      let serviceAccountJson: string;
      try {
        serviceAccountJson = Buffer.from(base64, "base64").toString("utf8");
      } catch (e) {
        console.error("Base64 decode error:", e);
        throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 value.");
      }
      let serviceAccount: admin.ServiceAccount;
      try {
        serviceAccount = JSON.parse(serviceAccountJson) as admin.ServiceAccount;
      } catch (e) {
        console.error("JSON parse error:", e);
        throw new Error("Decoded service account JSON is invalid.");
      }
      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else if (projectId && clientEmail && privateKey) {
      app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    } else {
      throw new Error(
        "Firebase Admin is not configured. Set either (1) FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 or FIREBASE_ADMIN_KEY, " +
          "or (2) FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (same as other API routes)."
      );
    }
    
    if (!app) {
      throw new Error("Failed to initialize Firebase Admin app");
    }

    ensureFirestoreIgnoreUndefined(app);
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