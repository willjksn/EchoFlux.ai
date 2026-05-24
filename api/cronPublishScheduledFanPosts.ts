import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireCronAuth } from "./_cronAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { hasPlatformAdminAccess } from "./_platformAdminAccess.js";
import { verifyAuth } from "./verifyAuth.js";
import { publishDueScheduledFanPosts } from "./_publishScheduledFanPostsCore.js";

/**
 * Publishes due Fan Hub / My Page posts (`creators/{uid}/fanPosts` with status `scheduled`).
 * Vercel Cron: every 5 minutes (see vercel.json).
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

  try {
    const db = getAdminDb();
    const result = await publishDueScheduledFanPosts(db);
    res.status(200).json({
      ok: true,
      message: "Scheduled My Page posts processed",
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("cronPublishScheduledFanPosts:", e);
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: "Failed to publish scheduled fan posts", message });
  }
}
