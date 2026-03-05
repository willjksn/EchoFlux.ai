import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { recordPlanChangeEvent } from './_planChangeEvents.js';
import { grantReferralRewardOnConversion } from './_grantReferralReward.js';

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

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const connectWebhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

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

function verifyWebhookSignature(rawBody: Buffer, sig: string): Stripe.Event {
  if (webhookSecret) {
    try {
      return stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (_) {
      // fall through to Connect secret
    }
  }
  if (connectWebhookSecret) {
    return stripe.webhooks.constructEvent(rawBody, sig, connectWebhookSecret);
  }
  throw new Error('Webhook signature verification failed (no valid secret)');
}

/** Connect event handling: fan subscriptions + one-time purchases; orders; entitlements; refunds. */
async function handleConnectEvent(db: Firestore, _stripe: Stripe, event: Stripe.Event): Promise<void> {

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const creatorId = session.metadata?.creatorId;
    const fanId = session.metadata?.fanId || session.client_reference_id;
    const type = session.metadata?.type;
    if (!creatorId || !fanId) return;

    const now = new Date().toISOString();

    if (type === 'subscription' && session.subscription) {
      const subRef = db.collection('creatorSubscribers').doc(creatorId).collection('subscribers').doc(fanId);
      await subRef.set({ status: 'active', stripeSubscriptionId: session.subscription, updatedAt: now }, { merge: true });
      const grantRef = db.collection('creatorEntitlements').doc(creatorId).collection('grants').doc(fanId);
      const grantSnap = await grantRef.get();
      const existing = grantSnap.data() as { unlockedProductIds?: string[] } | undefined;
      const unlocked = Array.isArray(existing?.unlockedProductIds) ? existing.unlockedProductIds : [];
      await grantRef.set({ subscription: true, unlockedProductIds: unlocked, updatedAt: now }, { merge: true });
      
      // Also create/update fan record in creators/{creatorId}/fans collection
      const fanEmail = session.customer_details?.email || session.metadata?.fanEmail || null;
      const fanName = session.customer_details?.name || session.metadata?.fanName || null;
      const fanRef = db.collection('creators').doc(creatorId).collection('fans').doc(fanId);
      const fanSnap = await fanRef.get();
      if (!fanSnap.exists) {
        // New fan - create record
        await fanRef.set({
          id: fanId,
          creatorId,
          email: fanEmail,
          displayName: fanName,
          stripeCustomerId: typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id || null,
          subscriptionStatus: 'active',
          subscribedAt: now,
          lastPaymentAt: now,
          totalSpentCents: session.amount_total || 0,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        // Existing fan - update subscription status
        await fanRef.update({
          subscriptionStatus: 'active',
          lastPaymentAt: now,
          updatedAt: now,
        });
      }
      
      console.log(`Connect: subscription created creator=${creatorId} fan=${fanId}`);
      return;
    }

    if (type === 'product' && session.metadata?.productId) {
      const productId = session.metadata.productId as string;
      const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent as Stripe.PaymentIntent)?.id;
      const amountTotal = session.amount_total ?? 0;

      const orderRef = db.collection('orders').doc();
      await orderRef.set({
        creatorId,
        fanId,
        productId,
        type: 'product',
        stripeSessionId: session.id,
        stripePaymentIntentId: paymentIntentId || null,
        amountCents: amountTotal,
        status: 'paid',
        createdAt: now,
      });

      const grantRef = db.collection('creatorEntitlements').doc(creatorId).collection('grants').doc(fanId);
      const grantSnap = await grantRef.get();
      const existing = grantSnap.data() as { unlockedProductIds?: string[] } | undefined;
      const unlocked = Array.isArray(existing?.unlockedProductIds) ? existing.unlockedProductIds : [];
      if (!unlocked.includes(productId)) {
        await grantRef.set({ unlockedProductIds: [...unlocked, productId], updatedAt: now }, { merge: true });
      }
      
      // Update fan record with purchase
      const fanEmail = session.customer_details?.email || session.metadata?.fanEmail || null;
      const fanName = session.customer_details?.name || session.metadata?.fanName || null;
      const fanRef = db.collection('creators').doc(creatorId).collection('fans').doc(fanId);
      const fanSnap = await fanRef.get();
      if (!fanSnap.exists) {
        // New fan from product purchase (non-subscriber)
        await fanRef.set({
          id: fanId,
          creatorId,
          email: fanEmail,
          displayName: fanName,
          stripeCustomerId: typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id || null,
          subscriptionStatus: null, // Not a subscriber, just a purchaser
          lastPurchaseAt: now,
          totalSpentCents: amountTotal,
          purchaseCount: 1,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        // Update existing fan
        const fanData = fanSnap.data() as { totalSpentCents?: number; purchaseCount?: number };
        await fanRef.update({
          lastPurchaseAt: now,
          totalSpentCents: (fanData.totalSpentCents || 0) + amountTotal,
          purchaseCount: (fanData.purchaseCount || 0) + 1,
          updatedAt: now,
        });
      }

      const statsRef = db.collection('creatorStats').doc(creatorId);
      const statsSnap = await statsRef.get();
      const stats = statsSnap.data() as { totalRevenueCents?: number; totalOrders?: number } | undefined;
      const totalRevenue = (stats?.totalRevenueCents ?? 0) + amountTotal;
      const totalOrders = (stats?.totalOrders ?? 0) + 1;
      await statsRef.set({ totalRevenueCents: totalRevenue, totalOrders, updatedAt: now }, { merge: true });
      console.log(`Connect: product order creator=${creatorId} fan=${fanId} product=${productId}`);
      return;
    }

    // Handle tips (one-time payments without a productId)
    if (type === 'tip') {
      const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent as Stripe.PaymentIntent)?.id;
      const amountTotal = session.amount_total ?? 0;
      const tipHandle = session.metadata?.tipHandle || 'Anonymous';

      // Record the tip as an order
      const orderRef = db.collection('orders').doc();
      await orderRef.set({
        creatorId,
        fanId,
        type: 'tip',
        stripeSessionId: session.id,
        stripePaymentIntentId: paymentIntentId || null,
        amountCents: amountTotal,
        tipHandle,
        status: 'paid',
        createdAt: now,
      });

      // Create/update fan record as tipper
      const fanEmail = session.customer_details?.email || null;
      const fanName = session.customer_details?.name || tipHandle;
      const isAnonymous = fanId.startsWith('anon_');
      
      const fanRef = db.collection('creators').doc(creatorId).collection('fans').doc(fanId);
      const fanSnap = await fanRef.get();
      if (!fanSnap.exists) {
        // New tipper
        await fanRef.set({
          id: fanId,
          creatorId,
          email: fanEmail,
          displayName: fanName,
          tipHandle,
          role: 'tipper', // Mark as tipper (non-subscriber who tips)
          isAnonymous,
          stripeCustomerId: typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id || null,
          subscriptionStatus: null, // Not a subscriber
          lastTipAt: now,
          totalTipsCents: amountTotal,
          tipCount: 1,
          totalSpentCents: amountTotal,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        // Existing fan/tipper - update tip stats
        const fanData = fanSnap.data() as { totalTipsCents?: number; tipCount?: number; totalSpentCents?: number };
        await fanRef.update({
          lastTipAt: now,
          totalTipsCents: (fanData.totalTipsCents || 0) + amountTotal,
          tipCount: (fanData.tipCount || 0) + 1,
          totalSpentCents: (fanData.totalSpentCents || 0) + amountTotal,
          updatedAt: now,
        });
      }

      // Update creator stats
      const statsRef = db.collection('creatorStats').doc(creatorId);
      const statsSnap = await statsRef.get();
      const stats = statsSnap.data() as { totalRevenueCents?: number; totalTipsCents?: number; totalTipCount?: number } | undefined;
      await statsRef.set({
        totalRevenueCents: (stats?.totalRevenueCents ?? 0) + amountTotal,
        totalTipsCents: (stats?.totalTipsCents ?? 0) + amountTotal,
        totalTipCount: (stats?.totalTipCount ?? 0) + 1,
        updatedAt: now,
      }, { merge: true });

      console.log(`Connect: tip received creator=${creatorId} fan=${fanId} amount=${amountTotal} handle=${tipHandle}`);
      return;
    }
    return;
  }

  if (event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as Stripe.Subscription;
    const creatorId = subscription.metadata?.creatorId;
    const fanId = subscription.metadata?.fanId;
    if (!creatorId || !fanId) return;
    const now = new Date().toISOString();
    const status = subscription.status === 'active' || subscription.status === 'trialing' ? subscription.status : 'past_due';
    const subRef = db.collection('creatorSubscribers').doc(creatorId).collection('subscribers').doc(fanId);
    await subRef.set({ status, stripeSubscriptionId: subscription.id, updatedAt: now }, { merge: true });
    const grantRef = db.collection('creatorEntitlements').doc(creatorId).collection('grants').doc(fanId);
    const grantSnap = await grantRef.get();
    const existing = grantSnap.data() as { unlockedProductIds?: string[] } | undefined;
    await grantRef.set({ subscription: status === 'active' || status === 'trialing', unlockedProductIds: existing?.unlockedProductIds ?? [], updatedAt: now }, { merge: true });
    
    // Update fan record subscription status
    const fanRef = db.collection('creators').doc(creatorId).collection('fans').doc(fanId);
    const fanSnap = await fanRef.get();
    if (fanSnap.exists) {
      await fanRef.update({
        subscriptionStatus: status,
        updatedAt: now,
      });
    }
    return;
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;
    const creatorId = subscription.metadata?.creatorId;
    const fanId = subscription.metadata?.fanId;
    if (!creatorId || !fanId) return;
    const now = new Date().toISOString();
    const subRef = db.collection('creatorSubscribers').doc(creatorId).collection('subscribers').doc(fanId);
    await subRef.set({ status: 'canceled', updatedAt: now }, { merge: true });
    const grantRef = db.collection('creatorEntitlements').doc(creatorId).collection('grants').doc(fanId);
    const grantSnap = await grantRef.get();
    const existing = grantSnap.data() as { unlockedProductIds?: string[] } | undefined;
    await grantRef.set({ subscription: false, unlockedProductIds: existing?.unlockedProductIds ?? [], updatedAt: now }, { merge: true });
    
    // Update fan record subscription status to cancelled
    const fanRef = db.collection('creators').doc(creatorId).collection('fans').doc(fanId);
    const fanSnap = await fanRef.get();
    if (fanSnap.exists) {
      await fanRef.update({
        subscriptionStatus: 'canceled',
        canceledAt: now,
        updatedAt: now,
      });
    }
    
    console.log(`Connect: subscription deleted creator=${creatorId} fan=${fanId}`);
    return;
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntentId = charge.payment_intent as string | null;
    if (!paymentIntentId) return;
    const ordersSnap = await db.collection('orders').where('stripePaymentIntentId', '==', paymentIntentId).limit(1).get();
    if (ordersSnap.empty) return;
    const orderDoc = ordersSnap.docs[0];
    const order = orderDoc.data() as { creatorId?: string; fanId?: string; productId?: string; amountCents?: number; status?: string };
    if (order.status === 'refunded') return;
    const { creatorId, fanId, productId, amountCents = 0 } = order;
    if (!creatorId || !fanId) return;

    await orderDoc.ref.update({ status: 'refunded', updatedAt: new Date().toISOString() });

    if (productId) {
      const grantRef = db.collection('creatorEntitlements').doc(creatorId).collection('grants').doc(fanId);
      const grantSnap = await grantRef.get();
      const data = grantSnap.data() as { unlockedProductIds?: string[] } | undefined;
      const unlocked = Array.isArray(data?.unlockedProductIds) ? data.unlockedProductIds.filter((id) => id !== productId) : [];
      await grantRef.set({ unlockedProductIds: unlocked, updatedAt: new Date().toISOString() }, { merge: true });
    }

    const statsRef = db.collection('creatorStats').doc(creatorId);
    const statsSnap = await statsRef.get();
    const stats = statsSnap.data() as { totalRevenueCents?: number; totalOrders?: number } | undefined;
    const totalRevenue = Math.max(0, (stats?.totalRevenueCents ?? 0) - amountCents);
    const totalOrders = Math.max(0, (stats?.totalOrders ?? 1) - 1);
    await statsRef.set({ totalRevenueCents: totalRevenue, totalOrders, updatedAt: new Date().toISOString() }, { merge: true });
    console.log(`Connect: refund processed creator=${creatorId} order=${orderDoc.id}`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!webhookSecret && !connectWebhookSecret) {
    return res.status(500).json({ error: 'Stripe webhook secret is not configured' });
  }

  const sig = req.headers['stripe-signature'] as string | undefined;
  if (!sig) {
    return res.status(400).json({ error: 'Missing Stripe signature header' });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await readRawBody(req);
    event = verifyWebhookSignature(rawBody, sig);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  const db = getFirestore();
  const isConnectEvent = !!event.account;

  try {
    if (isConnectEvent) {
      await handleConnectEvent(db, stripe, event);
      return res.status(200).json({ received: true });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        // Handle video minute pack purchases
        if (session.metadata?.type === 'video_minutes') {
          const userId = session.metadata.userId;
          const minutes = parseInt(session.metadata.minutes || '0', 10);
          const packId = session.metadata.packId;
          
          if (userId && minutes > 0) {
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const quotaRef = db.collection('creator_video_quotas').doc(userId);
            
            await db.runTransaction(async (transaction) => {
              const doc = await transaction.get(quotaRef);
              
              if (doc.exists) {
                const current = doc.data() as { bonusMinutes?: number };
                transaction.update(quotaRef, {
                  bonusMinutes: (current.bonusMinutes || 0) + minutes,
                  updatedAt: now.toISOString(),
                });
              } else {
                transaction.set(quotaRef, {
                  creatorId: userId,
                  monthlyMinutesLimit: 0,
                  minutesUsedThisMonth: 0,
                  totalMinutesAllTime: 0,
                  lastResetMonth: currentMonth,
                  bonusMinutes: minutes,
                  quotaExceededNotified: false,
                  updatedAt: now.toISOString(),
                });
              }
            });
            
            // Record the purchase
            await db.collection('video_minute_purchases').add({
              userId,
              packId,
              minutes,
              amountCents: session.amount_total || 0,
              stripeSessionId: session.id,
              purchasedAt: now.toISOString(),
            });
            
            console.log(`Video minutes purchased: user=${userId} minutes=${minutes} pack=${packId}`);
          }
          break;
        }
        
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

            // Capture trial end date if subscription is in trial
            const trialEndDate = subscription.trial_end 
              ? new Date(subscription.trial_end * 1000).toISOString() 
              : null;

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
              trialEndDate, // Store trial end date for notifications
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

            // Grant referral reward if applicable (Elite plan conversions)
            const referralCode = session.metadata?.referralCode || subscription.metadata?.referralCode;
            if (referralCode && planName === 'Elite') {
              try {
                await grantReferralRewardOnConversion(userId, planName, referralCode);
              } catch (err) {
                console.warn('Failed to grant referral reward from webhook:', err);
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

          const periodEnd = (subscription as { current_period_end?: number }).current_period_end;
          // Capture trial end date if subscription is in trial
          const trialEnd = (subscription as { trial_end?: number }).trial_end;
          const trialEndDate = trialEnd ? new Date(trialEnd * 1000).toISOString() : null;
          
          await userDoc.ref.set({
            plan: planName,
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            billingCycle,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            subscriptionEndDate: subscription.cancel_at_period_end && periodEnd
              ? new Date(periodEnd * 1000).toISOString()
              : null,
            trialEndDate, // Update trial end date for notifications
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
          const userData = userDoc.data();
          const planName = userData?.plan || 'Free';
          
          // Reset usage counters on successful payment
          // Clear trial end date if this is the first payment after trial
          await userDoc.ref.set({
            monthlyCaptionGenerationsUsed: 0,
            monthlyImageGenerationsUsed: 0,
            monthlyVideoGenerationsUsed: 0,
            lastPaymentDate: new Date().toISOString(),
            trialEndDate: null, // Clear trial end date after first payment
          }, { merge: true });

          // Check for referral code and grant reward if this is the first payment after trial
          // (This handles cases where referral wasn't processed during checkout.session.completed)
          const subscriptionId = userData?.stripeSubscriptionId;
          if (subscriptionId && planName === 'Elite') {
            try {
              const subscription = await stripe.subscriptions.retrieve(subscriptionId);
              const referralCode = subscription.metadata?.referralCode;
              
              if (referralCode) {
                // Check if reward was already granted
                const referralSnapshot = await db.collection('referrals')
                  .where('refereeId', '==', userDoc.id)
                  .where('rewardStatus', '==', 'granted')
                  .limit(1)
                  .get();
                
                if (referralSnapshot.empty) {
                  // Reward not yet granted, grant it now
                  await grantReferralRewardOnConversion(userDoc.id, planName, referralCode);
                }
              }
            } catch (err) {
              console.warn('Failed to check/grant referral reward on payment:', err);
            }
          }

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
          const userData = userDoc.data();
          
          // Create payment failure notification for user
          const userNotificationsRef = db.collection('users').doc(userDoc.id).collection('notifications');
          await userNotificationsRef.add({
            id: `payment-failed-${Date.now()}`,
            text: `💳 Payment failed for your subscription. Please update your payment method in Settings to avoid service interruption.`,
            timestamp: new Date().toISOString(),
            read: false,
            messageId: 'payment-failed',
            createdAt: new Date(),
          });

          // Create admin alert for payment failure
          const adminAlertsRef = db.collection('admin_alerts');
          const alertData = {
            type: 'payment_failed',
            message: `Payment failed for user: ${userData.name || userData.email || userDoc.id} (${userDoc.id})`,
            severity: 'high',
            userId: userDoc.id,
            userName: userData.name || 'Unknown',
            metadata: {
              customerId,
              invoiceId: invoice.id,
              amount: invoice.amount_due,
              currency: invoice.currency,
            },
            createdAt: new Date(),
            read: false,
          };
          
          await adminAlertsRef.add(alertData);

          // Send email notification for critical payment failures
          try {
            const { sendEmail } = await import('./_mailer.js');
            const adminUsers = await db.collection('users')
              .where('role', '==', 'Admin')
              .limit(5)
              .get();
            
            for (const adminDoc of adminUsers.docs) {
              const adminData = adminDoc.data();
              const adminEmail = adminData.email;
              if (adminEmail) {
                await sendEmail({
                  to: adminEmail,
                  subject: `🚨 Payment Failed: ${userData.name || userData.email || userDoc.id}`,
                  text: `Payment failed for user ${userData.name || userData.email || userDoc.id} (${userDoc.id}).

Amount: ${(invoice.amount_due / 100).toFixed(2)} ${invoice.currency?.toUpperCase()}
Invoice ID: ${invoice.id}
Customer ID: ${customerId}

Please check the admin dashboard for more details.`,
                  html: `<h2>Payment Failed Alert</h2>
<p><strong>User:</strong> ${userData.name || userData.email || userDoc.id} (${userDoc.id})</p>
<p><strong>Amount:</strong> ${(invoice.amount_due / 100).toFixed(2)} ${invoice.currency?.toUpperCase()}</p>
<p><strong>Invoice ID:</strong> ${invoice.id}</p>
<p><strong>Customer ID:</strong> ${customerId}</p>
<p>Please check the admin dashboard for more details.</p>`,
                });
              }
            }
          } catch (emailError) {
            console.warn('Failed to send payment failure email notification:', emailError);
            // Don't fail the webhook if email fails
          }

          console.log(`Payment failed for user ${userDoc.id} - notifications created`);
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

