import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Liveness probe for uptime monitors (no auth, no secrets).
 * Use GET /api/health — Cache-Control: no-store.
 */
export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.status(200).json({
    ok: true,
    service: "echoflux-api",
    ts: new Date().toISOString(),
  });
}
