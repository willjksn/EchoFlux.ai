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
