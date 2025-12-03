// api/postToSocial.ts
// API endpoint to post content to social media platforms

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getVerifyAuth, getAdminDbFunction, withErrorHandling } from "./_errorHandler.js";
import { Platform } from "../types.js";

interface PostToSocialRequest {
  userId: string;
  platform: Platform;
  content: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
}

/**
 * Post to Instagram using Graph API
 */
async function postToInstagram(
  accessToken: string,
  accountId: string,
  content: string,
  mediaUrl: string,
  mediaType: 'image' | 'video'
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    // Step 1: Create media container
    const containerUrl = `https://graph.instagram.com/${accountId}/media`;
    const containerParams = new URLSearchParams({
      access_token: accessToken,
      caption: content,
    });

    if (mediaType === 'image') {
      containerParams.append('image_url', mediaUrl);
    } else {
      containerParams.append('media_type', 'REELS');
      containerParams.append('video_url', mediaUrl);
    }

    const containerResponse = await fetch(`${containerUrl}?${containerParams}`, {
      method: 'POST',
    });

    if (!containerResponse.ok) {
      const error = await containerResponse.text();
      return { success: false, error: `Instagram container creation failed: ${error}` };
    }

    const containerData = await containerResponse.json();
    const creationId = containerData.id;

    if (!creationId) {
      return { success: false, error: 'Failed to get creation ID from Instagram' };
    }

    // Step 2: For videos/reels, wait for processing, then publish
    if (mediaType === 'video') {
      // Check status until ready
      let status = 'IN_PROGRESS';
      let attempts = 0;
      while (status === 'IN_PROGRESS' && attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        
        const statusResponse = await fetch(
          `https://graph.instagram.com/${creationId}?fields=status_code&access_token=${accessToken}`
        );
        
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          status = statusData.status_code;
        }
        attempts++;
      }

      if (status !== 'FINISHED') {
        return { success: false, error: `Video processing not finished. Status: ${status}` };
      }
    }

    // Step 3: Publish the media
    const publishUrl = `https://graph.instagram.com/${accountId}/media_publish`;
    const publishParams = new URLSearchParams({
      access_token: accessToken,
      creation_id: creationId,
    });

    const publishResponse = await fetch(`${publishUrl}?${publishParams}`, {
      method: 'POST',
    });

    if (!publishResponse.ok) {
      const error = await publishResponse.text();
      return { success: false, error: `Instagram publish failed: ${error}` };
    }

    const publishData = await publishResponse.json();
    return { success: true, postId: publishData.id };

  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error posting to Instagram' };
  }
}

/**
 * Post to X (Twitter) using API v2
 */
async function postToX(
  accessToken: string,
  content: string,
  mediaUrl?: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    // X API v2 requires OAuth 2.0 with specific scopes
    // For now, return a placeholder - full implementation requires proper OAuth setup
    return { 
      success: false, 
      error: 'X (Twitter) posting requires additional OAuth 2.0 setup. Coming soon.' 
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error posting to X' };
  }
}

/**
 * Post to TikTok using Business API
 */
async function postToTikTok(
  accessToken: string,
  content: string,
  mediaUrl: string,
  mediaType: 'image' | 'video'
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    // TikTok Business API requires video upload via multipart/form-data
    // For now, return a placeholder
    return { 
      success: false, 
      error: 'TikTok posting requires video upload API setup. Coming soon.' 
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error posting to TikTok' };
  }
}

/**
 * Post to LinkedIn using API
 */
async function postToLinkedIn(
  accessToken: string,
  userId: string,
  content: string,
  mediaUrl?: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    // LinkedIn API requires specific format
    // For now, return a placeholder
    return { 
      success: false, 
      error: 'LinkedIn posting requires additional API setup. Coming soon.' 
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error posting to LinkedIn' };
  }
}

/**
 * Post to Facebook using Graph API
 */
