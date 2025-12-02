// /api/_auth.ts
import { VercelRequest } from "@vercel/node";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)),
  });
}

export async function verifyAuth(req: VercelRequest) {
  const header = req.headers.authorization;
  if (!header) return null;

  const token = header.replace("Bearer ", "").trim();
  try {
    return await admin.auth().verifyIdToken(token);
  } catch {
    return null;
  }
}
