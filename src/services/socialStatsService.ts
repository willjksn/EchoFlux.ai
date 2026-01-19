import { getSocialStats } from './geminiService';
import { fetchRealSocialStats } from './socialMediaService';
import { User, Platform, SocialAccount } from '../../types';

/**
 * Fetches real social stats from connected APIs (prioritized) or aggregated post data (fallback)
 * and updates the user's socialStats in Firestore
 * @param userId - The user's ID
 * @param setUser - Function to update user in Firestore
 * @param currentStats - Current social stats (for merging/fallback)
 * @param connectedAccounts - Real OAuth-connected accounts
 * @returns Updated social stats or null if update failed
 */
export async function updateUserSocialStats(
  userId: string,
  setUser: (user: Partial<User>) => Promise<void>,
  currentStats?: Record<Platform, { followers: number; following: number }>,
  connectedAccounts?: Record<Platform, SocialAccount | null>
): Promise<Record<Platform, { followers: number; following: number }> | null> {
  try {
    let realStats: Record<Platform, { followers: number; following: number }> = {
      Instagram: { followers: 0, following: 0 },
      TikTok: { followers: 0, following: 0 },
      X: { followers: 0, following: 0 },
      Threads: { followers: 0, following: 0 },
      YouTube: { followers: 0, following: 0 },
      LinkedIn: { followers: 0, following: 0 },
      Facebook: { followers: 0, following: 0 },
    };

    // Check if any accounts are OAuth-connected
    const hasConnectedAccounts = connectedAccounts && 
      Object.values(connectedAccounts).some(account => account?.connected);

    if (hasConnectedAccounts) {
      // Try to fetch from real APIs first
      try {
        const apiStats = await fetchRealSocialStats();
        // Merge API stats (only for connected platforms)
        Object.keys(apiStats).forEach(platform => {
          const platformKey = platform as Platform;
          if (apiStats[platformKey].connected) {
            realStats[platformKey] = {
              followers: apiStats[platformKey].followers,
              following: apiStats[platformKey].following,
            };
          }
        });
      } catch (error) {
        console.warn('Failed to fetch from real APIs, falling back to aggregated data:', error);
      }
    }

    // For platforms without real API connections, use aggregated post data
    try {
      const aggregatedStats = await getSocialStats();
      // Only use aggregated stats for platforms that don't have real API connections
      if (aggregatedStats && typeof aggregatedStats === 'object') {
        Object.keys(aggregatedStats).forEach(platform => {
          const platformKey = platform as Platform;
          const platformStats = aggregatedStats[platformKey];
          // Only use if stats exist and have valid structure
          if (platformStats && typeof platformStats === 'object' && 
              typeof platformStats.followers === 'number' && 
              typeof platformStats.following === 'number') {
            if (!realStats[platformKey] || realStats[platformKey].followers === 0) {
              realStats[platformKey] = platformStats;
            }
          }
        });
      }
    } catch (error) {
      // Silently fail - stats will use cached/fallback values
      // Error is logged but not shown to user since it doesn't break functionality
      if (process.env.NODE_ENV === 'development') {
        console.warn('Failed to fetch aggregated stats (non-critical):', error);
      }
    }
    
    // Merge with current stats if provided (preserve any manually set values that are higher)
    const mergedStats = currentStats 
      ? {
          ...realStats,
          ...Object.keys(currentStats).reduce((acc, platform) => {
            const platformKey = platform as Platform;
            const currentPlatformStats = currentStats[platformKey];
            const realPlatformStats = realStats[platformKey];
            // Keep current stat if it's higher (might be manually set) and both are valid
            if (currentPlatformStats && 
                typeof currentPlatformStats === 'object' &&
                typeof currentPlatformStats.followers === 'number' &&
                realPlatformStats &&
                typeof realPlatformStats === 'object' &&
                typeof realPlatformStats.followers === 'number' &&
                currentPlatformStats.followers > realPlatformStats.followers) {
              acc[platformKey] = currentPlatformStats;
            }
            return acc;
          }, {} as Record<Platform, { followers: number; following: number }>)
        }
      : realStats;
    
    // Update user in Firestore
    await setUser({
      id: userId,
      socialStats: mergedStats as any, // Type assertion needed due to Platform union
    });
    
    return mergedStats;
  } catch (error) {
    console.error('Failed to update social stats:', error);
    return null;
  }
}

/**
 * Check if social stats should be refreshed (based on last update time)
 * Refreshes once per hour to avoid too many API calls
 */
export function shouldRefreshSocialStats(lastUpdateTime?: string): boolean {
  if (!lastUpdateTime) return true;
  
  const lastUpdate = new Date(lastUpdateTime);
  const now = new Date();
  const hoursSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);
  
  // Refresh if more than 1 hour has passed
  return hoursSinceUpdate >= 1;
}

