import { createHash } from 'crypto';
import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from './_firebaseAdmin.js';
import { recordPlanChangeEvent } from './_planChangeEvents.js';
import { grantReferralRewardOnConversion } from './_grantReferralReward.js';
import {
  reconcileFanHubFanPreferenceForMember,
  ensureFanDmThreadForMember,
} from './_syncFanHubFanPreference.js';
import { mergeGuestTreatPurchasesIntoUid } from './_mergeGuestFanPurchases.js';
import { notifyCreatorNewFanMemberJoined, sendCreatorHubNotification } from './_fanNotifications.js';
import { maybeSendAutomatedMemberWelcomeDm } from './_memberWelcomeDm.js';
import { syncLiveStreamTicketOrdersForStream } from './_syncLiveStreamTicketOrders.js';
import {
  billingCountryFromCheckoutSession,
  enrichBillingCountryFromCheckoutSession,
  enrichBillingCountryFromInvoice,
} from './_stripeBillingCountry.js';

// Check STRIPE_USE_TEST_MODE toggle first, then select appropriate key
// Set STRIPE_USE_TEST_MODE=true in Vercel to use test mode, false or unset for live mode
const useTestMode = process.env.STRIPE_USE_TEST_MODE === 'true' || process.env.STRIPE_USE_TEST_MODE === '1';

const stripeSecretKey = useTestMode
  ? (process.env.STRIPE_SECRET_KEY_Test || process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY)
  : (process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY);

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2024-06-20' as any, // Type assertion to handle Stripe types
    })
  : null;

if (!stripeSecretKey) {
  const mode = useTestMode ? 'test' : 'live';
  console.error(
    `stripeWebhook init: missing STRIPE_SECRET_KEY_${useTestMode ? 'Test' : 'LIVE'} / STRIPE_SECRET_KEY for ${mode} mode`,
  );
}

// Log which mode is being used
console.log(`Stripe webhook initialized in ${useTestMode ? 'TEST' : 'LIVE'} mode (STRIPE_USE_TEST_MODE=${process.env.STRIPE_USE_TEST_MODE || 'not set'})`);

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const connectWebhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

/**
 * All signing secrets we accept on this URL. EchoFlux + Connect are required for normal operation;
 * add STRIPE_STORMIJXO_WEBHOOK_SECRET when the Stormijxo Stripe account (same org, second account)
 * sends webhooks here so legacy subscriptions keep updating Firestore.
 */
function collectStripeWebhookSecrets(): string[] {
  const out: string[] = [];
  const add = (s: string | undefined) => {
    const t = typeof s === "string" ? s.trim() : "";
    if (t.length > 0) out.push(t);
  };
  add(webhookSecret);
  add(connectWebhookSecret);
  add(process.env.STRIPE_STORMIJXO_WEBHOOK_SECRET);
  const more = process.env.STRIPE_ADDITIONAL_WEBHOOK_SECRETS;
  if (more) {
    for (const part of more.split(",")) add(part.trim());
  }
  return [...new Set(out)];
}

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

