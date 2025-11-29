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
    // Get authorization URL from backend
    const response = await fetch(`/api/oauth/${platform.toLowerCase()}/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        redirectUri: `${window.location.origin}/api/oauth/${platform.toLowerCase()}/callback`,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to initiate OAuth flow');
    }

    const { authUrl } = await response.json();

    // Redirect user to OAuth provider
    window.location.href = authUrl;
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

