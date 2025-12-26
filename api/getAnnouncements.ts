import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withErrorHandling, getVerifyAuth } from './_errorHandler.js';
import { getAdminDb } from './_firebaseAdmin.js';

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

  const verifyAuth = await getVerifyAuth();
  const decoded = await verifyAuth(req);

  if (!decoded?.uid) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const db = getAdminDb();
  const userDoc = await db.collection('users').doc(decoded.uid).get();
  const userData = userDoc.data();
  const userPlan = userData?.plan || 'Free';

  const now = Date.now();
  const snapshot = await db.collection('announcements').get();

  const announcements = snapshot.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((a: any) => a?.isActive === true)
    .filter((a: any) => isWithinWindow(now, a.startsAt, a.endsAt))
    .filter((a: any) => {
      const targetPlans: string[] | undefined = a.targetPlans;
      return !targetPlans || targetPlans.length === 0 || targetPlans.includes(userPlan);
    })
    .filter((a: any) => {
      const targetUserIds: string[] | undefined = a.targetUserIds;
      return !targetUserIds || targetUserIds.length === 0 || targetUserIds.includes(decoded.uid);
    })
    .sort((a: any, b: any) => {
      // banner first, then newest
      const bannerScore = (b.isBanner ? 1 : 0) - (a.isBanner ? 1 : 0);
      if (bannerScore !== 0) return bannerScore;
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tB - tA;
    });

  res.status(200).json({ announcements });
}

export default withErrorHandling(handler);


