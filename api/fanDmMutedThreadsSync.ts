import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { syncCreatorDmMutedMirrors } from "./_fanDmMutedMirror.js";

/**
 * Creator-only: sync users/{uid}/dm_muted_threads from fanDmThreads.creatorInboxMuted
 * so message badges / bell can filter without reading fanDmThreads from the client.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await syncCreatorDmMutedMirrors(decoded.uid);
    return res.status(200).json({ ok: true });
  } catch (e: unknown) {
    console.error("fanDmMutedThreadsSync error:", e);
    return res.status(500).json({
      error: "Failed to sync muted threads",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
}
