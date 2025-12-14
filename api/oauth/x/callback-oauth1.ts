// api/oauth/x/callback-oauth1.ts
// X (Twitter) OAuth 1.0a callback for media uploads

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminApp } from '../../_firebaseAdmin.js';
import { createHmac, randomBytes } from 'crypto';

/**
 * Generate OAuth 1.0a signature
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
 * Handle X OAuth 1.0a callback
 * Exchanges request token for access token and stores it
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { oauth_token, oauth_verifier, denied } = req.query;

    if (denied) {
      return res.redirect(`/?error=oauth_denied&platform=x&type=oauth1`);
    }

    if (!oauth_token || !oauth_verifier) {
      return res.redirect(`/?error=missing_params&platform=x&type=oauth1`);
    }

    // Find the user by matching the oauth_token to a stored request token
    const adminApp = getAdminApp();
    const db = adminApp.firestore();
    
    let userId: string | null = null;
    let requestTokenSecret: string | null = null;

    // Search for the request token in all users' temp collections
    const usersSnapshot = await db.collection('users').get();
    for (const userDoc of usersSnapshot.docs) {
      const tempTokenDoc = await db.collection('users').doc(userDoc.id).collection('x_oauth1_temp').doc('request_token').get();
      if (tempTokenDoc.exists && tempTokenDoc.data()?.oauthToken === oauth_token) {
        userId = userDoc.id;
        requestTokenSecret = tempTokenDoc.data()?.oauthTokenSecret;
        // Clean up the temporary request token
        await db.collection('users').doc(userDoc.id).collection('x_oauth1_temp').doc('request_token').delete();
        break;
      }
    }

    if (!userId || !requestTokenSecret) {
      console.error('OAuth 1.0a: Could not find matching request token for oauth_token:', oauth_token);
      return res.redirect(`/?error=oauth1_token_mismatch&platform=x&type=oauth1`);
    }
    const consumerKey = process.env.TWITTER_CLIENT_ID || process.env.X_CLIENT_ID;
    const consumerSecret = process.env.TWITTER_CLIENT_SECRET || process.env.X_CLIENT_SECRET;

    if (!consumerKey || !consumerSecret) {
      return res.redirect(`/?error=oauth_not_configured&platform=x&type=oauth1`);
    }

    // Step 2: Exchange request token for access token
    const accessTokenUrl = 'https://api.twitter.com/oauth/access_token';
    
    const nonce = randomBytes(16).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    const oauthParams: Record<string, string> = {
      oauth_consumer_key: consumerKey,
      oauth_token: oauth_token as string,
      oauth_verifier: oauth_verifier as string,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_version: '1.0',
    };
    
    const signature = generateOAuth1Signature('POST', accessTokenUrl, oauthParams, consumerSecret, requestTokenSecret);
    oauthParams.oauth_signature = signature;
    
    // Build Authorization header (RFC 5849 Section 3.5.1)
    const sortedOAuthKeys = Object.keys(oauthParams).sort();
    const authHeader = 'OAuth ' + sortedOAuthKeys
      .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
      .join(', ');
    
    const tokenResponse = await fetch(accessTokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
      },
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('OAuth 1.0a access token exchange failed:', errorText);
      return res.redirect(`/?error=token_exchange_failed&platform=x&type=oauth1`);
    }

    const tokenData = new URLSearchParams(await tokenResponse.text());
    const oauthToken = tokenData.get('oauth_token');
    const oauthTokenSecret = tokenData.get('oauth_token_secret');
    const userIdFromToken = tokenData.get('user_id');
    const screenName = tokenData.get('screen_name');

    if (!oauthToken || !oauthTokenSecret) {
      return res.redirect(`/?error=invalid_token_response&platform=x&type=oauth1`);
    }

    // Store OAuth 1.0a tokens in Firestore (alongside OAuth 2.0 tokens)
    const socialAccountRef = db
      .collection('users')
      .doc(userId)
      .collection('social_accounts')
      .doc('x');

    // Update existing account with OAuth 1.0a credentials
    await socialAccountRef.set({
      // Keep existing OAuth 2.0 tokens
      // Add OAuth 1.0a tokens for media uploads
      oauthToken: oauthToken,
      oauthTokenSecret: oauthTokenSecret,
      oauth1UserId: userIdFromToken,
      oauth1ScreenName: screenName,
      oauth1ConnectedAt: new Date().toISOString(),
    }, { merge: true });

    return res.redirect(`/?oauth_success=x&type=oauth1`);
  } catch (error: any) {
    console.error('X OAuth 1.0a callback error:', error);
    return res.redirect(`/?error=oauth_failed&platform=x&type=oauth1`);
  }
}

