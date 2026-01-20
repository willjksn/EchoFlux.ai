import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { verifyAuth } from './verifyAuth.js';

// Initialize Stripe only if secret key is available
// Environment variable priority (for testing/sandbox support):
// 1. STRIPE_USE_TEST_MODE=true/false - Master toggle to switch between test and live mode
//    - Set to "true" to use test keys and test Price IDs
//    - Set to "false" or leave unset to use live keys and live Price IDs
// 2. STRIPE_SECRET_KEY_Test (for testing/sandbox)
// 3. STRIPE_SECRET_KEY_LIVE (production)
// 4. STRIPE_SECRET_KEY (fallback)
// - STRIPE_PUBLISHABLE_KEY_LIVE (production) or STRIPE_PUBLISHABLE_KEY (fallback) - for frontend use if needed
// - STRIPE_PUBLISHABLE_KEY_Test - for test mode

// Check master toggle first (optional - if not set, use original behavior)
// Make comparison more robust - handle various string formats
const stripeUseTestModeEnv = (process.env.STRIPE_USE_TEST_MODE || '').toString().toLowerCase().trim();
const useTestMode = stripeUseTestModeEnv === 'true' || stripeUseTestModeEnv === '1' || stripeUseTestModeEnv === 'yes';

// Select key with priority matching original working behavior:
// Original: STRIPE_SECRET_KEY_LIVE || STRIPE_SECRET_KEY
// Now: If STRIPE_USE_TEST_MODE=true, MUST use test key (no fallback to live)
//      Otherwise use original logic
let stripeSecretKey: string | null = null;
if (useTestMode) {
  // Test mode: only use test key, no fallback
  stripeSecretKey = process.env.STRIPE_SECRET_KEY_Test || null;
} else {
  // Live mode: use original logic
  stripeSecretKey = process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY || null;
}

// If we have a key, verify it matches the expected mode
// If STRIPE_USE_TEST_MODE is set but key doesn't match, warn and potentially override
if (stripeSecretKey && useTestMode && !stripeSecretKey.startsWith('sk_test_')) {
  console.error(`⚠️ CRITICAL: STRIPE_USE_TEST_MODE is true but key starts with ${stripeSecretKey.substring(0, 7)}... (not sk_test_)`);
  console.error(`   This will cause test cards to fail! Setting stripeSecretKey to null to force error.`);
  stripeSecretKey = null; // Force error to prevent using wrong key
}

// Determine if using test or live keys based on actual key format (most reliable)
const isUsingTestKey = stripeSecretKey?.startsWith('sk_test_') === true;
const isUsingLiveKey = stripeSecretKey?.startsWith('sk_live_') === true;

let stripe: Stripe | null = null;
if (stripeSecretKey) {
  try {
    stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
    });
    // Log which mode is being used with detailed info
    console.log(`Stripe initialized in ${useTestMode ? 'TEST' : 'LIVE'} mode`);
    console.log(`  STRIPE_USE_TEST_MODE env var: "${process.env.STRIPE_USE_TEST_MODE}" (type: ${typeof process.env.STRIPE_USE_TEST_MODE})`);
    console.log(`  useTestMode calculated: ${useTestMode}`);
    console.log(`  Using key: ${stripeSecretKey ? (stripeSecretKey.substring(0, 12) + '...') : 'none'}`);
    console.log(`  Key type detected: ${stripeSecretKey?.startsWith('sk_test_') ? 'test' : stripeSecretKey?.startsWith('sk_live_') ? 'live' : 'unknown'}`);
    console.log(`  isUsingTestKey: ${isUsingTestKey}, isUsingLiveKey: ${isUsingLiveKey}`);
    
    // Warn if there's a mismatch
    if (useTestMode && !stripeSecretKey?.startsWith('sk_test_')) {
      console.warn(`⚠️ WARNING: STRIPE_USE_TEST_MODE=true but using ${stripeSecretKey?.startsWith('sk_live_') ? 'LIVE' : 'unknown'} key!`);
      console.warn(`   This will cause test cards to fail. Check your STRIPE_SECRET_KEY_Test environment variable.`);
    }
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
  }
}

