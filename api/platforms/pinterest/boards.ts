// api/platforms/pinterest/boards.ts
// Pinterest API v5 - Get user boards

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

interface PinterestBoard {
  id: string;
  name: string;
  description?: string;
  privacy?: 'PUBLIC' | 'SECRET';
  owner?: {
    username?: string;
  };
}

/**
 * Get user's Pinterest boards
 * Pinterest API v5: GET /v5/boards
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication
    const authUser = await verifyAuth(req);
    if (!authUser || !authUser.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
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

    // Fetch boards from Pinterest API v5
    // GET /v5/boards?page_size=250
    const boardsUrl = 'https://api.pinterest.com/v5/boards';
    const queryParams = new URLSearchParams({
      page_size: '250', // Max boards per request
      privacy: 'all', // Include both public and secret boards
    });

    console.log('Fetching Pinterest boards for user:', authUser.uid);

    const boardsResponse = await fetch(`${boardsUrl}?${queryParams.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!boardsResponse.ok) {
      let errorText = await boardsResponse.text();
      let errorData: any = {};
      try {
        errorData = JSON.parse(errorText);
      } catch {
        // If not JSON, use raw text
      }

      console.error('Pinterest boards fetch failed:', {
        status: boardsResponse.status,
        statusText: boardsResponse.statusText,
        error: errorText,
        errorData: errorData,
      });

      const errorMessage = errorData.message || 
                          errorData.error_description || 
                          errorData.error || 
                          errorText.substring(0, 200);

      return res.status(boardsResponse.status).json({
        error: 'Failed to fetch Pinterest boards',
        details: errorMessage,
        pinterestError: errorData,
      });
    }

    const boardsData = await boardsResponse.json();
    
    // Pinterest API v5 returns items array with pagination
    const boards: PinterestBoard[] = boardsData.items || [];
    
    console.log('Pinterest boards fetched successfully:', {
      count: boards.length,
      hasMore: !!boardsData.bookmark,
    });

    // Format boards for frontend
    const formattedBoards = boards.map((board: PinterestBoard) => ({
      id: board.id,
      name: board.name,
      description: board.description || '',
      privacy: board.privacy || 'PUBLIC',
      owner: board.owner?.username || account.accountUsername || '',
    }));

    // Update last synced time
    await socialAccountRef.update({
      lastBoardsSync: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      boards: formattedBoards,
      total: formattedBoards.length,
      hasMore: !!boardsData.bookmark,
      bookmark: boardsData.bookmark || null, // For pagination if needed
    });

  } catch (error: any) {
    console.error('Pinterest boards fetch error:', error);
    return res.status(500).json({
      error: 'Failed to fetch Pinterest boards',
      details: error?.message || String(error)
    });
  }
}
