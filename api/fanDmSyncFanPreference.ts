import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { isFanBlocked } from "./_fanDmHelpers.js";
import { upsertFanHubFanPreferenceFromMember } from "./_syncFanHubFanPreference.js";

/**
 * Creator-only: ensure `users/{creatorId}/onlyfans_fan_preferences/{fanId}` exists
 * so the Fans tab can open the same card as this DM thread (uid-aligned).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const fanId = typeof body.fanId === "string" ? body.fanId.trim() : "";
  if (!fanId) {
    return res.status(400).json({ error: "fanId is required" });
  }

  const creatorId = decoded.uid;

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    if (await isFanBlocked(db, creatorId, fanId)) {
      return res.status(403).json({ error: "This member is blocked" });
    }

    const now = new Date().toISOString();
    await upsertFanHubFanPreferenceFromMember(db, creatorId, fanId, now, "dm_open_fan_card");

    return res.status(200).json({ ok: true, creatorId, fanId });
  } catch (e: unknown) {
    console.error("fanDmSyncFanPreference error:", e);
    return res.status(500).json({
      error: "Failed to sync fan card",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
}
