/**
 * Fan Hub Checkout can run on the platform Stripe account (no stripeAccount header) or on a
 * connected Express account (stripeAccount header). Checkout branding (logo, business name)
 * follows the account that creates the session — so "platform owner" creators who still want
 * Stormij-style branding should use Connect for checkout once Express is onboarded.
 */

function parseCreatorIdList(raw: string | undefined): Set<string> {
  return new Set(
    (raw || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

const useConnectCheckoutIds = parseCreatorIdList(process.env.FAN_HUB_CHECKOUT_USE_CONNECT_CREATOR_IDS);

/**
 * When true, Checkout is created with `{ stripeAccount: connectAccountId }` (after
 * charges_enabled check). Platform-only checkout when false.
 *
 * - Normal creators: always true (require Connect).
 * - Platform owners (e.g. PLATFORM_OWNER_CREATOR_IDS): default false unless their uid is listed
 *   in FAN_HUB_CHECKOUT_USE_CONNECT_CREATOR_IDS and they have a connected account.
 */
export function fanHubCheckoutShouldUseConnectedAccount(
  creatorId: string,
  isPlatformOwner: boolean,
): boolean {
  if (!isPlatformOwner) return true;
  return useConnectCheckoutIds.has(creatorId);
}

/**
 * Order for checkout.session.retrieve (sync) — same routing as createFanCheckoutSession.
 */
export function fanHubCheckoutSessionRetrieveOrder(
  creatorId: string,
  isPlatformOwner: boolean,
  connectAccountId: string | null,
): (string | null)[] {
  const useConn =
    !!connectAccountId && fanHubCheckoutShouldUseConnectedAccount(creatorId, isPlatformOwner);
  if (useConn) {
    return [connectAccountId as string, null];
  }
  if (isPlatformOwner && connectAccountId) {
    return [null, connectAccountId];
  }
  return [null];
}
