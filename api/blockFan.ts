import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { CREATOR_BLOCKS } from "./_fanDmHelpers.js";

/** Creator blocks a fan (ban: fan cannot message or purchase). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const fanId = body.fanId as string;
  if (!fanId) {
    return res.status(400).json({ error: "fanId is required" });
  }

  const creatorId = decoded.uid;

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const blockRef = db
      .collection(CREATOR_BLOCKS)
      .doc(creatorId)
      .collection("blocked")
      .doc(fanId);
    const now = new Date().toISOString();
    await blockRef.set({ createdAt: now }, { merge: true });

    return res.status(200).json({ success: true });
  } catch (e: unknown) {
    console.error("blockFan error:", e);
    return res.status(500).json({
      error: "Failed to block fan",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
}
