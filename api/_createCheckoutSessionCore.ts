import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Stripe from 'stripe';

const INVITE_CREATOR_CHECKOUT_PLANS = new Set(['CreatorPro', 'CreatorElite']);

/** Keep in sync with `constants.ts` (avoid importing `../constants.js` — pulls `types` and bloats / destabilizes Vercel bundle). */
const ECHOFLUX_PRO_MONTHLY_USD = 29;
const ECHOFLUX_ELITE_MONTHLY_USD = 59;
const ECHOFLUX_CREATOR_PRO_INVITE_USD = 1;
const ECHOFLUX_CREATOR_ELITE_INVITE_USD = 2;
const ECHOFLUX_PRO_ANNUAL_TOTAL_USD = 276;
const ECHOFLUX_ELITE_ANNUAL_TOTAL_USD = 564;
const ECHOFLUX_ANNUAL_FALLBACK_DISCOUNT = 0.2;

function echofluxAnnualTotalCents(monthlyUsd: number): number {
  if (monthlyUsd === ECHOFLUX_PRO_MONTHLY_USD) return Math.round(ECHOFLUX_PRO_ANNUAL_TOTAL_USD * 100);
  if (monthlyUsd === ECHOFLUX_ELITE_MONTHLY_USD) return Math.round(ECHOFLUX_ELITE_ANNUAL_TOTAL_USD * 100);
  return Math.round(monthlyUsd * 100 * 12 * (1 - ECHOFLUX_ANNUAL_FALLBACK_DISCOUNT));
}

type StripeModeFlags = {
  stripeSecretKey: string | null;
  useTestMode: boolean;
  isUsingTestKey: boolean;
  isUsingLiveKey: boolean;
};

function resolveStripeKeys(): StripeModeFlags {
  const stripeUseTestModeEnv = (process.env.STRIPE_USE_TEST_MODE || '').toString().toLowerCase().trim();
  const useTestMode =
    stripeUseTestModeEnv === 'true' || stripeUseTestModeEnv === '1' || stripeUseTestModeEnv === 'yes';

  let stripeSecretKey: string | null = null;
  if (useTestMode) {
    stripeSecretKey = process.env.STRIPE_SECRET_KEY_Test || null;
  } else {
    stripeSecretKey = process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY || null;
  }

  if (stripeSecretKey && useTestMode && !stripeSecretKey.startsWith('sk_test_')) {
    console.error(
      `⚠️ CRITICAL: STRIPE_USE_TEST_MODE is true but key starts with ${stripeSecretKey.substring(0, 7)}... (not sk_test_)`,
    );
    stripeSecretKey = null;
  }

  const isUsingTestKey = stripeSecretKey?.startsWith('sk_test_') === true;
  const isUsingLiveKey = stripeSecretKey?.startsWith('sk_live_') === true;

  return { stripeSecretKey, useTestMode, isUsingTestKey, isUsingLiveKey };
}

function getPriceId(
  planName: string,
  cycle: 'monthly' | 'annually',
  flags: StripeModeFlags,
): string {
  const { useTestMode, isUsingTestKey, isUsingLiveKey } = flags;
  const suffix = cycle === 'monthly' ? 'MONTHLY' : 'ANNUALLY';
  const envVarBase = `STRIPE_PRICE_${planName.toUpperCase()}_${suffix}`;

  let priceId = '';
  let source = '';

  if (isUsingTestKey) {
    priceId = process.env[`${envVarBase}_Test`] || process.env[envVarBase] || '';
    source = priceId ? (process.env[`${envVarBase}_Test`] ? `${envVarBase}_Test` : envVarBase) : 'none';
  } else {
    priceId = process.env[`${envVarBase}_LIVE`] || process.env[envVarBase] || '';
    source = priceId ? (process.env[`${envVarBase}_LIVE`] ? `${envVarBase}_LIVE` : envVarBase) : 'none';
  }

  if (priceId) {
    console.log(`Price ID for ${planName} ${cycle}: ${priceId.substring(0, 20)}... (from ${source})`);
    const isTestPriceId = priceId.startsWith('price_') && !priceId.startsWith('price_1');
    const isLivePriceId = priceId.startsWith('price_1');
    if ((useTestMode || isUsingTestKey) && isLivePriceId) {
      console.warn(`⚠️ WARNING: Using live Price ID format in test mode! Price ID: ${priceId.substring(0, 20)}...`);
    } else if (isUsingLiveKey && isTestPriceId) {
      console.warn(`⚠️ WARNING: Using test Price ID format in live mode! Price ID: ${priceId.substring(0, 20)}...`);
    }
  } else {
    console.warn(`⚠️ No Price ID found for ${planName} ${cycle} (checked ${source})`);
  }

  return priceId;
}

