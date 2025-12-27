import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { verifyAuth } from './verifyAuth.js';
import { getAdminDb } from './_firebaseAdmin.js';

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
  console.error(`⚠️ CRITICAL: STRIPE_USE_TEST_MODE is true but key does not start with sk_test_. Refusing to preview subscription change.`);
  stripeSecretKey = null;
}

const isUsingTestKey = stripeSecretKey?.startsWith('sk_test_') === true;
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' as Stripe.LatestApiVersion })
  : null;

type BillingCycle = 'monthly' | 'annually';

const PLAN_RANK: Record<string, number> = {
  Free: 0,
  Caption: 0,
  Starter: 0,
  Growth: 0,
  Pro: 1,
  Elite: 2,
  OnlyFansStudio: 2,
  Agency: 3,
};

const getPriceId = (planName: string, cycle: BillingCycle): string => {
  const suffix = cycle === 'monthly' ? 'MONTHLY' : 'ANNUALLY';
  const envVarBase = `STRIPE_PRICE_${planName.toUpperCase()}_${suffix}`;
  if (isUsingTestKey) return process.env[`${envVarBase}_Test`] || process.env[envVarBase] || '';
  return process.env[`${envVarBase}_LIVE`] || process.env[envVarBase] || '';
};

const PLAN_PRICE_IDS: Record<string, { monthly: string; annually: string }> = {
  Pro: { monthly: getPriceId('Pro', 'monthly'), annually: getPriceId('Pro', 'annually') },
  Elite: { monthly: getPriceId('Elite', 'monthly'), annually: getPriceId('Elite', 'annually') },
  Caption: { monthly: getPriceId('Caption', 'monthly'), annually: getPriceId('Caption', 'annually') },
  OnlyFansStudio: { monthly: getPriceId('OnlyFansStudio', 'monthly'), annually: getPriceId('OnlyFansStudio', 'annually') },
  Agency: { monthly: getPriceId('Agency', 'monthly'), annually: getPriceId('Agency', 'annually') },
};

const ANNUAL_TOTAL_OVERRIDE_CENTS: Record<string, number> = {
  Pro: 27600,
  Elite: 56400,
};

