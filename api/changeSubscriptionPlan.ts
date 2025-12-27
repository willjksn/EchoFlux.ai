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
  console.error(`⚠️ CRITICAL: STRIPE_USE_TEST_MODE is true but key does not start with sk_test_. Refusing to change subscription plan.`);
  stripeSecretKey = null;
}

const isUsingTestKey = stripeSecretKey?.startsWith('sk_test_') === true;
const isUsingLiveKey = stripeSecretKey?.startsWith('sk_live_') === true;

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' as Stripe.LatestApiVersion })
  : null;

type BillingCycle = 'monthly' | 'annually';

// Keep plan ranks simple and explicit. Only tiers in the UI matter today.
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

// Helper function to get Price ID with proper priority based on mode toggle
const getPriceId = (planName: string, cycle: BillingCycle): string => {
  const suffix = cycle === 'monthly' ? 'MONTHLY' : 'ANNUALLY';
  const envVarBase = `STRIPE_PRICE_${planName.toUpperCase()}_${suffix}`;

  if (isUsingTestKey) {
    return process.env[`${envVarBase}_Test`] || process.env[envVarBase] || '';
  }
  return process.env[`${envVarBase}_LIVE`] || process.env[envVarBase] || '';
};

const PLAN_PRICE_IDS: Record<string, { monthly: string; annually: string }> = {
  Pro: { monthly: getPriceId('Pro', 'monthly'), annually: getPriceId('Pro', 'annually') },
  Elite: { monthly: getPriceId('Elite', 'monthly'), annually: getPriceId('Elite', 'annually') },
  Caption: { monthly: getPriceId('Caption', 'monthly'), annually: getPriceId('Caption', 'annually') },
  OnlyFansStudio: { monthly: getPriceId('OnlyFansStudio', 'monthly'), annually: getPriceId('OnlyFansStudio', 'annually') },
  Agency: { monthly: getPriceId('Agency', 'monthly'), annually: getPriceId('Agency', 'annually') },
};

