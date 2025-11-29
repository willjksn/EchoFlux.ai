import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from '../../verifyAuth';
import { getAdminApp } from '../../_firebaseAdmin';

/**
 * Fetch Instagram stats using stored OAuth token
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

    // Get stored Instagram account
    const adminApp = getAdminApp();
    const db = adminApp.firestore();
    
    const accountRef = db
      .collection('users')
      .doc(userId)
      .collection('social_accounts')
      .doc('instagram');

    const accountSnap = await accountRef.get();

    if (!accountSnap.exists) {
      return res.status(404).json({
        error: 'Instagram account not connected',
        connected: false
      });
    }

    const account = accountSnap.data();
    
    if (!account?.connected || !account?.accessToken) {
      return res.status(404).json({
        error: 'Instagram account not connected',
        connected: false
      });
    }

    // Check if token is expired
    if (account.expiresAt) {
      const expiration = new Date(account.expiresAt);
      if (expiration < new Date()) {
        return res.status(401).json({
          error: 'Instagram token expired',
          needsRefresh: true
        });
      }
    }

    const accessToken = account.accessToken;

    // Fetch user account info
    const accountInfoResponse = await fetch(
      `https://graph.instagram.com/me?fields=id,username,account_type&access_token=${accessToken}`
    );

    if (!accountInfoResponse.ok) {
      const errorText = await accountInfoResponse.text();
      console.error('Instagram API error:', errorText);
      return res.status(accountInfoResponse.status).json({
        error: 'Failed to fetch Instagram account info',
        details: errorText
      });
    }

    const accountInfo = await accountInfoResponse.json();

    // Fetch media count (basic metric)
    // For Instagram Basic Display API, we can get:
    // - Media count (posts)
    // - For business accounts via Graph API: followers, following, etc.

    // Get media list to count posts
    const mediaResponse = await fetch(
      `https://graph.instagram.com/me/media?fields=id&access_token=${accessToken}`
    );

    let postsCount = 0;
    if (mediaResponse.ok) {
      const mediaData = await mediaResponse.json();
      postsCount = mediaData.data?.length || 0;
    }

    // For Instagram Basic Display, we have limited metrics
    // For business accounts, you'd use Instagram Graph API which requires different setup
    const stats = {
      platform: 'Instagram' as const,
      accountId: accountInfo.id,
      accountUsername: accountInfo.username || account.accountUsername,
      accountName: account.accountName || accountInfo.username,
      accountType: accountInfo.account_type,
      postsCount,
      followers: 0, // Not available in Basic Display API
      following: 0, // Not available in Basic Display API
      // Note: To get followers/following, you need Instagram Graph API with Business/Creator account
    };

    // Update lastSyncedAt
    await accountRef.update({
      lastSyncedAt: new Date().toISOString(),
      accountUsername: accountInfo.username || account.accountUsername,
    });

    return res.status(200).json(stats);
  } catch (error: any) {
    console.error('Instagram stats error:', error);
    return res.status(500).json({
      error: 'Failed to fetch Instagram stats',
      details: error?.message || String(error)
    });
  }
}

