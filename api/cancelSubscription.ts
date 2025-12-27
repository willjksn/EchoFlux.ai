import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { verifyAuth } from './verifyAuth.js';

// Stripe init mirrors api/createCheckoutSession.ts so sandbox cancel/reactivate works.
const stripeUseTestModeEnv = (process.env.STRIPE_USE_TEST_MODE || '').toString().toLowerCase().trim();
const useTestMode = stripeUseTestModeEnv === 'true' || stripeUseTestModeEnv === '1' || stripeUseTestModeEnv === 'yes';

let stripeSecretKey: string | null = null;
if (useTestMode) {
  stripeSecretKey = process.env.STRIPE_SECRET_KEY_Test || null;
} else {
  stripeSecretKey = process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY || null;
}

if (stripeSecretKey && useTestMode && !stripeSecretKey.startsWith('sk_test_')) {
  console.error(`⚠️ CRITICAL: STRIPE_USE_TEST_MODE is true but key does not start with sk_test_. Refusing to cancel subscription.`);
  stripeSecretKey = null;
}

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' as Stripe.LatestApiVersion })
  : null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Payment system not configured' });
    }
    // Verify authentication
    const decodedToken = await verifyAuth(req);
    if (!decodedToken || !decodedToken.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = decodedToken.uid;
    const { action } = req.body; // 'cancel' or 'reactivate'

    // Get user from Firestore to find Stripe subscription ID
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();
    const subscriptionId = userData?.stripeSubscriptionId;

    if (!subscriptionId) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    if (action === 'cancel') {
      // Cancel subscription at period end (user keeps access until then)
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      // Retrieve the updated subscription to get current_period_end
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const periodEnd = (subscription as any).current_period_end as number | null;
      
      // Update user document
      await userDoc.ref.set({
        cancelAtPeriodEnd: true,
        subscriptionEndDate: periodEnd
          ? new Date(periodEnd * 1000).toISOString()
          : null,
        subscriptionStatus: subscription.status,
      }, { merge: true });
      const endDate = periodEnd
        ? new Date(periodEnd * 1000).toLocaleDateString()
        : 'the end of your billing period';

      return res.status(200).json({
        success: true,
        message: `Subscription will cancel at the end of your billing period (${endDate}). You'll retain full access until then.`,
        cancelAtPeriodEnd: true,
        subscriptionEndDate: periodEnd
          ? new Date(periodEnd * 1000).toISOString()
          : null,
      });
    } else if (action === 'reactivate') {
      // Reactivate subscription (remove cancellation)
      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });

      // Update user document
      await userDoc.ref.set({
        cancelAtPeriodEnd: false,
        subscriptionEndDate: null,
        subscriptionStatus: subscription.status,
      }, { merge: true });

      return res.status(200).json({
        success: true,
        message: 'Subscription reactivated successfully!',
        cancelAtPeriodEnd: false,
      });
    } else {
      return res.status(400).json({ error: 'Invalid action. Use "cancel" or "reactivate"' });
    }
  } catch (error: any) {
    console.error('Error managing subscription:', error);
    return res.status(500).json({
      error: 'Failed to manage subscription',
      message: error.message,
    });
  }
}

