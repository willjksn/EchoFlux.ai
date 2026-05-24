import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { withErrorHandling } from "./_errorHandler.js";
import { applyBrowserApiCors } from "./_browserApiCors.js";

type Body = {
  action?: "register" | "unregister" | "disable";
  token?: string;
};

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (applyBrowserApiCors(req, res)) return;

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const db = getAdminDb();
  const userRef = db.collection("users").doc(decoded.uid);

  if (req.method === "GET") {
    const snap = await userRef.get();
    const data = snap.data() as { fcmTokens?: unknown; pushNotificationsEnabled?: boolean } | undefined;
    const tokens = Array.isArray(data?.fcmTokens)
      ? (data!.fcmTokens as string[]).filter((t) => typeof t === "string" && t.trim())
      : [];
    res.status(200).json({
      ok: true,
      pushNotificationsEnabled: data?.pushNotificationsEnabled !== false,
      deviceCount: tokens.length,
    });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
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
  const actionRaw = body.action === "unregister" ? "unregister" : body.action === "disable" ? "disable" : "register";
  const token = typeof body.token === "string" ? body.token.trim() : "";

  if (actionRaw === "disable") {
    const updates: Record<string, unknown> = {
      pushNotificationsEnabled: false,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (token) {
      updates.fcmTokens = FieldValue.arrayRemove(token);
    } else {
      updates.fcmTokens = [];
    }
    await userRef.set(updates, { merge: true });
    res.status(200).json({ ok: true, action: "disable" });
    return;
  }

  if (!token || token.length < 20) {
    res.status(400).json({ error: "Valid FCM token required" });
    return;
  }

  const action = actionRaw;

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
