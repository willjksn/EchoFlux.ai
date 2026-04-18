import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyBrowserApiCors } from "./_browserApiCors.js";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { syncLiveStreamTicketOrdersForStream } from "./_syncLiveStreamTicketOrders.js";

/**
 * POST JSON: { streamId } — creator-only; re-syncs live stream ticket orders from the stream doc
 * (used after client-side Firestore fallbacks when /api/liveStreams is unavailable).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyBrowserApiCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}) as {
    streamId?: string;
  };
  const streamId = typeof body.streamId === "string" ? body.streamId.trim() : "";
  if (!streamId) {
    return res.status(400).json({ error: "streamId is required" });
  }

  const db = getAdminDb();
  if (!db) return res.status(500).json({ error: "Database unavailable" });

  try {
    await syncLiveStreamTicketOrdersForStream(db, decoded.uid, streamId);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("syncLiveStreamTicketOrders:", e);
    return res.status(500).json({ error: "Sync failed" });
  }
}