async function postToFacebook(
  accessToken: string,
  pageId: string,
  content: string,
  mediaUrl?: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    const url = `https://graph.facebook.com/v18.0/${pageId}/photos`;
    const params: any = {
      access_token: accessToken,
      message: content,
    };

    if (mediaUrl) {
      params.url = mediaUrl;
    }

    const response = await fetch(`${url}?${new URLSearchParams(params)}`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Facebook post failed: ${error}` };
    }

    const data = await response.json();
    return { success: true, postId: data.id };

  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error posting to Facebook' };
  }
}

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Allow cron jobs to bypass auth by providing userId in header
  const isCronRequest = req.headers['x-cron-request'] === 'true';
  const userIdFromHeader = req.headers['x-user-id'] as string;

  let user;
  let targetUserId: string;

  if (isCronRequest && userIdFromHeader) {
    // Cron job request - use provided userId
    targetUserId = userIdFromHeader;
  } else {
    // Regular request - verify auth
    try {
      const verifyAuth = await getVerifyAuth();
      user = await verifyAuth(req);
    } catch (authError: any) {
      return res.status(401).json({ error: "Unauthorized", details: authError?.message });
    }

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    targetUserId = user.uid;
  }

  const { userId, platform, content, mediaUrl, mediaType } = req.body as PostToSocialRequest;
  
  // Use userId from body if provided, otherwise use authenticated user or cron userId
  const finalUserId = userId || targetUserId;

  if (!platform || !content) {
    return res.status(400).json({ error: "Missing required fields: platform, content" });
  }

  try {
    const getAdminDb = await getAdminDbFunction();
    const adminDb = await getAdminDb();
    const userDoc = await adminDb.collection('users').doc(finalUserId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();
    const socialAccounts = userData?.socialAccounts || {};

    // Get platform-specific account info
    const platformAccount = socialAccounts[platform];
    if (!platformAccount || !platformAccount.connected) {
      return res.status(400).json({ 
        error: `${platform} account not connected`,
        note: `Please connect your ${platform} account in Settings > Connections`
      });
    }

    const accessToken = platformAccount.accessToken;
    if (!accessToken) {
      return res.status(400).json({ error: `No access token for ${platform}` });
    }

    let result;
    switch (platform) {
      case 'Instagram':
        if (!platformAccount.accountId) {
          return res.status(400).json({ error: 'Instagram account ID missing' });
        }
        if (!mediaUrl) {
          return res.status(400).json({ error: 'Media URL required for Instagram' });
        }
        result = await postToInstagram(
          accessToken,
          platformAccount.accountId,
          content,
          mediaUrl,
          mediaType || 'image'
        );
        break;

      case 'Facebook':
        if (!platformAccount.pageId) {
          return res.status(400).json({ error: 'Facebook page ID missing' });
        }
        result = await postToFacebook(
          accessToken,
          platformAccount.pageId,
          content,
          mediaUrl
        );
        break;

      case 'X':
        result = await postToX(accessToken, content, mediaUrl);
        break;

      case 'TikTok':
        if (!mediaUrl) {
          return res.status(400).json({ error: 'Media URL required for TikTok' });
        }
        result = await postToTikTok(
          accessToken,
          content,
          mediaUrl,
          mediaType || 'video'
        );
        break;

      case 'LinkedIn':
        if (!platformAccount.userId) {
          return res.status(400).json({ error: 'LinkedIn user ID missing' });
        }
        result = await postToLinkedIn(
          accessToken,
          platformAccount.userId,
          content,
          mediaUrl
        );
        break;

      default:
        return res.status(400).json({ error: `Platform ${platform} not yet supported for auto-posting` });
    }

    if (result.success) {
      return res.status(200).json({
        success: true,
        postId: result.postId,
        message: `Successfully posted to ${platform}`
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || `Failed to post to ${platform}`
      });
    }

  } catch (error: any) {
    console.error("Error posting to social media:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to post to social media"
    });
  }
}

export default withErrorHandling(handler);

