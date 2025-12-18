// api/oauth/x/authorize-oauth1.ts
// X (Twitter) OAuth 1.0a authorization for media uploads
// X API v1.1 media upload requires OAuth 1.0a, not OAuth 2.0

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from '../../verifyAuth.js';
import { createHmac, randomBytes } from 'crypto';
import { getAdminApp } from '../../_firebaseAdmin.js';

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
 * Start X OAuth 1.0a flow for media uploads
 * Returns authorization URL and request token
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

    const consumerKey = process.env.TWITTER_CLIENT_ID || process.env.X_CLIENT_ID;
    const consumerSecret = process.env.TWITTER_CLIENT_SECRET || process.env.X_CLIENT_SECRET;

    if (!consumerKey || !consumerSecret) {
      return res.status(500).json({
        error: 'X OAuth not configured',
        details: 'Missing TWITTER_CLIENT_ID or TWITTER_CLIENT_SECRET'
      });
    }

    // Step 1: Get request token
    const requestTokenUrl = 'https://api.twitter.com/oauth/request_token';
    const callbackUrl = 'https://echoflux.ai/api/oauth/x/callback-oauth1';
    
    // Validate callback URL format
    try {
      const urlTest = new URL(callbackUrl);
      if (urlTest.protocol !== 'https:') {
        return res.status(500).json({
          error: 'Invalid callback URL',
          details: 'Callback URL must use HTTPS protocol'
        });
      }
      // Check for invalid characters (X is strict about URL format)
      if (!/^[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/.test(callbackUrl)) {
        return res.status(500).json({
          error: 'Invalid callback URL',
          details: 'Callback URL contains invalid characters. Only alphanumeric, hyphens, dots, slashes, and standard URL characters are allowed.'
        });
      }
    } catch (urlError) {
      return res.status(500).json({
        error: 'Invalid callback URL format',
        details: `Callback URL is malformed: ${urlError instanceof Error ? urlError.message : String(urlError)}`
      });
    }
    
    // Generate OAuth 1.0a parameters
    const nonce = randomBytes(16).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    const oauthParams: Record<string, string> = {
      oauth_callback: callbackUrl,
      oauth_consumer_key: consumerKey,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_version: '1.0',
    };
    
    // Generate signature (without oauth_signature in params)
    const signature = generateOAuth1Signature('POST', requestTokenUrl, oauthParams, consumerSecret);
    
    // Add signature to params (will be percent-encoded in header)
    oauthParams.oauth_signature = signature;
    
    // Build Authorization header (RFC 5849 Section 3.5.1)
    // According to X docs: https://docs.x.com/fundamentals/authentication/oauth-1-0a/authorizing-a-request
    // Sort OAuth parameters alphabetically by key
    const sortedOAuthKeys = Object.keys(oauthParams).sort();
    const authHeader = 'OAuth ' + sortedOAuthKeys
      .map(key => {
        // Percent-encode both key and value as per X documentation
        const encodedKey = encodeURIComponent(key);
        const encodedValue = encodeURIComponent(oauthParams[key]);
        return `${encodedKey}="${encodedValue}"`;
      })
      .join(', ');
    
    // Debug: Log the header (without sensitive data)
    console.log('OAuth 1.0a Authorization header (sanitized):', {
      hasSignature: !!oauthParams.oauth_signature,
      signatureLength: oauthParams.oauth_signature?.length,
      paramCount: sortedOAuthKeys.length,
      headerLength: authHeader.length,
    });
    
    // Request token
    console.log('OAuth 1.0a request token - sending request:', {
      url: requestTokenUrl,
      method: 'POST',
      callbackUrl,
      consumerKey: consumerKey ? `${consumerKey.substring(0, 8)}...` : 'missing',
      hasConsumerSecret: !!consumerSecret,
    });
    
    const tokenResponse = await fetch(requestTokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
      },
    });

    const responseText = await tokenResponse.text();
    
    if (!tokenResponse.ok) {
      const statusText = tokenResponse.statusText;
      
      // Log full error details for debugging
      console.error('OAuth 1.0a request token failed:', {
        status: tokenResponse.status,
        statusText,
        responseText,
        url: requestTokenUrl,
        callbackUrl,
        callbackUrlLength: callbackUrl.length,
        callbackUrlEncoded: encodeURIComponent(callbackUrl),
        consumerKey: consumerKey ? `${consumerKey.substring(0, 8)}...` : 'missing',
        headers: Object.fromEntries(tokenResponse.headers.entries()),
      });
      
      // Parse error message for better user feedback
      let errorMessage = 'Failed to get request token from X';
      let errorDetails = responseText || statusText;
      let troubleshootingSteps: string[] = [];
      
      if (responseText.includes('Invalid callback URL') || 
          responseText.includes('callback') || 
          responseText.includes('Invalid callback url') ||
          responseText.toLowerCase().includes('callback')) {
        errorMessage = 'OAuth 1.0a callback URL not registered or invalid';
        errorDetails = `X rejected the callback URL: "${callbackUrl}"\n\nX's response: ${responseText}`;
        troubleshootingSteps = [
          '1. Go to X Developer Portal → Your App → Settings → User authentication settings',
          '2. Make sure OAuth 1.0a is ENABLED (separate from OAuth 2.0)',
          '3. Find the OAuth 1.0a Callback URLs section (NOT OAuth 2.0 section)',
          `4. Verify the URL is registered exactly as: ${callbackUrl}`,
          '5. Check for: no trailing slash, exact case, no extra spaces',
          '6. If the URL is already there, DELETE it and RE-ADD it',
          '7. Wait 2-3 minutes after saving before testing again',
          '8. Make sure App permissions are set to "Read and write"'
        ];
      } else if (responseText.includes('Invalid consumer key') || responseText.includes('401')) {
        errorMessage = 'Invalid X API credentials';
        errorDetails = 'Please verify that TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET are correct in your Vercel environment variables.';
      } else if (responseText.includes('Forbidden') || responseText.includes('403')) {
        errorMessage = 'OAuth 1.0a not enabled for your X app';
        errorDetails = 'OAuth 1.0a must be enabled in your X Developer Portal. Go to your X App settings → User authentication settings and enable "OAuth 1.0a" authentication.';
      }
      
      return res.status(500).json({
        error: errorMessage,
        details: errorDetails,
        status: tokenResponse.status,
        twitterError: responseText,
        callbackUrl: callbackUrl,
        troubleshootingSteps: troubleshootingSteps.length > 0 ? troubleshootingSteps : undefined,
        help: troubleshootingSteps.length > 0 
          ? 'Follow the troubleshooting steps above. The most common issue is registering the URL in the OAuth 2.0 section instead of OAuth 1.0a section.'
          : 'Make sure OAuth 1.0a is enabled in your X Developer Portal and the callback URL is registered.'
      });
    }

    console.log('OAuth 1.0a request token - response received:', {
      status: tokenResponse.status,
      responseLength: responseText.length,
      responsePreview: responseText.substring(0, 200),
    });
    
    const tokenData = new URLSearchParams(responseText);
    const oauthToken = tokenData.get('oauth_token');
    const oauthTokenSecret = tokenData.get('oauth_token_secret');

    if (!oauthToken || !oauthTokenSecret) {
      return res.status(500).json({
        error: 'Invalid request token response',
        details: 'Missing oauth_token or oauth_token_secret'
      });
    }

    // Store request token temporarily in Firestore for callback
    const adminApp = getAdminApp();
    const db = adminApp.firestore();
    await db.collection('users').doc(authUser.uid).collection('x_oauth1_temp').doc('request_token').set({
      oauthToken: oauthToken,
      oauthTokenSecret: oauthTokenSecret,
      timestamp: new Date().toISOString(),
    }, { merge: true });

    // Build authorization URL
    const authUrl = `https://api.twitter.com/oauth/authorize?oauth_token=${encodeURIComponent(oauthToken)}`;

    return res.status(200).json({
      authUrl,
    });
  } catch (error: any) {
    console.error('X OAuth 1.0a authorize error:', error);
    return res.status(500).json({
      error: 'Failed to generate authorization URL',
      details: error?.message || String(error),
      help: 'Check that OAuth 1.0a is enabled in your X Developer Portal and the callback URL is registered.'
    });
  }
}

