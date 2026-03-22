/**
 * Guest store checkouts use Firestore doc id `guest_${stripeCustomerId}`.
 * When the fan later has a Firebase uid (subscribe or claim), merge grants + fan row + orders into `uid`.
 */
import type { Firestore } from "firebase-admin/firestore";

export function guestFanDocIdForStripeCustomer(stripeCustomerId: string): string {
  return `guest_${stripeCustomerId.replace(/\s/g, "")}`;
}

export async function mergeGuestTreatPurchasesIntoUid(
  db: Firestore,
  creatorId: string,
  memberUid: string,
  stripeCustomerId: string | null | undefined,
  nowIso: string
): Promise<boolean> {
  if (!stripeCustomerId || typeof stripeCustomerId !== "string" || !stripeCustomerId.startsWith("cus_")) {
    return false;
  }
  const guestId = guestFanDocIdForStripeCustomer(stripeCustomerId);
  if (guestId === memberUid) return false;

  const guestFanRef = db.collection("creators").doc(creatorId).collection("fans").doc(guestId);
  const guestSnap = await guestFanRef.get();
  if (!guestSnap.exists) return false;

  const guestData = guestSnap.data() as Record<string, unknown>;
  const guestGrantRef = db.collection("creatorEntitlements").doc(creatorId).collection("grants").doc(guestId);
  const memberGrantRef = db.collection("creatorEntitlements").doc(creatorId).collection("grants").doc(memberUid);
  const memberFanRef = db.collection("creators").doc(creatorId).collection("fans").doc(memberUid);

  const [gG, gM, memberSnap] = await Promise.all([guestGrantRef.get(), memberGrantRef.get(), memberFanRef.get()]);

  const uGuest = Array.isArray(gG.data()?.unlockedProductIds)
    ? ([...gG.data()!.unlockedProductIds] as string[])
    : [];
  const uMember = Array.isArray(gM.data()?.unlockedProductIds)
    ? ([...gM.data()!.unlockedProductIds] as string[])
    : [];
  const mergedUnlocked = [...new Set([...uMember, ...uGuest])];
  const subscriptionActive = gM.data()?.subscription === true;

  await memberGrantRef.set(
    {
      unlockedProductIds: mergedUnlocked,
      subscription: subscriptionActive,
      updatedAt: nowIso,
    },
    { merge: true }
  );
  await guestGrantRef.delete().catch(() => {});

  const mData = memberSnap.exists ? (memberSnap.data() as Record<string, unknown>) : {};
  const gSpent = typeof guestData.totalSpentCents === "number" ? guestData.totalSpentCents : 0;
  const mSpent = typeof mData.totalSpentCents === "number" ? mData.totalSpentCents : 0;
  const gPurch = typeof guestData.purchaseCount === "number" ? guestData.purchaseCount : 0;
  const mPurch = typeof mData.purchaseCount === "number" ? mData.purchaseCount : 0;

  const fanPatch: Record<string, unknown> = {
    stripeCustomerId,
    totalSpentCents: mSpent + gSpent,
    purchaseCount: mPurch + gPurch,
    updatedAt: nowIso,
    mergedGuestTreatPurchasesAt: nowIso,
  };
  if (typeof guestData.email === "string" && guestData.email && !mData.email) {
    fanPatch.email = guestData.email;
  }
  if (typeof guestData.displayName === "string" && guestData.displayName && !mData.displayName) {
    fanPatch.displayName = guestData.displayName;
  }
  if (guestData.role === "treat_buyer" && !mData.subscriptionStatus) {
    fanPatch.role = "member";
  }

  await memberFanRef.set(fanPatch, { merge: true });
  await guestFanRef.delete().catch(() => {});

  await db
    .collection("users")
    .doc(creatorId)
    .collection("onlyfans_fan_preferences")
    .doc(guestId)
    .delete()
    .catch(() => {});

  const ordersSnap = await db.collection("orders").where("fanId", "==", guestId).limit(200).get();
  for (const d of ordersSnap.docs) {
    const od = d.data() as { creatorId?: string };
    if (od.creatorId !== creatorId) continue;
    await d.ref.update({ fanId: memberUid, linkedFromGuestFanId: guestId }).catch(() => {});
  }

  return true;
}
