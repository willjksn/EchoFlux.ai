import type { Firestore } from "firebase-admin/firestore";
import {
  hasActiveFanHubMembershipAccess,
  parseDateLike,
  pickLatestMemberAccessEnd,
} from "../src/lib/memberAccessEnd.js";

function cancelAtPeriodEndFromDoc(d: Record<string, unknown>): boolean {
  const raw = d.cancelAtPeriodEnd ?? d.cancel_at_period_end;
  if (raw === true) return true;
  if (raw === false || raw == null) return false;
  if (typeof raw === "string") {
    const t = raw.trim().toLowerCase();
    return t === "true" || t === "1" || t === "yes";
  }
  if (typeof raw === "number") return raw === 1;
  return false;
}

/** True when Firestore shows the fan previously paid for membership (not tips-only). */
export function fanHadPriorPaidMembership(
  fanRow: Record<string, unknown> | undefined,
  subRow: Record<string, unknown> | undefined,
): boolean {
  const merged = { ...(subRow || {}), ...(fanRow || {}) };
  const stripeSub =
    typeof merged.stripeSubscriptionId === "string" &&
    merged.stripeSubscriptionId.trim().startsWith("sub_");
  const membershipCents =
    typeof merged.totalMembershipCents === "number" &&
    Number.isFinite(merged.totalMembershipCents) &&
    merged.totalMembershipCents > 0;
  const membershipPayments =
    typeof merged.membershipPaymentCount === "number" &&
    Number.isFinite(merged.membershipPaymentCount) &&
    merged.membershipPaymentCount > 0;
  if (stripeSub || membershipCents || membershipPayments) return true;
  if (subRow && Object.keys(subRow).length > 0) {
    const status = typeof subRow.status === "string" ? subRow.status.trim().toLowerCase() : "";
    if (status && status !== "free") return true;
  }
  const fanStatus =
    typeof fanRow?.subscriptionStatus === "string" ? fanRow.subscriptionStatus.trim().toLowerCase() : "";
  if (fanStatus && fanStatus !== "free" && fanStatus !== "none") return true;
  return false;
}

export function fanHubPaidMembershipStillActive(
  fanRow: Record<string, unknown> | undefined,
  subRow: Record<string, unknown> | undefined,
): boolean {
  const merged = { ...(subRow || {}), ...(fanRow || {}) };
  const status =
    (typeof fanRow?.subscriptionStatus === "string" ? fanRow.subscriptionStatus : null) ||
    (typeof subRow?.status === "string" ? subRow.status : null);
  return hasActiveFanHubMembershipAccess({
    subscriptionStatus: status,
    cancelAtPeriodEnd: cancelAtPeriodEndFromDoc(merged),
    accessEnd: pickLatestMemberAccessEnd(merged),
    canceledAt: parseDateLike(merged.canceledAt),
  });
}

/** Fan → creator DM requires active paid/free membership (not tips-only or lapsed sub). */
export async function fanHasActiveHubMembershipForCreator(
  db: Firestore,
  creatorId: string,
  fanId: string,
): Promise<boolean> {
  const [fanSnap, subSnap] = await Promise.all([
    db.collection("creators").doc(creatorId).collection("fans").doc(fanId).get(),
    db.collection("creatorSubscribers").doc(creatorId).collection("subscribers").doc(fanId).get(),
  ]);
  const fanRow = fanSnap.exists ? (fanSnap.data() as Record<string, unknown>) : undefined;
  const subRow = subSnap.exists ? (subSnap.data() as Record<string, unknown>) : undefined;
  return fanHubPaidMembershipStillActive(fanRow, subRow);
}