function verifyWebhookSignature(
  stripeClient: Stripe,
  rawBody: Buffer,
  sig: string,
): Stripe.Event {
  const secrets = collectStripeWebhookSecrets();
  if (secrets.length === 0) {
    throw new Error(
      "Webhook signature verification failed: set STRIPE_WEBHOOK_SECRET and/or STRIPE_CONNECT_WEBHOOK_SECRET " +
        "and/or STRIPE_STORMIJXO_WEBHOOK_SECRET (see .env.example)",
    );
  }
  const errors: string[] = [];
  for (const secret of secrets) {
    try {
      return stripeClient.webhooks.constructEvent(rawBody, sig, secret);
    } catch (e: unknown) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(
    `Webhook signature verification failed. Fan Hub Connect checkouts need STRIPE_CONNECT_WEBHOOK_SECRET from your Connect webhook endpoint. ` +
      `Legacy Stormijxo-account events need STRIPE_STORMIJXO_WEBHOOK_SECRET if that account posts to this URL. Attempts: ${errors.join(" | ")}`,
  );
}

const FAN_HUB_CHECKOUT_TYPES = new Set(['subscription', 'product', 'tip', 'post_unlock', 'live_stream_ticket']);

function normalizeFanHubCheckoutType(
  rawType: string | undefined,
): 'subscription' | 'product' | 'tip' | 'post_unlock' | 'live_stream_ticket' | null {
  if (!rawType) return null;
  if (rawType === 'treat') return 'product'; // Legacy Stormij payload alias.
  if (
    rawType === 'subscription' ||
    rawType === 'product' ||
    rawType === 'tip' ||
    rawType === 'post_unlock' ||
    rawType === 'live_stream_ticket'
  ) {
    return rawType;
  }
  return null;
}

function deriveGuestFanIdFromCheckoutSession(
  session: Stripe.Checkout.Session,
  stripeCustId: string | null,
): string | null {
  if (stripeCustId) return `guest_${stripeCustId}`;
  const raw = (session.customer_details?.email || '').trim().toLowerCase();
  if (!raw) return null;
  return `guest_tip_${createHash('sha256').update(raw).digest('hex').slice(0, 32)}`;
}

function fallbackGuestFanIdFromSession(session: Stripe.Checkout.Session): string {
  return `guest_session_${session.id}`;
}

function getCheckoutSessionEmail(session: Stripe.Checkout.Session): string | null {
  const email =
    session.customer_details?.email ||
    session.customer_email ||
    session.metadata?.fanEmail ||
    null;
  return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
}

function getCheckoutSessionName(session: Stripe.Checkout.Session): string | null {
  const name =
    session.customer_details?.name ||
    session.metadata?.fanName ||
    null;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

/** Stripe-derived billing locale (ISO2), not inferred physical location. */
function fanBillingCountryPatch(country: string | null, now: string): Record<string, unknown> {
  if (!country) return {};
  return {
    billingCountry: country,
    billingCountrySource: 'stripe_billing',
    billingCountryUpdatedAt: now,
  };
}

function orderBillingCountryField(country: string | null): Record<string, unknown> {
  return country ? { billingCountry: country } : {};
}

export type FanHubCheckoutStripeContext = {
  stripe: Stripe;
  /** Connected account id when Checkout lived on Stripe Connect */
  stripeAccount?: string | null;
};

async function incrementFanPostTipGoalRaisedCents(
  db: Firestore,
  creatorId: string,
  postId: string,
  amountCents: number,
): Promise<void> {
  const cleanPostId = typeof postId === 'string' ? postId.trim() : '';
  if (!creatorId || !cleanPostId || amountCents <= 0) return;
  const refs = [
    db.collection('creators').doc(creatorId).collection('fanPosts').doc(cleanPostId),
    db.collection('creators').doc(creatorId).collection('posts').doc(cleanPostId),
    db.collection('users').doc(creatorId).collection('posts').doc(cleanPostId),
  ];
  await Promise.all(
    refs.map(async (ref) => {
      const snap = await ref.get().catch(() => null);
      const data = snap?.exists ? snap.data() : null;
      const tipGoal = data?.tipGoal as { targetCents?: unknown } | undefined;
      if (!tipGoal || typeof tipGoal !== 'object') return;
      const targetCents = typeof tipGoal.targetCents === 'number' ? tipGoal.targetCents : 0;
      if (targetCents <= 0) return;
      await ref.update({
        'tipGoal.raisedCents': FieldValue.increment(amountCents),
        updatedAt: new Date().toISOString(),
      });
    }),
  );
}

function stripeRefId(
  value: unknown,
): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

/**
 * Creator Fan Hub bell: one notification per paid store order, even when a duplicate webhook
 * skips granting (Firestore already finalized) — avoids missing the bell after a crash between txn + notify.
 */
async function trySendCreatorHubProductPurchaseBell(
  db: Firestore,
  sessionId: string,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const orderRef = db.collection('orders').doc(sessionId);
  const snap = await orderRef.get();
  const d = snap.data() as {
    status?: string;
    type?: string;
    creatorPurchaseBellSent?: boolean;
    creatorId?: string;
    productId?: string;
    productTitle?: string;
    amountCents?: number;
    fanEmail?: unknown;
    fanName?: unknown;
  } | undefined;
  const status = typeof d?.status === 'string' ? d.status.trim().toLowerCase() : '';
  const typ = typeof d?.type === 'string' ? d.type.trim().toLowerCase() : '';
  if (!d || status !== 'paid' || typ !== 'product') return;
  if (d.creatorPurchaseBellSent === true) return;

  const creatorId = typeof d.creatorId === 'string' ? d.creatorId.trim() : '';
  if (!creatorId) return;

  const md = session.metadata || {};
  const productId =
    (typeof d.productId === 'string' ? d.productId.trim() : '') ||
    (typeof md.productId === 'string' ? md.productId.trim() : '') ||
    (typeof md.treatId === 'string' ? md.treatId.trim() : '');

  const amountTotal =
    typeof d.amountCents === 'number' && Number.isFinite(d.amountCents)
      ? d.amountCents
      : (session.amount_total ?? 0);

  const fanNameDoc = typeof d.fanName === 'string' ? d.fanName.trim() : '';
  const fanEmailDoc = typeof d.fanEmail === 'string' ? d.fanEmail.trim() : '';
  const fanName = fanNameDoc || getCheckoutSessionName(session) || '';
  const fanEmail = fanEmailDoc || getCheckoutSessionEmail(session) || '';

  try {
    const amountLabel = (amountTotal / 100).toFixed(2);
    const buyerLabel = (fanName && String(fanName).trim()) || fanEmail || 'A fan';
    const itemLabel =
      (typeof d.productTitle === 'string' && d.productTitle.trim()) ||
      (typeof md.productTitle === 'string' && md.productTitle.trim()) ||
      'Store item';

    await sendCreatorHubNotification({
      creatorId,
      type: 'creator_new_purchase',
      title: 'New store purchase',
      body: `${buyerLabel} bought ${itemLabel} ($${amountLabel}).`,
      data: {
        orderId: sessionId,
        creatorId,
        ...(productId ? { productId } : {}),
        destination: 'purchases',
      },
    });

    await orderRef.set(
      {
        creatorPurchaseBellSent: true,
        creatorPurchaseBellSentAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch (e) {
    console.warn('trySendCreatorHubProductPurchaseBell failed', sessionId, e);
  }
}

async function repairFanHubSubscriptionIdentityForSession(
  db: Firestore,
  session: Stripe.Checkout.Session,
  creatorId: string,
  fromFanId: string,
  toFanId: string,
  nowIso: string,
): Promise<void> {
  if (!fromFanId || !toFanId || fromFanId === toFanId) return;
  const fanEmail = getCheckoutSessionEmail(session);
  const fanName = getCheckoutSessionName(session);
  const subId =
    typeof session.subscription === 'string'
      ? session.subscription
      : ((session.subscription as { id?: string } | null)?.id || null);

  // Keep the canonical order keyed to the currently authenticated UID.
  await db.collection('orders').doc(session.id).set(
    {
      fanId: toFanId,
      ...(fanEmail ? { fanEmail } : {}),
      ...(fanName ? { fanName } : {}),
      updatedAt: nowIso,
      repairedFromFanId: fromFanId,
    },
    { merge: true },
  );

  const subs = db.collection('creatorSubscribers').doc(creatorId).collection('subscribers');
  const grants = db.collection('creatorEntitlements').doc(creatorId).collection('grants');
  const fans = db.collection('creators').doc(creatorId).collection('fans');

  const [oldSubSnap, newSubSnap, oldGrantSnap, newGrantSnap, oldFanSnap, newFanSnap] = await Promise.all([
    subs.doc(fromFanId).get().catch(() => null),
    subs.doc(toFanId).get().catch(() => null),
    grants.doc(fromFanId).get().catch(() => null),
    grants.doc(toFanId).get().catch(() => null),
    fans.doc(fromFanId).get().catch(() => null),
    fans.doc(toFanId).get().catch(() => null),
  ]);

  const oldSub = (oldSubSnap?.data() || {}) as Record<string, unknown>;
  const newSub = (newSubSnap?.data() || {}) as Record<string, unknown>;
  await subs.doc(toFanId).set(
    {
      ...oldSub,
      ...newSub,
      status: 'active',
      ...(subId ? { stripeSubscriptionId: subId } : {}),
      fanId: toFanId,
      ...(fanEmail ? { email: fanEmail, fanEmail } : {}),
      updatedAt: nowIso,
      migratedFromFanId: fromFanId,
    },
    { merge: true },
  );

  const oldGrant = (oldGrantSnap?.data() || {}) as {
    unlockedProductIds?: string[];
    unlockedFanPostIds?: string[];
    unlockedLiveStreamIds?: string[];
  };
  const newGrant = (newGrantSnap?.data() || {}) as {
    unlockedProductIds?: string[];
    unlockedFanPostIds?: string[];
    unlockedLiveStreamIds?: string[];
  };
  const unlockedProductIds = Array.from(
    new Set([...(newGrant.unlockedProductIds || []), ...(oldGrant.unlockedProductIds || [])]),
  );
  const unlockedFanPostIds = Array.from(
    new Set([...(newGrant.unlockedFanPostIds || []), ...(oldGrant.unlockedFanPostIds || [])]),
  );
  const unlockedLiveStreamIds = Array.from(
    new Set([...(newGrant.unlockedLiveStreamIds || []), ...(oldGrant.unlockedLiveStreamIds || [])]),
  );
  await grants.doc(toFanId).set(
    {
      subscription: true,
      unlockedProductIds,
      ...(unlockedFanPostIds.length ? { unlockedFanPostIds } : {}),
      ...(unlockedLiveStreamIds.length ? { unlockedLiveStreamIds } : {}),
      updatedAt: nowIso,
      migratedFromFanId: fromFanId,
    },
    { merge: true },
  );

  const oldFan = (oldFanSnap?.data() || {}) as Record<string, unknown>;
  const newFan = (newFanSnap?.data() || {}) as Record<string, unknown>;
  await fans.doc(toFanId).set(
    {
      ...oldFan,
      ...newFan,
      id: toFanId,
      creatorId,
      subscriptionStatus: 'active',
      ...(subId ? { stripeSubscriptionId: subId } : {}),
      ...(fanEmail ? { email: fanEmail } : {}),
      ...(fanName ? { displayName: fanName } : {}),
      updatedAt: nowIso,
      migratedFromFanId: fromFanId,
    },
    { merge: true },
  );
}

/**
 * Fan Hub checkout (creator storefront): same Firestore updates for Connect checkouts and
 * platform-account checkouts (e.g. PLATFORM_OWNER_CREATOR_IDS / Stormij).
 * Returns true if this session was handled as fan hub (caller should skip EchoFlux creator billing).
 */
/** Exported for POST /api/syncFanCheckoutSession when webhooks are delayed (member returns before Firestore updates). */
export async function processFanHubCheckoutSessionCompleted(
  db: Firestore,
  session: Stripe.Checkout.Session,
  stripeContext?: FanHubCheckoutStripeContext | null,
): Promise<boolean> {
  const creatorId = session.metadata?.creatorId;
  const rawType = session.metadata?.type;
  const type = normalizeFanHubCheckoutType(rawType);
  if (!creatorId || !type || !FAN_HUB_CHECKOUT_TYPES.has(type)) {
    return false;
  }

  const stripeCustId =
    typeof session.customer === 'string'
      ? session.customer
      : (session.customer as { id?: string } | null)?.id || null;

  const isGuestProductCheckout = type === 'product' && session.metadata?.guestCheckout === 'true';
  let fanId = (session.metadata?.fanId || session.client_reference_id || '') as string;
  if (isGuestProductCheckout) {
    fanId = stripeCustId ? `guest_${stripeCustId}` : fallbackGuestFanIdFromSession(session);
  } else if (type === 'tip' && (!fanId || fanId === 'guest_pending')) {
    const guestDerived = deriveGuestFanIdFromCheckoutSession(session, stripeCustId);
    fanId = guestDerived || fallbackGuestFanIdFromSession(session);
  } else if (!fanId || fanId === 'guest_pending') {
    return false;
  }

  // Landing-page tips without sign-in: metadata still has anon_*; key fans/orders by Stripe customer
  // (or stable email hash) so repeat tippers merge and show under Tippers / revenue like guest store buyers.
  if (type === 'tip' && typeof fanId === 'string' && fanId.startsWith('anon_')) {
    const guestDerived = deriveGuestFanIdFromCheckoutSession(session, stripeCustId);
    fanId = guestDerived || fallbackGuestFanIdFromSession(session);
  }

  const now = new Date().toISOString();
  const dupOrder = await db.collection('orders').where('stripeSessionId', '==', session.id).limit(1).get();
  if (!dupOrder.empty) {
    const existing = dupOrder.docs[0].data() as { status?: string; fanId?: string } | undefined;
    const existingStatus = typeof existing?.status === 'string' ? existing.status.trim().toLowerCase() : '';
    if (type === 'product' && existingStatus !== 'paid') {
      // Product checkout writes a recoverable pending order at session creation.
      // Continue so this webhook/return sync can finalize it to paid and grant access.
    } else {
    // If this session already exists but points at a different fan id, repair to the
    // current canonical UID (common after auth-account merges/migrations).
    if (type === 'subscription') {
      const existingFanId = typeof existing?.fanId === 'string' ? existing.fanId : '';
      if (existingFanId && existingFanId !== fanId) {
        try {
          await repairFanHubSubscriptionIdentityForSession(
            db,
            session,
            creatorId,
            existingFanId,
            fanId,
            now,
          );
        } catch (e) {
          console.warn('Fan hub duplicate session identity repair failed', session.id, e);
        }
      }
      const canonFanId =
        typeof existing?.fanId === 'string' && existing.fanId.trim() ? existing.fanId.trim() : fanId;
      try {
        await maybeSendAutomatedMemberWelcomeDm(db, creatorId, canonFanId, now, {
          source: 'paid_subscription',
        });
      } catch (e) {
        console.warn('maybeSendAutomatedMemberWelcomeDm (subscription duplicate session replay):', e);
      }
    }
    console.log(`Fan hub: skip duplicate checkout.session.completed session=${session.id}`);
    return true;
    }
  }

  let billingCountry: string | null = null;
  if (stripeContext?.stripe) {
    billingCountry = await enrichBillingCountryFromCheckoutSession(
      stripeContext.stripe,
      session,
      stripeContext.stripeAccount ?? null,
    );
  } else {
    billingCountry = billingCountryFromCheckoutSession(session);
  }

  const sessionSubscriptionId = stripeRefId(session.subscription);
  if (type === 'subscription' && sessionSubscriptionId) {
    const amountTotal = session.amount_total ?? 0;

    let subscriptionPaymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent as Stripe.PaymentIntent | null)?.id || null;

    if (!subscriptionPaymentIntentId && stripeContext?.stripe) {
      const stripe = stripeContext.stripe;
      const acct = stripeContext.stripeAccount ?? null;
      const reqOpts = acct ? { stripeAccount: acct } : undefined;
      try {
        const invoiceId = stripeRefId(session.invoice);
        if (invoiceId) {
          const inv = await stripe.invoices.retrieve(invoiceId, { expand: ['payment_intent'] }, reqOpts);
          const invPi = (
            inv as Stripe.Invoice & { payment_intent?: string | Stripe.PaymentIntent | null }
          ).payment_intent;
          subscriptionPaymentIntentId = stripeRefId(invPi);
        }
      } catch (e) {
        console.warn('Fan hub subscription checkout: could not resolve payment_intent from invoice', e);
      }
    }

    const subRef = db.collection('creatorSubscribers').doc(creatorId).collection('subscribers').doc(fanId);
    await subRef.set({ status: 'active', stripeSubscriptionId: sessionSubscriptionId, updatedAt: now }, { merge: true });
    const grantRef = db.collection('creatorEntitlements').doc(creatorId).collection('grants').doc(fanId);
    const grantSnap = await grantRef.get();
    const existing = grantSnap.data() as { unlockedProductIds?: string[] } | undefined;
    const unlocked = Array.isArray(existing?.unlockedProductIds) ? existing.unlockedProductIds : [];
    await grantRef.set({ subscription: true, unlockedProductIds: unlocked, updatedAt: now }, { merge: true });

    const orderRef = db.collection('orders').doc(session.id);
    await orderRef.set({
      creatorId,
      fanId,
      productId: null,
      type: 'subscription',
      stripeSessionId: session.id,
      ...(subscriptionPaymentIntentId ? { stripePaymentIntentId: subscriptionPaymentIntentId } : {}),
      stripeSubscriptionId: sessionSubscriptionId,
      amountCents: amountTotal,
      status: 'paid',
      fanEmail: getCheckoutSessionEmail(session),
      fanName: getCheckoutSessionName(session),
      scheduleStatus: 'pending',
      createdAt: now,
      ...orderBillingCountryField(billingCountry),
    });

    const statsRef = db.collection('creatorStats').doc(creatorId);
    const statsSnap = await statsRef.get();
    const stats = statsSnap.data() as { totalRevenueCents?: number; totalOrders?: number } | undefined;
    const totalRevenue = (stats?.totalRevenueCents ?? 0) + amountTotal;
    const totalOrders = (stats?.totalOrders ?? 0) + 1;
    await statsRef.set({ totalRevenueCents: totalRevenue, totalOrders, updatedAt: now }, { merge: true });

    const fanEmail = getCheckoutSessionEmail(session);
    const fanName = getCheckoutSessionName(session);
    const fanRef = db.collection('creators').doc(creatorId).collection('fans').doc(fanId);
    const fanSnap = await fanRef.get();
    const prevSubRaw = fanSnap.exists
      ? (fanSnap.data() as { subscriptionStatus?: string | null }).subscriptionStatus
      : '';
    const prevSubNorm =
      typeof prevSubRaw === 'string' ? prevSubRaw.trim().toLowerCase() : '';
    const hadActivePaidMembership =
      prevSubNorm === 'active' || prevSubNorm === 'trialing';
    let memberUsername: string | null = null;
    try {
      const uSnap = await db.collection('users').doc(fanId).get();
      const u = uSnap.data() as { username?: string } | undefined;
      const raw = typeof u?.username === 'string' ? u.username.trim().toLowerCase() : '';
      if (raw.length >= 3 && /^[a-z0-9_]+$/.test(raw)) memberUsername = raw;
    } catch {
      /* ignore */
    }
    if (!fanSnap.exists) {
      await fanRef.set({
        id: fanId,
        creatorId,
        email: fanEmail,
        displayName: fanName,
        ...(memberUsername ? { username: memberUsername } : {}),
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id || null,
        subscriptionStatus: 'active',
        subscribedAt: now,
        lastPaymentAt: now,
        totalSpentCents: amountTotal,
        totalMembershipCents: amountTotal,
        membershipPaymentCount: 1,
        createdAt: now,
        updatedAt: now,
        ...fanBillingCountryPatch(billingCountry, now),
      });
    } else {
      const fanData = fanSnap.data() as {
        totalSpentCents?: number;
        totalMembershipCents?: number;
        membershipPaymentCount?: number;
      } | undefined;
      const patch: Record<string, unknown> = {
        subscriptionStatus: 'active',
        lastPaymentAt: now,
        totalSpentCents: (fanData?.totalSpentCents || 0) + amountTotal,
        totalMembershipCents: (fanData?.totalMembershipCents || 0) + amountTotal,
        membershipPaymentCount: (fanData?.membershipPaymentCount || 0) + 1,
        updatedAt: now,
        ...fanBillingCountryPatch(billingCountry, now),
      };
      if (memberUsername) patch.username = memberUsername;
      await fanRef.update(patch);
    }

    try {
      await ensureFanDmThreadForMember(db, creatorId, fanId, now);
    } catch (e) {
      console.warn('ensureFanDmThreadForMember (subscription checkout):', e);
    }

    try {
      await reconcileFanHubFanPreferenceForMember(db, creatorId, fanId, now, 'stripe_subscription_checkout');
    } catch (e) {
      console.error('reconcileFanHubFanPreference (subscription checkout):', e);
    }

    try {
      const cust =
        typeof session.customer === 'string'
          ? session.customer
          : (session.customer as { id?: string } | null)?.id || null;
      await mergeGuestTreatPurchasesIntoUid(db, creatorId, fanId, cust, now);
    } catch (e) {
      console.warn('mergeGuestTreatPurchasesIntoUid (subscription checkout):', e);
    }

    if (!hadActivePaidMembership) {
      try {
        await notifyCreatorNewFanMemberJoined({
          creatorId,
          fanId,
          displayNameHint: fanName || null,
        });
      } catch (e) {
        console.warn('notifyCreatorNewFanMemberJoined (subscription checkout):', e);
      }
    }

    try {
      await maybeSendAutomatedMemberWelcomeDm(db, creatorId, fanId, now, {
        source: 'paid_subscription',
      });
    } catch (e) {
      console.warn('maybeSendAutomatedMemberWelcomeDm (subscription checkout):', e);
    }

    console.log(`Fan hub: subscription checkout creator=${creatorId} fan=${fanId}`);
    return true;
  }

  if (type === 'product' && (session.metadata?.productId || session.metadata?.treatId)) {
    const productId = (session.metadata.productId || session.metadata.treatId) as string;
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent as Stripe.PaymentIntent)?.id;
    const amountTotal = session.amount_total ?? 0;

    const fanEmail = getCheckoutSessionEmail(session);
    const fanName = getCheckoutSessionName(session);
    const isGuestFan = fanId.startsWith('guest_');

    const productTitle =
      (typeof session.metadata?.productTitle === 'string' && session.metadata.productTitle.trim()) || null;
    const orderRef = db.collection('orders').doc(session.id);
    const productRef = db.collection('products').doc(productId);

    const orderPayload: Record<string, unknown> = {
      creatorId,
      fanId,
      productId,
      productTitle: productTitle || undefined,
      type: 'product',
      stripeSessionId: session.id,
      stripePaymentIntentId: paymentIntentId || null,
      amountCents: amountTotal,
      status: 'paid',
      fanEmail,
      fanName,
      scheduleStatus: 'pending',
      ...(isGuestProductCheckout ? { guestCheckout: true } : {}),
      createdAt: now,
      ...orderBillingCountryField(billingCountry),
    };

    /** One order row + one soldCount bump per Stripe session (race-safe vs duplicate webhooks / sync). */
    const finalizedOrder = await db.runTransaction(async (tx) => {
      const [existingOrder, pSnap] = await Promise.all([tx.get(orderRef), tx.get(productRef)]);
      const existingStatus = existingOrder.exists
        ? String((existingOrder.data() as { status?: unknown } | undefined)?.status || '').trim().toLowerCase()
        : '';
      if (existingOrder.exists && existingStatus === 'paid') return false;
      tx.set(orderRef, { ...orderPayload, updatedAt: now }, { merge: true });
      if (pSnap.exists) {
        tx.update(productRef, {
          soldCount: FieldValue.increment(1),
          updatedAt: now,
        });
      }
      return true;
    });

    if (!finalizedOrder) {
      console.log(`Fan hub: skip duplicate product checkout session=${session.id}`);
    } else {
      const grantRef = db.collection('creatorEntitlements').doc(creatorId).collection('grants').doc(fanId);
      const grantSnap = await grantRef.get();
      const existing = grantSnap.data() as { unlockedProductIds?: string[] } | undefined;
      const unlocked = Array.isArray(existing?.unlockedProductIds) ? existing.unlockedProductIds : [];
      if (!unlocked.includes(productId)) {
        await grantRef.set({ unlockedProductIds: [...unlocked, productId], updatedAt: now }, { merge: true });
      }

      const fanRef = db.collection('creators').doc(creatorId).collection('fans').doc(fanId);
      const fanSnap = await fanRef.get();
      if (!fanSnap.exists) {
        await fanRef.set({
          id: fanId,
          creatorId,
          email: fanEmail,
          displayName: fanName,
          stripeCustomerId: typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id || null,
          subscriptionStatus: null,
          ...(isGuestFan ? { role: 'treat_buyer' as const } : {}),
          lastPurchaseAt: now,
          totalSpentCents: amountTotal,
          purchaseCount: 1,
          createdAt: now,
          updatedAt: now,
          ...fanBillingCountryPatch(billingCountry, now),
        });
      } else {
        const fanData = fanSnap.data() as { totalSpentCents?: number; purchaseCount?: number };
        const patch: Record<string, unknown> = {
          lastPurchaseAt: now,
          totalSpentCents: (fanData.totalSpentCents || 0) + amountTotal,
          purchaseCount: (fanData.purchaseCount || 0) + 1,
          updatedAt: now,
          ...fanBillingCountryPatch(billingCountry, now),
        };
        if (isGuestFan) {
          patch.role = 'treat_buyer';
          if (fanEmail) patch.email = fanEmail;
          if (fanName) patch.displayName = fanName;
        }
        await fanRef.update(patch);
      }

      if (!isGuestFan) {
        try {
          await reconcileFanHubFanPreferenceForMember(db, creatorId, fanId, now, 'stripe_product');
        } catch (e) {
          console.error('reconcileFanHubFanPreference (product):', e);
        }
      }

      const statsRef = db.collection('creatorStats').doc(creatorId);
      const statsSnap = await statsRef.get();
      const stats = statsSnap.data() as { totalRevenueCents?: number; totalOrders?: number } | undefined;
      const totalRevenue = (stats?.totalRevenueCents ?? 0) + amountTotal;
      const totalOrders = (stats?.totalOrders ?? 0) + 1;
      await statsRef.set({ totalRevenueCents: totalRevenue, totalOrders, updatedAt: now }, { merge: true });
      console.log(`Fan hub: product checkout creator=${creatorId} fan=${fanId} product=${productId}`);
    }

    await trySendCreatorHubProductPurchaseBell(db, session.id, session);

    return true;
  }

  if (type === 'post_unlock' && session.metadata?.postId) {
    const unlockPostId = session.metadata.postId as string;
    if (fanId.startsWith('guest_') || fanId.startsWith('anon_')) {
      console.warn('Fan hub post_unlock checkout invalid fan id', session.id);
      return false;
    }
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent as Stripe.PaymentIntent)?.id;
    const amountTotal = session.amount_total ?? 0;

    const orderRef = db.collection('orders').doc(session.id);
    await orderRef.set({
      creatorId,
      fanId,
      postId: unlockPostId,
      productId: null,
      type: 'post_unlock',
      stripeSessionId: session.id,
      stripePaymentIntentId: paymentIntentId || null,
      amountCents: amountTotal,
      status: 'paid',
      fanEmail: getCheckoutSessionEmail(session),
      fanName: getCheckoutSessionName(session),
      scheduleStatus: 'pending',
      createdAt: now,
      ...orderBillingCountryField(billingCountry),
    });

    const grantRef = db.collection('creatorEntitlements').doc(creatorId).collection('grants').doc(fanId);
    const grantSnap = await grantRef.get();
    const existing = grantSnap.data() as { unlockedFanPostIds?: string[]; unlockedProductIds?: string[] } | undefined;
    const unlockedPosts = Array.isArray(existing?.unlockedFanPostIds) ? existing.unlockedFanPostIds : [];
    if (!unlockedPosts.includes(unlockPostId)) {
      await grantRef.set({ unlockedFanPostIds: [...unlockedPosts, unlockPostId], updatedAt: now }, { merge: true });
    }

    const fanEmail = getCheckoutSessionEmail(session);
    const fanName = getCheckoutSessionName(session);
    const fanRef = db.collection('creators').doc(creatorId).collection('fans').doc(fanId);
    const fanSnap = await fanRef.get();
    if (!fanSnap.exists) {
      await fanRef.set({
        id: fanId,
        creatorId,
        email: fanEmail,
        displayName: fanName,
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id || null,
        subscriptionStatus: null,
        lastPurchaseAt: now,
        totalSpentCents: amountTotal,
        purchaseCount: 1,
        createdAt: now,
        updatedAt: now,
        ...fanBillingCountryPatch(billingCountry, now),
      });
    } else {
      const fanData = fanSnap.data() as { totalSpentCents?: number; purchaseCount?: number };
      await fanRef.update({
        lastPurchaseAt: now,
        totalSpentCents: (fanData.totalSpentCents || 0) + amountTotal,
        purchaseCount: (fanData.purchaseCount || 0) + 1,
        updatedAt: now,
        ...fanBillingCountryPatch(billingCountry, now),
      });
    }

    try {
      await reconcileFanHubFanPreferenceForMember(db, creatorId, fanId, now, 'stripe_post_unlock');
    } catch (e) {
      console.error('reconcileFanHubFanPreference (post_unlock):', e);
    }

    const statsRef = db.collection('creatorStats').doc(creatorId);
    const statsSnap = await statsRef.get();
    const stats = statsSnap.data() as { totalRevenueCents?: number; totalOrders?: number } | undefined;
    const totalRevenue = (stats?.totalRevenueCents ?? 0) + amountTotal;
    const totalOrders = (stats?.totalOrders ?? 0) + 1;
    await statsRef.set({ totalRevenueCents: totalRevenue, totalOrders, updatedAt: now }, { merge: true });
    console.log(`Fan hub: post_unlock checkout creator=${creatorId} fan=${fanId} post=${unlockPostId}`);
    return true;
  }

  if (type === 'live_stream_ticket' && session.metadata?.streamId) {
    const ticketStreamId = session.metadata.streamId as string;
    if (fanId.startsWith('guest_') || fanId.startsWith('anon_')) {
      console.warn('Fan hub live_stream_ticket checkout invalid fan id', session.id);
      return false;
    }
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent as Stripe.PaymentIntent)?.id;
    const amountTotal = session.amount_total ?? 0;

    let streamTitleForOrder: string | undefined;
    try {
      const streamSnap = await db
        .collection('creators')
        .doc(creatorId)
        .collection('liveStreams')
        .doc(ticketStreamId)
        .get();
      const t = streamSnap.data()?.title;
      if (typeof t === 'string' && t.trim()) streamTitleForOrder = t.trim();
    } catch {
      /* ignore */
    }
    const productTitle = streamTitleForOrder ? `Live stream: ${streamTitleForOrder}` : 'Live stream ticket';

    const orderRef = db.collection('orders').doc(session.id);
    await orderRef.set({
      creatorId,
      fanId,
      streamId: ticketStreamId,
      postId: null,
      productId: null,
      type: 'live_stream_ticket',
      productTitle,
      stripeSessionId: session.id,
      stripePaymentIntentId: paymentIntentId || null,
      amountCents: amountTotal,
      status: 'paid',
      fanEmail: getCheckoutSessionEmail(session),
      fanName: getCheckoutSessionName(session),
      scheduleStatus: 'pending',
      createdAt: now,
      ...orderBillingCountryField(billingCountry),
    });

    const grantRef = db.collection('creatorEntitlements').doc(creatorId).collection('grants').doc(fanId);
    const grantSnap = await grantRef.get();
    const existing = grantSnap.data() as {
      unlockedFanPostIds?: string[];
      unlockedProductIds?: string[];
      unlockedLiveStreamIds?: string[];
    } | undefined;
    const unlockedStreams = Array.isArray(existing?.unlockedLiveStreamIds) ? existing.unlockedLiveStreamIds : [];
    if (!unlockedStreams.includes(ticketStreamId)) {
      await grantRef.set({ unlockedLiveStreamIds: [...unlockedStreams, ticketStreamId], updatedAt: now }, { merge: true });
    }

    const fanEmail = getCheckoutSessionEmail(session);
    const fanName = getCheckoutSessionName(session);
    const fanRef = db.collection('creators').doc(creatorId).collection('fans').doc(fanId);
    const fanSnap = await fanRef.get();
    if (!fanSnap.exists) {
      await fanRef.set({
        id: fanId,
        creatorId,
        email: fanEmail,
        displayName: fanName,
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id || null,
        subscriptionStatus: null,
        lastPurchaseAt: now,
        totalSpentCents: amountTotal,
        purchaseCount: 1,
        createdAt: now,
        updatedAt: now,
        ...fanBillingCountryPatch(billingCountry, now),
      });
    } else {
      const fanData = fanSnap.data() as { totalSpentCents?: number; purchaseCount?: number };
      await fanRef.update({
        lastPurchaseAt: now,
        totalSpentCents: (fanData.totalSpentCents || 0) + amountTotal,
        purchaseCount: (fanData.purchaseCount || 0) + 1,
        updatedAt: now,
        ...fanBillingCountryPatch(billingCountry, now),
      });
    }

    try {
      await reconcileFanHubFanPreferenceForMember(db, creatorId, fanId, now, 'stripe_live_stream_ticket');
    } catch (e) {
      console.error('reconcileFanHubFanPreference (live_stream_ticket):', e);
    }

    const statsRef = db.collection('creatorStats').doc(creatorId);
    const statsSnap = await statsRef.get();
    const stats = statsSnap.data() as { totalRevenueCents?: number; totalOrders?: number } | undefined;
    const totalRevenue = (stats?.totalRevenueCents ?? 0) + amountTotal;
    const totalOrders = (stats?.totalOrders ?? 0) + 1;
    await statsRef.set({ totalRevenueCents: totalRevenue, totalOrders, updatedAt: now }, { merge: true });
    console.log(`Fan hub: live_stream_ticket checkout creator=${creatorId} fan=${fanId} stream=${ticketStreamId}`);

    try {
      await syncLiveStreamTicketOrdersForStream(db, creatorId, ticketStreamId);
    } catch (e) {
      console.warn('syncLiveStreamTicketOrdersForStream (live_stream_ticket checkout):', e);
    }

    try {
      const itemLabel = streamTitleForOrder || 'Live stream';
      const amountLabel = (amountTotal / 100).toFixed(2);
      const buyerLabel = (fanName && String(fanName).trim()) || fanEmail || 'A fan';
      await sendCreatorHubNotification({
        creatorId,
        type: 'creator_new_purchase',
        title: 'New live stream ticket',
        body: `${buyerLabel} bought a ticket for ${itemLabel} ($${amountLabel}).`,
        data: {
          orderId: session.id,
          streamId: ticketStreamId,
          destination: 'purchases',
        },
      });
    } catch (e) {
      console.warn('sendCreatorHubNotification (live_stream_ticket):', e);
    }

    return true;
  }

  if (type === 'tip') {
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent as Stripe.PaymentIntent)?.id;
    const amountTotal = session.amount_total ?? 0;
    const tipHandle = session.metadata?.tipHandle || 'Anonymous';
    const tipPostId = typeof session.metadata?.postId === 'string' && session.metadata.postId.trim() ? session.metadata.postId.trim() : '';

    const orderRef = db.collection('orders').doc(session.id);
    await orderRef.set({
      creatorId,
      fanId,
      type: 'tip',
      stripeSessionId: session.id,
      stripePaymentIntentId: paymentIntentId || null,
      amountCents: amountTotal,
      tipHandle,
      ...(tipPostId ? { postId: tipPostId } : {}),
      fanEmail: getCheckoutSessionEmail(session),
      fanName: getCheckoutSessionName(session),
      status: 'paid',
      scheduleStatus: 'pending',
      createdAt: now,
      ...orderBillingCountryField(billingCountry),
    });

    const fanEmail = getCheckoutSessionEmail(session);
    const fanName = getCheckoutSessionName(session) || tipHandle;
    const metaFanId = (session.metadata?.fanId || '') as string;
    const isAnonymous = metaFanId.startsWith('anon_');

    const fanRef = db.collection('creators').doc(creatorId).collection('fans').doc(fanId);
    const fanSnap = await fanRef.get();
    if (!fanSnap.exists) {
      await fanRef.set({
        id: fanId,
        creatorId,
        email: fanEmail,
        displayName: fanName,
        tipHandle,
        role: 'tipper',
        isAnonymous,
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id || null,
        subscriptionStatus: null,
        lastTipAt: now,
        totalTipsCents: amountTotal,
        tipCount: 1,
        totalSpentCents: amountTotal,
        createdAt: now,
        updatedAt: now,
        ...fanBillingCountryPatch(billingCountry, now),
      });
    } else {
      const fanData = fanSnap.data() as {
        totalTipsCents?: number;
        tipCount?: number;
        totalSpentCents?: number;
        subscriptionStatus?: string | null;
        role?: string | null;
      };
      const sub = fanData.subscriptionStatus;
      const activeSub = sub === 'active' || sub === 'trialing';
      const patch: Record<string, unknown> = {
        lastTipAt: now,
        totalTipsCents: (fanData.totalTipsCents || 0) + amountTotal,
        tipCount: (fanData.tipCount || 0) + 1,
        totalSpentCents: (fanData.totalSpentCents || 0) + amountTotal,
        updatedAt: now,
        ...fanBillingCountryPatch(billingCountry, now),
      };
      if (fanEmail && !(fanData as { email?: string }).email) {
        patch.email = fanEmail;
      }
      if (!activeSub && (fanData.role == null || String(fanData.role).trim() === '')) {
        patch.role = 'tipper';
      }
      await fanRef.update(patch);
    }

    try {
      await reconcileFanHubFanPreferenceForMember(db, creatorId, fanId, now, 'stripe_tip');
    } catch (e) {
      console.error('reconcileFanHubFanPreference (tip):', e);
    }

    const statsRef = db.collection('creatorStats').doc(creatorId);
    const statsSnap = await statsRef.get();
    const stats = statsSnap.data() as { totalRevenueCents?: number; totalTipsCents?: number; totalTipCount?: number } | undefined;
    await statsRef.set({
      totalRevenueCents: (stats?.totalRevenueCents ?? 0) + amountTotal,
      totalTipsCents: (stats?.totalTipsCents ?? 0) + amountTotal,
      totalTipCount: (stats?.totalTipCount ?? 0) + 1,
      updatedAt: now,
    }, { merge: true });

    if (tipPostId) {
      try {
        await incrementFanPostTipGoalRaisedCents(db, creatorId, tipPostId, amountTotal);
      } catch (e) {
        console.warn('incrementFanPostTipGoalRaisedCents:', e);
      }
    }

    try {
      const amountLabel = (amountTotal / 100).toFixed(2);
      const buyerLabel =
        (fanName && String(fanName).trim()) ||
        (typeof tipHandle === 'string' && tipHandle.trim()) ||
        fanEmail ||
        'A fan';
      await sendCreatorHubNotification({
        creatorId,
        type: 'creator_new_purchase',
        title: 'New tip',
        body: `${buyerLabel} sent a tip of $${amountLabel}.`,
        data: {
          orderId: session.id,
          destination: 'purchases',
          kind: 'tip',
          ...(tipPostId ? { postId: tipPostId } : {}),
        },
      });
    } catch (e) {
      console.warn('sendCreatorHubNotification (tip checkout):', e);
    }

    console.log(`Fan hub: tip creator=${creatorId} fan=${fanId} amount=${amountTotal} handle=${tipHandle}`);
    return true;
  }

  return false;
}

