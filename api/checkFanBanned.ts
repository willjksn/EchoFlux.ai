import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { isFanBlocked } from "./_fanDmHelpers.js";

/** GET ?creatorId= — returns { banned: true } if current user (fan) is blocked by creator. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(200).json({ banned: false });
  }

  const creatorId = req.query.creatorId as string;
  if (!creatorId) {
    return res.status(400).json({ error: "creatorId is required" });
  }

  const fanId = decoded.uid;
  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });
    const banned = await isFanBlocked(db, creatorId, fanId);
    return res.status(200).json({ banned });
  } catch (e: unknown) {
    console.error("checkFanBanned error:", e);
    return res.status(500).json({ error: "Failed to check" });
  }
}
