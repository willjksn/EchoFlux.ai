/**
 * Rate Limiting Utility with Upstash Redis
 * Uses distributed Redis for production-ready rate limiting
 * Falls back to in-memory store if Redis is not configured
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// In-memory fallback store (for development or if Redis not configured)
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}
const rateLimitStore: RateLimitStore = {};

// Initialize Upstash Redis if credentials are available
let redisClient: Redis | null = null;
let ratelimit: Ratelimit | null = null;

function initRedis() {
  if (redisClient && ratelimit) {
    return { redisClient, ratelimit };
  }

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    try {
      redisClient = new Redis({
        url: upstashUrl,
        token: upstashToken,
      });

      ratelimit = new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow,
        analytics: true,
      });

      return { redisClient, ratelimit };
    } catch (error) {
      console.warn('Failed to initialize Upstash Redis, falling back to in-memory rate limiting:', error);
    }
  }

  return { redisClient: null, ratelimit: null };
}

/**
 * Rate limiter with Redis support
 * @param identifier - Unique identifier (e.g., user ID or IP)
 * @param maxRequests - Maximum requests allowed
 * @param windowMs - Time window in milliseconds
 * @returns { allowed: boolean, remaining: number, resetTime: number }
 */
export async function checkRateLimit(
  identifier: string,
  maxRequests: number = 10,
  windowMs: number = 60000 // 1 minute default
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  const { ratelimit } = initRedis();

  // Use Upstash Redis if available
  if (ratelimit) {
    try {
      const windowSeconds = Math.floor(windowMs / 1000);
      const result = await ratelimit.limit(identifier, {
        rate: maxRequests,
        window: `${windowSeconds}s`,
      });

      const now = Date.now();
      return {
        allowed: result.success,
        remaining: result.remaining,
        resetTime: now + windowMs, // Approximate reset time
      };
    } catch (error) {
      console.error('Rate limit check failed, falling back to in-memory:', error);
      // Fall through to in-memory fallback
    }
  }

  // Fallback to in-memory rate limiting
  const now = Date.now();
  const key = identifier;

  // Get or create rate limit entry
  let entry = rateLimitStore[key];

  // If entry doesn't exist or window has expired, reset
  if (!entry || now > entry.resetTime) {
    entry = {
      count: 0,
      resetTime: now + windowMs,
    };
    rateLimitStore[key] = entry;
  }

  // Increment count
  entry.count++;

  // Check if limit exceeded
  const allowed = entry.count <= maxRequests;
  const remaining = Math.max(0, maxRequests - entry.count);

  return {
    allowed,
    remaining,
    resetTime: entry.resetTime,
  };
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(
  remaining: number,
  resetTime: number,
  limit: number
): Record<string, string> {
  return {
    'X-RateLimit-Limit': limit.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(resetTime / 1000).toString(),
  };
}

/**
 * Rate limit middleware for API endpoints
 * Usage:
 *   const rateLimit = checkRateLimit(user.uid, 10, 60000); // 10 requests per minute
 *   if (!rateLimit.allowed) {
 *     res.status(429).json({ error: 'Rate limit exceeded' });
 *     return;
 *   }
 */
export function withRateLimit(
  maxRequests: number = 10,
  windowMs: number = 60000
) {
  return (req: any, res: any, next: () => void) => {
    // Get identifier (user ID if authenticated, IP otherwise)
    const identifier = req.user?.uid || req.headers['x-forwarded-for'] || 'anonymous';
    
    const rateLimit = checkRateLimit(identifier, maxRequests, windowMs);
    
    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit.remaining, rateLimit.resetTime, maxRequests)).forEach(
      ([key, value]) => {
        res.setHeader(key, value);
      }
    );

    if (!rateLimit.allowed) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Too many requests. Please try again after ${new Date(rateLimit.resetTime).toLocaleTimeString()}`,
        retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000),
      });
      return;
    }

    next();
  };
}



