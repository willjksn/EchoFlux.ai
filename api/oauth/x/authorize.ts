import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from '../../verifyAuth.js';
import { createHash, randomBytes } from 'crypto';

/**
 * CRITICAL: Redirect URI Consistency
 * 
 * The redirect URI MUST be EXACTLY the same in all three places:
 * 
 * A) X Developer Portal: https://echoflux.ai/api/oauth/x/callback
 * B) Authorization request (this file): https://echoflux.ai/api/oauth/x/callback
 * C) Token exchange (callback.ts): https://echoflux.ai/api/oauth/x/callback
 * 
 * No variations, no encoding mismatches, no trailing slashes.
 * Any difference will cause OAuth to fail.
 */

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

    // Note: redirectUri from req.body is ignored - we use hardcoded value for exact match
    const clientId = process.env.TWITTER_CLIENT_ID || process.env.X_CLIENT_ID;

    // Note: We don't need clientSecret in the authorize step, only in callback
    if (!clientId) {
      return res.status(500).json({
        error: 'Twitter/X OAuth not configured',
        details: 'Missing TWITTER_CLIENT_ID or X_CLIENT_ID environment variable'
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
    // Correct endpoint: https://twitter.com/i/oauth2/authorize (NOT /i/api/2/oauth2/authorize)
    const baseUrl = 'https://twitter.com/i/oauth2/authorize';
    
    // CRITICAL: Use EXACT same redirect URI everywhere (must match X Developer Portal and token exchange)
    // Must be identical to: https://echoflux.ai/api/oauth/x/callback
    // No trailing slash, no encoding variations, exact string match required
    const redirectUri = 'https://echoflux.ai/api/oauth/x/callback';
    
    console.log('X OAuth authorize:', {
      clientId: clientId?.substring(0, 10) + '...',
      redirectUri: redirectUri,
      origin: req.headers.origin,
      host: req.headers.host,
    });
    
    // Build params manually to ensure proper encoding
    // X API requires spaces in scope to be URL-encoded as %20, not +
    // Note: media.write scope may be needed for media uploads, but OAuth 2.0 may not support v1.1 media upload endpoint
    const scope = 'tweet.read tweet.write users.read offline.access media.write';
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri, // Exact same string as X Developer Portal
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256', // SHA256 method for PKCE
    });
    
    // Add scope separately to ensure proper encoding (spaces as %20)
    params.append('scope', scope);

    const authUrl = `${baseUrl}?${params.toString()}`;
    
    // Verify the URL is correct before returning
    if (!authUrl.includes('/i/oauth2/authorize')) {
      console.error('ERROR: Generated URL has wrong path:', authUrl);
      throw new Error('Invalid OAuth URL path generated');
    }
    
    console.log('X OAuth authorization URL generated:', {
      baseUrl: baseUrl,
      fullUrl: authUrl.substring(0, 150) + '...',
      clientId: clientId?.substring(0, 10) + '...',
      redirectUri: redirectUri, // Exact same string used everywhere
      scope: scope,
      hasCodeChallenge: !!codeChallenge,
      urlLength: authUrl.length,
      pathCorrect: authUrl.includes('/i/oauth2/authorize'),
    });

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
