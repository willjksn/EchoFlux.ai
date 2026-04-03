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

export function getPlatformStripe(): Stripe | null {
  return platformStripe;
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

export function isStripeConfigured(): boolean {
  return !!platformStripe && !!stripeSecretKey;
}
