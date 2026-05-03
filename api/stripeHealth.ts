import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPlatformStripe, isStripeConfigured } from "./_stripeConnect.js";

/**
 * GET: Safe deployment check for Vercel env (no secrets returned).
 * Use after setting STRIPE_* vars: open /api/stripeHealth on your deployment.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const useTestMode =
    (process.env.STRIPE_USE_TEST_MODE || "").toString().toLowerCase().trim() === "true" ||
    (process.env.STRIPE_USE_TEST_MODE || "").toString().toLowerCase().trim() === "1";

  const testKeyPresent = !!(
    process.env.STRIPE_SECRET_KEY_Test ||
    process.env.STRIPE_SECRET_KEY_TEST ||
    process.env.STRIPE_SECRET_KEY
  );
  const liveKeyPresent = !!(process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY);

  const stripe = getPlatformStripe();

  const activeRaw = useTestMode
    ? process.env.STRIPE_SECRET_KEY_Test ||
      process.env.STRIPE_SECRET_KEY_TEST ||
      process.env.STRIPE_SECRET_KEY
    : process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY;
  let activeKeyKind: "sk_test" | "sk_live" | "unset" | "other" = "unset";
  if (typeof activeRaw === "string" && activeRaw.length > 0) {
    if (activeRaw.startsWith("sk_test_")) activeKeyKind = "sk_test";
    else if (activeRaw.startsWith("sk_live_")) activeKeyKind = "sk_live";
    else activeKeyKind = "other";
  }

  return res.status(200).json({
    ok: isStripeConfigured(),
    mode: useTestMode ? "test" : "live",
    stripeClientInitialized: !!stripe,
    /** First segment of the active secret key (sk_test / sk_live), not the secret itself. */
    activeKeyKind,
    /** Which key slots are non-empty (not whether they are valid). */
    env: {
      testKeyConfigured: testKeyPresent,
      liveKeyConfigured: liveKeyPresent,
      webhookSecretConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
      connectWebhookSecretConfigured: !!process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
      appUrlConfigured: !!process.env.NEXT_PUBLIC_APP_URL,
      /** Connect Fan Hub subscriptions need their own signing secret if events are delivered as Connect webhooks. */
      connectWebhookRecommended:
        !!stripe &&
        !!process.env.STRIPE_WEBHOOK_SECRET &&
        !process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
    },
    hint:
      !stripe && useTestMode
        ? "Test mode on: set STRIPE_SECRET_KEY_Test or STRIPE_SECRET_KEY_TEST (or STRIPE_SECRET_KEY) to sk_test_..."
        : !stripe && !useTestMode
          ? "Live mode: set STRIPE_SECRET_KEY_LIVE (or STRIPE_SECRET_KEY) to sk_live_..."
          : !process.env.STRIPE_WEBHOOK_SECRET
          ? "Set STRIPE_WEBHOOK_SECRET from Stripe Dashboard → Webhooks → signing secret."
          : useTestMode && activeKeyKind === "sk_live"
              ? "STRIPE_USE_TEST_MODE is true but the active key looks like sk_live_; use sk_test_ or turn off test mode."
              : !useTestMode && activeKeyKind === "sk_test"
                ? "STRIPE_USE_TEST_MODE is false but the active key looks like sk_test_; use sk_live_ or enable test mode."
                : undefined,
  });
}
