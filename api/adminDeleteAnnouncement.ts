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

  const { id } = (req.body as any) || {};
  if (!id) {
    res.status(400).json({ error: 'Missing id' });
    return;
  }

  await db.collection('announcements').doc(String(id)).delete();
  res.status(200).json({ success: true });
}

export default withErrorHandling(handler);


