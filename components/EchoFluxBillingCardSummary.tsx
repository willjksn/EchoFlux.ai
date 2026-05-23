import React, { useCallback, useEffect, useState } from "react";
import { useAppContext } from "./AppContext";
import { auth } from "../firebaseConfig";
import { resolveApiUrl } from "../src/lib/resolveApiUrl";
import { canOpenCreatorBillingPortal } from "../src/lib/openCreatorBillingPortal";

type BillingCardResponse = {
  hasCard?: boolean;
  last4?: string | null;
  brand?: string | null;
  expLabel?: string;
};

/** Card on file + expiration for Settings → Billing → Subscription. */
export const EchoFluxBillingCardOnFile: React.FC = () => {
  const { user } = useAppContext();
  const showPortal = canOpenCreatorBillingPortal(user);
  const [card, setCard] = useState<BillingCardResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchCard = useCallback(async () => {
    if (!showPortal || !auth.currentUser) {
      setCard(null);
      return;
    }
    setLoading(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(resolveApiUrl("/api/getCreatorBillingPaymentMethod"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as BillingCardResponse;
      if (!res.ok) {
        setCard(null);
        return;
      }
      setCard(data.hasCard ? data : { hasCard: false });
    } catch {
      setCard(null);
    } finally {
      setLoading(false);
    }
  }, [showPortal]);

  useEffect(() => {
    void fetchCard();
  }, [fetchCard, user?.id, (user as { stripeSubscriptionId?: string })?.stripeSubscriptionId]);

  if (!showPortal) return null;

  if (loading) {
    return (
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 m-0">Loading card on file…</p>
    );
  }

  if (card?.hasCard && card.expLabel) {
    return (
      <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 m-0">
        <span className="font-medium text-gray-900 dark:text-white">Card on file: </span>
        {card.brand ? `${card.brand} ` : ""}
        {card.last4 ? `••••${card.last4}` : "Card"} — expires {card.expLabel}
      </p>
    );
  }

  return (
    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 m-0">
      No card on file yet. Use <span className="font-medium">Update payment method</span> to add one in Stripe.
    </p>
  );
};
