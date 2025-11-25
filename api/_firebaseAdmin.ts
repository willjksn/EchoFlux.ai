// api/_firebaseAdmin.ts
import admin from "firebase-admin";

let app: admin.app.App | null = null;

export function getAdminApp(): admin.app.App {
  if (app) return app;

  if (admin.apps.length) {
    app = admin.app();
    return app;
  }

  const serviceAccountJson = process.env.SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    throw new Error("SERVICE_ACCOUNT env var is missing.");
  }

  const serviceAccount = JSON.parse(serviceAccountJson);

  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
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