/** Fan Hub subscription lifecycle (Connect + platform Stripe). Returns true if handled. */
async function processFanHubSubscriptionUpdated(
  db: Firestore,
  subscription: Stripe.Subscription,
): Promise<boolean> {
  const creatorId = subscription.metadata?.creatorId;
  const fanId = subscription.metadata?.fanId;
  if (!creatorId || !fanId) return false;

  const now = new Date().toISOString();
  const raw = subscription.status;
  let subStatus: string;
  if (raw === 'active' || raw === 'trialing') {
    subStatus = raw;
  } else if (raw === 'canceled' || raw === 'unpaid' || raw === 'incomplete_expired') {
    subStatus = 'canceled';
  } else if (raw === 'past_due') {
    subStatus = 'past_due';
  } else {
    subStatus = raw;
  }
  const periodEndSec = (subscription as { current_period_end?: number }).current_period_end;
  const subscriptionCurrentPeriodEnd = periodEndSec
    ? new Date(periodEndSec * 1000).toISOString()
    : null;
  const cancelAtPeriodEnd = !!(subscription as { cancel_at_period_end?: boolean }).cancel_at_period_end;
  const grantActive = subStatus === 'active' || subStatus === 'trialing';

  const subRef = db.collection('creatorSubscribers').doc(creatorId).collection('subscribers').doc(fanId);
  await subRef.set(
    {
      status: subStatus,
      stripeSubscriptionId: subscription.id,
      cancelAtPeriodEnd,
      currentPeriodEnd: subscriptionCurrentPeriodEnd,
      updatedAt: now,
    },
    { merge: true },
  );
  const grantRef = db.collection('creatorEntitlements').doc(creatorId).collection('grants').doc(fanId);
  const grantSnap = await grantRef.get();
  const existing = grantSnap.data() as { unlockedProductIds?: string[] } | undefined;
  await grantRef.set(
    { subscription: grantActive, unlockedProductIds: existing?.unlockedProductIds ?? [], updatedAt: now },
    { merge: true },
  );

  const stripeCustomerId = stripeRefId(subscription.customer);
  const fanRef = db.collection('creators').doc(creatorId).collection('fans').doc(fanId);
  const fanSnap = await fanRef.get();
  if (fanSnap.exists) {
    const fanPatch: Record<string, unknown> = {
      subscriptionStatus: subStatus,
      cancelAtPeriodEnd,
      subscriptionCurrentPeriodEnd,
      updatedAt: now,
    };
    if (stripeCustomerId && stripeCustomerId.startsWith('cus_')) {
      fanPatch.stripeCustomerId = stripeCustomerId;
    }
    await fanRef.update(fanPatch as any);
    try {
      await reconcileFanHubFanPreferenceForMember(db, creatorId, fanId, now, 'stripe_subscription_updated');
    } catch (e) {
      console.error('reconcileFanHubFanPreference (subscription updated):', e);
    }
  }

  console.log(`Fan hub: subscription updated creator=${creatorId} fan=${fanId} status=${subStatus}`);
  return true;
}

