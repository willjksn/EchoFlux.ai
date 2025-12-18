import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from '../verifyAuth.js';
import { getAdminApp } from '../_firebaseAdmin.js';

/**
 * Fetch real stats from all connected social media platforms
 * Aggregates data from Instagram, Facebook, etc.
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

    // Get all connected social accounts
    const accountsRef = db
      .collection('users')
      .doc(userId)
      .collection('social_accounts');

    const accountsSnapshot = await accountsRef.get();
    const accounts = accountsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as any)
    })) as Array<{
      id: string;
      platform?: string;
      connected?: boolean;
      accessToken?: string;
      accountUsername?: string;
    }>;

    const stats: Record<string, {
      followers: number;
      following: number;
      connected: boolean;
      accountUsername?: string;
    }> = {};

    // Fetch stats for each connected platform
    for (const account of accounts) {
      if (!account.connected || !account.accessToken) continue;

      try {
        switch (account.platform) {
          case 'Instagram':
            // Fetch Instagram stats directly (we're already server-side)
            try {
              const accessToken = account.accessToken;
              
              // Get user account info
              const accountInfoResponse = await fetch(
                `https://graph.instagram.com/me?fields=id,username,account_type&access_token=${accessToken}`
              );

              if (accountInfoResponse.ok) {
                const accountInfo = await accountInfoResponse.json();
                
                // For Instagram Basic Display, we have limited metrics
                // To get followers/following, you need Instagram Graph API with Business account
                stats.Instagram = {
                  followers: 0, // Not available in Basic Display API
                  following: 0, // Not available in Basic Display API
                  connected: true,
                  accountUsername: accountInfo.username || account.accountUsername,
                };
              }
            } catch (error) {
              console.error('Error fetching Instagram stats:', error);
              stats.Instagram = {
                followers: 0,
                following: 0,
                connected: true,
              };
            }
            break;
          
          // Add other platforms here (Facebook, TikTok, etc.)
          
          default:
            // Platform not yet implemented
            if (account.platform) {
              stats[account.platform] = {
                followers: 0,
                following: 0,
                connected: true,
              };
            }
        }
      } catch (error) {
        console.error(`Error fetching stats for ${account.platform}:`, error);
        // Continue with other platforms
      }
    }

    // Initialize all platforms with default values
    const platforms = ['Instagram', 'TikTok', 'X', 'Threads', 'YouTube', 'LinkedIn', 'Facebook'];
    platforms.forEach(platform => {
      if (!stats[platform]) {
        stats[platform] = {
          followers: 0,
          following: 0,
          connected: false,
        };
      }
    });

    return res.status(200).json(stats);
  } catch (error: any) {
    console.error('fetchRealStats error:', error);
    return res.status(500).json({
      error: 'Failed to fetch social media stats',
      details: error?.message || String(error)
    });
  }
}