// Annual totals (in cents) used when Stripe annual prices are misconfigured.
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

  // Separate by mode to avoid mixing test/live IDs.
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
      createdBy: 'api/changeSubscriptionPlan',
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
    const userRef = db.collection('users').doc(decoded.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });
    const userData = userSnap.data() as any;

    const subscriptionId: string | undefined = userData?.stripeSubscriptionId;
    if (!subscriptionId) {
      return res.status(400).json({
        error: 'No active subscription found',
        message: 'This account does not have an active Stripe subscription to change. Use Stripe Checkout to start a subscription.',
      });
    }

    // If user is moving to Free, treat it like cancel-at-period-end (no refunds).
    if (planName === 'Free') {
      const updatedResp = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
      // Stripe SDK types can be `Stripe.Response<Stripe.Subscription>` which doesn't always expose
      // fields cleanly in TS builds. Cast to Subscription for safe access.
      const updated = updatedResp as unknown as Stripe.Subscription;
      const periodEnd = (updated as any).current_period_end as number | null;

      await userRef.set(
        {
          cancelAtPeriodEnd: true,
          subscriptionEndDate: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          subscriptionStatus: updated.status,
        },
        { merge: true }
      );

      return res.status(200).json({
        success: true,
        type: 'cancel_at_period_end',
        message: 'Subscription will cancel at period end. No refunds for unused time.',
        subscriptionEndDate: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      });
    }

    const subscriptionResp = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price', 'latest_invoice'],
    });
    const subscription = subscriptionResp as unknown as Stripe.Subscription;

    const currentPlanName: string = userData?.plan || 'Free';
    const currentRank = PLAN_RANK[currentPlanName] ?? 0;
    const targetRank = PLAN_RANK[planName] ?? 0;

    const currentInterval = subscription.items.data[0]?.price?.recurring?.interval || 'month';
    const targetInterval = billingCycle === 'annually' ? 'year' : 'month';

    const isDowngrade = targetRank < currentRank;

    const planPrices = PLAN_PRICE_IDS[planName];
    if (!planPrices) {
      return res.status(400).json({ error: 'Unsupported plan', message: `Cannot change to plan "${planName}"` });
    }

    let targetPriceId = billingCycle === 'annually' ? planPrices.annually : planPrices.monthly;

    // For Pro/Elite annual, enforce correct annual totals by using (or creating) an override price.
    if (billingCycle === 'annually' && (planName === 'Pro' || planName === 'Elite')) {
      const overrideCents = ANNUAL_TOTAL_OVERRIDE_CENTS[planName];
      const monthlyPriceId = planPrices.monthly;
      if (overrideCents && monthlyPriceId) {
        targetPriceId = await getOrCreateAnnualOverridePriceId({
          db,
          planName,
          monthlyPriceId,
          overrideCents,
        });
      }
    }

    if (!targetPriceId) {
      return res.status(500).json({
        error: 'Payment configuration error',
        message: `Stripe Price ID not configured for ${planName} ${billingCycle}.`,
      });
    }

    // Downgrades: no refunds; schedule change at period end.
    if (isDowngrade) {
      // Create or re-use a schedule and add a next phase.
      const scheduleId =
        (subscription as any).schedule ||
        (await stripe.subscriptionSchedules.create({ from_subscription: subscriptionId })).id;

      const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId, { expand: ['phases'] });
      const currentPhase = schedule.phases?.[0];
      const effectiveStart = currentPhase?.end_date || (subscription as any).current_period_end;

      if (!effectiveStart) {
        return res.status(500).json({ error: 'Unable to determine period end for scheduling downgrade' });
      }

      const currentPhaseItems =
        currentPhase?.items?.map((i: any) => ({
          price: typeof i.price === 'string' ? i.price : i.price?.id,
          quantity: i.quantity || 1,
        })) ||
        subscription.items.data.map((i) => ({
          price: typeof i.price === 'string' ? i.price : i.price.id,
          quantity: i.quantity || 1,
        }));

      await stripe.subscriptionSchedules.update(scheduleId, {
        end_behavior: 'release',
        phases: [
          {
            start_date: currentPhase?.start_date || (subscription as any).current_period_start,
            end_date: effectiveStart,
            items: currentPhaseItems,
          },
          {
            start_date: effectiveStart,
            items: [{ price: targetPriceId, quantity: 1 }],
            // No proration; schedule switch at renewal.
          },
        ],
      });

      await userRef.set(
        {
          pendingPlan: planName,
          pendingBillingCycle: billingCycle,
          pendingPlanEffectiveDate: new Date(effectiveStart * 1000).toISOString(),
        },
        { merge: true }
      );

      return res.status(200).json({
        success: true,
        type: 'downgrade_scheduled',
        message: 'Downgrade scheduled for period end. No refunds for unused time.',
        effectiveDate: new Date(effectiveStart * 1000).toISOString(),
      });
    }

    // Upgrades (including cross-interval): prorate unused time and charge the difference.
    const itemId = subscription.items.data[0]?.id;
    if (!itemId) return res.status(500).json({ error: 'Unable to identify subscription item' });

    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
      proration_behavior: 'create_prorations',
      billing_cycle_anchor: currentInterval === targetInterval ? 'unchanged' : 'now',
      items: [{ id: itemId, price: targetPriceId }],
      metadata: {
        ...(subscription.metadata || {}),
        planName,
      },
    });

    // Invoice now so user pays (or receives credit) immediately.
    const customerId = subscription.customer as string;
    const createdInvoice = await stripe.invoices.create({
      customer: customerId,
      subscription: subscriptionId,
      auto_advance: true,
      description: `Plan change: ${currentPlanName} → ${planName}`,
    });

    const finalized = await stripe.invoices.finalizeInvoice(createdInvoice.id);
    let paidOrFinal = finalized;

    if (finalized.amount_due > 0 && finalized.status !== 'paid') {
      try {
        paidOrFinal = await stripe.invoices.pay(finalized.id);
      } catch (err) {
        // If payment fails, return hosted invoice URL for manual completion.
        paidOrFinal = finalized;
      }
    }

    const nowIso = new Date().toISOString();
    await userRef.set(
      {
        plan: planName,
        billingCycle,
        cancelAtPeriodEnd: false,
        subscriptionEndDate: null,
        subscriptionStatus: subscription.status,
        subscriptionStartDate: nowIso,
        monthlyCaptionGenerationsUsed: 0,
        monthlyImageGenerationsUsed: 0,
        monthlyVideoGenerationsUsed: 0,
        pendingPlan: null,
        pendingBillingCycle: null,
        pendingPlanEffectiveDate: null,
      },
      { merge: true }
    );

    // Record plan change event for promo cohorts.
    try {
      if (currentPlanName !== planName) {
        await recordPlanChangeEvent({
          userId: decoded.uid,
          fromPlan: currentPlanName,
          toPlan: planName,
          changedAtIso: nowIso,
          source: 'subscription_change_api',
          stripeSessionId: null,
          stripeSubscriptionId: subscriptionId,
        });
      }
    } catch (err) {
      console.warn('Failed to record plan change event from changeSubscriptionPlan:', err);
    }

    return res.status(200).json({
      success: true,
      type: currentInterval === targetInterval ? 'upgrade_prorated' : 'upgrade_cross_interval_prorated',
      message: 'Plan updated with proration credit applied to unused time.',
      invoice: {
        id: paidOrFinal.id,
        status: paidOrFinal.status,
        amount_due: paidOrFinal.amount_due,
        amount_paid: (paidOrFinal as any).amount_paid,
        currency: paidOrFinal.currency,
        hosted_invoice_url: (paidOrFinal as any).hosted_invoice_url || null,
      },
    });
  } catch (error: any) {
    console.error('changeSubscriptionPlan error:', error);
    return res.status(500).json({
      error: 'Failed to change subscription plan',
      message: error?.message || 'Unknown error',
    });
  }
}


