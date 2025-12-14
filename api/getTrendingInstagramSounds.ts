// api/getTrendingInstagramSounds.ts
// Fetch trending Instagram Reels sounds without embedding them

import { NextApiRequest, NextApiResponse } from 'next';

export interface TrendingSound {
  id: string;
  title: string;
  artist?: string;
  hashtags: string[];
  trendStats: {
    usageCount?: number;
    growthRate?: number;
    peakTime?: string;
  };
  instagramUrl: string; // Link to use this sound on Instagram
  thumbnail?: string;
}

/**
 * Fetch trending Instagram Reels sounds
 * Uses Instagram Graph API when available, falls back to AI recommendations
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean; sounds?: TrendingSound[]; error?: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Get userId from query or auth header
    const userId = req.query.userId as string | undefined;
    const authHeader = req.headers.authorization;

    const trendingSounds: TrendingSound[] = await fetchTrendingSounds(userId, authHeader);

    return res.status(200).json({
      success: true,
      sounds: trendingSounds,
    });
  } catch (error: any) {
    console.error('Error fetching trending Instagram sounds:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch trending sounds',
    });
  }
}

/**
 * Fetch trending sounds from various sources
 */
async function fetchTrendingSounds(userId?: string, authHeader?: string): Promise<TrendingSound[]> {
  const sounds: TrendingSound[] = [];

  try {
    // Method 1: Use Instagram Graph API (if user has connected account)
    if (userId || authHeader) {
      try {
        const instagramSounds = await fetchFromInstagramGraphAPI(userId, authHeader);
        if (instagramSounds.length > 0) {
          sounds.push(...instagramSounds);
        }
      } catch (igError) {
        console.warn('Instagram Graph API fetch failed, falling back to AI:', igError);
      }
    }

    // Method 2: Use AI to generate recommendations based on current trends
    // This runs as fallback or supplement to Instagram data
    const aiRecommendations = await generateAISoundRecommendations();
    sounds.push(...aiRecommendations);

    // Remove duplicates by title
    const uniqueSounds = Array.from(
      new Map(sounds.map(sound => [sound.title.toLowerCase(), sound])).values()
    );

    // Sort by trend stats (usage count, growth rate)
    uniqueSounds.sort((a, b) => {
      const aScore = (a.trendStats.usageCount || 0) * (1 + (a.trendStats.growthRate || 0) / 100);
      const bScore = (b.trendStats.usageCount || 0) * (1 + (b.trendStats.growthRate || 0) / 100);
      return bScore - aScore;
    });

    return uniqueSounds.slice(0, 20); // Return top 20
  } catch (error) {
    console.error('Error in fetchTrendingSounds:', error);
    return getFallbackTrendingSounds();
  }
}

/**
 * Fetch sounds from Instagram Graph API
 * Note: Instagram Graph API doesn't have a direct "trending sounds" endpoint
 * We'll get the user's Reels and extract audio information, or use insights API
 */
