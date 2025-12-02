import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from '../../verifyAuth.js';
import { getAdminApp } from '../../_firebaseAdmin.js';

/**
 * Disconnect Instagram account (remove tokens)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication
    const authUser = await verifyAuth(req);
    if (!authUser || !authUser.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = authUser.uid;
    const adminApp = getAdminApp();
    const db = adminApp.firestore();

    // Delete Instagram account connection
    const accountRef = db
      .collection('users')
      .doc(userId)
      .collection('social_accounts')
      .doc('instagram');

    await accountRef.delete();

    return res.status(200).json({
      success: true,
      message: 'Instagram account disconnected'
    });
  } catch (error: any) {
    console.error('Instagram disconnect error:', error);
    return res.status(500).json({
      error: 'Failed to disconnect Instagram account',
      details: error?.message || String(error)
    });
  }
}

