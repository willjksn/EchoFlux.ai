import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from '../../verifyAuth.js';

/**
 * Start LinkedIn OAuth flow
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
    const clientId = process.env.LINKEDIN_CLIENT_ID;

    if (!clientId) {
      return res.status(500).json({
        error: 'LinkedIn OAuth not configured',
        details: 'Missing LINKEDIN_CLIENT_ID'
      });
    }

    // Generate state parameter for security (include user ID and redirectUri)
    const finalRedirectUri = redirectUri || `${req.headers.origin || 'http://localhost:3000'}/api/oauth/linkedin/callback`;
    const state = Buffer.from(JSON.stringify({
      userId: authUser.uid,
      timestamp: Date.now(),
      redirectUri: finalRedirectUri,
    })).toString('base64');

    // Build authorization URL
    // LinkedIn OAuth 2.0 authorization endpoint
    const baseUrl = 'https://www.linkedin.com/oauth/v2/authorization';
    
    // Ensure redirectUri is normalized (no trailing slash, correct protocol)
    const normalizedRedirectUri = finalRedirectUri.replace(/\/$/, '');
    
    console.log('LinkedIn OAuth authorize:', {
      clientId: clientId?.substring(0, 10) + '...',
      redirectUri: normalizedRedirectUri,
      origin: req.headers.origin,
      host: req.headers.host,
    });
    
    // LinkedIn OAuth scopes:
    // - openid: Basic profile information
    // - profile: Full profile information
    // - email: Email address
    // - w_member_social: Post content on behalf of member
    // - r_liteprofile: Read basic profile (deprecated but still used)
    // - r_basicprofile: Read basic profile
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: normalizedRedirectUri,
      state: state,
      scope: 'openid profile email w_member_social',
    });

    const authUrl = `${baseUrl}?${params.toString()}`;

    return res.status(200).json({
      authUrl,
      state,
    });
  } catch (error: any) {
    console.error('LinkedIn authorize error:', error);
    return res.status(500).json({
      error: 'Failed to generate authorization URL',
      details: error?.message || String(error)
    });
  }
}
