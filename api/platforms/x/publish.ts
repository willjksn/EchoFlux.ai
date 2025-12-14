// api/platforms/x/publish.ts
// X (Twitter) API v2 content publishing

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from '../../verifyAuth.js';
import { getAdminApp } from '../../_firebaseAdmin.js';
import { createHmac } from 'crypto';

interface XAccount {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  connected: boolean;
  // OAuth 1.0a credentials for media uploads
  oauthToken?: string;
  oauthTokenSecret?: string;
}

/**
 * Refresh X access token if expired or expiring soon
 * Returns the refreshed access token and updates Firestore
 */
async function refreshXToken(
  account: XAccount,
  userId: string,
  db: any
): Promise<string> {
  // Check if token is expired or expiring soon (within 1 hour)
  if (account.expiresAt) {
    const expiresAt = new Date(account.expiresAt);
    const now = new Date();
    
    // Refresh if expired or expires within 1 hour
    if (expiresAt.getTime() <= now.getTime() || expiresAt.getTime() - now.getTime() < 60 * 60 * 1000) {
      if (!account.refreshToken) {
        console.warn('No refresh token available for X account');
        return account.accessToken; // Return existing token, will fail if expired
      }

      try {
        const clientId = process.env.TWITTER_CLIENT_ID || process.env.X_CLIENT_ID;
        const clientSecret = process.env.TWITTER_CLIENT_SECRET || process.env.X_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) {
          console.warn('X OAuth credentials not configured for token refresh');
          return account.accessToken;
        }

        // Exchange refresh token for new access token
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const response = await fetch('https://api.twitter.com/2/oauth2/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credentials}`,
          },
          body: new URLSearchParams({
            refresh_token: account.refreshToken,
            grant_type: 'refresh_token',
          }),
        });

        if (response.ok) {
          const tokenData = await response.json();
          const { access_token, refresh_token, expires_in } = tokenData;
          
          // Calculate new expiration time
          let expiresAt: string | undefined;
          if (expires_in) {
            const expirationDate = new Date();
            expirationDate.setSeconds(expirationDate.getSeconds() + expires_in);
            expiresAt = expirationDate.toISOString();
          }

          // Update token in Firestore
          const socialAccountRef = db
            .collection('users')
            .doc(userId)
            .collection('social_accounts')
            .doc('x');

          await socialAccountRef.update({
            accessToken: access_token,
            refreshToken: refresh_token || account.refreshToken, // Keep old refresh token if new one not provided
            expiresAt: expiresAt,
            lastSyncedAt: new Date().toISOString(),
          });

          console.log('X access token refreshed successfully');
          return access_token;
        } else {
          const errorText = await response.text();
          console.error('Failed to refresh X token:', errorText);
          // Return existing token - will fail if expired, but better than nothing
          return account.accessToken;
        }
      } catch (error: any) {
        console.error('Error refreshing X token:', error);
        // Return existing token - will fail if expired, but better than nothing
        return account.accessToken;
      }
    }
  }

  // Token is still valid, return it
  return account.accessToken;
}

/**
 * Publish a tweet to X (Twitter)
 * Uses X API v2 POST /2/tweets endpoint
 */
export async function publishTweet(
  accessToken: string,
  text: string,
  mediaIds?: string[] // Optional: Array of media IDs (must be uploaded separately first)
): Promise<{ tweetId: string; text: string }> {
  const url = 'https://api.x.com/2/tweets';
  
  const body: any = {
    text: text,
  };

  // Add media if provided
  if (mediaIds && mediaIds.length > 0) {
    body.media = {
      media_ids: mediaIds,
    };
    console.log('publishTweet: Including media_ids in tweet:', mediaIds);
  } else {
    console.log('publishTweet: No media_ids provided');
  }

  console.log('publishTweet: Request body:', JSON.stringify(body));
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData: any = {};
    try {
      errorData = JSON.parse(errorText);
    } catch {
      // If not JSON, use raw text
    }
    
    const errorMessage = errorData.errors?.[0]?.message || errorData.detail || errorText;
    const errorCode = errorData.errors?.[0]?.code || errorData.title || 'unknown';
    
    // Provide user-friendly message for duplicate content error
    if (errorMessage?.includes('duplicate') || errorCode === '187') {
      throw new Error('This tweet was already posted. X does not allow posting duplicate content. Please modify your text and try again.');
    }
    
    throw new Error(`Failed to publish tweet: ${errorCode} - ${errorMessage}`);
  }

  const data = await response.json();
  
  if (!data.data?.id) {
    throw new Error('No tweet ID returned from X API');
  }

  return {
    tweetId: data.data.id,
    text: data.data.text || text,
  };
}

