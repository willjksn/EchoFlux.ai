import { VercelRequest, VercelResponse } from '@vercel/node';
import { searchWeb } from './_webSearch.js';
import { getVerifyAuth } from './_errorHandler.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Verify authentication
    const verifyAuth = await getVerifyAuth();
    const user = await verifyAuth(req);
    
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Only allow Admin users
    const userRole = (user as any)?.role;
    if (userRole !== 'Admin') {
      res.status(403).json({ 
        error: 'Forbidden',
        note: 'Web search is only available for Admin users.'
      });
      return;
    }

    const { query, maxResults, searchDepth, bypassCache } = req.body || {};

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Missing or invalid query parameter' });
      return;
    }

    // Perform web search
    const result = await searchWeb(
      query,
      user.uid,
      (user as any)?.plan,
      userRole,
      {
        maxResults,
        searchDepth,
        bypassCache,
      }
    );

    res.status(200).json(result);
  } catch (error: any) {
    console.error('[webSearch] Error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error',
      results: [],
    });
  }
}