/** Fan Hub subscription canceled. Returns true if handled. */
async function processFanHubSubscriptionDeleted(db: Firestore, subscription: Stripe.Subscription): Promise<boolean> {
  const creatorId = subscription.metadata?.creatorId;
  const fanId = subscription.metadata?.fanId;
  if (!creatorId || !fanId) return false;

  const now = new Date().toISOString();
  const subTs = subscription as Stripe.Subscription & { current_period_end?: number; ended_at?: number | null };
  const cpe = subTs.current_period_end;
  const endedAt = subTs.ended_at;
  let periodEndIso: string | null = null;
  if (typeof cpe === 'number' && Number.isFinite(cpe)) {
    periodEndIso = new Date(cpe * 1000).toISOString();
  } else if (typeof endedAt === 'number' && Number.isFinite(endedAt)) {
    periodEndIso = new Date(endedAt * 1000).toISOString();
  }

  const subRef = db.collection('creatorSubscribers').doc(creatorId).collection('subscribers').doc(fanId);
  await subRef.set(
    {
      status: 'canceled',
      updatedAt: now,
      ...(periodEndIso ? { currentPeriodEnd: periodEndIso } : {}),
    },
    { merge: true },
  );
  const grantRef = db.collection('creatorEntitlements').doc(creatorId).collection('grants').doc(fanId);
  const grantSnap = await grantRef.get();
  const existing = grantSnap.data() as { unlockedProductIds?: string[] } | undefined;
  await grantRef.set({ subscription: false, unlockedProductIds: existing?.unlockedProductIds ?? [], updatedAt: now }, { merge: true });

  const fanRef = db.collection('creators').doc(creatorId).collection('fans').doc(fanId);
  const fanSnap = await fanRef.get();
  if (fanSnap.exists) {
    // Do not clear subscriptionCurrentPeriodEnd: Fan Hub UI uses it for "X days left (until …)" after cancel.
    // Stripe's deleted object still includes current_period_end / ended_at; if absent, keep existing Firestore value.
    const fanUpdate: Record<string, unknown> = {
      subscriptionStatus: 'canceled',
      canceledAt: now,
      cancelAtPeriodEnd: false,
      updatedAt: now,
    };
    if (periodEndIso) {
      fanUpdate.subscriptionCurrentPeriodEnd = periodEndIso;
      fanUpdate.subscriptionEndDate = periodEndIso;
    }
    await fanRef.update(fanUpdate as any);
    try {
      await reconcileFanHubFanPreferenceForMember(db, creatorId, fanId, now, 'stripe_subscription_canceled');
    } catch (e) {
      console.error('reconcileFanHubFanPreference (subscription deleted):', e);
    }
  }

  console.log(`Fan hub: subscription deleted creator=${creatorId} fan=${fanId}`);
  return true;
}