/**
 * Generate OAuth 1.0a signature for X API v1.1 media upload
 * Follows RFC 5849 OAuth 1.0a specification
 */
function generateOAuth1Signature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret?: string
): string {
  // Normalize URL (remove query string and fragment, ensure https)
  const urlObj = new URL(url);
  const normalizedUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  
  // Collect all parameters (OAuth params + query params)
  const allParams: Record<string, string> = { ...params };
  
  // Add query string parameters if any
  urlObj.searchParams.forEach((value, key) => {
    allParams[key] = value;
  });
  
  // Sort parameters by key, then by value (RFC 5849 Section 3.4.1.3.2)
  const sortedKeys = Object.keys(allParams).sort();
  const sortedPairs = sortedKeys.map(key => 
    `${encodeURIComponent(key)}=${encodeURIComponent(allParams[key])}`
  );
  const parameterString = sortedPairs.join('&');
  
  // Create signature base string (RFC 5849 Section 3.4.1.1)
  const signatureBaseString = [
    method.toUpperCase(),
    encodeURIComponent(normalizedUrl),
    encodeURIComponent(parameterString)
  ].join('&');
  
  // Create signing key (RFC 5849 Section 3.4.2)
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret || '')}`;
  
  // Generate HMAC-SHA1 signature (RFC 5849 Section 3.4.2)
  const signature = createHmac('sha1', signingKey)
    .update(signatureBaseString)
    .digest('base64');
  
  return signature;
}

/**
 * Upload media to X (Twitter) using OAuth 1.0a
 * X API v1.1 media upload requires OAuth 1.0a authentication
 */
async function uploadMediaOAuth1(
  mediaBuffer: Buffer,
  mediaType: 'image' | 'video',
  oauthToken: string,
  oauthTokenSecret: string,
  consumerKey: string,
  consumerSecret: string
): Promise<string> {
  const endpoint = 'https://upload.twitter.com/1.1/media/upload.json';
  
  if (mediaType === 'image') {
    // For images, use base64 encoded media_data (simpler for serverless)
    const mediaBase64 = mediaBuffer.toString('base64');
    const formData = new URLSearchParams();
    formData.append('media_data', mediaBase64);

    // Generate OAuth 1.0a signature
    const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    const oauthParams: Record<string, string> = {
      oauth_consumer_key: consumerKey,
      oauth_token: oauthToken,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_version: '1.0',
    };
    
    const signature = generateOAuth1Signature('POST', endpoint, oauthParams, consumerSecret, oauthTokenSecret);
    oauthParams.oauth_signature = signature;
    
    const sortedOAuthKeys = Object.keys(oauthParams).sort();
    const authHeader = 'OAuth ' + sortedOAuthKeys
      .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
      .join(', ');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OAuth 1.0a image upload failed:', response.status, errorText);
      throw new Error(`Failed to upload image via OAuth 1.0a: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const mediaId = data.media_id_string || data.media_id;
    
    if (!mediaId) {
      throw new Error('X API did not return a media_id');
    }
    
    console.log('OAuth 1.0a image upload successful, media_id:', mediaId);
    return mediaId;
  } else {
    // For videos, use chunked upload with OAuth 1.0a
    // INIT
    const initFormData = new URLSearchParams();
    initFormData.append('command', 'INIT');
    initFormData.append('media_type', 'video/mp4');
    initFormData.append('total_bytes', mediaBuffer.length.toString());

    const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    const oauthParams: Record<string, string> = {
      oauth_consumer_key: consumerKey,
      oauth_token: oauthToken,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_version: '1.0',
    };
    
    const signature = generateOAuth1Signature('POST', endpoint, oauthParams, consumerSecret, oauthTokenSecret);
    oauthParams.oauth_signature = signature;
    
    const sortedOAuthKeys = Object.keys(oauthParams).sort();
    const authHeader = 'OAuth ' + sortedOAuthKeys
      .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
      .join(', ');

    const initResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: initFormData.toString(),
    });

    if (!initResponse.ok) {
      const errorText = await initResponse.text();
      throw new Error(`Failed to initialize video upload: ${errorText}`);
    }

    const initData = await initResponse.json();
    const mediaId = initData.media_id_string;

    // APPEND (simplified - in production, chunk large files)
    const appendFormData = new URLSearchParams();
    appendFormData.append('command', 'APPEND');
    appendFormData.append('media_id', mediaId);
    appendFormData.append('media', mediaBuffer.toString('base64'));
    appendFormData.append('segment_index', '0');

    const appendNonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const appendTimestamp = Math.floor(Date.now() / 1000).toString();
    
    const appendOAuthParams: Record<string, string> = {
      oauth_consumer_key: consumerKey,
      oauth_token: oauthToken,
      oauth_nonce: appendNonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: appendTimestamp,
      oauth_version: '1.0',
    };
    
    const appendSignature = generateOAuth1Signature('POST', endpoint, appendOAuthParams, consumerSecret, oauthTokenSecret);
    appendOAuthParams.oauth_signature = appendSignature;
    
    const appendSortedKeys = Object.keys(appendOAuthParams).sort();
    const appendAuthHeader = 'OAuth ' + appendSortedKeys
      .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(appendOAuthParams[key])}"`)
      .join(', ');

    const appendResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': appendAuthHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: appendFormData.toString(),
    });

    if (!appendResponse.ok) {
      const errorText = await appendResponse.text();
      throw new Error(`Failed to append video chunk: ${errorText}`);
    }

    // FINALIZE
    const finalizeFormData = new URLSearchParams();
    finalizeFormData.append('command', 'FINALIZE');
    finalizeFormData.append('media_id', mediaId);

    const finalizeNonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const finalizeTimestamp = Math.floor(Date.now() / 1000).toString();
    
    const finalizeOAuthParams: Record<string, string> = {
      oauth_consumer_key: consumerKey,
      oauth_token: oauthToken,
      oauth_nonce: finalizeNonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: finalizeTimestamp,
      oauth_version: '1.0',
    };
    
    const finalizeSignature = generateOAuth1Signature('POST', endpoint, finalizeOAuthParams, consumerSecret, oauthTokenSecret);
    finalizeOAuthParams.oauth_signature = finalizeSignature;
    
    const finalizeSortedKeys = Object.keys(finalizeOAuthParams).sort();
    const finalizeAuthHeader = 'OAuth ' + finalizeSortedKeys
      .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(finalizeOAuthParams[key])}"`)
      .join(', ');

    const finalizeResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': finalizeAuthHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: finalizeFormData.toString(),
    });

    if (!finalizeResponse.ok) {
      const errorText = await finalizeResponse.text();
      throw new Error(`Failed to finalize video upload: ${errorText}`);
    }

    return mediaId;
  }
}

