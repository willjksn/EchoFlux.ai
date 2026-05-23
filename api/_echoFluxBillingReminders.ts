/**
 * Server helpers: Stripe default payment method, reminder state on users/{uid}.
 */
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { getPlatformStripe, subscriptionsRetrieve } from "./_stripeConnect.js";
import {
  cardAnchorKey,
  isCardExpiryLater,
  type EchoFluxBillingReminderState,
  type EchoFluxDefaultCardExp,
} from "../src/lib/echoFluxBillingReminders.js";

export type { EchoFluxDefaultCardExp, EchoFluxBillingReminderState };

export async function resolvePlatformStripeCustomerId(
  db: Firestore,
  uid: string,
  userData: { stripeCustomerId?: string; stripeSubscriptionId?: string } | undefined,
): Promise<string | null> {
  let customerId =
    typeof userData?.stripeCustomerId === "string" ? userData.stripeCustomerId.trim() : "";
  if (customerId.startsWith("cus_")) return customerId;

  const subscriptionId =
    typeof userData?.stripeSubscriptionId === "string" ? userData.stripeSubscriptionId.trim() : "";
  if (!subscriptionId) return null;

  const stripe = getPlatformStripe();
  if (!stripe) return null;

  try {
    const subscription = await subscriptionsRetrieve(stripe, subscriptionId, null);
    const cust = subscription.customer;
    customerId = typeof cust === "string" ? cust : (cust as { id?: string } | null)?.id || "";
    if (customerId.startsWith("cus_")) {
      try {
        await db.collection("users").doc(uid).set({ stripeCustomerId: customerId }, { merge: true });
      } catch {
        /* non-fatal */
      }
      return customerId;
    }
  } catch (e) {
    console.warn(`resolvePlatformStripeCustomerId(${uid}):`, e);
  }
  return null;
}

export async function fetchDefaultCardFromStripeCustomer(
  stripe: Stripe,
  customerId: string,
): Promise<EchoFluxDefaultCardExp | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ["invoice_settings.default_payment_method"],
    });
    if (customer.deleted) return null;

    let pm: Stripe.PaymentMethod | null = null;
    const defaultPm = customer.invoice_settings?.default_payment_method;
    if (typeof defaultPm === "object" && defaultPm && defaultPm.object === "payment_method") {
      pm = defaultPm;
    } else if (typeof defaultPm === "string" && defaultPm.startsWith("pm_")) {
      pm = await stripe.paymentMethods.retrieve(defaultPm);
    }

    if (!pm && typeof customer.default_source === "string" && customer.default_source.startsWith("pm_")) {
      pm = await stripe.paymentMethods.retrieve(customer.default_source);
    }

    if (!pm || pm.type !== "card" || !pm.card) return null;

    const { exp_month: expMonth, exp_year: expYear, last4, brand } = pm.card;
    if (!expMonth || !expYear) return null;

    return {
      expMonth,
      expYear,
      last4: last4 || undefined,
      brand: brand || undefined,
    };
  } catch (e) {
    console.warn(`fetchDefaultCardFromStripeCustomer(${customerId}):`, e);
    return null;
  }
}

/** After a better card or successful payment — cancel pending 3/1-day card reminders. */
export async function clearCardBillingReminders(
  db: Firestore,
  uid: string,
  nextCard?: EchoFluxDefaultCardExp | null,
): Promise<void> {
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() as {
    echoFluxBillingReminderState?: EchoFluxBillingReminderState;
    echoFluxDefaultCardExp?: EchoFluxDefaultCardExp;
  };
  const prevCard = data.echoFluxDefaultCardExp;
  const prevState = data.echoFluxBillingReminderState || {};

  const patch: Record<string, unknown> = {
    echoFluxBillingReminderPending: FieldValue.delete(),
  };

  if (nextCard && isCardExpiryLater(prevCard, nextCard)) {
    patch.echoFluxDefaultCardExp = nextCard;
    patch.echoFluxBillingReminderState = {
      ...prevState,
      cardAnchor: cardAnchorKey(nextCard.expMonth, nextCard.expYear),
      sent: {
        ...(prevState.sent || {}),
        card: [],
      },
    };
  } else if (nextCard) {
    patch.echoFluxDefaultCardExp = nextCard;
  } else {
    patch.echoFluxBillingReminderState = {
      ...prevState,
      sent: {
        ...(prevState.sent || {}),
        card: [],
      },
    };
  }

  await ref.set(patch, { merge: true });
}

/** Subscription renewed or cancel-at-period-end cleared — stop period reminders. */
export async function clearPeriodBillingReminders(
  db: Firestore,
  uid: string,
  newPeriodAnchor?: string | null,
): Promise<void> {
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return;
  const prevState = (snap.data() as { echoFluxBillingReminderState?: EchoFluxBillingReminderState })
    .echoFluxBillingReminderState || {};

  await ref.set(
    {
      echoFluxBillingReminderPending: FieldValue.delete(),
      echoFluxBillingReminderState: {
        ...prevState,
        periodAnchor: newPeriodAnchor || null,
        sent: {
          ...(prevState.sent || {}),
          period: [],
        },
      },
    },
    { merge: true },
  );
}

export async function recordBillingReminderSent(
  db: Firestore,
  uid: string,
  kind: "period" | "card",
  anchor: string,
  day: number,
): Promise<void> {
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  const prevState = (snap.data() as { echoFluxBillingReminderState?: EchoFluxBillingReminderState })
    .echoFluxBillingReminderState || {};
  const sent = { ...(prevState.sent || {}) };
  const key = kind === "period" ? "period" : "card";
  const existing = [...(sent[key] || [])];
  if (!existing.includes(day)) existing.push(day);
  sent[key] = existing.sort((a, b) => b - a);

  const nextState: EchoFluxBillingReminderState = {
    ...prevState,
    ...(kind === "period" ? { periodAnchor: anchor } : { cardAnchor: anchor }),
    sent,
  };

  await ref.set(
    {
      echoFluxBillingReminderState: nextState,
      echoFluxBillingReminderPending: FieldValue.delete(),
    },
    { merge: true },
  );
}

export async function syncEchoFluxDefaultCardForUser(
  db: Firestore,
  uid: string,
): Promise<EchoFluxDefaultCardExp | null> {
  const stripe = getPlatformStripe();
  if (!stripe) return null;

  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const userData = snap.data() as {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    echoFluxDefaultCardExp?: EchoFluxDefaultCardExp;
  };

  const customerId = await resolvePlatformStripeCustomerId(db, uid, userData);
  if (!customerId) return null;

  const card = await fetchDefaultCardFromStripeCustomer(stripe, customerId);
  if (!card) return null;

  const prev = userData.echoFluxDefaultCardExp;
  if (isCardExpiryLater(prev, card)) {
    await clearCardBillingReminders(db, uid, card);
  } else {
    await db.collection("users").doc(uid).set({ echoFluxDefaultCardExp: card }, { merge: true });
  }
  return card;
}
