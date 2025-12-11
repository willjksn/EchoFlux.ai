// api/platforms/pinterest/publish.ts
// Pinterest API v5 pin creation

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from '../../verifyAuth.js';
import { getAdminApp } from '../../_firebaseAdmin.js';

interface PinterestAccount {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  connected: boolean;
  accountId?: string;
  accountUsername?: string;
}

interface PublishRequest {
  mediaUrl: string; // Public HTTPS URL to image
  title: string; // Pin title (required)
  description: string; // Pin description (caption)
  boardId: string; // Pinterest board ID where pin will be created
}

/**
 * Create a Pin on Pinterest
 * Pinterest API v5: POST /v5/pins
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

    const { mediaUrl, title, description, boardId } = req.body as PublishRequest;

    // Validate required fields
    if (!mediaUrl || !title || !boardId) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'mediaUrl, title, and boardId are required'
      });
    }

    // Validate mediaUrl is HTTPS
    if (!mediaUrl.startsWith('https://')) {
      return res.status(400).json({
        error: 'Invalid media URL',
        details: 'Media URL must be a publicly accessible HTTPS URL'
      });
    }

    // Get Pinterest account from Firestore
    const adminApp = getAdminApp();
    const db = adminApp.firestore();
    const socialAccountRef = db
      .collection('users')
      .doc(authUser.uid)
      .collection('social_accounts')
      .doc('pinterest');

    const accountDoc = await socialAccountRef.get();
    if (!accountDoc.exists) {
      return res.status(404).json({
        error: 'Pinterest account not connected',
        details: 'Please connect your Pinterest account in Settings'
      });
    }

    const account = accountDoc.data() as PinterestAccount;
    if (!account.connected || !account.accessToken) {
      return res.status(401).json({
        error: 'Pinterest account not connected',
        details: 'Please reconnect your Pinterest account'
      });
    }

    // Check if token is expired
    if (account.expiresAt) {
      const expiresAt = new Date(account.expiresAt);
      const now = new Date();
      if (expiresAt.getTime() <= now.getTime()) {
        return res.status(401).json({
          error: 'Pinterest access token expired',
          details: 'Please reconnect your Pinterest account'
        });
      }
    }

    // Create Pin using Pinterest API v5
    const pinUrl = 'https://api.pinterest.com/v5/pins';
    
    const pinData = {
      board_id: boardId,
      media_source: {
        source_type: 'image_url',
        url: mediaUrl
      },
      title: title.substring(0, 100), // Pinterest title limit is 100 characters
      description: description.substring(0, 8000), // Pinterest description limit is 8000 characters
    };

    console.log('Creating Pinterest pin:', {
      boardId,
      title: title.substring(0, 50),
      hasDescription: !!description,
      mediaUrl: mediaUrl.substring(0, 50) + '...',
    });

    const pinResponse = await fetch(pinUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pinData),
    });

    if (!pinResponse.ok) {
      let errorText = await pinResponse.text();
      let errorData: any = {};
      try {
        errorData = JSON.parse(errorText);
      } catch {
        // If not JSON, use raw text
      }

      console.error('Pinterest pin creation failed:', {
        status: pinResponse.status,
        statusText: pinResponse.statusText,
        error: errorText,
        errorData: errorData,
      });

      const errorMessage = errorData.message || 
                          errorData.error_description || 
                          errorData.error || 
                          errorText.substring(0, 200);

      return res.status(pinResponse.status).json({
        error: 'Failed to create Pinterest pin',
        details: errorMessage,
        pinterestError: errorData,
      });
    }

    const pinResult = await pinResponse.json();
    
    console.log('Pinterest pin created successfully:', {
      pinId: pinResult.id,
      boardId: pinResult.board_id,
    });

    // Update last synced time
    await socialAccountRef.update({
      lastSyncedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      pinId: pinResult.id,
      boardId: pinResult.board_id,
      url: pinResult.pin_url || `https://www.pinterest.com/pin/${pinResult.id}/`,
      status: 'published',
    });

  } catch (error: any) {
    console.error('Pinterest publish error:', error);
    return res.status(500).json({
      error: 'Failed to publish to Pinterest',
      details: error?.message || String(error)
    });
  }
}
