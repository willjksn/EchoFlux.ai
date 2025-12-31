import type { VercelRequest } from "@vercel/node";

/**
 * Shared auth for Vercel Cron endpoints.
 *
 * We support two safe modes:
 * - Manual run (for smoke tests): Authorization: Bearer ${CRON_SECRET}
 * - Vercel Cron run: header x-vercel-cron: 1 AND User-Agent contains vercel-cron/1.0
 *
 * Note: headers can be spoofed by a determined attacker, but this is a meaningful
 * hardening step. Critical actions should still be idempotent (markers/locks).
 */
export function requireCronAuth(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const authHeader = (req.headers.authorization as string | undefined) || "";
  if (secret && secret.trim() && authHeader === `Bearer ${secret}`) {
    return true;
  }

  const xVercelCron = req.headers["x-vercel-cron"];
  const ua = String(req.headers["user-agent"] || "");
  const isCronHeader = xVercelCron === "1";
  const isCronUa = ua.includes("vercel-cron/1.0");

  return isCronHeader && isCronUa;
}


