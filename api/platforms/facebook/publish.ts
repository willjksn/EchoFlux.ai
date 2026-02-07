// api/platforms/facebook/publish.ts
// Facebook Graph API content publishing for Pages

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from '../../verifyAuth.js';
import { getAdminApp } from '../../_firebaseAdmin.js';

interface PublishRequest {
  caption: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  mediaType?: 'image' | 'video';
  scheduledPublishTime?: string; // ISO 8601
}

interface FacebookPageAccount {
  pageId: string;
  pageName?: string;
  pageAccessToken: string;
}

async function fetchWithRetry(request: RequestInfo, init: RequestInit, attempts = 3) {
  let lastError: any;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(request, init);
      if (response.ok) return response;
      if (response.status >= 500 || response.status === 429) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      return response;
    } catch (err: any) {
      lastError = err;
    }
  }
  throw lastError;
}

function parseScheduledTime(iso?: string): { unix: number; isValid: boolean; error?: string } {
  if (!iso) return { unix: 0, isValid: false };
  const t = new Date(iso).getTime();
  if (!t) return { unix: 0, isValid: false, error: 'Invalid scheduledPublishTime' };
  const now = Date.now();
  const minLeadMs = 10 * 60 * 1000; // Facebook requires >= 10 minutes in future
  if (t - now < minLeadMs) {
    return { unix: 0, isValid: false, error: 'Scheduled time must be at least 10 minutes in the future.' };
  }
  return { unix: Math.floor(t / 1000), isValid: true };
}

async function resolveFacebookPageAccount(
  account: any,
  userId: string,
  db: any
): Promise<FacebookPageAccount> {
  if (account?.pageId && (account?.pageAccessToken || account?.accessToken)) {
    return {
      pageId: account.pageId,
      pageName: account.pageName,
      pageAccessToken: account.pageAccessToken || account.accessToken,
    };
  }

  const token = account?.userAccessToken || account?.accessToken;
  if (!token) {
    throw new Error('Missing Facebook access token. Please reconnect Facebook.');
  }

  const pagesResponse = await fetchWithRetry(
    `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(token)}`,
    { method: 'GET' }
  );

  if (!pagesResponse.ok) {
    const errorText = await pagesResponse.text();
    throw new Error(`Failed to fetch Facebook Pages: ${errorText}`);
  }

  const pagesData = await pagesResponse.json();
  const pages = Array.isArray(pagesData?.data) ? pagesData.data : [];
  const primaryPage = pages[0];

  if (!primaryPage?.id || !primaryPage?.access_token) {
    if (account?.accountId && account?.accessToken) {
      return {
        pageId: account.accountId,
        pageName: account.accountName,
        pageAccessToken: account.accessToken,
      };
    }
    throw new Error('No Facebook Pages found. Please connect a Page and try again.');
  }

  const socialAccountRef = db
    .collection('users')
    .doc(userId)
    .collection('social_accounts')
    .doc('facebook');

  await socialAccountRef.set(
    {
      accountId: primaryPage.id,
      accountName: primaryPage.name || '',
      pageId: primaryPage.id,
      pageName: primaryPage.name || '',
      pageAccessToken: primaryPage.access_token,
      accessToken: primaryPage.access_token,
      lastSyncedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return {
    pageId: primaryPage.id,
    pageName: primaryPage.name,
    pageAccessToken: primaryPage.access_token,
  };
}

async function publishTextPost(
  page: FacebookPageAccount,
  caption: string,
  scheduledUnix?: number
): Promise<string> {
  const params: Record<string, string> = {
    access_token: page.pageAccessToken,
    message: caption,
  };
  if (scheduledUnix) {
    params.published = 'false';
    params.scheduled_publish_time = String(scheduledUnix);
  }

  const response = await fetchWithRetry(`https://graph.facebook.com/v19.0/${page.pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to publish Facebook post: ${errorText}`);
  }

  const data = await response.json();
  if (!data.id) throw new Error('No post ID returned from Facebook API');
  return data.id;
}

async function publishSinglePhoto(
  page: FacebookPageAccount,
  mediaUrl: string,
  caption: string,
  scheduledUnix?: number
): Promise<string> {
  const params: Record<string, string> = {
    access_token: page.pageAccessToken,
    url: mediaUrl,
    message: caption,
  };
  if (scheduledUnix) {
    params.published = 'false';
    params.scheduled_publish_time = String(scheduledUnix);
  }

  const response = await fetchWithRetry(`https://graph.facebook.com/v19.0/${page.pageId}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to publish Facebook photo: ${errorText}`);
  }

  const data = await response.json();
  if (!data.id) throw new Error('No photo ID returned from Facebook API');
  return data.id;
}

