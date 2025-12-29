/**
 * Simple Rate Limiting Utility
 * Uses in-memory store (for Vercel serverless functions)
 * For production, consider using Redis (Upstash) for distributed rate limiting
 */

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

// In-memory store (resets on function restart)
// For production, use Redis or Vercel's built-in rate limiting
const rateLimitStore: RateLimitStore = {};

/**
 * Simple rate limiter
 * @param identifier - Unique identifier (e.g., user ID or IP)
 * @param maxRequests - Maximum requests allowed
 * @param windowMs - Time window in milliseconds
 * @returns { allowed: boolean, remaining: number, resetTime: number }
 */
export function checkRateLimit(
  identifier: string,
  maxRequests: number = 10,
  windowMs: number = 60000 // 1 minute default
): { allowed: boolean; remaining: number; resetTime: number } {
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



