// api/oauth/x/debug.ts
// Admin-only diagnostics for X OAuth configuration

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from '../../verifyAuth.js';
import { getAdminApp } from '../../_firebaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authUser = await verifyAuth(req);
    if (!authUser?.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const adminApp = getAdminApp();
    const db = adminApp.firestore();

    const userDoc = await db.collection('users').doc(authUser.uid).get();
    const role = userDoc.data()?.role;
    if (role !== 'Admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const apiKey = process.env.TWITTER_API_KEY || process.env.X_API_KEY || '';
    const clientId = process.env.TWITTER_CLIENT_ID || process.env.X_CLIENT_ID || '';
    const consumerKey = apiKey || clientId;

    let keySource = 'none';
    if (apiKey) {
      keySource = process.env.TWITTER_API_KEY ? 'TWITTER_API_KEY' : 'X_API_KEY';
    } else if (clientId) {
      keySource = process.env.TWITTER_CLIENT_ID ? 'TWITTER_CLIENT_ID' : 'X_CLIENT_ID';
    }

    const socialAccountDoc = await db
      .collection('users')
      .doc(authUser.uid)
      .collection('social_accounts')
      .doc('x')
      .get();

    const socialAccount = socialAccountDoc.exists ? socialAccountDoc.data() : null;
    const hasOAuth1Tokens = !!(socialAccount?.oauthToken && socialAccount?.oauthTokenSecret);

    return res.status(200).json({
      keySource,
      consumerKeyPrefix: consumerKey ? `${consumerKey.slice(0, 8)}...` : null,
      hasApiKeyEnv: !!apiKey,
      hasClientIdEnv: !!clientId,
      hasOAuth1Tokens,
      callbackUrl: 'https://echoflux.ai/api/oauth/x/callback-oauth1',
    });
  } catch (error: any) {
    console.error('X OAuth debug error:', error);
    return res.status(500).json({
      error: 'Failed to load X OAuth debug',
      details: error?.message || String(error),
    });
  }
}
