import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from '../../verifyAuth';
import { createHash, randomBytes } from 'crypto';

/**
 * Generate PKCE code verifier and challenge
 * Twitter/X OAuth 2.0 requires PKCE (Proof Key for Code Exchange)
 */
function generatePKCE() {
  // Generate a random code verifier (43-128 characters, URL-safe)
  const codeVerifier = randomBytes(32).toString('base64url');
  
  // Create SHA256 hash of the verifier
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  
  return {
    codeVerifier,
    codeChallenge,
  };
}

/**
 * Start Twitter/X OAuth flow
 * Returns authorization URL for frontend to redirect to
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

    const { redirectUri } = req.body || {};
    const clientId = process.env.TWITTER_CLIENT_ID || process.env.X_CLIENT_ID;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET || process.env.X_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({
        error: 'Twitter/X OAuth not configured',
        details: 'Missing TWITTER_CLIENT_ID/X_CLIENT_ID or TWITTER_CLIENT_SECRET/X_CLIENT_SECRET'
      });
    }

    // Generate PKCE code verifier and challenge
    const { codeVerifier, codeChallenge } = generatePKCE();

    // Generate state parameter for security (include user ID and code verifier)
    const state = Buffer.from(JSON.stringify({
      userId: authUser.uid,
      codeVerifier: codeVerifier, // Store verifier in state to retrieve in callback
      timestamp: Date.now(),
    })).toString('base64');

    // Build authorization URL
    // Twitter/X uses OAuth 2.0 with authorization code flow + PKCE
    const baseUrl = 'https://twitter.com/i/oauth2/authorize';
    const callbackUrl = redirectUri || `${req.headers.origin || 'http://localhost:3000'}/api/oauth/x/callback`;
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: callbackUrl,
      scope: 'tweet.read tweet.write users.read offline.access', // Scopes for Twitter API v2
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256', // SHA256 method for PKCE
    });

    const authUrl = `${baseUrl}?${params.toString()}`;

    return res.status(200).json({
      authUrl,
      state,
    });
  } catch (error: any) {
    console.error('Twitter/X authorize error:', error);
    // Ensure we always return JSON, even on error
    try {
      return res.status(500).json({
        error: 'Failed to generate authorization URL',
        details: error?.message || String(error)
      });
    } catch (jsonError) {
      // If JSON response fails, try plain text as last resort
      return res.status(500).send(JSON.stringify({
        error: 'Failed to generate authorization URL',
        details: error?.message || String(error)
      }));
    }
  }
}
