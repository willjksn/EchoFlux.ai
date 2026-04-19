/**
 * Single source of truth for matching Fan Hub store orders + onlyfans_calendar_events
 * to a Fans-tab card (`onlyfans_fan_preferences` doc id).
 *
 * Covers: Firebase uid, compound fan doc ids, guest_${cus_…} from Stripe, email on order vs uid on card,
 * linkedFromGuestFanId after guest→member merges, and calendar rows that use email as fanId.
 */
import { parseCompoundFanDocumentId } from "./compoundFanDocId";

export type MinimalOrderForFanMatch = {
  fanId: string;
  fanEmail?: string;
  fanName?: string | null;
  linkedFromGuestFanId?: string | null;
};

export type FanPurchaseIdentity = {
  /** Primary Fans card id (preference doc id). */
  fanUid: string;
  emails: ReadonlySet<string>;
  /** All Firestore fan keys that might appear on orders/calendar: uid, compound id, guest_*, etc. */
  fanIds: ReadonlySet<string>;
};

export function normFanHubEmail(s: string | null | undefined): string | null {
  const t = typeof s === "string" ? s.trim().toLowerCase() : "";
  return t || null;
}

/** Same shape as api/_mergeGuestFanPurchases `guest_${stripeCustomerId}`. */
export function guestFanDocIdForStripeCustomer(stripeCustomerId: string): string {
  return `guest_${stripeCustomerId.replace(/\s/g, "")}`;
}

export function collectStripeGuestFanIds(stripeCustomerId: unknown): string[] {
  if (typeof stripeCustomerId !== "string" || !stripeCustomerId.startsWith("cus_")) return [];
  return [guestFanDocIdForStripeCustomer(stripeCustomerId)];
}

/**
 * Build identity from everything we know about the fan without reading orders.
 * Pass emails from preferences doc, users/{uid}, creators/{creatorId}/fans/{docId}, and stripeCustomerId from fan row.
 */
export function buildFanPurchaseIdentity(params: {
  fanUid: string;
  prefEmail?: string | null;
  userEmail?: string | null;
  fanRowEmail?: string | null;
  stripeCustomerId?: string | null;
}): FanPurchaseIdentity {
  const emails = new Set<string>();
  const addE = (e: string | null | undefined) => {
    const n = normFanHubEmail(e);
    if (n) emails.add(n);
  };
  addE(params.prefEmail);
  addE(params.userEmail);
  addE(params.fanRowEmail);

  const fanIds = new Set<string>();
  const uid = String(params.fanUid ?? "").trim();
  if (uid) {
    fanIds.add(uid);
    const parsed = parseCompoundFanDocumentId(uid);
    if (parsed.authUid && parsed.authUid !== uid) fanIds.add(parsed.authUid);
    if (parsed.emailFromId) emails.add(parsed.emailFromId);
  }
  for (const g of collectStripeGuestFanIds(params.stripeCustomerId ?? null)) {
    fanIds.add(g);
  }

  return { fanUid: uid, emails, fanIds };
}

export function orderMatchesFanPurchaseIdentity(o: MinimalOrderForFanMatch, id: FanPurchaseIdentity): boolean {
  const fid = typeof o.fanId === "string" ? o.fanId.trim() : "";
  if (fid && id.fanIds.has(fid)) return true;

  const oEmail = normFanHubEmail(o.fanEmail);
  if (oEmail && id.emails.has(oEmail)) return true;

  if (fid.includes("@")) {
    const idEmail = normFanHubEmail(fid);
    if (idEmail && id.emails.has(idEmail)) return true;
  }

  const name = typeof o.fanName === "string" ? o.fanName.trim() : "";
  if (name.includes("@")) {
    const ne = normFanHubEmail(name);
    if (ne && id.emails.has(ne)) return true;
  }

  const linked = typeof o.linkedFromGuestFanId === "string" ? o.linkedFromGuestFanId.trim() : "";
  if (linked && id.fanIds.has(linked)) return true;

  return false;
}

export function onlyfansCalendarEventIsCustomOrStore(ev: Record<string, unknown>): boolean {
  if (ev.contentType === "custom") return true;
  if (ev.reminderType === "treat") return true;
  const tid = ev.treatPurchaseId;
  if (typeof tid === "string" && tid.trim().length > 0) return true;
  return false;
}

export function calendarEventMatchesFanPurchaseIdentity(
  ev: Record<string, unknown>,
  id: FanPurchaseIdentity
): boolean {
  const evFanId = typeof ev.fanId === "string" ? ev.fanId.trim() : "";
  const evMemberUid = typeof ev.fanMemberUid === "string" ? ev.fanMemberUid.trim() : "";

  if (evFanId && id.fanIds.has(evFanId)) return true;
  if (evMemberUid && id.fanIds.has(evMemberUid)) return true;

  const evFanEmail = normFanHubEmail(typeof ev.fanEmail === "string" ? ev.fanEmail : undefined);
  if (evFanEmail && id.emails.has(evFanEmail)) return true;

  if (evFanId.includes("@")) {
    const ie = normFanHubEmail(evFanId);
    if (ie && id.emails.has(ie)) return true;
  }

  const fn = typeof ev.fanName === "string" ? ev.fanName.trim() : "";
  if (fn.includes("@")) {
    const ne = normFanHubEmail(fn);
    if (ne && id.emails.has(ne)) return true;
  }

  return false;
}