// Helper function to get Price ID with proper priority based on mode toggle
const getPriceId = (planName: string, cycle: 'monthly' | 'annually'): string => {
  const suffix = cycle === 'monthly' ? 'MONTHLY' : 'ANNUALLY';
  const envVarBase = `STRIPE_PRICE_${planName.toUpperCase()}_${suffix}`;
  
  let priceId = '';
  let source = '';
  
  // Simplified logic matching original behavior:
  // If using test key, prefer test Price IDs
  // Otherwise, use original behavior: prefer _LIVE if set, otherwise regular (no _LIVE suffix)
  if (isUsingTestKey) {
    priceId = process.env[`${envVarBase}_Test`] || process.env[envVarBase] || '';
    source = priceId ? (process.env[`${envVarBase}_Test`] ? `${envVarBase}_Test` : envVarBase) : 'none';
  } else {
    // Original behavior: STRIPE_PRICE_PRO_MONTHLY (or STRIPE_PRICE_PRO_MONTHLY_LIVE if set)
    priceId = process.env[`${envVarBase}_LIVE`] || process.env[envVarBase] || '';
    source = priceId ? (process.env[`${envVarBase}_LIVE`] ? `${envVarBase}_LIVE` : envVarBase) : 'none';
  }
  
  // Log Price ID selection for debugging
  if (priceId) {
    console.log(`Price ID for ${planName} ${cycle}: ${priceId.substring(0, 20)}... (from ${source})`);
    
    // Validate Price ID format
    // Test Price IDs typically start with "price_" (no "1" after "price_")
    // Live Price IDs start with "price_1"
    const isTestPriceId = priceId.startsWith('price_') && !priceId.startsWith('price_1');
    const isLivePriceId = priceId.startsWith('price_1');
    
    // Warn if there's a mismatch (but allow it since Stripe format can vary)
    if ((useTestMode || isUsingTestKey) && isLivePriceId) {
      console.warn(`⚠️ WARNING: Using live Price ID format in test mode! Price ID: ${priceId.substring(0, 20)}...`);
      console.warn(`   Make sure this Price ID exists in your test Stripe account.`);
    } else if (isUsingLiveKey && isTestPriceId) {
      console.warn(`⚠️ WARNING: Using test Price ID format in live mode! Price ID: ${priceId.substring(0, 20)}...`);
      console.warn(`   Make sure this Price ID exists in your live Stripe account.`);
    }
  } else {
    console.warn(`⚠️ No Price ID found for ${planName} ${cycle} (checked ${source})`);
  }
  
  return priceId;
};

// Map plan names to Stripe Price IDs
const PLAN_PRICE_IDS: Record<string, { monthly: string; annually: string }> = {
  Caption: {
    monthly: getPriceId('Caption', 'monthly'),
    annually: getPriceId('Caption', 'annually'),
  },
  OnlyFansStudio: {
    monthly: getPriceId('OnlyFansStudio', 'monthly'),
    annually: getPriceId('OnlyFansStudio', 'annually'),
  },
  Pro: {
    monthly: getPriceId('Pro', 'monthly'),
    annually: getPriceId('Pro', 'annually'),
  },
  Elite: {
    monthly: getPriceId('Elite', 'monthly'),
    annually: getPriceId('Elite', 'annually'),
  },
  Agency: {
    monthly: getPriceId('Agency', 'monthly'),
    annually: getPriceId('Agency', 'annually'),
  },
};

// Annual pricing overrides (in cents) to ensure "amount due today" matches the billed-annual totals.
// This avoids relying on potentially misconfigured Stripe annual Price IDs (e.g. $23/yr instead of $276/yr).
// If you change annual pricing, update these values.
const ANNUAL_TOTAL_OVERRIDE_CENTS: Record<string, number> = {
  Pro: 27600,
  Elite: 56400,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    const { planName, billingCycle, referralCode } = req.body;

    if (!planName || !billingCycle) {
      return res.status(400).json({ error: 'Plan name and billing cycle are required' });
    }

    const planPrices = PLAN_PRICE_IDS[planName];
    if (!planPrices) {
      console.error(`Invalid plan name: ${planName}`);
      return res.status(400).json({ 
        error: 'Invalid plan name',
        message: `Plan "${planName}" is not supported. Supported plans: ${Object.keys(PLAN_PRICE_IDS).join(', ')}`
      });
    }

    // Normalize billing cycle: accept 'annual', 'annually', or 'yearly' for annual, otherwise monthly
    const isAnnual = billingCycle === 'annual' || billingCycle === 'annually' || billingCycle === 'yearly';
    const priceId = isAnnual ? planPrices.annually : planPrices.monthly;
    
    if (!priceId || priceId.trim() === '') {
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
        trial_period_days: 7, // 7-day free trial - card required but no charge until trial ends
        metadata: {
          planName,
          billingCycle,
          userId: decodedToken.uid,
          ...(referralCode ? { referralCode: referralCode.toUpperCase() } : {}),
        },
      },
      metadata: {
        userId: decodedToken.uid,
        planName,
        billingCycle,
        userType: 'Creator', // Default to Creator for now
        ...(referralCode ? { referralCode: referralCode.toUpperCase() } : {}),
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
      planName: req.body?.planName,
      billingCycle: req.body?.billingCycle,
      type: error.type,
      code: error.code,
      raw: error.raw,
    });
    
    // Provide more specific error messages for common Stripe errors
    let errorMessage = error.message || 'An unexpected error occurred';
    if (error.type === 'StripeInvalidRequestError') {
      if (error.message?.includes('No such price')) {
        errorMessage = `Invalid Price ID configured for ${req.body?.planName} plan. Please check your Stripe Price IDs in environment variables.`;
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