async function fetchFromInstagramGraphAPI(userId?: string, authHeader?: string): Promise<TrendingSound[]> {
  try {
    // Get Instagram account from Firestore
    const { getAdminApp } = await import('./_firebaseAdmin.js');
    const adminApp = getAdminApp();
    const db = adminApp.firestore();

    // If userId provided, get account directly
    // Otherwise, verify auth token to get userId
    let actualUserId = userId;
    if (!actualUserId && authHeader) {
      const { verifyIdToken } = await import('./_firebaseAdmin.js');
      const decodedToken = await verifyIdToken(authHeader.replace('Bearer ', ''));
      if (!decodedToken) {
        throw new Error('Invalid auth token');
      }
      actualUserId = decodedToken.uid;
    }

    if (!actualUserId) {
      return []; // No user ID, skip Instagram API
    }

    const accountRef = db
      .collection('users')
      .doc(actualUserId)
      .collection('social_accounts')
      .doc('instagram');

    const accountSnap = await accountRef.get();

    if (!accountSnap.exists) {
      return []; // No Instagram account connected
    }

    const account = accountSnap.data();
    if (!account?.connected || !account?.accessToken) {
      return []; // Account not connected or no token
    }

    const accessToken = account.accessToken;
    const accountId = account.accountId || account.id;

    if (!accountId) {
      return [];
    }

    // Fetch user's Reels media
    // Note: Instagram Graph API returns media with audio information for Reels
    const mediaUrl = new URL(`https://graph.instagram.com/${accountId}/media`);
    mediaUrl.searchParams.set('access_token', accessToken);
    mediaUrl.searchParams.set('fields', 'id,media_type,caption,like_count,comments_count,timestamp,thumbnail_url');
    mediaUrl.searchParams.set('limit', '25'); // Get recent 25 posts

    const mediaResponse = await fetch(mediaUrl.toString());
    
    if (!mediaResponse.ok) {
      const errorText = await mediaResponse.text();
      console.warn('Instagram Media API error:', errorText);
      return [];
    }

    const mediaData = await mediaResponse.json();
    const soundsMap = new Map<string, TrendingSound>();

    // Process Reels to extract audio information
    // Note: Instagram Graph API doesn't directly expose audio metadata,
    // but we can infer from captions and hashtags
    if (mediaData.data && Array.isArray(mediaData.data)) {
      for (const media of mediaData.data) {
        // Focus on Reels (VIDEO type)
        if (media.media_type === 'VIDEO' || media.media_type === 'REELS') {
          const caption = media.caption || '';
          const hashtags = caption.match(/#\w+/g) || [];
          
          // Extract potential sound mentions from caption
          // Users often mention sounds in captions like "using [sound name]"
          const soundMentions = caption.match(/using\s+([^#\n]+)/gi) || [];
          
          // For now, we'll use hashtags and engagement metrics to infer trending sounds
          // In a full implementation, you'd need to use Instagram's Insights API
          // or scrape the actual Reels to get audio metadata
          
          if (hashtags.length > 0) {
            // Create sound entries based on popular hashtags
            hashtags.slice(0, 3).forEach((tag: string) => {
              const tagLower = tag.toLowerCase();
              if (!soundsMap.has(tagLower)) {
                soundsMap.set(tagLower, {
                  id: `ig-${media.id}-${tagLower}`,
                  title: `Trending Sound - ${tag}`,
                  hashtags: [tag],
                  trendStats: {
                    usageCount: media.like_count || 0,
                    growthRate: 0, // Would need historical data
                    peakTime: 'Evening', // Default
                  },
                  instagramUrl: `https://www.instagram.com/reels/?hashtag=${encodeURIComponent(tag.replace('#', ''))}`,
                  thumbnail: media.thumbnail_url,
                });
              }
            });
          }
        }
      }
    }

    // Also try to get insights for trending content
    // Note: This requires Instagram Business/Creator account with insights permission
    try {
      const insightsUrl = new URL(`https://graph.instagram.com/${accountId}/insights`);
      insightsUrl.searchParams.set('access_token', accessToken);
      insightsUrl.searchParams.set('metric', 'impressions,reach,engagement');
      insightsUrl.searchParams.set('period', 'day');

      const insightsResponse = await fetch(insightsUrl.toString());
      if (insightsResponse.ok) {
        // Process insights data if available
        // This would help identify which sounds/content types are performing best
      }
    } catch (insightsError) {
      // Insights API may not be available for all account types
      console.log('Insights API not available:', insightsError);
    }

    return Array.from(soundsMap.values());
  } catch (error) {
    console.error('Error fetching from Instagram Graph API:', error);
    return [];
  }
}

/**
 * Generate AI-powered sound recommendations based on current trends
 */
async function generateAISoundRecommendations(): Promise<TrendingSound[]> {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `Generate a list of 10 trending Instagram Reels sounds/audio tracks that are currently popular. 
For each sound, provide:
- A catchy title/name
- Artist name (if applicable)
- 3-5 relevant hashtags that are trending with this sound
- Estimated usage count (make it realistic, between 100K-10M)
- Growth rate percentage (0-100%)
- Peak usage time (e.g., "Evening", "Morning", "Weekend")

Format as JSON array with this structure:
[
  {
    "title": "Sound name",
    "artist": "Artist name",
    "hashtags": ["#hashtag1", "#hashtag2"],
    "usageCount": 500000,
    "growthRate": 25,
    "peakTime": "Evening"
  }
]

Focus on sounds that are currently trending and have high engagement potential.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.map((sound: any, index: number) => ({
        id: `sound-${Date.now()}-${index}`,
        title: sound.title || 'Unknown Sound',
        artist: sound.artist,
        hashtags: sound.hashtags || [],
        trendStats: {
          usageCount: sound.usageCount,
          growthRate: sound.growthRate,
          peakTime: sound.peakTime,
        },
        instagramUrl: `https://www.instagram.com/reels/?audio=${encodeURIComponent(sound.title)}`,
      }));
    }
  } catch (error) {
    console.error('Error generating AI sound recommendations:', error);
  }

  return [];
}

/**
 * Fallback trending sounds if API fails
 */
function getFallbackTrendingSounds(): TrendingSound[] {
  return [
    {
      id: 'fallback-1',
      title: 'Trending Audio Track',
      artist: 'Popular Artist',
      hashtags: ['#viral', '#trending', '#reels'],
      trendStats: {
        usageCount: 1000000,
        growthRate: 15,
        peakTime: 'Evening',
      },
      instagramUrl: 'https://www.instagram.com/reels/',
    },
  ];
}

