import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from '../verifyAuth.js';
import { getAdminApp } from '../_firebaseAdmin.js';
import { Platform } from '../../types';

/**
 * Generic endpoint to disconnect any social media platform
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
    const { platform } = req.body || {};

    if (!platform || !['Instagram', 'Facebook', 'TikTok', 'X', 'LinkedIn', 'YouTube', 'Threads'].includes(platform)) {
      return res.status(400).json({
        error: 'Invalid platform',
        details: 'Platform must be one of: Instagram, Facebook, TikTok, X, LinkedIn, YouTube, Threads'
      });
    }

    const adminApp = getAdminApp();
    const db = adminApp.firestore();

    // Delete social account connection
    const accountRef = db
      .collection('users')
      .doc(userId)
      .collection('social_accounts')
      .doc(platform.toLowerCase());

    await accountRef.delete();

    return res.status(200).json({
      success: true,
      message: `${platform} account disconnected successfully`
    });
  } catch (error: any) {
    console.error(`Disconnect ${req.body?.platform || 'unknown'} error:`, error);
    return res.status(500).json({
      error: 'Failed to disconnect account',
      details: error?.message || String(error)
    });
  }
}

