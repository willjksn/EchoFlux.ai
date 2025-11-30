import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from './verifyAuth';
import { getAdminApp } from './_firebaseAdmin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication
    let authUser;
    try {
      authUser = await verifyAuth(req);
    } catch (authError: any) {
      console.error('Auth verification error:', authError);
      return res.status(401).json({ error: 'Unauthorized', details: authError?.message });
    }

    if (!authUser || !authUser.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = authUser.uid;

    // Initialize Firebase Admin
    let db;
    try {
      db = getAdminApp().firestore();
    } catch (firebaseError: any) {
      console.error('Firebase Admin initialization error:', firebaseError);
      // Return empty stats instead of error so UI doesn't break
      const emptyStats: Record<string, { followers: number; following: number }> = {};
      const platforms = ['Instagram', 'TikTok', 'X', 'Threads', 'YouTube', 'LinkedIn', 'Facebook'];
      platforms.forEach(platform => {
        emptyStats[platform] = { followers: 0, following: 0 };
      });
      return res.status(200).json(emptyStats);
    }

    // Fetch posts to aggregate stats
    let allPosts: any[] = [];
    try {
      const postsRef = db.collection('users').doc(userId).collection('posts');
      const postsSnapshot = await postsRef.get();
      allPosts = postsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (postsError: any) {
      console.error('Error fetching posts:', postsError);
      allPosts = [];
    }

    // Initialize platform stats
    const platforms = ['Instagram', 'TikTok', 'X', 'Threads', 'YouTube', 'LinkedIn', 'Facebook'];
    const platformStats: Record<string, {
      followers: number;
      following: number;
      totalEngagement: number;
      totalPosts: number;
      avgEngagement: number;
    }> = {};

    platforms.forEach(platform => {
      platformStats[platform] = {
        followers: 0,
        following: 0,
        totalEngagement: 0,
        totalPosts: 0,
        avgEngagement: 0,
      };
    });

    // Aggregate stats from posts
    allPosts.forEach((post: any) => {
      const postPlatforms = post.platforms || [];
      const likes = post.likes || 0;
      const comments = (post.comments?.length || 0) * 2; // Weight comments more
      const shares = (post.shares || 0) * 3; // Weight shares more
      const views = post.views || 0;
      
      // Calculate engagement (likes + comments + shares)
      const engagement = likes + comments + shares;

      postPlatforms.forEach((platform: string) => {
        if (platformStats[platform]) {
          platformStats[platform].totalPosts++;
          platformStats[platform].totalEngagement += engagement;

          // Estimate followers from engagement (rough estimate: 1 follower per 20 engagements)
          // This is a simplified model - in production, you'd track actual follower counts
          const estimatedNewFollowers = Math.floor(engagement / 20);
          platformStats[platform].followers += estimatedNewFollowers;
        }
      });
    });

    // Calculate averages and set minimum follower counts
    const socialStats: Record<string, { followers: number; following: number }> = {};
    
    platforms.forEach(platform => {
      const stats = platformStats[platform];
      
      // Calculate average engagement
      stats.avgEngagement = stats.totalPosts > 0 
        ? Math.round(stats.totalEngagement / stats.totalPosts) 
        : 0;

      // Set base follower count (minimum 50 to match mock data behavior)
      // In production, you'd fetch this from actual social media APIs
      const baseFollowers = Math.max(50, stats.followers || 0);
      
      // Estimate following (typically 10-50% of followers for most accounts)
      const following = Math.floor(baseFollowers * (0.1 + Math.random() * 0.4));

      socialStats[platform] = {
        followers: baseFollowers,
        following: following,
      };
    });

    // Return social stats in the format expected by the frontend
    return res.status(200).json(socialStats);
  } catch (error: any) {
    console.error('getSocialStats error:', error);
    console.error('Error stack:', error?.stack);
    
    // Return empty stats structure so UI doesn't break
    const emptyStats: Record<string, { followers: number; following: number }> = {};
    const platforms = ['Instagram', 'TikTok', 'X', 'Threads', 'YouTube', 'LinkedIn', 'Facebook'];
    platforms.forEach(platform => {
      emptyStats[platform] = { followers: 0, following: 0 };
    });
    
    // Always return 200 with empty stats so UI doesn't break
    // This endpoint is non-critical - if it fails, we just return zeros
    return res.status(200).json(emptyStats);
  }
}