/**
 * Upload media to X (Twitter)
 * Returns media_id that can be used in tweet creation
 * Tries OAuth 1.0a first (required for v1.1 media upload), falls back to OAuth 2.0 if available
 */
export async function uploadMedia(
  accessToken: string,
  mediaUrl: string,
  mediaType: 'image' | 'video',
  oauth1Credentials?: {
    oauthToken: string;
    oauthTokenSecret: string;
    consumerKey: string;
    consumerSecret: string;
  }
): Promise<string> {
  console.log('uploadMedia: Starting upload for', mediaUrl, 'type:', mediaType);
  
  // First, download the media from the URL
  const mediaResponse = await fetch(mediaUrl);
  if (!mediaResponse.ok) {
    console.error('uploadMedia: Failed to download media:', mediaResponse.status, mediaResponse.statusText);
    throw new Error(`Failed to download media from URL: ${mediaResponse.statusText}`);
  }

  const mediaBuffer = Buffer.from(await mediaResponse.arrayBuffer());
  console.log('uploadMedia: Downloaded media, size:', mediaBuffer.length, 'bytes');

  // Prefer OAuth 1.0a for media uploads (v1.1 endpoint requires it)
  if (oauth1Credentials) {
    console.log('uploadMedia: Using OAuth 1.0a for media upload');
    try {
      return await uploadMediaOAuth1(
        mediaBuffer,
        mediaType,
        oauth1Credentials.oauthToken,
        oauth1Credentials.oauthTokenSecret,
        oauth1Credentials.consumerKey,
        oauth1Credentials.consumerSecret
      );
    } catch (error: any) {
      console.error('uploadMedia: OAuth 1.0a upload failed, error:', error);
      throw error;
    }
  }

  // Fallback: Try OAuth 2.0 with v2 endpoint (if media.write scope is available)
  console.log('uploadMedia: OAuth 1.0a not available, trying OAuth 2.0 with v2 endpoint');
  
  // Note: X API v2 media upload endpoint may not be fully available yet
  // For now, we require OAuth 1.0a for media uploads
  throw new Error(
    'Media upload requires OAuth 1.0a authentication. ' +
    'X API v1.1 media upload endpoint requires OAuth 1.0a credentials. ' +
    'Please connect OAuth 1.0a in Settings (click "Connect OAuth 1.0a" button for X account) to enable image and video uploads.'
  );
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
      text,
      mediaUrl, // Single media URL (for backward compatibility)
      mediaUrls, // Array of media URLs (for multi-image posts)
      mediaType, // 'image' | 'video'
    } = req.body;

    console.log('X publish request:', {
      hasText: !!text,
      textLength: text?.length,
      hasMediaUrl: !!mediaUrl,
      hasMediaUrls: !!mediaUrls,
      mediaUrlsCount: mediaUrls?.length || 0,
      mediaType: mediaType,
    });

    // Validate required fields
    if (!text) {
      return res.status(400).json({
        error: 'Missing required field',
        details: 'text is required',
      });
    }

    // Validate text length (X limit is 280 characters, but can be longer with Twitter Blue)
    if (text.length > 10000) {
      return res.status(400).json({
        error: 'Text too long',
        details: 'Tweet text must be 10,000 characters or less',
      });
    }

    // Get X account from Firestore
    const adminApp = getAdminApp();
    const db = adminApp.firestore();
    
    const socialAccountRef = db
      .collection('users')
      .doc(authUser.uid)
      .collection('social_accounts')
      .doc('x');

    const socialAccountDoc = await socialAccountRef.get();

    if (!socialAccountDoc.exists) {
      return res.status(404).json({
        error: 'X account not connected',
        details: 'Please connect your X account in Settings',
      });
    }

    const socialAccount = socialAccountDoc.data() as XAccount;
    
    if (!socialAccount?.connected || !socialAccount?.accessToken) {
      return res.status(400).json({
        error: 'X account not properly connected',
        details: 'Please reconnect your X account',
      });
    }

    // Log OAuth 1.0a status for debugging
    const hasOAuth1 = !!(socialAccount.oauthToken && socialAccount.oauthTokenSecret);
    console.log('X account status:', {
      hasOAuth2: !!socialAccount.accessToken,
      hasOAuth1: hasOAuth1,
      hasMedia: !!(mediaUrl || (mediaUrls && mediaUrls.length > 0)),
    });

    // Refresh token if expired or expiring soon
    let accessToken = await refreshXToken(socialAccount, authUser.uid, db);
    let retryCount = 0;
    const maxRetries = 1; // Only retry once if we get unauthorized

    // Helper function to attempt publishing with retry on unauthorized
    const attemptPublish = async (): Promise<{ tweetId: string; text: string }> => {
      // Upload media if provided (support both single and multiple images)
      let mediaIds: string[] | undefined;
      
      // Determine which URLs to use - prefer mediaUrls array, fallback to single mediaUrl
      let urlsToUpload: string[] = [];
      if (mediaUrls && Array.isArray(mediaUrls) && mediaUrls.length > 0) {
        urlsToUpload = mediaUrls.filter(url => url && typeof url === 'string'); // Filter out invalid URLs
      } else if (mediaUrl && typeof mediaUrl === 'string') {
        urlsToUpload = [mediaUrl];
      }
      
      console.log('attemptPublish: Media URLs to upload:', urlsToUpload);
      console.log('attemptPublish: Media type:', mediaType);
      console.log('attemptPublish: Access token present:', !!accessToken, 'length:', accessToken?.length);
      console.log('attemptPublish: Original mediaUrl:', mediaUrl);
      console.log('attemptPublish: Original mediaUrls:', mediaUrls);
      
      if (urlsToUpload.length > 0 && mediaType) {
        // Check OAuth 1.0a credentials upfront before attempting upload
        const clientId = process.env.TWITTER_CLIENT_ID || process.env.X_CLIENT_ID;
        const clientSecret = process.env.TWITTER_CLIENT_SECRET || process.env.X_CLIENT_SECRET;
        const hasOAuth1Tokens = !!(socialAccount.oauthToken && socialAccount.oauthTokenSecret);
        const hasConsumerKeys = !!(clientId && clientSecret);
        
        if (!hasOAuth1Tokens || !hasConsumerKeys) {
          throw new Error(
            'Media upload requires OAuth 1.0a authentication. ' +
            'Please go to Settings → Connections → X and click "Connect OAuth 1.0a" to enable image and video uploads. ' +
            'OAuth 1.0a is required for X API v1.1 media upload endpoint.'
          );
        }
        
        try {
          const uploadedIds: string[] = [];
          for (const url of urlsToUpload) {
            // X supports up to 4 images per tweet
            if (uploadedIds.length >= 4) {
              console.warn('X supports maximum 4 images per tweet, skipping additional images');
              break;
            }
            
            try {
              console.log(`attemptPublish: Uploading media ${uploadedIds.length + 1}/${urlsToUpload.length}:`, url);
              
              // OAuth 1.0a credentials already checked above
              const oauth1Credentials = {
                oauthToken: socialAccount.oauthToken!,
                oauthTokenSecret: socialAccount.oauthTokenSecret!,
                consumerKey: clientId!,
                consumerSecret: clientSecret!,
              };
              
              console.log('attemptPublish: Using OAuth 1.0a for media upload');
              
              const mediaId = await uploadMedia(
                accessToken,
                url,
                mediaType,
                oauth1Credentials
              );
              uploadedIds.push(mediaId);
              console.log(`attemptPublish: Successfully uploaded media ${uploadedIds.length}, media_id:`, mediaId);
            } catch (singleMediaError: any) {
              console.error(`Failed to upload media ${url}:`, singleMediaError);
              
              // Provide helpful error message if OAuth 1.0a is missing
              const errorMessage = singleMediaError.message || String(singleMediaError);
              if (errorMessage.includes('OAuth 1.0a') || 
                  errorMessage.includes('requires OAuth 1.0a')) {
                throw new Error(
                  'Media upload requires OAuth 1.0a authentication. ' +
                  'Please go to Settings → Connections → X and click "Connect OAuth 1.0a" to enable image and video uploads.'
                );
              }
              
              // Don't continue silently - throw the error so user knows
              throw singleMediaError;
            }
          }
          
          if (uploadedIds.length > 0) {
            mediaIds = uploadedIds;
            console.log('attemptPublish: All media uploaded successfully, media_ids:', mediaIds);
          } else {
            console.warn('attemptPublish: No media IDs were successfully uploaded');
            throw new Error('Failed to upload media to X. No media IDs were returned.');
          }
        } catch (mediaError: any) {
          console.error('Media upload failed:', mediaError);
          
          // Check if error is due to missing OAuth 1.0a
          const errorMessage = mediaError.message || String(mediaError);
          if (errorMessage.includes('OAuth 1.0a') || errorMessage.includes('requires OAuth 1.0a')) {
            throw new Error(
              'Media upload requires OAuth 1.0a authentication. ' +
              'Please go to Settings → Connections → X and click "Connect OAuth 1.0a" to enable image and video uploads to X.'
            );
          }
          
          // Don't continue silently - throw the error
          throw new Error(`Media upload failed: ${errorMessage}`);
        }
      } else {
        console.log('attemptPublish: No media to upload (urlsToUpload:', urlsToUpload.length, ', mediaType:', mediaType, ')');
        // For text-only posts, mediaIds should be undefined
        mediaIds = undefined;
      }

      // Publish tweet (with or without media)
      try {
        console.log('attemptPublish: Publishing tweet with text-only:', !mediaIds || mediaIds.length === 0);
        console.log('attemptPublish: Publishing tweet with media_ids:', mediaIds);
        return await publishTweet(accessToken, text, mediaIds);
      } catch (publishError: any) {
        // If we get unauthorized error and haven't retried yet, refresh token and try again
        if (
          retryCount < maxRetries &&
          (publishError.message?.includes('Unauthorized') ||
           publishError.message?.includes('401') ||
           publishError.message?.includes('unauthorized'))
        ) {
          console.warn('Got unauthorized error, attempting token refresh and retry...');
          retryCount++;
          
          // Re-fetch account data to get latest token info
          const updatedAccountDoc = await socialAccountRef.get();
          const updatedAccount = updatedAccountDoc.data() as XAccount;
          
          // Force refresh token (even if not expired)
          accessToken = await refreshXToken(updatedAccount, authUser.uid, db);
          
          // Retry publish
          return attemptPublish();
        }
        throw publishError;
      }
    };

    const result = await attemptPublish();

    return res.status(200).json({
      success: true,
      tweetId: result.tweetId,
      text: result.text,
      message: 'Tweet published successfully',
    });
  } catch (error: any) {
    console.error('X publish error:', error);
    return res.status(500).json({
      error: 'Failed to publish to X',
      details: error?.message || String(error),
    });
  }
}

