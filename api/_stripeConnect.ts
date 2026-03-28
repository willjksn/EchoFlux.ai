/**
 * Shared Stripe instance and Connect helpers.
 * Uses same key selection as createCheckoutSession (STRIPE_USE_TEST_MODE, STRIPE_SECRET_KEY_Test / _LIVE).
 * For Connect: pass stripeAccount when calling Stripe APIs to act on behalf of a connected account.
 */
import Stripe from "stripe";

const useTestMode =
  (process.env.STRIPE_USE_TEST_MODE || "").toString().toLowerCase().trim() === "true" ||
  (process.env.STRIPE_USE_TEST_MODE || "").toString().toLowerCase().trim() === "1";

const stripeSecretKey = useTestMode
  ? (process.env.STRIPE_SECRET_KEY_Test ||
      process.env.STRIPE_SECRET_KEY_TEST ||
      process.env.STRIPE_SECRET_KEY ||
      null)
  : (process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY || null);

if (stripeSecretKey && useTestMode && !stripeSecretKey.startsWith("sk_test_")) {
  console.error(
    "STRIPE_USE_TEST_MODE is true but key is not sk_test_. Refusing to use wrong key."
  );
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

export function isStripeConfigured(): boolean {
  return !!platformStripe && !!stripeSecretKey;
}