async function getOrCreateAnnualOverridePriceId(params: {
  db: ReturnType<typeof getAdminDb>;
  planName: string;
  monthlyPriceId: string;
  overrideCents: number;
}) {
  const { db, planName, monthlyPriceId, overrideCents } = params;
  if (!stripe) throw new Error('Stripe not configured');

  const modeKey = isUsingTestKey ? 'test' : 'live';
  const docId = `${modeKey}_${planName}_annual_override`;
  const ref = db.collection('stripe_price_overrides').doc(docId);
  const snap = await ref.get();
  const existing = snap.exists ? (snap.data() as any) : null;
  if (existing?.priceId) return existing.priceId as string;

  const monthlyPrice = await stripe.prices.retrieve(monthlyPriceId);
  const currency = monthlyPrice.currency || 'usd';
  const product = typeof monthlyPrice.product === 'string' ? monthlyPrice.product : monthlyPrice.product?.id;
  if (!product) throw new Error(`Could not resolve Stripe product for ${planName} monthly price`);

  const created = await stripe.prices.create({
    currency,
    product,
    unit_amount: overrideCents,
    recurring: { interval: 'year' },
    nickname: `${planName} Annual (Override)`,
    metadata: {
      planName,
      purpose: 'annual_total_override',
      createdBy: 'api/previewSubscriptionChange',
      mode: modeKey,
    },
  });

  await ref.set(
    {
      planName,
      cycle: 'annually',
      mode: modeKey,
      priceId: created.id,
      unitAmount: overrideCents,
      createdAtIso: new Date().toISOString(),
    },
    { merge: true }
  );

  return created.id;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!stripe) return res.status(500).json({ error: 'Payment system not configured' });

  try {
    const decoded = await verifyAuth(req);
    if (!decoded?.uid) return res.status(401).json({ error: 'Unauthorized' });

    const { planName, billingCycle } = (req.body || {}) as { planName?: string; billingCycle?: BillingCycle };
    if (!planName || !billingCycle) {
      return res.status(400).json({ error: 'planName and billingCycle are required' });
    }

    const db = getAdminDb();
    const userSnap = await db.collection('users').doc(decoded.uid).get();
    if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });
    const userData = userSnap.data() as any;

    const subscriptionId: string | undefined = userData?.stripeSubscriptionId;
    if (!subscriptionId) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    // Free means cancel-at-period-end (no refunds) — no amount due today.
    if (planName === 'Free') {
      return res.status(200).json({
        success: true,
        type: 'cancel_at_period_end',
        amount_due: 0,
        currency: 'usd',
        message: 'Switching to Free will cancel at period end. No refunds for unused time.',
      });
    }

    const currentPlanName: string = userData?.plan || 'Free';
    const currentRank = PLAN_RANK[currentPlanName] ?? 0;
    const targetRank = PLAN_RANK[planName] ?? 0;

    if (targetRank < currentRank) {
      // Downgrades are scheduled at renewal; no charge today.
      return res.status(200).json({
        success: true,
        type: 'downgrade_scheduled',
        amount_due: 0,
        currency: 'usd',
        message: 'Downgrades take effect at the end of the billing period. No refunds for unused time.',
      });
    }

    const planPrices = PLAN_PRICE_IDS[planName];
    if (!planPrices) {
      return res.status(400).json({ error: 'Unsupported plan', message: `Cannot preview plan "${planName}"` });
    }

    let targetPriceId = billingCycle === 'annually' ? planPrices.annually : planPrices.monthly;

    if (billingCycle === 'annually' && (planName === 'Pro' || planName === 'Elite')) {
      const overrideCents = ANNUAL_TOTAL_OVERRIDE_CENTS[planName];
      const monthlyPriceId = planPrices.monthly;
      if (overrideCents && monthlyPriceId) {
        targetPriceId = await getOrCreateAnnualOverridePriceId({ db, planName, monthlyPriceId, overrideCents });
      }
    }

    if (!targetPriceId) {
      return res.status(500).json({ error: 'Payment configuration error', message: 'Missing Stripe price configuration.' });
    }

    const subscriptionResp = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price'] });
    const subscription = subscriptionResp as unknown as Stripe.Subscription;
    const itemId = subscription.items.data[0]?.id;
    if (!itemId) return res.status(500).json({ error: 'Unable to identify subscription item' });

    const currentInterval = (subscription.items.data[0]?.price as any)?.recurring?.interval || 'month';
    const targetInterval = billingCycle === 'annually' ? 'year' : 'month';

    const upcoming = await stripe.invoices.retrieveUpcoming({
      customer: subscription.customer as string,
      subscription: subscriptionId,
      subscription_items: [{ id: itemId, price: targetPriceId, quantity: 1 }],
      subscription_proration_behavior: 'create_prorations',
      subscription_billing_cycle_anchor: currentInterval === targetInterval ? 'unchanged' : 'now',
      subscription_proration_date: Math.floor(Date.now() / 1000),
    });

    return res.status(200).json({
      success: true,
      type: currentInterval === targetInterval ? 'upgrade_prorated_preview' : 'upgrade_cross_interval_prorated_preview',
      amount_due: upcoming.amount_due,
      currency: upcoming.currency,
      lines: (upcoming.lines?.data || []).map((l) => ({
        description: l.description,
        amount: l.amount,
        proration: l.proration,
      })),
      message: 'This is an upcoming invoice preview. Final amount is calculated by Stripe at confirmation.',
    });
  } catch (error: any) {
    console.error('previewSubscriptionChange error:', error);
    return res.status(500).json({
      error: 'Failed to preview subscription change',
      message: error?.message || 'Unknown error',
    });
  }
}