async function publishMultiPhoto(
  page: FacebookPageAccount,
  mediaUrls: string[],
  caption: string,
  scheduledUnix?: number
): Promise<string> {
  const mediaFbIds: string[] = [];

  for (const url of mediaUrls) {
    const params = new URLSearchParams({
      access_token: page.pageAccessToken,
      url,
      published: 'false',
    });

    const response = await fetchWithRetry(`https://graph.facebook.com/v19.0/${page.pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload Facebook photo: ${errorText}`);
    }

    const data = await response.json();
    if (data.id) {
      mediaFbIds.push(data.id);
    }
  }

  if (mediaFbIds.length === 0) {
    throw new Error('No media IDs returned from Facebook photo uploads');
  }

  const params = new URLSearchParams({
    access_token: page.pageAccessToken,
    message: caption,
  });
  mediaFbIds.forEach((id, index) => {
    params.set(`attached_media[${index}]`, JSON.stringify({ media_fbid: id }));
  });
  if (scheduledUnix) {
    params.set('published', 'false');
    params.set('scheduled_publish_time', String(scheduledUnix));
  }

  const response = await fetchWithRetry(`https://graph.facebook.com/v19.0/${page.pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to publish Facebook multi-photo post: ${errorText}`);
  }

  const data = await response.json();
  if (!data.id) throw new Error('No post ID returned from Facebook API');
  return data.id;
}

async function publishVideo(
  page: FacebookPageAccount,
  mediaUrl: string,
  caption: string,
  scheduledUnix?: number
): Promise<string> {
  const params: Record<string, string> = {
    access_token: page.pageAccessToken,
    file_url: mediaUrl,
    description: caption,
  };
  if (scheduledUnix) {
    params.published = 'false';
    params.scheduled_publish_time = String(scheduledUnix);
  }

  const response = await fetchWithRetry(`https://graph.facebook.com/v19.0/${page.pageId}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to publish Facebook video: ${errorText}`);
  }

  const data = await response.json();
  if (!data.id) throw new Error('No video ID returned from Facebook API');
  return data.id;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authUser = await verifyAuth(req);
    if (!authUser?.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { caption, mediaUrl, mediaUrls, mediaType, scheduledPublishTime } =
      req.body as PublishRequest;

    const normalizedCaption = (caption || '').trim();
    const urlsToUse = Array.isArray(mediaUrls) && mediaUrls.length > 0
      ? mediaUrls
      : mediaUrl
        ? [mediaUrl]
        : [];

    if (!normalizedCaption && urlsToUse.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'caption is required for text-only posts',
      });
    }

    if (urlsToUse.length > 1 && mediaType && mediaType !== 'image') {
      return res.status(400).json({
        error: 'Invalid media type for multiple images',
        details: 'Multiple images are only supported for image posts',
      });
    }

    const scheduledInfo = parseScheduledTime(scheduledPublishTime);
    if (scheduledPublishTime && !scheduledInfo.isValid) {
      return res.status(400).json({
        error: 'Invalid scheduledPublishTime',
        details: scheduledInfo.error || 'Invalid schedule time',
      });
    }

    const adminApp = getAdminApp();
    const db = adminApp.firestore();
    const socialAccountRef = db
      .collection('users')
      .doc(authUser.uid)
      .collection('social_accounts')
      .doc('facebook');

    const socialAccountDoc = await socialAccountRef.get();
    if (!socialAccountDoc.exists) {
      return res.status(404).json({
        error: 'Facebook account not connected',
        details: 'Please connect your Facebook Page in Settings',
      });
    }

    const socialAccount = socialAccountDoc.data();
    if (!socialAccount?.connected) {
      return res.status(400).json({
        error: 'Facebook account not properly connected',
        details: 'Please reconnect your Facebook account',
      });
    }

    const page = await resolveFacebookPageAccount(socialAccount, authUser.uid, db);

    let postId: string;
    const scheduledUnix = scheduledInfo.isValid ? scheduledInfo.unix : undefined;

    if (urlsToUse.length === 0) {
      postId = await publishTextPost(page, normalizedCaption, scheduledUnix);
    } else if (mediaType === 'video') {
      postId = await publishVideo(page, urlsToUse[0], normalizedCaption, scheduledUnix);
    } else if (urlsToUse.length > 1) {
      postId = await publishMultiPhoto(page, urlsToUse, normalizedCaption, scheduledUnix);
    } else {
      postId = await publishSinglePhoto(page, urlsToUse[0], normalizedCaption, scheduledUnix);
    }

    return res.status(200).json({
      success: true,
      postId,
      status: scheduledUnix ? 'scheduled' : 'published',
      message: scheduledUnix ? 'Post scheduled successfully' : 'Post published successfully',
    });
  } catch (error: any) {
    console.error('Facebook publish error:', error);
    return res.status(500).json({
      error: 'Failed to publish to Facebook',
      details: error?.message || String(error),
    });
  }
}

