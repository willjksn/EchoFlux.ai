// api/platforms/instagram/publish.ts
// Instagram Graph API content publishing (2-step process)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from '../../verifyAuth.js';
import { getAdminApp } from '../../_firebaseAdmin.js';

interface PublishRequest {
  userId: string;
  accountId: string; // Instagram Business Account ID
  accessToken: string; // Page Access Token
  mediaUrl: string; // Public HTTPS URL to image/video
  caption: string;
  mediaType: 'IMAGE' | 'REELS' | 'VIDEO'; // Instagram media type
  scheduledPublishTime?: string; // ISO 8601 timestamp for scheduled posts
}

interface TokenDebugResult {
  isValid: boolean;
  appId?: string;
  userId?: string;
  expiresAt?: string;
}

async function debugAccessToken(accessToken: string): Promise<TokenDebugResult> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    // If app credentials are missing, skip validation to avoid blocking publish.
    return { isValid: true };
  }

  const appAccessToken = `${appId}|${appSecret}`;
  const url = new URL('https://graph.facebook.com/v19.0/debug_token');
  url.searchParams.set('input_token', accessToken);
  url.searchParams.set('access_token', appAccessToken);

  const response = await fetch(url.toString(), { method: 'GET' });
  if (!response.ok) {
    return { isValid: false };
  }

  const data = await response.json();
  const debugData = data?.data;
  return {
    isValid: Boolean(debugData?.is_valid),
    appId: debugData?.app_id,
    userId: debugData?.user_id,
    expiresAt: debugData?.expires_at
      ? new Date(debugData.expires_at * 1000).toISOString()
      : undefined,
  };
}

async function refreshInstagramAccessToken(
  userId: string,
  db: any
): Promise<string | null> {
  const facebookAccountRef = db
    .collection('users')
    .doc(userId)
    .collection('social_accounts')
    .doc('facebook');

  const facebookAccountDoc = await facebookAccountRef.get();
  if (!facebookAccountDoc.exists) return null;

  const facebookAccount = facebookAccountDoc.data();
  if (!facebookAccount?.connected) return null;

  // Prefer existing page access token if present
  if (facebookAccount.pageAccessToken) {
    return facebookAccount.pageAccessToken;
  }

  // If we have a user access token + pageId, fetch a fresh page token
  if (facebookAccount.userAccessToken && facebookAccount.pageId) {
    const pageTokenUrl = new URL(`https://graph.facebook.com/v19.0/${facebookAccount.pageId}`);
    pageTokenUrl.searchParams.set('fields', 'access_token');
    pageTokenUrl.searchParams.set('access_token', facebookAccount.userAccessToken);

    const pageTokenResponse = await fetch(pageTokenUrl.toString(), { method: 'GET' });
    if (!pageTokenResponse.ok) return null;
    const pageTokenData = await pageTokenResponse.json();
    const pageAccessToken = pageTokenData?.access_token;
    if (!pageAccessToken) return null;

    await facebookAccountRef.set(
      {
        pageAccessToken,
        accessToken: pageAccessToken,
        lastSyncedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return pageAccessToken;
  }

  return null;
}

/**
 * Step 1: Create media container(s)
 * For carousel posts (multiple images), creates multiple containers and returns the first container ID
 * Returns container ID(s) that will be used in Step 2
 */
async function createMediaContainer(
  accountId: string,
  accessToken: string,
  mediaUrl: string,
  caption: string,
  mediaType: 'IMAGE' | 'REELS' | 'VIDEO',
  scheduledPublishTime?: string,
  additionalUrls?: string[] // For carousel posts
): Promise<string | string[]> {
  const url = `https://graph.facebook.com/v19.0/${accountId}/media`;
  
  // For carousel posts (multiple images), create containers for each image
  if (additionalUrls && additionalUrls.length > 0 && mediaType === 'IMAGE') {
    const allUrls = [mediaUrl, ...additionalUrls];
    const containerIds: string[] = [];
    
    // Create container for each image
    for (let i = 0; i < allUrls.length; i++) {
      const params: Record<string, string> = {
        access_token: accessToken,
        image_url: allUrls[i],
      };
      
      // Only add caption to the first image
      if (i === 0) {
        params.caption = caption;
      }
      
      // For carousel, mark as carousel item
      if (allUrls.length > 1) {
        params.is_carousel_item = 'true';
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(params).toString(),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorData: any = {};
        try {
          errorData = JSON.parse(errorText);
        } catch {
          // If not JSON, use raw text
        }
        
        const errorMessage = errorData.error?.message || errorData.error_description || errorText;
        const errorCode = errorData.error?.code || errorData.error?.type || 'unknown';
        
        throw new Error(`Failed to create carousel container ${i + 1}: ${errorCode} - ${errorMessage}`);
      }
      
      const data = await response.json();
      if (data.id) {
        containerIds.push(data.id);
      }
    }
    
    // Create carousel container that references all child containers
    if (containerIds.length > 1) {
      const carouselParams: Record<string, string> = {
        access_token: accessToken,
        caption: caption,
        media_type: 'CAROUSEL',
        children: containerIds.join(','),
      };
      
      if (scheduledPublishTime) {
        carouselParams.scheduled_publish_time = scheduledPublishTime;
      }
      
      const carouselResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(carouselParams).toString(),
      });
      
      if (!carouselResponse.ok) {
        const errorText = await carouselResponse.text();
        throw new Error(`Failed to create carousel container: ${errorText}`);
      }
      
      const carouselData = await carouselResponse.json();
      return carouselData.id;
    }
    
    return containerIds[0];
  }
  
  // Single image/video (original logic)
  const params: Record<string, string> = {
    access_token: accessToken,
  };

  if (mediaType === 'IMAGE') {
    params.image_url = mediaUrl;
  } else if (mediaType === 'REELS' || mediaType === 'VIDEO') {
    params.video_url = mediaUrl;
    params.media_type = 'REELS'; // Instagram uses REELS for all video content
  }

  params.caption = caption;

  // Add scheduled publish time if provided
  if (scheduledPublishTime) {
    params.scheduled_publish_time = scheduledPublishTime;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData: any = {};
    try {
      errorData = JSON.parse(errorText);
    } catch {
      // If not JSON, use raw text
    }
    
    const errorMessage = errorData.error?.message || errorData.error_description || errorText;
    const errorCode = errorData.error?.code || errorData.error?.type || 'unknown';
    
    throw new Error(`Failed to create media container: ${errorCode} - ${errorMessage}`);
  }

  const data = await response.json();
  
  if (!data.id) {
    throw new Error('No container ID returned from Instagram API');
  }

  return data.id;
}

