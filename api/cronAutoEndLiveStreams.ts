import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireCronAuth } from "./_cronAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { hasPlatformAdminAccess } from "./_platformAdminAccess.js";
import { verifyAuth } from "./verifyAuth.js";
import { endLiveStreamBroadcast, liveStreamEligibleForAutoEnd } from "./_liveStreamEndCore.js";
import { syncLiveStreamTicketOrdersForStream } from "./_syncLiveStreamTicketOrders.js";

/**
 * Auto-ends Fan Hub broadcasts when the host left (or stopped heartbeating) and did not tap End stream.
 * Grace period: 5 minutes after host leave / idle (see LIVE_STREAM_HOST_IDLE_END_MS).
 * Vercel Cron: every 1 minute.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const isCronAuth = requireCronAuth(req);
  let isAdminAuth = false;
  if (!isCronAuth) {
    const user = await verifyAuth(req);
    if (user) {
      const db = getAdminDb();
      const userDoc = await db.collection("users").doc(user.uid).get();
      if (hasPlatformAdminAccess(userDoc.data() as Record<string, unknown> | undefined)) {
        isAdminAuth = true;
      }
    }
  }
  if (!isCronAuth && !isAdminAuth) {
    res.status(401).json({ error: "Unauthorized. Use CRON_SECRET or Admin auth." });
    return;
  }

  const db = getAdminDb();
  const ended: Array<{ creatorId: string; streamId: string; participantMinutes?: number }> = [];
  const errors: string[] = [];

  try {
    const snap = await db.collectionGroup("liveStreams").where("status", "==", "live").limit(200).get();

    for (const doc of snap.docs) {
      const pathMatch = /^creators\/([^/]+)\/liveStreams\/([^/]+)$/.exec(doc.ref.path);
      if (!pathMatch) continue;
      const creatorId = pathMatch[1];
      const streamId = pathMatch[2];
      const data = doc.data() as Record<string, unknown>;

      if (!liveStreamEligibleForAutoEnd(data)) continue;

      const result = await endLiveStreamBroadcast(db, creatorId, streamId, { autoEnded: true });
      if (!result.ok) {
        errors.push(`${creatorId}/${streamId}: ${result.error}`);
        continue;
      }
      try {
        await syncLiveStreamTicketOrdersForStream(db, creatorId, streamId);
      } catch (e) {
        console.warn("cronAutoEndLiveStreams: syncLiveStreamTicketOrdersForStream", e);
      }
      ended.push({ creatorId, streamId, participantMinutes: result.participantMinutes });
    }

    res.status(200).json({
      ok: true,
      scanned: snap.size,
      autoEnded: ended.length,
      ended,
      errors: errors.length ? errors : undefined,
    });
  } catch (e) {
    console.error("cronAutoEndLiveStreams:", e);
    res.status(500).json({ error: "Failed to auto-end live streams" });
  }
}
