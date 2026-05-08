import Stripe from "stripe";

/** ISO 3166-1 alpha-2 from Stripe billing / card fields. */
export function normalizeStripeBillingCountry(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const c = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
}

export function billingCountryFromCheckoutSession(session: Stripe.Checkout.Session): string | null {
  const addr = session.customer_details?.address;
  return normalizeStripeBillingCountry(addr?.country);
}

function paymentIntentIdFromSession(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent;
  if (typeof pi === "string" && pi.startsWith("pi_")) return pi;
  if (pi && typeof pi === "object" && "id" in pi) {
    const id = String((pi as { id?: string }).id || "");
    return id.startsWith("pi_") ? id : null;
  }
  return null;
}

function countryFromExpandedPaymentIntent(pi: Stripe.PaymentIntent): string | null {
  const pm = pi.payment_method;
  if (typeof pm !== "object" || !pm || pm.object !== "payment_method") return null;
  const fromBilling = normalizeStripeBillingCountry(pm.billing_details?.address?.country);
  if (fromBilling) return fromBilling;
  return normalizeStripeBillingCountry(pm.card?.country);
}

/**
 * Prefer Checkout `customer_details.address.country` (billing), then PI payment_method billing address, then card country.
 */
export async function enrichBillingCountryFromCheckoutSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  stripeAccount?: string | null,
): Promise<string | null> {
  const direct = billingCountryFromCheckoutSession(session);
  if (direct) return direct;

  const embedded = session.payment_intent;
  const sessPi = embedded as Stripe.PaymentIntent | null | undefined;
  if (sessPi && typeof sessPi === "object" && sessPi.object === "payment_intent") {
    const fromEmb = countryFromExpandedPaymentIntent(sessPi);
    if (fromEmb) return fromEmb;
  }

  const piId = paymentIntentIdFromSession(session);
  if (!piId) return null;
  try {
    const reqOpts = stripeAccount ? ({ stripeAccount } as Stripe.RequestOptions) : undefined;
    const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["payment_method"] }, reqOpts);
    return countryFromExpandedPaymentIntent(pi);
  } catch {
    return null;
  }
}

function paymentIntentIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const pi = (invoice as Stripe.Invoice & { payment_intent?: string | { id?: string } | null }).payment_intent;
  if (typeof pi === "string" && pi.startsWith("pi_")) return pi;
  if (pi && typeof pi === "object" && "id" in pi) {
    const id = String((pi as { id?: string }).id || "");
    return id.startsWith("pi_") ? id : null;
  }
  return null;
}

/** Billing locality for recurring subscription invoices (not shipping). */
export async function enrichBillingCountryFromInvoice(
  stripe: Stripe,
  invoice: Stripe.Invoice,
  stripeAccount?: string | null,
): Promise<string | null> {
  const inv = invoice as Stripe.Invoice & {
    customer_address?: { country?: string | null } | null;
    customer_country?: string | null;
  };
  const fromAddr = normalizeStripeBillingCountry(inv.customer_address?.country ?? null);
  if (fromAddr) return fromAddr;
  const legacy = normalizeStripeBillingCountry(inv.customer_country ?? null);
  if (legacy) return legacy;

  const embedded = (invoice as Stripe.Invoice & { payment_intent?: unknown }).payment_intent;
  const embPi = embedded as Stripe.PaymentIntent | null | undefined;
  if (embPi && typeof embPi === "object" && embPi.object === "payment_intent") {
    const fromEmb = countryFromExpandedPaymentIntent(embPi);
    if (fromEmb) return fromEmb;
  }

  const piId = paymentIntentIdFromInvoice(invoice);
  if (!piId) return null;
  try {
    const reqOpts = stripeAccount ? ({ stripeAccount } as Stripe.RequestOptions) : undefined;
    const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["payment_method"] }, reqOpts);
    return countryFromExpandedPaymentIntent(pi);
  } catch {
    return null;
  }
}
