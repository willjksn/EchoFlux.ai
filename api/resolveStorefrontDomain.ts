import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { enforceRateLimit } from "./_rateLimit.js";

/**
 * GET ?host=stormijxo.com
 * Resolves `creatorDomains/{normalizedHost}` → public handle (and optional creatorId).
 * Used when the fan storefront loads on a custom domain root (no /{handle} in path).
 */
function normalizeHost(input: string): string {
  try {
    return decodeURIComponent(input).trim().toLowerCase().replace(/^www\./, "");
  } catch {
    return input.trim().toLowerCase().replace(/^www\./, "");
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    (req.headers["x-real-ip"] as string | undefined) ||
    "anonymous";

  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "resolveStorefrontDomain",
    limit: 120,
    windowMs: 60 * 1000,
    identifier: ip,
  });
  if (!ok) return;

  const hostParam = typeof req.query.host === "string" ? req.query.host : "";
  const host = normalizeHost(hostParam);
  if (!host || host.length > 253) {
    res.status(400).json({ error: "host is required" });
    return;
  }

  try {
    const db = getAdminDb();
    if (!db) {
      res.status(500).json({ error: "Database unavailable" });
      return;
    }

    const snap = await db.collection("creatorDomains").doc(host).get();
    if (!snap.exists) {
      res.status(404).json({ error: "Domain not mapped" });
      return;
    }

    const data = snap.data() as { handle?: string; creatorId?: string };
    const handle = typeof data.handle === "string" ? data.handle.trim().toLowerCase() : "";
    if (!handle) {
      res.status(500).json({ error: "Invalid mapping" });
      return;
    }

    const creatorId =
      typeof data.creatorId === "string" && data.creatorId.trim() ? data.creatorId.trim() : undefined;
    res.status(200).json(creatorId ? { handle, creatorId } : { handle });
  } catch (e) {
    console.error("resolveStorefrontDomain", e);
    res.status(500).json({ error: "Server error" });
  }
}