/** Fan Hub recurring subscription invoice -> write revenue order for analytics. */
async function processFanHubSubscriptionInvoicePaid(
  db: Firestore,
  stripe: Stripe,
  invoice: Stripe.Invoice,
  stripeAccount?: string | null,
): Promise<boolean> {
  const subField = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription;
  const subId =
    typeof subField === 'string'
      ? subField
      : subField && typeof subField === 'object' && 'id' in subField
        ? (subField as { id: string }).id
        : null;
  if (!subId) return false;

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(
      subId,
      undefined,
      stripeAccount ? { stripeAccount } : undefined,
    );
  } catch {
    return false;
  }

  const creatorId = subscription.metadata?.creatorId;
  const fanId = subscription.metadata?.fanId;
  if (!creatorId || !fanId) return false;

  const billingReason = String(invoice.billing_reason || '').trim().toLowerCase();
  // Initial checkout already writes a subscription order in checkout.session.completed.
  if (billingReason === 'subscription_create') {
    console.log(`Fan hub: invoice ${invoice.id} is initial subscription invoice; skip duplicate order`);
    return true;
  }

  const dupOrder = await db.collection('orders').where('stripeInvoiceId', '==', invoice.id).limit(1).get();
  if (!dupOrder.empty) {
    console.log(`Fan hub: skip duplicate invoice order invoice=${invoice.id}`);
    return true;
  }

  const amountPaid =
    typeof invoice.amount_paid === 'number'
      ? invoice.amount_paid
      : typeof invoice.amount_due === 'number'
        ? invoice.amount_due
        : 0;
  if (amountPaid <= 0) {
    console.log(`Fan hub: invoice ${invoice.id} paid with non-positive amount; skip revenue order`);
    return true;
  }

  const now = new Date().toISOString();
  const paidAtSec = (invoice.status_transitions as { paid_at?: number } | undefined)?.paid_at;
  const createdAt =
    typeof paidAtSec === 'number' && Number.isFinite(paidAtSec) && paidAtSec > 0
      ? new Date(paidAtSec * 1000).toISOString()
      : typeof invoice.created === 'number' && Number.isFinite(invoice.created)
        ? new Date(invoice.created * 1000).toISOString()
        : now;
  const invoiceWithPaymentIntent = invoice as Stripe.Invoice & {
    payment_intent?: string | { id?: string } | null;
  };
  const paymentIntentId =
    typeof invoiceWithPaymentIntent.payment_intent === 'string'
      ? invoiceWithPaymentIntent.payment_intent
      : invoiceWithPaymentIntent.payment_intent?.id || null;

  const billingCountry = await enrichBillingCountryFromInvoice(stripe, invoice, stripeAccount ?? null);

  await db.collection('orders').doc(`inv_${invoice.id}`).set({
    creatorId,
    fanId,
    productId: null,
    type: 'subscription',
    stripeInvoiceId: invoice.id,
    stripeSubscriptionId: subscription.id,
    stripePaymentIntentId: paymentIntentId,
    amountCents: amountPaid,
    status: 'paid',
    fanEmail: invoice.customer_email || null,
    fanName: null,
    scheduleStatus: 'pending',
    createdAt,
    updatedAt: now,
    ...orderBillingCountryField(billingCountry),
  });

  const fanRef = db.collection('creators').doc(creatorId).collection('fans').doc(fanId);
  const fanSnap = await fanRef.get();
  if (fanSnap.exists) {
    const fanData = fanSnap.data() as {
      totalSpentCents?: number;
      totalMembershipCents?: number;
      membershipPaymentCount?: number;
    } | undefined;
    await fanRef.set(
      {
        subscriptionStatus: 'active',
        lastPaymentAt: createdAt,
        totalSpentCents: (fanData?.totalSpentCents ?? 0) + amountPaid,
        totalMembershipCents: (fanData?.totalMembershipCents ?? 0) + amountPaid,
        membershipPaymentCount: (fanData?.membershipPaymentCount ?? 0) + 1,
        updatedAt: now,
        ...fanBillingCountryPatch(billingCountry, now),
      },
      { merge: true },
    );
  }

  const statsRef = db.collection('creatorStats').doc(creatorId);
  const statsSnap = await statsRef.get();
  const stats = statsSnap.data() as { totalRevenueCents?: number; totalOrders?: number } | undefined;
  await statsRef.set(
    {
      totalRevenueCents: (stats?.totalRevenueCents ?? 0) + amountPaid,
      totalOrders: (stats?.totalOrders ?? 0) + 1,
      updatedAt: now,
    },
    { merge: true },
  );

  console.log(
    `Fan hub: subscription invoice paid creator=${creatorId} fan=${fanId} invoice=${invoice.id} amount=${amountPaid}`,
  );
  return true;
}