function buildPlanPriceIds(flags: StripeModeFlags): Record<string, { monthly: string; annually: string }> {
  const g = (name: string, c: 'monthly' | 'annually') => getPriceId(name, c, flags);
  return {
    Caption: { monthly: g('Caption', 'monthly'), annually: g('Caption', 'annually') },
    OnlyFansStudio: { monthly: g('OnlyFansStudio', 'monthly'), annually: g('OnlyFansStudio', 'annually') },
    Pro: { monthly: g('Pro', 'monthly'), annually: g('Pro', 'annually') },
    Elite: { monthly: g('Elite', 'monthly'), annually: g('Elite', 'annually') },
    CreatorPro: { monthly: g('CreatorPro', 'monthly'), annually: '' },
    CreatorElite: { monthly: g('CreatorElite', 'monthly'), annually: '' },
    Agency: { monthly: g('Agency', 'monthly'), annually: g('Agency', 'annually') },
  };
}

export async function runCreateCheckoutSession(req: VercelRequest, res: VercelResponse): Promise<VercelResponse | void> {
  const [{ verifyAuth }, { getAdminDb }, { default: StripeCtor }] = await Promise.all([
    import('./verifyAuth.js'),
    import('./_firebaseAdmin.js'),
    import('stripe'),
  ]);

  const mode = resolveStripeKeys();
  const { stripeSecretKey, useTestMode, isUsingTestKey, isUsingLiveKey } = mode;

  let stripe: Stripe | null = null;
  if (stripeSecretKey) {
    try {
      // Omit apiVersion — let SDK default match account (pinned versions can crash or mismatch on Vercel).
      stripe = new StripeCtor(stripeSecretKey);
      console.log(`Stripe initialized (${useTestMode ? 'TEST' : 'LIVE'} flag; key prefix: ${stripeSecretKey.substring(0, 7)}...)`);
    } catch (error) {
      console.error('Failed to initialize Stripe:', error);
    }
  }

  const PLAN_PRICE_IDS = buildPlanPriceIds(mode);
  const ANNUAL_TOTAL_OVERRIDE_CENTS: Record<string, number> = {
    Pro: echofluxAnnualTotalCents(ECHOFLUX_PRO_MONTHLY_USD),
    Elite: echofluxAnnualTotalCents(ECHOFLUX_ELITE_MONTHLY_USD),
  };

  try {
    // Check if Stripe is configured
    if (!stripe || !stripeSecretKey) {
      if (useTestMode) {
        console.error('STRIPE_USE_TEST_MODE is true but STRIPE_SECRET_KEY_Test is not set!');
        return res.status(500).json({ 
          error: 'Payment system not configured',
          message: 'Stripe test mode is enabled but STRIPE_SECRET_KEY_Test is not configured. Please set STRIPE_SECRET_KEY_Test in your Vercel environment variables, or set STRIPE_USE_TEST_MODE=false to use live mode.',
          details: 'Test mode requires STRIPE_SECRET_KEY_Test to be set. Check your Vercel environment variables.'
        });
      } else {
        console.error('STRIPE_SECRET_KEY_LIVE or STRIPE_SECRET_KEY not configured');
        return res.status(500).json({ 
          error: 'Payment system not configured',
          message: 'Stripe payment system is not configured. Please ensure STRIPE_SECRET_KEY_LIVE (or STRIPE_SECRET_KEY) is set in your environment variables. If you are the site administrator, check your deployment settings (Vercel, etc.) and add the Stripe secret key. If you are a user, please contact support.',
          details: process.env.NODE_ENV === 'development' 
            ? 'Missing STRIPE_SECRET_KEY_LIVE or STRIPE_SECRET_KEY environment variable. See STRIPE_SETUP_GUIDE.md for setup instructions.'
            : undefined
        });
      }
    }

    // Verify authentication
    let decodedToken;
    try {
      decodedToken = await verifyAuth(req);
      if (!decodedToken || !decodedToken.uid) {
        console.error('Auth verification failed: No decoded token or UID');
        return res.status(401).json({ error: 'Unauthorized', message: 'Authentication failed' });
      }
    } catch (authError: any) {
      console.error('Auth verification error:', authError);
      return res.status(401).json({ error: 'Unauthorized', message: authError.message || 'Authentication failed' });
    }

    const rawBody = req.body;
    const body: Record<string, unknown> | null =
      typeof rawBody === 'string'
        ? (() => {
            try {
              return JSON.parse(rawBody) as Record<string, unknown>;
            } catch {
              return null;
            }
          })()
        : rawBody && typeof rawBody === 'object'
          ? (rawBody as Record<string, unknown>)
          : null;
    if (!body) {
      return res.status(400).json({ error: 'Invalid or missing JSON body' });
    }

    const planName = body.planName as string | undefined;
    const billingCycle = body.billingCycle as string | undefined;
    const rawReferral = body.referralCode;
    const referralCode =
      typeof rawReferral === 'string' && rawReferral.trim()
        ? rawReferral.trim().toUpperCase()
        : null;

    if (!planName || !billingCycle) {
      return res.status(400).json({ error: 'Plan name and billing cycle are required' });
    }

    const isAnnual = billingCycle === 'annual' || billingCycle === 'annually' || billingCycle === 'yearly';
    if (INVITE_CREATOR_CHECKOUT_PLANS.has(planName) && isAnnual) {
      return res.status(400).json({
        error: 'Invalid billing cycle',
        message: 'Creator invite plans are monthly only.',
      });
    }

    const planPrices = PLAN_PRICE_IDS[planName];
    if (!planPrices) {
      console.error(`Invalid plan name: ${planName}`);
      return res.status(400).json({ 
        error: 'Invalid plan name',
        message: `Plan "${planName}" is not supported. Supported plans: ${Object.keys(PLAN_PRICE_IDS).join(', ')}`
      });
    }

    const priceId = isAnnual ? planPrices.annually : planPrices.monthly;
    /** Dedicated CreatorPro/CreatorElite Price IDs are optional if Pro/Elite monthly IDs exist (inline $1/$2 on same product). */
    const useInviteInlineUnitPrice =
      INVITE_CREATOR_CHECKOUT_PLANS.has(planName) && (!priceId || priceId.trim() === '');

    if (INVITE_CREATOR_CHECKOUT_PLANS.has(planName)) {
      let db;
      try {
        db = getAdminDb();
      } catch (adminErr: unknown) {
        console.error('createCheckoutSession: Firestore admin unavailable:', adminErr);
        return res.status(503).json({
          error: 'Service unavailable',
          message: 'Could not verify your account for invite checkout. Try again in a moment.',
        });
      }
      try {
        const userSnap = await db.collection('users').doc(decodedToken.uid).get();
        const u = userSnap.data() as Record<string, unknown> | undefined;
        if (!userSnap.exists) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'User profile not found.',
          });
        }
        const subStatus = u?.subscriptionStatus as string | undefined;
        const inviteGrant = u?.inviteGrantPlan as string | undefined;
        if (subStatus !== 'creator_invite_pending' || inviteGrant !== 'CreatorChoice') {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'This plan is only available after redeeming a creator invite code.',
          });
        }
        const currentPlan = (u?.plan as string | undefined) || 'Free';
        if (currentPlan !== 'Free') {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Account is not eligible for creator invite checkout.',
          });
        }
        if (typeof u?.stripeSubscriptionId === 'string' && u.stripeSubscriptionId.trim()) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'You already have an active subscription.',
          });
        }
      } catch (firestoreErr: unknown) {
        console.error('createCheckoutSession: Firestore read failed:', firestoreErr);
        return res.status(503).json({
          error: 'Service unavailable',
          message: 'Could not load your profile for checkout. Please try again.',
        });
      }
    }
    
    if ((!priceId || priceId.trim() === '') && !useInviteInlineUnitPrice) {
      const cycleDisplay = isAnnual ? 'annual' : 'monthly';
      const suffix = isAnnual ? 'ANNUALLY' : 'MONTHLY';
      const envVarBase = `STRIPE_PRICE_${planName.toUpperCase()}_${suffix}`;
      
      // Determine which env var to suggest based on mode
      let suggestedEnvVar = envVarBase;
      if (useTestMode || isUsingTestKey) {
        suggestedEnvVar = `${envVarBase}_Test`;
      } else if (isUsingLiveKey) {
        suggestedEnvVar = `${envVarBase}_LIVE`;
      }
      
      // Determine mode status for error message
      let modeStatus = 'unknown mode';
      if (useTestMode) {
        modeStatus = 'test mode (STRIPE_USE_TEST_MODE=true)';
      } else if (isUsingTestKey) {
        modeStatus = 'test mode (detected from test key)';
      } else if (isUsingLiveKey) {
        modeStatus = 'live mode';
      } else if (stripeSecretKey) {
        modeStatus = stripeSecretKey.startsWith('sk_test_') ? 'test mode (detected from key prefix)' : 
                     stripeSecretKey.startsWith('sk_live_') ? 'live mode (detected from key prefix)' : 
                     'unknown mode (key format unrecognized)';
      }
      
      console.error(`Missing Price ID for ${planName} ${cycleDisplay}. Check environment variables.`);
      console.error(`Expected env var: ${suggestedEnvVar} (or ${envVarBase})`);
      console.error(`Current mode: ${modeStatus}`);
      console.error(`STRIPE_USE_TEST_MODE: ${process.env.STRIPE_USE_TEST_MODE || 'not set'}`);
      console.error(`Using key: ${stripeSecretKey ? (stripeSecretKey.substring(0, 10) + '...') : 'none'}`);
      return res.status(500).json({ 
        error: 'Payment configuration error',
        message: `Stripe Price ID not configured for ${planName} ${cycleDisplay} plan. Please contact support or check STRIPE_SETUP_GUIDE.md for setup instructions.`,
        details: `Missing environment variable: ${suggestedEnvVar} (or ${envVarBase}). Currently using ${modeStatus}.`
      });
    }

    // Create Stripe Checkout Session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [],
      customer_email: decodedToken.email || undefined,
      client_reference_id: decodedToken.uid,
      // Ensure the resulting subscription carries plan metadata, so future subscription.updated events
      // can reliably map back to the correct plan (without needing price→plan reverse mapping).
      subscription_data: {
        // Do not pass trial_period_days: 0 — Stripe can reject it; omit the field for no trial (invite checkout).
        ...(INVITE_CREATOR_CHECKOUT_PLANS.has(planName) ? {} : { trial_period_days: 7 }),
        metadata: {
          planName,
          billingCycle,
          userId: decodedToken.uid,
          ...(referralCode ? { referralCode } : {}),
        },
      },
      metadata: {
        userId: decodedToken.uid,
        planName,
        billingCycle,
        userType: 'Creator', // Default to Creator for now
        ...(referralCode ? { referralCode } : {}),
      },
      success_url: `${req.headers.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://engagesuite.ai'}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://engagesuite.ai'}/pricing?canceled=true`,
      allow_promotion_codes: true, // Users can enter promotion codes directly in Stripe Checkout
    };

    let session;
    try {
      // For Pro/Elite annual, charge the full annual amount due today.
      // We build an inline annual price using the existing product from the monthly Price ID,
      // so Stripe Checkout shows: "$276/yr due today" (not "$23/yr").
      if (isAnnual && (planName === 'Pro' || planName === 'Elite')) {
        const overrideCents = ANNUAL_TOTAL_OVERRIDE_CENTS[planName];
        const monthlyPriceId = planPrices.monthly;

        if (overrideCents && monthlyPriceId) {
          const monthlyPrice = await stripe.prices.retrieve(monthlyPriceId);
          const currency = monthlyPrice.currency || 'usd';
          const product = typeof monthlyPrice.product === 'string' ? monthlyPrice.product : monthlyPrice.product?.id;

          if (!product) {
            console.warn(`Could not resolve Stripe product for ${planName} monthly price. Falling back to configured annual priceId.`);
            sessionParams.line_items = [{ price: priceId, quantity: 1 }];
          } else {
            sessionParams.line_items = [
              {
                price_data: {
                  currency,
                  product,
                  unit_amount: overrideCents,
                  recurring: { interval: 'year' },
                },
                quantity: 1,
              },
            ];
          }
        } else {
          sessionParams.line_items = [{ price: priceId, quantity: 1 }];
        }
      } else if (useInviteInlineUnitPrice) {
        const sourcePlan = planName === 'CreatorElite' ? 'Elite' : 'Pro';
        const sourceMonthlyId = PLAN_PRICE_IDS[sourcePlan].monthly;
        if (!sourceMonthlyId?.trim()) {
          console.error(
            `Invite checkout needs STRIPE_PRICE_${planName.toUpperCase()}_MONTHLY or STRIPE_PRICE_${sourcePlan.toUpperCase()}_MONTHLY for product fallback.`,
          );
          return res.status(500).json({
            error: 'Payment configuration error',
            message: `Stripe is not configured for invite checkout. Set STRIPE_PRICE_${planName.toUpperCase()}_MONTHLY or ensure STRIPE_PRICE_${sourcePlan.toUpperCase()}_MONTHLY is set (used to attach $${planName === 'CreatorElite' ? ECHOFLUX_CREATOR_ELITE_INVITE_USD : ECHOFLUX_CREATOR_PRO_INVITE_USD}/mo billing).`,
          });
        }
        const monthlyPrice = await stripe.prices.retrieve(sourceMonthlyId);
        const currency = monthlyPrice.currency || 'usd';
        const product =
          typeof monthlyPrice.product === 'string' ? monthlyPrice.product : monthlyPrice.product?.id;
        if (!product) {
          return res.status(500).json({
            error: 'Payment configuration error',
            message: `Could not resolve Stripe product from ${sourcePlan} monthly price for invite checkout.`,
          });
        }
        const unitCents =
          planName === 'CreatorElite'
            ? Math.round(ECHOFLUX_CREATOR_ELITE_INVITE_USD * 100)
            : Math.round(ECHOFLUX_CREATOR_PRO_INVITE_USD * 100);
        sessionParams.line_items = [
          {
            price_data: {
              currency,
              product,
              unit_amount: unitCents,
              recurring: { interval: 'month' },
            },
            quantity: 1,
          },
        ];
      } else {
        sessionParams.line_items = [{ price: priceId, quantity: 1 }];
      }

      console.log('Creating Stripe checkout session with params:', {
        planName,
        billingCycle,
        priceId,
        customer_email: decodedToken.email,
        client_reference_id: decodedToken.uid,
      });
      
      session = await stripe.checkout.sessions.create(sessionParams);
      
      if (!session || !session.url) {
        console.error('Stripe session created but no URL returned:', session);
        return res.status(500).json({
          error: 'Failed to create checkout session',
          message: 'Checkout session created but no URL returned',
        });
      }
      
      console.log('Stripe checkout session created successfully:', session.id);
      
      return res.status(200).json({
        sessionId: session.id,
        url: session.url,
      });
    } catch (stripeError: any) {
      console.error('Stripe API error:', stripeError);
      console.error('Stripe error details:', {
        type: stripeError.type,
        code: stripeError.code,
        message: stripeError.message,
        param: stripeError.param,
        requestId: stripeError.requestId,
        statusCode: stripeError.statusCode,
      });
      
      // Provide more specific error messages
      let errorMessage = stripeError.message || 'Failed to create checkout session';
      if (stripeError.type === 'StripeInvalidRequestError') {
        if (stripeError.message?.includes('No such price') || stripeError.message?.includes('Invalid price')) {
          const cycleDisplay = isAnnual ? 'annual' : 'monthly';
          const suffix = isAnnual ? 'ANNUALLY' : 'MONTHLY';
          const envVarBase = `STRIPE_PRICE_${planName.toUpperCase()}_${suffix}`;
          
          // Determine which env var to suggest based on mode
          let suggestedEnvVar = envVarBase;
          if (useTestMode || isUsingTestKey) {
            suggestedEnvVar = `${envVarBase}_Test`;
          } else if (isUsingLiveKey) {
            suggestedEnvVar = `${envVarBase}_LIVE`;
          }
          
          // Determine mode status for error message
          let modeStatus = 'unknown mode';
          if (useTestMode) {
            modeStatus = 'test mode (STRIPE_USE_TEST_MODE=true)';
          } else if (isUsingTestKey) {
            modeStatus = 'test mode (detected from test key)';
          } else if (isUsingLiveKey) {
            modeStatus = 'live mode';
          } else if (stripeSecretKey) {
            modeStatus = stripeSecretKey.startsWith('sk_test_') ? 'test mode (detected from key prefix)' : 
                         stripeSecretKey.startsWith('sk_live_') ? 'live mode (detected from key prefix)' : 
                         'unknown mode (key format unrecognized)';
          }
          
          errorMessage = `Invalid Price ID for ${planName} ${cycleDisplay} plan: ${priceId}. This Price ID doesn't exist in your Stripe account. Please check your Stripe Dashboard and update the ${suggestedEnvVar} (or ${envVarBase}) environment variable with a valid Price ID. Currently using ${modeStatus} - make sure your Price IDs match (test Price IDs with test keys, live Price IDs with live keys).`;
        } else if (stripeError.message?.includes('Invalid API Key')) {
          errorMessage = 'Invalid Stripe API key. Please check your STRIPE_SECRET_KEY_LIVE (or STRIPE_SECRET_KEY) environment variable. Ensure you are using live API keys with live Price IDs, or test API keys with test Price IDs.';
        } else if (stripeError.param) {
          errorMessage = `Invalid parameter: ${stripeError.param}. ${stripeError.message}`;
        }
      } else if (stripeError.type === 'StripeAuthenticationError') {
        errorMessage = 'Stripe authentication failed. Please check your STRIPE_SECRET_KEY_LIVE (or STRIPE_SECRET_KEY) environment variable.';
      } else if (stripeError.type === 'StripeAPIError') {
        errorMessage = `Stripe API error: ${stripeError.message}`;
      }
      
      // Log additional context for debugging
      console.error('Checkout session creation failed:', {
        planName,
        billingCycle,
        isAnnual,
        priceId,
        errorType: stripeError.type,
        errorCode: stripeError.code,
        errorMessage: stripeError.message,
      });
      
      return res.status(500).json({
        error: 'Failed to create checkout session',
        message: errorMessage,
        details: process.env.NODE_ENV === 'development' ? {
          type: stripeError.type,
          code: stripeError.code,
          param: stripeError.param,
          requestId: stripeError.requestId,
        } : undefined,
      });
    }
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      planName: (req.body as { planName?: string } | undefined)?.planName,
      billingCycle: (req.body as { billingCycle?: string } | undefined)?.billingCycle,
      type: error.type,
      code: error.code,
      raw: error.raw,
    });

    if (res.headersSent) {
      return;
    }

    // Provide more specific error messages for common Stripe errors
    let errorMessage = error.message || 'An unexpected error occurred';
    if (error.type === 'StripeInvalidRequestError') {
      if (error.message?.includes('No such price')) {
        const pn = (req.body as { planName?: string } | undefined)?.planName;
        errorMessage = `Invalid Price ID configured for ${pn || 'selected'} plan. Please check your Stripe Price IDs in environment variables.`;
      } else if (error.message?.includes('No such customer')) {
        errorMessage = 'Customer lookup failed. Please try again.';
      }
    }

    return res.status(500).json({
      error: 'Failed to create checkout session',
      message: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

