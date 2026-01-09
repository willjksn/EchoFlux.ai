import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { recordPlanChangeEvent } from './_planChangeEvents.js';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

// Check STRIPE_USE_TEST_MODE toggle first, then select appropriate key
// Set STRIPE_USE_TEST_MODE=true in Vercel to use test mode, false or unset for live mode
const useTestMode = process.env.STRIPE_USE_TEST_MODE === 'true' || process.env.STRIPE_USE_TEST_MODE === '1';

const stripeSecretKey = useTestMode
  ? (process.env.STRIPE_SECRET_KEY_Test || process.env.STRIPE_SECRET_KEY)
  : (process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY);

if (!stripeSecretKey) {
  const mode = useTestMode ? 'test' : 'live';
  throw new Error(`STRIPE_SECRET_KEY_${useTestMode ? 'Test' : 'LIVE'} or STRIPE_SECRET_KEY must be set for ${mode} mode`);
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2024-06-20' as any, // Type assertion to handle Stripe types
});

// Log which mode is being used
console.log(`Stripe webhook initialized in ${useTestMode ? 'TEST' : 'LIVE'} mode (STRIPE_USE_TEST_MODE=${process.env.STRIPE_USE_TEST_MODE || 'not set'})`);

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  // When `config.api.bodyParser = false`, the request is a raw Node stream.
  // Stripe signature verification requires the exact raw bytes that Stripe sent.
  const chunks: Buffer[] = [];
  const stream = req as any;
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!webhookSecret) {
    return res.status(500).json({ error: 'Stripe webhook secret is not configured' });
  }

  const sig = req.headers['stripe-signature'] as string | undefined;
  if (!sig) {
    return res.status(400).json({ error: 'Missing Stripe signature header' });
  }

  let event: Stripe.Event;

  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  const db = getFirestore();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        if (session.mode === 'subscription' && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          const userId = session.metadata?.userId || session.client_reference_id;
          const planName = session.metadata?.planName || 'Free';
          const billingCycle = session.metadata?.billingCycle || 'monthly';

          if (userId) {
            const userRef = db.collection('users').doc(userId);
            const now = new Date().toISOString();

            // Read existing plan for cohort tracking
            let fromPlan: string | null = null;
            try {
              const existing = await userRef.get();
              fromPlan = (existing.data() as any)?.plan || null;
            } catch {}

            await userRef.set({
              plan: planName,
              userType: 'Creator', // Ensure userType is set for onboarding flow
              stripeCustomerId: subscription.customer as string,
              stripeSubscriptionId: subscription.id,
              subscriptionStatus: subscription.status,
              subscriptionStartDate: now,
              billingCycle,
              cancelAtPeriodEnd: false,
              subscriptionEndDate: null,
              monthlyCaptionGenerationsUsed: 0,
              monthlyImageGenerationsUsed: 0,
              monthlyVideoGenerationsUsed: 0,
            }, { merge: true });

            // Record plan change event (promo cohort tracking)
            if (fromPlan !== planName) {
              try {
                await recordPlanChangeEvent({
                  userId,
                  fromPlan,
                  toPlan: planName,
                  changedAtIso: now,
                  source: 'stripe_webhook',
                  stripeSessionId: session.id || null,
                  stripeSubscriptionId: subscription.id || null,
                });
              } catch (err) {
                console.warn('Failed to record plan change event from webhook:', err);
              }
            }

            console.log(`Subscription created for user ${userId}: ${planName}`);
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find user by Stripe customer ID
        const usersSnapshot = await db.collection('users')
          .where('stripeCustomerId', '==', customerId)
          .limit(1)
          .get();

        if (!usersSnapshot.empty) {
          const userDoc = usersSnapshot.docs[0];
          const priceId = subscription.items.data[0]?.price.id;
          
          // Determine plan from price ID (you may want to create a reverse mapping)
          const planName = subscription.metadata?.planName || 'Free';
          const billingCycle = subscription.items.data[0]?.price.recurring?.interval === 'year' ? 'annual' : 'monthly';

          const periodEnd = subscription.current_period_end;
          
          await userDoc.ref.set({
            plan: planName,
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            billingCycle,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            subscriptionEndDate: subscription.cancel_at_period_end && periodEnd
              ? new Date(periodEnd * 1000).toISOString()
              : null,
          }, { merge: true });

          console.log(`Subscription updated for user ${userDoc.id}: ${subscription.status}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find user by Stripe customer ID
        const usersSnapshot = await db.collection('users')
          .where('stripeCustomerId', '==', customerId)
          .limit(1)
          .get();

        if (!usersSnapshot.empty) {
          const userDoc = usersSnapshot.docs[0];

          await userDoc.ref.set({
            plan: 'Free',
            subscriptionStatus: 'canceled',
            cancelAtPeriodEnd: false,
            subscriptionEndDate: new Date().toISOString(),
          }, { merge: true });

          console.log(`Subscription canceled for user ${userDoc.id}`);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Find user by Stripe customer ID
        const usersSnapshot = await db.collection('users')
          .where('stripeCustomerId', '==', customerId)
          .limit(1)
          .get();

        if (!usersSnapshot.empty) {
          const userDoc = usersSnapshot.docs[0];
          
          // Reset usage counters on successful payment
          await userDoc.ref.set({
            monthlyCaptionGenerationsUsed: 0,
            monthlyImageGenerationsUsed: 0,
            monthlyVideoGenerationsUsed: 0,
            lastPaymentDate: new Date().toISOString(),
          }, { merge: true });

          console.log(`Payment succeeded for user ${userDoc.id}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Find user by Stripe customer ID
        const usersSnapshot = await db.collection('users')
          .where('stripeCustomerId', '==', customerId)
          .limit(1)
          .get();

        if (!usersSnapshot.empty) {
          const userDoc = usersSnapshot.docs[0];
          
          // Optionally downgrade or notify user
          console.log(`Payment failed for user ${userDoc.id}`);
          // You might want to send an email notification here
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ error: 'Webhook processing failed', message: error.message });
  }
}

// Disable body parsing for webhook endpoint (Stripe needs raw body)
export const config = {
  api: {
    bodyParser: false,
  },
};

