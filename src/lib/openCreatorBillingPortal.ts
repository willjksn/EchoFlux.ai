import { auth } from "../../firebaseConfig";

export type OpenCreatorBillingPortalOptions = {
  returnUrl?: string;
};

/**
 * Opens Stripe Customer Portal for the signed-in creator's EchoFlux subscription
 * (update card, invoices, cancel/resume where Stripe allows).
 */
export async function openCreatorBillingPortal(
  options?: OpenCreatorBillingPortalOptions,
): Promise<void> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
  if (!token) {
    throw new Error("Sign in to manage billing.");
  }

  const returnUrl =
    options?.returnUrl ||
    (typeof window !== "undefined" ? `${window.location.origin}/profile` : undefined);

  const res = await fetch("/api/createCreatorBillingPortalSession", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(returnUrl ? { returnUrl } : {}),
  });

  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Could not open billing portal");
  }
  if (!data.url) {
    throw new Error("Stripe did not return a portal URL");
  }
  window.location.href = data.url;
}

/** True when the user likely has a Stripe billing profile for EchoFlux SaaS. */
export function canOpenCreatorBillingPortal(user: {
  plan?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
} | null | undefined): boolean {
  if (!user) return false;
  const plan = typeof user.plan === "string" ? user.plan.trim() : "";
  if (!plan || plan === "Free") return false;
  const customerId =
    typeof user.stripeCustomerId === "string" ? user.stripeCustomerId.trim() : "";
  const subscriptionId =
    typeof user.stripeSubscriptionId === "string" ? user.stripeSubscriptionId.trim() : "";
  return customerId.startsWith("cus_") || !!subscriptionId;
}
