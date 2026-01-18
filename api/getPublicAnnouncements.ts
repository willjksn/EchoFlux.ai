import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withErrorHandling } from './_errorHandler.js';
import { getAdminDb } from './_firebaseAdmin.js';
import { enforceRateLimit } from './_rateLimit.js';

function isWithinWindow(now: number, startsAt?: string, endsAt?: string): boolean {
  const startOk = startsAt ? now >= new Date(startsAt).getTime() : true;
  const endOk = endsAt ? now <= new Date(endsAt).getTime() : true;
  return startOk && endOk;
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    (req.headers["x-real-ip"] as string | undefined) ||
    "anonymous";

  // Rate limit: 120 requests / minute per IP
  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "getPublicAnnouncements",
    limit: 120,
    windowMs: 60 * 1000,
    identifier: ip,
  });
  if (!ok) return;

  const db = getAdminDb();
  const now = Date.now();
  const snapshot = await db.collection('announcements').get();

  const announcements = snapshot.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((a: any) => a?.isActive === true)
    .filter((a: any) => a?.isPublic === true)
    .filter((a: any) => a?.isBanner === true)
    .filter((a: any) => isWithinWindow(now, a.startsAt, a.endsAt))
    .sort((a: any, b: any) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tB - tA;
    });

  res.status(200).json({ announcements });
}

export default withErrorHandling(handler);


