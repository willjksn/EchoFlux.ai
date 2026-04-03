/**
 * Keeps `users/{creatorId}/onlyfans_fan_preferences/{fanId}` in sync with
 * `creators/{creatorId}/fans/{fanId}` so Fans tab + chat session fan pickers match real members.
 */
import type { Firestore } from "firebase-admin/firestore";
import { FAN_DM_THREADS, getThreadId } from "./_fanDmHelpers.js";
import { fanHubListLabel } from "./_fanHubDisplay.js";

function subscriptionTierFromFanStatus(subStatus: string): "Free" | "Paid" {
  if (subStatus === "free") return "Free";
  if (subStatus === "canceled" || subStatus === "unpaid" || subStatus === "incomplete_expired") {
    return "Free";
  }
  if (subStatus === "active" || subStatus === "trialing" || subStatus === "past_due") {
    return "Paid";
  }
  // null / empty — tipper, one-off buyer, etc.
  return "Free";
}

/**
 * Fans tab cards read `users/{creatorId}/onlyfans_fan_preferences/{fanId}`.
 * Keep a card while the fan is still a member (paid/free/past_due) or has any spend/tips/purchases on the fan row.
 * Drop the card when subscription has fully lapsed and there is no purchase/tip history on that row.
 */
export function shouldRetainFanHubFanCardFromFanRow(fan: Record<string, unknown>): boolean {
  const sub = typeof fan.subscriptionStatus === "string" ? fan.subscriptionStatus : "";
  if (sub === "active" || sub === "trialing" || sub === "free" || sub === "past_due") {
    return true;
  }
  const spent = typeof fan.totalSpentCents === "number" ? fan.totalSpentCents : 0;
  const tips = typeof fan.totalTipsCents === "number" ? fan.totalTipsCents : 0;
  const purchases = typeof fan.purchaseCount === "number" ? fan.purchaseCount : 0;
  const tipCount = typeof fan.tipCount === "number" ? fan.tipCount : 0;
  return spent > 0 || tips > 0 || purchases > 0 || tipCount > 0;
}

export async function removeFanHubFanPreference(
  db: Firestore,
  creatorId: string,
  fanId: string,
): Promise<void> {
  await db.collection("users").doc(creatorId).collection("onlyfans_fan_preferences").doc(fanId).delete();
}

/**
 * After `creators/{creatorId}/fans/{fanId}` changes (or is removed), either refresh or delete the Fans-tab card.
 * Manual CRM fans (pref doc only, no `memberSource`) are left alone when the fan row is missing.
 */
export async function reconcileFanHubFanPreferenceForMember(
  db: Firestore,
  creatorId: string,
  fanId: string,
  nowIso: string,
  source: string,
): Promise<void> {
  const fanRef = db.collection("creators").doc(creatorId).collection("fans").doc(fanId);
  const prefRef = db.collection("users").doc(creatorId).collection("onlyfans_fan_preferences").doc(fanId);
  const [fanSnap, prefSnap] = await Promise.all([fanRef.get(), prefRef.get()]);

  if (!fanSnap.exists) {
    if (!prefSnap.exists) return;
    const pref = prefSnap.data() as Record<string, unknown> | undefined;
    const linked = typeof pref?.memberSource === "string" && pref.memberSource.length > 0;
    if (linked) {
      await prefRef.delete();
    }
    return;
  }

  const fanRow = fanSnap.data() as Record<string, unknown>;
  if (!shouldRetainFanHubFanCardFromFanRow(fanRow)) {
    await prefRef.delete();
    return;
  }

  await upsertFanHubFanPreferenceFromMember(db, creatorId, fanId, nowIso, source);
}

export async function upsertFanHubFanPreferenceFromMember(
  db: Firestore,
  creatorId: string,
  fanId: string,
  nowIso: string,
  source: string
): Promise<void> {
  const fanRef = db.collection("creators").doc(creatorId).collection("fans").doc(fanId);
  const [fanSnap, userSnap] = await Promise.all([
    fanRef.get(),
    db.collection("users").doc(fanId).get(),
  ]);
  const fanRow = fanSnap.exists ? (fanSnap.data() as Record<string, unknown>) : {};
  const u = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};
  const email =
    (typeof fanRow.email === "string" && fanRow.email) ||
    (typeof u.email === "string" && u.email) ||
    "";
  const fanUsernameRaw =
    (typeof fanRow.username === "string" && fanRow.username.trim()) ||
    (typeof fanRow.memberUsername === "string" && fanRow.memberUsername.trim()) ||
    (typeof fanRow.handle === "string" && fanRow.handle.trim()) ||
    (typeof fanRow.instagram_handle === "string" && fanRow.instagram_handle.trim()) ||
    (typeof fanRow.instagramHandle === "string" && fanRow.instagramHandle.trim()) ||
    "";
  const fanUsername = fanUsernameRaw ? fanUsernameRaw.replace(/^@/, "").toLowerCase() : null;
  const userUsername =
    typeof u.username === "string" && u.username.trim()
      ? u.username.replace(/^@/, "").trim().toLowerCase()
      : null;
  const usernameForLabel = userUsername || fanUsername;
  const displayNameForLabel =
    (typeof fanRow.displayName === "string" && fanRow.displayName.trim()) ||
    (typeof u.displayName === "string" && u.displayName.trim()) ||
    null;
  const listName = fanHubListLabel(
    usernameForLabel,
    displayNameForLabel,
    email || null,
    typeof u.name === "string" ? u.name.trim() : null
  );
  const subStatus =
    typeof fanRow.subscriptionStatus === "string" ? fanRow.subscriptionStatus : "";
  const subscriptionTier = subscriptionTierFromFanStatus(subStatus);

  const prefRef = db.collection("users").doc(creatorId).collection("onlyfans_fan_preferences").doc(fanId);
  const prefSnap = await prefRef.get();
  const totalSpent = typeof fanRow.totalSpentCents === "number" ? fanRow.totalSpentCents : 0;
  const patch: Record<string, unknown> = {
    name: listName,
    email,
    subscriptionTier,
    memberSource: source,
    updatedAt: nowIso,
  };
  if (!prefSnap.exists) {
    patch.createdAt = nowIso;
    patch.spendingLevel = Math.min(5, Math.floor(totalSpent / 10000));
    patch.totalSessions = 0;
    patch.notes = "";
    patch.tags = [];
    patch.reminders = [];
    patch.engagementHistory = [];
  }
  await prefRef.set(patch, { merge: true });
}

/** Creates an empty DM thread row so the creator sees the fan under Messages before the first message. */
export async function ensureFanDmThreadForMember(
  db: Firestore,
  creatorId: string,
  fanId: string,
  nowIso: string
): Promise<void> {
  const threadId = getThreadId(creatorId, fanId);
  const ref = db.collection(FAN_DM_THREADS).doc(threadId);
  const snap = await ref.get();
  if (snap.exists) return;
  await ref.set({
    creatorId,
    fanId,
    lastMessageAt: nowIso,
    lastMessagePreview: "",
    fanHasSentMessage: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
}
