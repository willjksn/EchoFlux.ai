import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Thin entry: loads heavy deps (Stripe, Firebase Admin) only after POST,
 * and returns JSON if the core module fails to load (avoids Vercel FUNCTION_INVOCATION_FAILED with no body).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { runCreateCheckoutSession } = await import('./_createCheckoutSessionCore.js');
    await runCreateCheckoutSession(req, res);
  } catch (e: unknown) {
    console.error('createCheckoutSession: failed to load or run core handler:', e);
    if (!res.headersSent) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({
        error: 'Checkout unavailable',
        message:
          'The checkout service could not start. Please try again. If this persists, verify Stripe and Firebase Admin env vars on your deployment.',
        details:
          process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV === 'development' ? msg : undefined,
      });
    }
  }
}
