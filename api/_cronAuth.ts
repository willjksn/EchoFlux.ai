import type { VercelRequest } from "@vercel/node";

/**
 * Shared auth for Vercel Cron endpoints.
 *
 * - When CRON_SECRET is set: only `Authorization: Bearer ${CRON_SECRET}` is accepted
 *   (Vercel injects this on cron invocations when the env var is configured).
 * - When CRON_SECRET is unset: allow Vercel cron headers (preview/local only — not for production).
 * - Vercel Production: CRON_SECRET must be set or all cron calls fail closed.
 */
export function requireCronAuth(req: VercelRequest): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  const authHeader = (req.headers.authorization as string | undefined) || "";

  if (secret && authHeader === `Bearer ${secret}`) {
    return true;
  }

  const isVercelProduction = process.env.VERCEL_ENV === "production";
  if (isVercelProduction) {
    return false;
  }

  if (secret) {
    return false;
  }

  const xVercelCron = req.headers["x-vercel-cron"];
  const ua = String(req.headers["user-agent"] || "");
  const isCronHeader = xVercelCron === "1";
  const isCronUa = ua.includes("vercel-cron/1.0");

  return isCronHeader && isCronUa;
}