/**
 * Step 2: Publish media container
 */
async function publishMediaContainer(
  accountId: string,
  accessToken: string,
  containerId: string
): Promise<string> {
  const url = `https://graph.facebook.com/v19.0/${accountId}/media_publish`;
  
  const params = new URLSearchParams({
    access_token: accessToken,
    creation_id: containerId,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData: any = {};
    try {
      errorData = JSON.parse(errorText);
    } catch {
      // If not JSON, use raw text
    }
    
    const errorMessage = errorData.error?.message || errorData.error_description || errorText;
    const errorCode = errorData.error?.code || errorData.error?.type || 'unknown';
    
    throw new Error(`Failed to publish media: ${errorCode} - ${errorMessage}`);
  }

  const data = await response.json();
  
  if (!data.id) {
    throw new Error('No media ID returned from Instagram API');
  }

  return data.id; // This is the published media ID
}

/**
 * Main publish function (2-step process)
 */
export async function publishInstagramContent(
  accountId: string,
  accessToken: string,
  mediaUrl: string,
  caption: string,
  mediaType: 'IMAGE' | 'REELS' | 'VIDEO',
  scheduledPublishTime?: string,
  additionalUrls?: string[] // For carousel posts
): Promise<{ containerId: string; mediaId?: string; status: 'scheduled' | 'published' }> {
  // Step 1: Create media container(s)
  const containerIdOrIds = await createMediaContainer(
    accountId,
    accessToken,
    mediaUrl,
    caption,
    mediaType,
    scheduledPublishTime,
    additionalUrls
  );
  
  const containerId = Array.isArray(containerIdOrIds) ? containerIdOrIds[0] : containerIdOrIds;

  // If scheduled, don't publish immediately
  if (scheduledPublishTime) {
    return {
      containerId,
      status: 'scheduled',
    };
  }

  // Step 2: Publish immediately
  const mediaId = await publishMediaContainer(accountId, accessToken, containerId);

  return {
    containerId,
    mediaId,
    status: 'published',
  };
}

/**
 * API endpoint handler
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

    const {
      mediaUrl, // Single media URL (for backward compatibility)
      mediaUrls, // Array of media URLs (for multi-image carousel posts)
      caption,
      mediaType, // 'IMAGE' | 'REELS' | 'VIDEO'
      scheduledPublishTime, // Optional ISO 8601 timestamp
    } = req.body;

    // Validate required fields
    const urlsToUse = mediaUrls && mediaUrls.length > 0 ? mediaUrls : (mediaUrl ? [mediaUrl] : []);
    if (urlsToUse.length === 0 || !caption || !mediaType) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'mediaUrl/mediaUrls, caption, and mediaType are required',
      });
    }
    
    // Instagram carousel posts support 2-10 images
    if (urlsToUse.length > 1 && mediaType !== 'IMAGE') {
      return res.status(400).json({
        error: 'Invalid media type for multiple images',
        details: 'Multiple images are only supported for IMAGE type (carousel posts)',
      });
    }
    
    if (urlsToUse.length > 10) {
      return res.status(400).json({
        error: 'Too many images',
        details: 'Instagram carousel posts support maximum 10 images',
      });
    }

    // Validate mediaType
    if (!['IMAGE', 'REELS', 'VIDEO'].includes(mediaType)) {
      return res.status(400).json({
        error: 'Invalid mediaType',
        details: 'mediaType must be IMAGE, REELS, or VIDEO',
      });
    }

    // Get Instagram account from Firestore
    const adminApp = getAdminApp();
    const db = adminApp.firestore();
    
    const socialAccountRef = db
      .collection('users')
      .doc(authUser.uid)
      .collection('social_accounts')
      .doc('instagram');

    const socialAccountDoc = await socialAccountRef.get();

    if (!socialAccountDoc.exists) {
      return res.status(404).json({
        error: 'Instagram account not connected',
        details: 'Please connect your Instagram account in Settings',
      });
    }

    const socialAccount = socialAccountDoc.data();
    
    if (!socialAccount?.connected || !socialAccount?.accessToken || !socialAccount?.accountId) {
      return res.status(400).json({
        error: 'Instagram account not properly connected',
        details: 'Please reconnect your Instagram account',
      });
    }

    let accessToken = socialAccount.accessToken;
    let tokenValid = true;
    const tokenDebug = await debugAccessToken(accessToken);
    tokenValid = tokenDebug.isValid;
    if (!tokenValid) {
      const refreshedToken = await refreshInstagramAccessToken(authUser.uid, db);
      if (refreshedToken) {
        const refreshedDebug = await debugAccessToken(refreshedToken);
        if (refreshedDebug.isValid) {
          accessToken = refreshedToken;
          tokenValid = true;
          await socialAccountRef.set(
            {
              accessToken: refreshedToken,
              expiresAt: refreshedDebug.expiresAt || socialAccount.expiresAt || null,
              lastSyncedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        }
      }
    }

    if (!accessToken || !tokenValid) {
      return res.status(401).json({
        error: 'Instagram token invalid',
        details: 'Please reconnect your Instagram account',
      });
    }

    // Publish content
    const additionalUrls = urlsToUse.length > 1 ? urlsToUse.slice(1) : undefined;
    const result = await publishInstagramContent(
      socialAccount.accountId,
      accessToken,
      urlsToUse[0],
      caption,
      mediaType,
      scheduledPublishTime,
      additionalUrls
    );

    return res.status(200).json({
      success: true,
      containerId: result.containerId,
      mediaId: result.mediaId,
      status: result.status,
      message: result.status === 'scheduled' 
        ? 'Post scheduled successfully' 
        : 'Post published successfully',
    });
  } catch (error: any) {
    console.error('Instagram publish error:', error);
    return res.status(500).json({
      error: 'Failed to publish to Instagram',
      details: error?.message || String(error),
    });
  }
}

