import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withErrorHandling, getVerifyAuth } from './_errorHandler.js';
import { getAdminDb } from './_firebaseAdmin.js';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const verifyAuth = await getVerifyAuth();
  const adminUser = await verifyAuth(req);
  if (!adminUser?.uid) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const db = getAdminDb();
  const adminDoc = await db.collection('users').doc(adminUser.uid).get();
  const adminData = adminDoc.data();
  if (adminData?.role !== 'Admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  const {
    id,
    title,
    body,
    type,
    isActive,
    isBanner,
    targetPlans,
    targetUserIds,
    startsAt,
    endsAt,
    actionLabel,
    actionPage,
  } = (req.body as any) || {};

  if (!title || !body) {
    res.status(400).json({ error: 'Missing title or body' });
    return;
  }

  const nowIso = new Date().toISOString();
  const docRef = id ? db.collection('announcements').doc(String(id)) : db.collection('announcements').doc();

  const payload: any = {
    title: String(title).trim(),
    body: String(body).trim(),
    type: (type === 'warning' || type === 'success' || type === 'info') ? type : 'info',
    isActive: Boolean(isActive),
    isBanner: Boolean(isBanner),
    targetPlans: Array.isArray(targetPlans) ? targetPlans : [],
    targetUserIds: Array.isArray(targetUserIds) ? targetUserIds : [],
    startsAt: startsAt ? String(startsAt) : null,
    endsAt: endsAt ? String(endsAt) : null,
    actionLabel: actionLabel ? String(actionLabel) : null,
    actionPage: actionPage ? String(actionPage) : null,
    updatedAt: nowIso,
  };

  // created fields only on create
  const existing = await docRef.get();
  if (!existing.exists) {
    payload.createdAt = nowIso;
    payload.createdBy = adminUser.uid;
  }

  // avoid storing nulls where possible (but Firestore allows null)
  await docRef.set(payload, { merge: true });

  res.status(200).json({ success: true, id: docRef.id });
}

export default withErrorHandling(handler);


