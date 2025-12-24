import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { verifyAuth } from './verifyAuth.js';

// Initialize Stripe only if secret key is available
let stripe: Stripe | null = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
    });
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
  }
}

// Map plan names to Stripe Price IDs (you'll need to create these in Stripe Dashboard)
const PLAN_PRICE_IDS: Record<string, { monthly: string; annually: string }> = {
  Caption: {
    monthly: process.env.STRIPE_PRICE_CAPTION_MONTHLY || '',
    annually: process.env.STRIPE_PRICE_CAPTION_ANNUALLY || '',
  },
  OnlyFansStudio: {
    monthly: process.env.STRIPE_PRICE_ONLYFANS_MONTHLY || '',
    annually: process.env.STRIPE_PRICE_ONLYFANS_ANNUALLY || '',
  },
  Pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || '',
    annually: process.env.STRIPE_PRICE_PRO_ANNUALLY || '',
  },
  Elite: {
    monthly: process.env.STRIPE_PRICE_ELITE_MONTHLY || '',
    annually: process.env.STRIPE_PRICE_ELITE_ANNUALLY || '',
  },
  Agency: {
    monthly: process.env.STRIPE_PRICE_AGENCY_MONTHLY || '',
    annually: process.env.STRIPE_PRICE_AGENCY_ANNUALLY || '',
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check if Stripe is configured
    if (!stripe) {
      console.error('STRIPE_SECRET_KEY not configured');
      return res.status(500).json({ 
        error: 'Payment system not configured',
        message: 'Stripe payment system is not configured. Please ensure STRIPE_SECRET_KEY is set in your environment variables. If you are the site administrator, check your deployment settings (Vercel, etc.) and add the Stripe secret key. If you are a user, please contact support.',
        details: process.env.NODE_ENV === 'development' 
          ? 'Missing STRIPE_SECRET_KEY environment variable. See STRIPE_SETUP_GUIDE.md for setup instructions.'
          : undefined
      });
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

    const { planName, billingCycle } = req.body;

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
      console.error(`Missing Price ID for ${planName} ${cycleDisplay}. Check environment variables.`);
      console.error(`Expected env var: STRIPE_PRICE_${planName.toUpperCase()}_${isAnnual ? 'ANNUALLY' : 'MONTHLY'}`);
      return res.status(500).json({ 
        error: 'Payment configuration error',
        message: `Stripe Price ID not configured for ${planName} ${cycleDisplay} plan. Please contact support or check STRIPE_SETUP_GUIDE.md for setup instructions.`,
        details: `Missing environment variable: STRIPE_PRICE_${planName.toUpperCase()}_${isAnnual ? 'ANNUALLY' : 'MONTHLY'}`
      });
    }

    // Create Stripe Checkout Session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: decodedToken.email || undefined,
      client_reference_id: decodedToken.uid,
      metadata: {
        userId: decodedToken.uid,
        planName,
        billingCycle,
        userType: 'Creator', // Default to Creator for now
      },
      success_url: `${req.headers.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://engagesuite.ai'}/pricing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://engagesuite.ai'}/pricing?canceled=true`,
      allow_promotion_codes: true, // Users can enter promotion codes directly in Stripe Checkout
    };

    let session;
    try {
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
        if (stripeError.message?.includes('No such price')) {
          errorMessage = `Invalid Price ID: ${priceId}. Please check your Stripe Price IDs in environment variables.`;
        } else if (stripeError.message?.includes('Invalid API Key')) {
          errorMessage = 'Invalid Stripe API key. Please check your STRIPE_SECRET_KEY environment variable.';
        } else if (stripeError.param) {
          errorMessage = `Invalid parameter: ${stripeError.param}. ${stripeError.message}`;
        }
      } else if (stripeError.type === 'StripeAuthenticationError') {
        errorMessage = 'Stripe authentication failed. Please check your STRIPE_SECRET_KEY environment variable.';
      } else if (stripeError.type === 'StripeAPIError') {
        errorMessage = `Stripe API error: ${stripeError.message}`;
      }
      
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

