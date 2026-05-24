import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { withErrorHandling } from "./_errorHandler.js";

type Body = {
  action?: "register" | "unregister";
  token?: string;
};

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rlOk = await enforceRateLimit({
    req,
    res,
    keyPrefix: "fanPushToken",
    limit: 30,
    windowMs: 60_000,
    identifier: decoded.uid,
  });
  if (!rlOk) return;

  const body = (req.body || {}) as Body;
  const action = body.action === "unregister" ? "unregister" : "register";
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token || token.length < 20) {
    res.status(400).json({ error: "Valid FCM token required" });
    return;
  }

  const db = getAdminDb();
  const userRef = db.collection("users").doc(decoded.uid);

  if (action === "unregister") {
    await userRef.set(
      {
        fcmTokens: FieldValue.arrayRemove(token),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    res.status(200).json({ ok: true, action });
    return;
  }

  await userRef.set(
    {
      fcmTokens: FieldValue.arrayUnion(token),
      pushNotificationsEnabled: true,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  res.status(200).json({ ok: true, action: "register" });
}

export default withErrorHandling(handler);
