/**
 * Frontend service for social media OAuth and stats
 */

import { auth } from '../../firebaseConfig';
import { Platform } from '../../types';

/**
 * Initiate OAuth flow for a social media platform
 */
export async function connectSocialAccount(platform: Platform): Promise<void> {
  const token = auth.currentUser
    ? await auth.currentUser.getIdToken(true)
    : null;

  if (!token) {
    throw new Error('User must be logged in to connect social accounts');
  }

  try {
    // For X, we need both OAuth 2.0 (for tweets) and OAuth 1.0a (for media uploads)
    // Check if OAuth 1.0a is already connected
    if (platform.toLowerCase() === 'x') {
      // First check if OAuth 1.0a is needed
      // We'll do OAuth 2.0 first, then prompt for OAuth 1.0a if needed
    }
    
    // Get authorization URL from backend
    // Note: For X/Twitter, backend uses hardcoded redirect URI for exact match
    // Frontend still sends it for consistency, but backend will use: https://echoflux.ai/api/oauth/x/callback
    const response = await fetch(`/api/oauth/${platform.toLowerCase()}/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        redirectUri: platform.toLowerCase() === 'x' 
          ? 'https://echoflux.ai/api/oauth/x/callback' // Exact match for X OAuth
          : `${window.location.origin}/api/oauth/${platform.toLowerCase()}/callback`,
      }),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to initiate OAuth flow';
      try {
        const error = await response.json();
        errorMessage = error.error || error.details || errorMessage;
      } catch {
        // If response is not JSON, try to get text
        try {
          const text = await response.text();
          errorMessage = text || errorMessage;
        } catch {
          // Use default error message
        }
      }
      throw new Error(errorMessage);
    }

    const { authUrl } = await response.json();

    // Verify authUrl is valid before redirecting
    if (!authUrl || typeof authUrl !== 'string') {
      throw new Error('Invalid authorization URL received from server');
    }

    // Ensure it's a valid URL
    try {
      const url = new URL(authUrl);
      // Verify it's a valid OAuth provider URL
      const validHostnames = [
        'twitter.com',
        'x.com',
        'linkedin.com',
        'www.linkedin.com',
        'facebook.com',
        'www.facebook.com',
        'instagram.com',
        'www.instagram.com',
        'tiktok.com',
        'www.tiktok.com',
        'youtube.com',
        'www.youtube.com',
        'pinterest.com',
        'www.pinterest.com',
      ];
      
      const isValidHostname = validHostnames.some(hostname => url.hostname.includes(hostname));
      
      if (!isValidHostname) {
        throw new Error(`Invalid OAuth provider URL: ${authUrl}`);
      }
      
      // Platform-specific path validation (optional warnings)
      if (platform.toLowerCase() === 'x' && !url.pathname.includes('/i/oauth2/authorize') && !url.pathname.includes('/oauth/authorize')) {
        console.warn('Unexpected X OAuth URL path:', url.pathname);
      }
    } catch (e: any) {
      throw new Error(`Invalid authorization URL format: ${e.message}`);
    }

    // Redirect user to OAuth provider
    // CRITICAL: Use direct assignment to window.location.href for immediate redirect
    // Do NOT use fetch() or any async operations - must be synchronous redirect
    console.log('Redirecting to X OAuth:', authUrl.substring(0, 80) + '...');
    
    // Force immediate redirect - prevent any interception
    // Using setTimeout(0) ensures this happens after current execution stack
    setTimeout(() => {
      window.location.href = authUrl;
    }, 0);
  } catch (error: any) {
    console.error(`Failed to connect ${platform}:`, error);
    throw error;
  }
}

/**
 * Disconnect a social media account
 */
export async function disconnectSocialAccount(platform: Platform): Promise<void> {
  const token = auth.currentUser
    ? await auth.currentUser.getIdToken(true)
    : null;

  if (!token) {
    throw new Error('User must be logged in to disconnect social accounts');
  }

  try {
    // Call generic disconnect endpoint
    const response = await fetch('/api/social/disconnect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ platform }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to disconnect account');
    }
  } catch (error: any) {
    console.error(`Failed to disconnect ${platform}:`, error);
    throw error;
  }
}

/**
 * Fetch real stats from all connected platforms
 */
export async function fetchRealSocialStats(): Promise<Record<Platform, {
  followers: number;
  following: number;
  connected: boolean;
  accountUsername?: string;
}>> {
  const token = auth.currentUser
    ? await auth.currentUser.getIdToken(true)
    : null;

  if (!token) {
    throw new Error('User must be logged in');
  }

  try {
    const response = await fetch('/api/social/fetchRealStats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch social stats');
    }

    return await response.json();
  } catch (error: any) {
    console.error('Failed to fetch real social stats:', error);
    throw error;
  }
}

/**
 * Publish content to Instagram
 * @param mediaUrl - Public HTTPS URL to image or video
 * @param caption - Post caption
 * @param mediaType - 'IMAGE' | 'REELS' | 'VIDEO'
 * @param scheduledPublishTime - Optional ISO 8601 timestamp for scheduled posts
 */
export async function publishInstagramPost(
  mediaUrl: string,
  caption: string,
  mediaType: 'IMAGE' | 'REELS' | 'VIDEO',
  scheduledPublishTime?: string,
  mediaUrls?: string[] // For carousel posts (multiple images)
): Promise<{ containerId: string; mediaId?: string; status: 'scheduled' | 'published' }> {
  const token = auth.currentUser
    ? await auth.currentUser.getIdToken(true)
    : null;

  if (!token) {
    throw new Error('User must be logged in to publish posts');
  }

  try {
    const response = await fetch('/api/platforms/instagram/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        mediaUrl,
        mediaUrls, // For carousel posts
        caption,
        mediaType,
        scheduledPublishTime,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || 'Failed to publish to Instagram');
    }

    const result = await response.json();
    return {
      containerId: result.containerId,
      mediaId: result.mediaId,
      status: result.status,
    };
  } catch (error: any) {
    console.error('Failed to publish Instagram post:', error);
    throw error;
  }
}

/**
 * Publish a tweet to X (Twitter)
 * @param text - Tweet text (max 10,000 characters)
 * @param mediaUrl - Optional public HTTPS URL to image or video (single, for backward compatibility)
 * @param mediaUrls - Optional array of media URLs (for multi-image posts, max 4)
 * @param mediaType - Optional 'image' | 'video'
 */
export async function publishTweet(
  text: string,
  mediaUrl?: string,
  mediaType?: 'image' | 'video',
  mediaUrls?: string[] // For multi-image posts
): Promise<{ tweetId: string; text: string }> {
  const token = auth.currentUser
    ? await auth.currentUser.getIdToken(true)
    : null;

  if (!token) {
    throw new Error('User must be logged in to publish tweets');
  }

  try {
    const response = await fetch('/api/platforms/x/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        text,
        mediaUrl,
        mediaUrls,
        mediaType,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || 'Failed to publish to X');
    }

    const result = await response.json();
    return {
      tweetId: result.tweetId,
      text: result.text,
    };
  } catch (error: any) {
    console.error('Failed to publish tweet:', error);
    throw error;
  }
}

