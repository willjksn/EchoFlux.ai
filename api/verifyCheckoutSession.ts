import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { verifyAuth } from './verifyAuth.js';
import { getAdminDb } from './_firebaseAdmin.js';
import { recordPlanChangeEvent } from './_planChangeEvents.js';

// Stripe init mirrors api/createCheckoutSession.ts so behavior stays consistent.
const stripeUseTestModeEnv = (process.env.STRIPE_USE_TEST_MODE || '').toString().toLowerCase().trim();
const useTestMode = stripeUseTestModeEnv === 'true' || stripeUseTestModeEnv === '1' || stripeUseTestModeEnv === 'yes';

let stripeSecretKey: string | null = null;
if (useTestMode) {
  stripeSecretKey = process.env.STRIPE_SECRET_KEY_Test || null;
} else {
  stripeSecretKey = process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY || null;
}

// Guard: prevent accidental live key use in test mode
if (stripeSecretKey && useTestMode && !stripeSecretKey.startsWith('sk_test_')) {
  console.error(
    `⚠️ CRITICAL: STRIPE_USE_TEST_MODE is true but key does not start with sk_test_. Refusing to verify checkout session.`
  );
  stripeSecretKey = null;
}

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' as Stripe.LatestApiVersion })
  : null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!stripe) return res.status(500).json({ error: 'Payment system not configured' });

  try {
    const decoded = await verifyAuth(req);
    if (!decoded?.uid) return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });

    const { sessionId } = (req.body || {}) as { sessionId?: string };
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });

    const sessionUserId = session.metadata?.userId || session.client_reference_id || null;
    if (!sessionUserId || sessionUserId !== decoded.uid) {
      return res.status(403).json({
        error: 'Checkout session does not belong to this user',
        code: 'SESSION_NOT_OWNED',
      });
    }

    // Stripe uses both `status` and `payment_status` depending on mode/session type.
    const isComplete =
      session.status === 'complete' ||
      session.payment_status === 'paid' ||
      session.payment_status === 'no_payment_required';

    if (!isComplete) {
      return res.status(409).json({
        error: 'Checkout session not completed',
        code: 'CHECKOUT_NOT_COMPLETE',
        status: session.status,
        payment_status: session.payment_status,
      });
    }

    const planName = session.metadata?.planName;
    const billingCycle = session.metadata?.billingCycle;

    if (!planName || !billingCycle) {
      return res.status(500).json({ error: 'Missing plan metadata on Stripe session' });
    }

    const db = getAdminDb();
    const now = new Date().toISOString();

    // Record plan change event (promo cohort tracking). We intentionally do this in the same call
    // that applies the plan so the event is available immediately after redirect.
    let fromPlan: string | null = null;
    try {
      const existing = await db.collection('users').doc(decoded.uid).get();
      fromPlan = (existing.data() as any)?.plan || null;
    } catch {}

    // Pull Stripe identifiers from the completed session so upgrades can be prorated immediately,
    // even if webhooks are delayed/misconfigured in sandbox.
    let stripeSubscriptionId: string | null = null;
    let stripeCustomerId: string | null = null;
    let subscriptionStatus: string | null = null;

    try {
      const subObj = session.subscription;
      const subscription =
        typeof subObj === 'string'
          ? await stripe.subscriptions.retrieve(subObj)
          : (subObj as Stripe.Subscription | null);

      if (subscription) {
        stripeSubscriptionId = subscription.id;
        stripeCustomerId = subscription.customer as string;
        subscriptionStatus = subscription.status;
      }
    } catch (err) {
      console.warn('verifyCheckoutSession: failed to resolve subscription from session:', err);
    }

    await db.collection('users').doc(decoded.uid).set(
      {
        plan: planName,
        userType: 'Creator',
        billingCycle,
        subscriptionStartDate: now,
        cancelAtPeriodEnd: false,
        subscriptionEndDate: null,
        subscriptionStatus: subscriptionStatus || undefined,
        stripeCustomerId: stripeCustomerId || undefined,
        stripeSubscriptionId: stripeSubscriptionId || undefined,
        monthlyCaptionGenerationsUsed: 0,
        monthlyImageGenerationsUsed: 0,
        monthlyVideoGenerationsUsed: 0,
      },
      { merge: true }
    );

    // Only record when plan actually changes (avoid noise on repeated calls)
    if (fromPlan !== planName) {
      try {
        await recordPlanChangeEvent({
          userId: decoded.uid,
          fromPlan,
          toPlan: planName,
          changedAtIso: now,
          source: 'verify_checkout_session',
          stripeSessionId: sessionId,
          stripeSubscriptionId,
        });
      } catch (err) {
        console.warn('Failed to record plan change event:', err);
      }
    }

    return res.status(200).json({
      success: true,
      planName,
      billingCycle,
      sessionId,
    });
  } catch (error: any) {
    console.error('verifyCheckoutSession error:', error);
    return res.status(500).json({
      error: 'Failed to verify checkout session',
      message: error?.message || 'Unknown error',
      code: 'VERIFY_CHECKOUT_FAILED',
    });
  }
}