async function processFanHubChargeRefunded(db: Firestore, charge: Stripe.Charge): Promise<boolean> {
  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : (charge.payment_intent as { id?: string } | null)?.id || null;
  if (!paymentIntentId) return false;

  const ordersSnap = await db.collection('orders').where('stripePaymentIntentId', '==', paymentIntentId).limit(1).get();
  if (ordersSnap.empty) return false;
  const orderDoc = ordersSnap.docs[0];
  const order = orderDoc.data() as {
    creatorId?: string;
    fanId?: string;
    productId?: string | null;
    postId?: string | null;
    streamId?: string | null;
    type?: string;
    amountCents?: number;
    status?: string;
    refundedAmountCents?: number;
  };

  const { creatorId, fanId, productId, postId: orderPostId, streamId: orderStreamId, type: orderType } = order;
  if (!creatorId || !fanId) return false;

  const orderAmount = Math.max(0, Math.round(order.amountCents || 0));
  const chargeRefunded = Math.max(0, Math.round(charge.amount_refunded || 0));
  const refundCents = orderAmount > 0 ? Math.min(chargeRefunded, orderAmount) : chargeRefunded;
  const alreadyRefunded = Math.max(0, Math.round(order.refundedAmountCents || 0));
  const refundDelta = Math.max(0, refundCents - alreadyRefunded);
  if (refundDelta <= 0) return true;

  const fullRefund = orderAmount > 0 && refundCents >= orderAmount;
  const now = new Date().toISOString();
  await orderDoc.ref.set(
    {
      status: fullRefund ? 'refunded' : 'partially_refunded',
      refundedAmountCents: refundCents,
      refundedAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  if (fullRefund && (productId || (orderType === 'post_unlock' && orderPostId) || (orderType === 'live_stream_ticket' && orderStreamId))) {
    const grantRef = db.collection('creatorEntitlements').doc(creatorId).collection('grants').doc(fanId);
    const grantSnap = await grantRef.get();
    const grantData = grantSnap.data() as {
      unlockedProductIds?: string[];
      unlockedFanPostIds?: string[];
      unlockedLiveStreamIds?: string[];
    } | undefined;
    const patch: Record<string, unknown> = { updatedAt: now };
    if (productId) {
      patch.unlockedProductIds = Array.isArray(grantData?.unlockedProductIds)
        ? grantData.unlockedProductIds.filter((id) => id !== productId)
        : [];
    }
    if (orderType === 'post_unlock' && orderPostId) {
      patch.unlockedFanPostIds = Array.isArray(grantData?.unlockedFanPostIds)
        ? grantData.unlockedFanPostIds.filter((id) => id !== orderPostId)
        : [];
    }
    if (orderType === 'live_stream_ticket' && orderStreamId) {
      patch.unlockedLiveStreamIds = Array.isArray(grantData?.unlockedLiveStreamIds)
        ? grantData.unlockedLiveStreamIds.filter((id) => id !== orderStreamId)
        : [];
    }
    await grantRef.set(patch, { merge: true });
  }

  const statsRef = db.collection('creatorStats').doc(creatorId);
  const statsSnap = await statsRef.get();
  const stats = statsSnap.data() as { totalRevenueCents?: number; totalOrders?: number } | undefined;
  const totalRevenue = Math.max(0, (stats?.totalRevenueCents ?? 0) - refundDelta);
  const shouldDecrementOrder = fullRefund && order.status !== 'refunded';
  const totalOrders = shouldDecrementOrder ? Math.max(0, (stats?.totalOrders ?? 1) - 1) : (stats?.totalOrders ?? 0);
  await statsRef.set({ totalRevenueCents: totalRevenue, totalOrders, updatedAt: now }, { merge: true });

  const fanRef = db.collection('creators').doc(creatorId).collection('fans').doc(fanId);
  const fanPatch: Record<string, unknown> = {
    totalSpentCents: FieldValue.increment(-refundDelta),
    updatedAt: now,
  };
  if (orderType === 'subscription') {
    fanPatch.totalMembershipCents = FieldValue.increment(-refundDelta);
    if (fullRefund) fanPatch.membershipPaymentCount = FieldValue.increment(-1);
  } else if (orderType === 'tip') {
    fanPatch.totalTipsCents = FieldValue.increment(-refundDelta);
    if (fullRefund) fanPatch.tipCount = FieldValue.increment(-1);
  } else if (fullRefund && (orderType === 'product' || productId)) {
    fanPatch.purchaseCount = FieldValue.increment(-1);
  }
  await fanRef.set(fanPatch, { merge: true });
  console.log(`Fan hub: refund processed creator=${creatorId} order=${orderDoc.id} delta=${refundDelta} full=${fullRefund}`);
  return true;
}

/** Connect + same handlers: fan storefront events (checkout on connected account includes event.account). */
async function handleConnectEvent(db: Firestore, stripeClient: Stripe, event: Stripe.Event): Promise<void> {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const handled = await processFanHubCheckoutSessionCompleted(db, session, {
      stripe: stripeClient,
      stripeAccount: event.account || null,
    });
    if (!handled) {
      console.warn('Connect checkout.session.completed missing fan hub metadata', session.id);
    }
    return;
  }

  if (event.type === 'customer.subscription.updated') {
    await processFanHubSubscriptionUpdated(db, event.data.object as Stripe.Subscription);
    return;
  }

  if (event.type === 'customer.subscription.deleted') {
    await processFanHubSubscriptionDeleted(db, event.data.object as Stripe.Subscription);
    return;
  }

  if (event.type === 'invoice.payment_succeeded') {
    await processFanHubSubscriptionInvoicePaid(db, stripeClient, event.data.object as Stripe.Invoice, event.account || null);
    return;
  }

  if (event.type === 'charge.refunded') {
    await processFanHubChargeRefunded(db, event.data.object as Stripe.Charge);
  }
}

/** If invoice is for a Fan Hub subscription, skip EchoFlux creator-tool billing side effects. */
async function isFanHubSubscriptionInvoice(stripe: Stripe, invoice: Stripe.Invoice): Promise<boolean> {
  const subField = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription;
  const subId =
    typeof subField === 'string'
      ? subField
      : subField && typeof subField === 'object' && 'id' in subField
        ? (subField as { id: string }).id
        : null;
  if (!subId) return false;
  try {
    const sub = await stripe.subscriptions.retrieve(subId);
    return !!(sub.metadata?.creatorId && sub.metadata?.fanId);
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!stripe) {
    return res.status(500).json({ error: 'Stripe is not configured' });
  }

  if (collectStripeWebhookSecrets().length === 0) {
    return res.status(500).json({ error: "Stripe webhook secret is not configured" });
  }

  const sig = req.headers['stripe-signature'] as string | undefined;
  if (!sig) {
    return res.status(400).json({ error: 'Missing Stripe signature header' });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await readRawBody(req);
    event = verifyWebhookSignature(stripe, rawBody, sig);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  const db = getAdminDb();
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

        // Fan Hub on platform Stripe (e.g. PLATFORM_OWNER_CREATOR_IDS) — same Firestore as Connect path
        const fanHubCheckoutDone = await processFanHubCheckoutSessionCompleted(db, session, { stripe });
        if (fanHubCheckoutDone) {
          break;
        }
        // Do not treat fan checkout as EchoFlux creator billing if metadata is clearly Fan Hub
        if (
          session.metadata?.creatorId &&
          session.metadata?.type &&
          FAN_HUB_CHECKOUT_TYPES.has(session.metadata.type)
        ) {
          console.warn('Fan hub checkout.session.completed not applied (incomplete session?)', session.id);
          break;
        }

        if (session.mode === 'subscription' && session.subscription) {
          try {
            const subscriptionId = stripeRefId(session.subscription);
            if (!subscriptionId) break;
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
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
              const cpe = (subscription as { current_period_end?: number }).current_period_end;
              const subscriptionCurrentPeriodEnd =
                typeof cpe === 'number' && Number.isFinite(cpe)
                  ? new Date(cpe * 1000).toISOString()
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
                subscriptionCurrentPeriodEnd,
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
              if (referralCode && (planName === 'Elite' || planName === 'CreatorElite')) {
                try {
                  await grantReferralRewardOnConversion(userId, planName, referralCode);
                } catch (err) {
                  console.warn('Failed to grant referral reward from webhook:', err);
                }
              }

              console.log(`Subscription created for user ${userId}: ${planName}`);
            }
          } catch (retrieveErr: unknown) {
            // Subscription lives on another Stripe account (e.g. legacy Stormijxo) but webhook is verified with that account's secret — retrieve uses STRIPE_SECRET_KEY_* (EchoFlux) and fails.
            console.warn(
              'stripeWebhook: checkout.session.completed — subscriptions.retrieve failed; skipping EchoFlux creator billing (foreign subscription or missing access).',
              session.id,
              stripeRefId(session.subscription),
              retrieveErr instanceof Error ? retrieveErr.message : retrieveErr,
            );
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        if (await processFanHubSubscriptionUpdated(db, subscription)) {
          break;
        }

        const customerId = stripeRefId(subscription.customer);
        if (!customerId) break;

        // Find user by Stripe customer ID
        const usersSnapshot = await db.collection('users')
          .where('stripeCustomerId', '==', customerId)
          .limit(1)
          .get();

        if (!usersSnapshot.empty) {
          const userDoc = usersSnapshot.docs[0];
          const firstPrice = subscription.items?.data?.[0]?.price;
          const recurringInterval = firstPrice?.recurring?.interval;
          // Determine plan from price ID (you may want to create a reverse mapping)
          const planName = subscription.metadata?.planName || 'Free';
          const billingCycle = recurringInterval === 'year' ? 'annual' : 'monthly';

          const periodEnd = (subscription as { current_period_end?: number }).current_period_end;
          // Capture trial end date if subscription is in trial
          const trialEnd = (subscription as { trial_end?: number }).trial_end;
          const trialEndDate = trialEnd ? new Date(trialEnd * 1000).toISOString() : null;
          const subscriptionCurrentPeriodEnd =
            typeof periodEnd === 'number' && Number.isFinite(periodEnd)
              ? new Date(periodEnd * 1000).toISOString()
              : null;
          
          await userDoc.ref.set({
            plan: planName,
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            billingCycle,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            subscriptionEndDate: subscription.cancel_at_period_end && periodEnd
              ? new Date(periodEnd * 1000).toISOString()
              : null,
            subscriptionCurrentPeriodEnd,
            trialEndDate, // Update trial end date for notifications
          }, { merge: true });

          console.log(`Subscription updated for user ${userDoc.id}: ${subscription.status}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        if (await processFanHubSubscriptionDeleted(db, subscription)) {
          break;
        }

        const customerId = stripeRefId(subscription.customer);
        if (!customerId) break;

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
            subscriptionCurrentPeriodEnd: null,
            trialEndDate: null,
          }, { merge: true });

          console.log(`Subscription canceled for user ${userDoc.id}`);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        if (await processFanHubSubscriptionInvoicePaid(db, stripe, invoice)) {
          break;
        }

        const customerId = stripeRefId(invoice.customer);
        if (!customerId) break;

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
          const subscriptionId =
            typeof userData?.stripeSubscriptionId === "string" && userData.stripeSubscriptionId.trim()
              ? userData.stripeSubscriptionId.trim()
              : null;
          if (subscriptionId && (planName === 'Elite' || planName === 'CreatorElite')) {
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

      case 'charge.refunded': {
        await processFanHubChargeRefunded(db, event.data.object as Stripe.Charge);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (await isFanHubSubscriptionInvoice(stripe, invoice)) {
          console.log('Fan hub: invoice.payment_failed handled by fan subscription status events; skip creator billing alerts');
          break;
        }

        const customerId = stripeRefId(invoice.customer);
        if (!customerId) break;

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

