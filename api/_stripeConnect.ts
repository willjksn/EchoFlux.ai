/**
 * Shared Stripe instance and Connect helpers.
 * Uses same key selection as createCheckoutSession (STRIPE_USE_TEST_MODE, STRIPE_SECRET_KEY_Test / _LIVE).
 * For Connect: pass stripeAccount when calling Stripe APIs to act on behalf of a connected account.
 */
import Stripe from "stripe";

const useTestMode =
  (process.env.STRIPE_USE_TEST_MODE || "").toString().toLowerCase().trim() === "true" ||
  (process.env.STRIPE_USE_TEST_MODE || "").toString().toLowerCase().trim() === "1";

let stripeSecretKey = useTestMode
  ? (process.env.STRIPE_SECRET_KEY_Test ||
      process.env.STRIPE_SECRET_KEY_TEST ||
      process.env.STRIPE_SECRET_KEY ||
      null)
  : (process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY || null);

/** Avoid half-working Checkout (opaque 500s): secret key prefix must match STRIPE_USE_TEST_MODE. */
if (stripeSecretKey && useTestMode && !stripeSecretKey.startsWith("sk_test_")) {
  console.error(
    "STRIPE_USE_TEST_MODE is true but active secret is not sk_test_. Refusing to initialize Stripe."
  );
  stripeSecretKey = null;
}
if (stripeSecretKey && !useTestMode && !stripeSecretKey.startsWith("sk_live_")) {
  console.error(
    "STRIPE_USE_TEST_MODE is false but active secret is not sk_live_. Refusing to initialize Stripe."
  );
  stripeSecretKey = null;
}

let platformStripe: Stripe | null = null;
if (stripeSecretKey) {
  platformStripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
  });
}

function stripeKeyMatchesMode(key: string): boolean {
  return useTestMode ? key.startsWith("sk_test_") : key.startsWith("sk_live_");
}

function makeStripeClientFromKey(key: string | undefined, label: string): { stripe: Stripe; label: string } | null {
  const trimmed = typeof key === "string" ? key.trim() : "";
  if (!trimmed) return null;
  if (!stripeKeyMatchesMode(trimmed)) {
    console.error(`Ignoring ${label}: key prefix does not match STRIPE_USE_TEST_MODE.`);
    return null;
  }
  return {
    label,
    stripe: new Stripe(trimmed, {
      apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
    }),
  };
}

export function getPlatformStripe(): Stripe | null {
  return platformStripe;
}

/**
 * Optional fallback Stripe clients for legacy fan memberships that were created
 * before the current Connect/platform setup. Configure only server-side env vars.
 */
export function getLegacyFanSubscriptionStripeClients(): Array<{ stripe: Stripe; label: string }> {
  const clients: Array<{ stripe: Stripe; label: string }> = [];
  const add = (key: string | undefined, label: string) => {
    const client = makeStripeClientFromKey(key, label);
    if (!client) return;
    if (clients.some((existing) => existing.label === client.label)) return;
    clients.push(client);
  };

  add(
    useTestMode
      ? process.env.STRIPE_STORMIJXO_SECRET_KEY_TEST || process.env.STRIPE_STORMIJXO_SECRET_KEY
      : process.env.STRIPE_STORMIJXO_SECRET_KEY_LIVE || process.env.STRIPE_STORMIJXO_SECRET_KEY,
    "stormijxo",
  );
  add(
    useTestMode
      ? process.env.STRIPE_LEGACY_FAN_SECRET_KEY_TEST || process.env.STRIPE_LEGACY_FAN_SECRET_KEY
      : process.env.STRIPE_LEGACY_FAN_SECRET_KEY_LIVE || process.env.STRIPE_LEGACY_FAN_SECRET_KEY,
    "legacy-fan",
  );

  const more = process.env.STRIPE_LEGACY_FAN_SECRET_KEYS || "";
  more
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((key, idx) => add(key, `legacy-fan-${idx + 1}`));

  return clients;
}

/**
 * Call Stripe API on behalf of a connected account (Express).
 * Use for: Account.retrieve, Checkout.Session.create with stripeAccount, etc.
 */
export function getStripeOptions(connectedAccountId?: string | null): { stripeAccount?: string } {
  if (!connectedAccountId) return {};
  return { stripeAccount: connectedAccountId };
}

/**
 * stripe-node treats the 2nd argument as request options only if it contains a known key
 * (e.g. stripeAccount). Passing `{}` leaves an extra `[object Object]` arg and throws
 * "Unknown arguments ... Did you mean to pass an options object?"
 */
export function checkoutSessionsCreate(
  stripe: Stripe,
  params: Stripe.Checkout.SessionCreateParams,
  connectedAccountId?: string | null,
): Promise<Stripe.Response<Stripe.Checkout.Session>> {
  const id = typeof connectedAccountId === "string" ? connectedAccountId.trim() : "";
  if (id) {
    return stripe.checkout.sessions.create(params, { stripeAccount: id });
  }
  return stripe.checkout.sessions.create(params);
}

export function checkoutSessionsRetrieve(
  stripe: Stripe,
  sessionId: string,
  connectedAccountId?: string | null,
  expand: string[] = ["subscription", "payment_intent"],
): Promise<Stripe.Response<Stripe.Checkout.Session>> {
  const id = typeof connectedAccountId === "string" ? connectedAccountId.trim() : "";
  const params: Stripe.Checkout.SessionRetrieveParams =
    expand.length > 0 ? { expand } : {};
  if (id) {
    return stripe.checkout.sessions.retrieve(sessionId, params, { stripeAccount: id });
  }
  return stripe.checkout.sessions.retrieve(sessionId, params);
}

export function subscriptionsRetrieve(
  stripe: Stripe,
  subscriptionId: string,
  connectedAccountId?: string | null,
  params?: Stripe.SubscriptionRetrieveParams,
): Promise<Stripe.Response<Stripe.Subscription>> {
  const id = typeof connectedAccountId === "string" ? connectedAccountId.trim() : "";
  const p = params ?? {};
  if (id) {
    return stripe.subscriptions.retrieve(subscriptionId, p, { stripeAccount: id });
  }
  return stripe.subscriptions.retrieve(subscriptionId, p);
}

/** Customer portal for subscription / payment method management (use `stripeAccount` for Connect). */
export function billingPortalSessionsCreate(
  stripe: Stripe,
  params: Stripe.BillingPortal.SessionCreateParams,
  connectedAccountId?: string | null,
): Promise<Stripe.Response<Stripe.BillingPortal.Session>> {
  const id = typeof connectedAccountId === "string" ? connectedAccountId.trim() : "";
  if (id) {
    return stripe.billingPortal.sessions.create(params, { stripeAccount: id });
  }
  return stripe.billingPortal.sessions.create(params);
}

export function isStripeConfigured(): boolean {
  return !!platformStripe && !!stripeSecretKey;
}
