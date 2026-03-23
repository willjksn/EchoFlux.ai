import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { resolveFanPartyDisplayLabel } from "./_fanDmLabels.js";

/**
 * Creator-only: fan card for DM header (notes mirror OnlyFansFans → onlyfans_fan_preferences).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const creatorId = decoded.uid;
  const fanId = typeof req.query.fanId === "string" ? req.query.fanId.trim() : "";
  if (!fanId) {
    return res.status(400).json({ error: "fanId is required" });
  }

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const [label, userSnap, prefSnap, fanSubSnap] = await Promise.all([
      resolveFanPartyDisplayLabel(db, creatorId, fanId),
      db.collection("users").doc(fanId).get(),
      db.collection("users").doc(creatorId).collection("onlyfans_fan_preferences").doc(fanId).get(),
      db.collection("creators").doc(creatorId).collection("fans").doc(fanId).get(),
    ]);

    const u = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};
    const pref = prefSnap.exists ? (prefSnap.data() as Record<string, unknown>) : {};
    const fsub = fanSubSnap.exists ? (fanSubSnap.data() as Record<string, unknown>) : {};

    const notes =
      typeof pref.notes === "string"
        ? pref.notes
        : typeof fsub.notes === "string"
          ? (fsub.notes as string)
          : "";

    return res.status(200).json({
      fanId,
      displayLabel: label,
      email: typeof u.email === "string" ? u.email : undefined,
      username: typeof u.username === "string" ? u.username : undefined,
      name: typeof u.name === "string" ? u.name : undefined,
      notes,
      avatar: typeof u.avatar === "string" ? u.avatar : undefined,
    });
  } catch (e: unknown) {
    console.error("fanDmFanCard error:", e);
    return res.status(500).json({
      error: "Failed to load fan card",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
}
