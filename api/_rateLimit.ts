import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTimeMs: number;
};

// Fallback in-memory store (used when Upstash env is not configured).
// NOTE: This is NOT distributed and only intended for local/dev.
const memoryStore: Record<string, { count: number; resetTime: number }> = {};

function getClientIp(req: VercelRequest): string {
  const xff = (req.headers["x-forwarded-for"] as string | undefined) || "";
  const first = xff.split(",")[0]?.trim();
  return (
    first ||
    (req.headers["x-real-ip"] as string | undefined) ||
    // Node request socket (not always present on Vercel types)
    ((req as any)?.socket?.remoteAddress as string | undefined) ||
    "anonymous"
  );
}

function getUpstashConfig():
  | { url: string; token: string }
  | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    "";
  if (!url || !token) return null;
  return { url, token };
}

let cachedRatelimit: Ratelimit | null = null;
function getRatelimit(limit: number, windowMs: number, prefix: string): Ratelimit | null {
  const cfg = getUpstashConfig();
  if (!cfg) return null;

  // Cache a single instance; Upstash handles keys; we include per-endpoint prefix in the key.
  if (cachedRatelimit) return cachedRatelimit;

  const redis = new Redis({ url: cfg.url, token: cfg.token });
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  cachedRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    prefix,
  });
  return cachedRatelimit;
}

async function checkRateLimitDistributed(params: {
  key: string;
  limit: number;
  windowMs: number;
  prefix: string;
}): Promise<RateLimitResult | null> {
  const ratelimit = getRatelimit(params.limit, params.windowMs, params.prefix);
  if (!ratelimit) return null;

  const r = await ratelimit.limit(params.key);

  // Upstash returns reset as a timestamp (ms).
  const resetTimeMs = typeof r.reset === "number" ? r.reset : Date.now() + params.windowMs;

  return {
    allowed: r.success,
    limit: r.limit,
    remaining: r.remaining,
    resetTimeMs,
  };
}

function checkRateLimitMemory(params: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  let entry = memoryStore[params.key];
  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + params.windowMs };
    memoryStore[params.key] = entry;
  }

  entry.count++;
  const allowed = entry.count <= params.limit;
  const remaining = Math.max(0, params.limit - entry.count);

  return {
    allowed,
    limit: params.limit,
    remaining,
    resetTimeMs: entry.resetTime,
  };
}

function setRateLimitHeaders(res: VercelResponse, info: RateLimitResult) {
  res.setHeader("X-RateLimit-Limit", String(info.limit));
  res.setHeader("X-RateLimit-Remaining", String(info.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(info.resetTimeMs / 1000)));
}

/**
 * Enforce rate limiting for an endpoint.
 *
 * - Uses Upstash Redis if configured (distributed across serverless instances)
 * - Falls back to in-memory (non-distributed) when not configured
 *
 * Returns true when allowed; false when blocked (and writes the 429 response).
 */
export async function enforceRateLimit(params: {
  req: VercelRequest;
  res: VercelResponse;
  keyPrefix: string;
  limit: number;
  windowMs: number;
  identifier?: string; // defaults to client IP
}): Promise<boolean> {
  const identifier = params.identifier || getClientIp(params.req);
  const key = `${params.keyPrefix}:${identifier}`;

  let result: RateLimitResult | null = null;
  try {
    result = await checkRateLimitDistributed({
      key,
      limit: params.limit,
      windowMs: params.windowMs,
      prefix: "engagesuite",
    });
  } catch (e) {
    // If distributed limiter fails, fall back to memory (do not hard-fail the endpoint).
    result = null;
  }

  const info = result || checkRateLimitMemory({ key, limit: params.limit, windowMs: params.windowMs });
  setRateLimitHeaders(params.res, info);

  if (!info.allowed) {
    const retryAfter = Math.max(1, Math.ceil((info.resetTimeMs - Date.now()) / 1000));
    params.res.setHeader("Retry-After", String(retryAfter));
    params.res.status(429).json({
      error: "Rate limit exceeded",
      retryAfter,
    });
    return false;
  }

  return true;
}

