import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "./_firebaseAdmin.js";
import { hasPlatformAdminAccess } from "./_platformAdminAccess.js";
import { verifyAuth } from "./verifyAuth.js";

type MembershipRow = {
  creatorId: string;
  creatorName: string;
  creatorHandle: string | null;
  membershipType: "free" | "paid";
  status: string;
  cancelAtPeriodEnd: boolean;
  subscriptionCurrentPeriodEnd: string | null;
  subscribedAt: string | null;
  subscriptionPriceCents: number;
  totalSpentCents: number;
  purchaseCount: number;
  purchasesCents: number;
  tipCount: number;
  tipsCents: number;
  updatedAt: string | null;
};

type FanProfile = {
  displayName: string | null;
  email: string | null;
  username: string | null;
  photoURL: string | null;
};

const ACTIVE_STATUSES = new Set(["active", "trialing", "free", "past_due"]);
const FIREBASE_UID_RE = /^[A-Za-z0-9]{20,36}$/;
const UID_LABEL_SUFFIX = /(?:^|[-_\s])u(?:id|di)\s*:\s*([A-Za-z0-9]{20,36})$/i;
const EMAIL_IN_ID = /([^\s]+@[^\s]+)$/i;
const DEFAULT_FAN_HUB_PLACEHOLDER_SETTINGS = {
  autoReply: true,
  autoRespond: false,
  safeMode: true,
  highQuality: false,
  tone: {
    formality: 50,
    humor: 30,
    empathy: 70,
    spiciness: 0,
  },
  voiceMode: true,
  prioritizedKeywords: "collaboration, pricing, question",
  ignoredKeywords: "spam, giveaway, follow back",
  connectedAccounts: {
    Instagram: true,
    TikTok: true,
    X: true,
    Threads: true,
    YouTube: false,
    LinkedIn: true,
    Facebook: true,
    Pinterest: false,
    "My Page": false,
  },
};

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  return null;
}

function getCreatorIdFromPath(path: string): string | null {
  const parts = path.split("/");
  const creatorsIdx = parts.findIndex((p) => p === "creators");
  if (creatorsIdx === -1 || creatorsIdx + 1 >= parts.length) return null;
  return parts[creatorsIdx + 1] || null;
}

function normalizeCreatorId(raw: unknown): string {
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!id) return "";
  const idx = id.indexOf("--collection=");
  if (idx >= 0) return id.slice(0, idx).trim();
  return id;
}

function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const clean = raw.replace(/^@/, "").trim().toLowerCase();
  if (!clean) return null;
  return clean;
}

function normalizeCreatorHandle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const clean = raw.replace(/^@/, "").trim().toLowerCase();
  return clean || null;
}

function parseCompoundFanId(raw: unknown): { authUid: string | null; emailFromId: string | null } {
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!id) return { authUid: null, emailFromId: null };
  const labeled = id.match(UID_LABEL_SUFFIX);
  if (labeled?.[1]) {
    const emailMatch = id.match(EMAIL_IN_ID);
    return {
      authUid: labeled[1],
      emailFromId: emailMatch?.[1] ? emailMatch[1].trim().toLowerCase() : null,
    };
  }
  const m = id.match(/^([A-Za-z0-9]{20,36})-(.+@.+)$/);
  if (m) {
    return { authUid: m[1], emailFromId: m[2].trim().toLowerCase() };
  }
  if (FIREBASE_UID_RE.test(id)) return { authUid: id, emailFromId: null };
  if (id.includes("@")) return { authUid: null, emailFromId: id.toLowerCase() };
  return { authUid: null, emailFromId: null };
}

/** Prefer explicit Auth UIDs stored on fan docs (`uid`, `userId`, etc.) over email-shaped document ids. */
function firstFirebaseAuthUid(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t && FIREBASE_UID_RE.test(t)) return t;
  }
  return null;
}

/** Matches admin annotations like `uid: xxx`, `udi: xxx`, `Uid:xxx` embedded in display names / notes. */
const UID_TAG_IN_TEXT = /\b(?:uid|udi)\s*:\s*([A-Za-z0-9]{20,36})\b/gi;

function extractTaggedFirebaseUids(...chunks: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of chunks) {
    if (typeof c !== "string" || !c.trim()) continue;
    UID_TAG_IN_TEXT.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = UID_TAG_IN_TEXT.exec(c)) !== null) {
      const u = m[1];
      if (!FIREBASE_UID_RE.test(u) || seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

type FanDocAuthHints = {
  /** Raw field values that may be a plain Firebase uid. */
  structured?: unknown[];
  /** Free text (displayName, doc id string, notes, …) that may contain `uid: …` / `udi: …`. */
  haystack?: unknown[];
};

function resolveFanDocAuthUid(hints?: FanDocAuthHints): string | null {
  const structured = hints?.structured ?? [];
  const haystack = hints?.haystack ?? [];
  return (
    firstFirebaseAuthUid(...structured) ||
    extractTaggedFirebaseUids(...structured)[0] ||
    extractTaggedFirebaseUids(...haystack)[0] ||
    null
  );
}

function deriveCanonicalFanKey(
  rawDocId: string,
  rawDataId: unknown,
  rawEmail: unknown,
  authHints?: FanDocAuthHints,
): { key: string; emailHint: string | null } {
  const docParsed = parseCompoundFanId(rawDocId);
  const dataParsed = parseCompoundFanId(rawDataId);
  const directEmail =
    typeof rawEmail === "string" && rawEmail.trim() ? rawEmail.trim().toLowerCase() : null;
  const fieldUid = resolveFanDocAuthUid(authHints);
  if (fieldUid) {
    return {
      key: fieldUid,
      emailHint: directEmail || docParsed.emailFromId || dataParsed.emailFromId || null,
    };
  }
  const authUid = docParsed.authUid || dataParsed.authUid;
  if (authUid) return { key: authUid, emailHint: directEmail || docParsed.emailFromId || dataParsed.emailFromId || null };
  const email = directEmail || docParsed.emailFromId || dataParsed.emailFromId;
  if (email) return { key: email, emailHint: email };
  const fallback = (typeof rawDataId === "string" && rawDataId.trim()) || rawDocId;
  return { key: String(fallback).trim(), emailHint: null };
}

function toPriceCents(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  if (n <= 0) return 0;
  // New storefront writes cents (e.g. 1999). Preserve those.
  if (Number.isInteger(n) && n >= 100) return Math.round(n);
  // Legacy docs may still store dollars (e.g. 9.99 or 10).
  if (n < 100) return Math.round(n * 100);
  // Fallback: treat as cents.
  return Math.round(n);
}

function orderAmountCents(rawAmountCents: unknown, rawAmount: unknown): number {
  if (typeof rawAmountCents === "number" && Number.isFinite(rawAmountCents)) {
    return Math.max(0, Math.round(rawAmountCents));
  }
  if (typeof rawAmount === "number" && Number.isFinite(rawAmount)) {
    if (rawAmount <= 0) return 0;
    // Legacy rows may store dollars in `amount`; newer rows store cents.
    if (rawAmount < 100) return Math.round(rawAmount * 100);
    return Math.round(rawAmount);
  }
  return 0;
}

function normalizeOrderType(rawType: unknown, rawProductType: unknown, tipHandle: unknown): "tip" | "purchase" {
  const type = typeof rawType === "string" ? rawType.trim().toLowerCase() : "";
  const productType = typeof rawProductType === "string" ? rawProductType.trim().toLowerCase() : "";
  if (type === "tip") return "tip";
  if (productType === "tip") return "tip";
  if (typeof tipHandle === "string" && tipHandle.trim()) return "tip";
  return "purchase";
}

function statusRank(status: string): number {
  const s = String(status || "").toLowerCase().trim();
  if (s === "active") return 5;
  if (s === "trialing") return 4;
  if (s === "past_due") return 3;
  if (s === "free") return 2;
  if (s === "canceled" || s === "cancelled" || s === "unpaid") return 1;
  return 0;
}

function normalizeAdminCreatorGroupKey(raw: string | null | undefined): string {
  const id = String(raw || "").trim();
  if (!id) return "";
  const idx = id.indexOf("--collection=");
  if (idx >= 0) return id.slice(0, idx).trim();
  return id;
}

function fanMembershipStatusRankAdmin(status: string | null | undefined): number {
  const s = String(status || "").toLowerCase().trim();
  if (s === "active") return 5;
  if (s === "trialing") return 4;
  if (s === "past_due") return 3;
  if (s === "free") return 2;
  if (s === "canceled" || s === "cancelled" || s === "unpaid") return 1;
  return 0;
}

function dedupeFanMembershipLinksAdmin(links: MembershipRow[]): MembershipRow[] {
  const dedupedByCreator = new Map<string, MembershipRow>();
  for (const membership of links) {
    const normalizedCreatorId = normalizeAdminCreatorGroupKey(membership.creatorId);
    const key =
      normalizedCreatorId ||
      (membership.creatorHandle ? `handle:${membership.creatorHandle}` : "") ||
      `name:${(membership.creatorName || "").trim().toLowerCase()}`;
    const existing = dedupedByCreator.get(key);
    if (!existing) {
      dedupedByCreator.set(key, {
        ...membership,
        creatorId: normalizedCreatorId || membership.creatorId,
      });
      continue;
    }
    const chosen =
      fanMembershipStatusRankAdmin(membership.status) > fanMembershipStatusRankAdmin(existing.status)
        ? membership
        : existing;
    dedupedByCreator.set(key, {
      ...chosen,
      creatorId: normalizedCreatorId || chosen.creatorId,
      purchaseCount: Math.max(existing.purchaseCount || 0, membership.purchaseCount || 0),
      purchasesCents: Math.max(existing.purchasesCents || 0, membership.purchasesCents || 0),
      tipCount: Math.max(existing.tipCount || 0, membership.tipCount || 0),
      tipsCents: Math.max(existing.tipsCents || 0, membership.tipsCents || 0),
      totalSpentCents: Math.max(existing.totalSpentCents || 0, membership.totalSpentCents || 0),
      subscriptionPriceCents: Math.max(
        existing.subscriptionPriceCents || 0,
        membership.subscriptionPriceCents || 0,
      ),
    });
  }
  return Array.from(dedupedByCreator.values());
}

function aggregateBuyerRowAdmin(memberships: MembershipRow[]) {
  return {
    purchaseCount: memberships.reduce((acc, m) => acc + (m.purchaseCount || 0), 0),
    purchasesCents: memberships.reduce((acc, m) => acc + (m.purchasesCents || 0), 0),
    tipCount: memberships.reduce((acc, m) => acc + (m.tipCount || 0), 0),
    tipsCents: memberships.reduce((acc, m) => acc + (m.tipsCents || 0), 0),
  };
}

function adminUserDisplayLabelServer(user: {
  name?: string | null;
  email?: string | null;
  username?: string | null;
  handle?: string | null;
  memberUsername?: string | null;
}): string {
  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  const nameRaw = typeof user.name === "string" ? user.name.trim() : "";
  const nameLower = nameRaw.toLowerCase();
  const nameLooksPlaceholder =
    !nameRaw ||
    nameLower === "new user" ||
    nameLower === "member" ||
    nameLower === "user" ||
    (email && nameLower === email);
  if (!nameLooksPlaceholder) return nameRaw;

  const rawHandle = user.username || user.handle || user.memberUsername;
  const u = rawHandle?.trim().toLowerCase();
  let username: string | null = null;
  if (u) {
    username = u.includes("@") ? (u.split("@")[0]?.trim().slice(0, 60) ?? null) : u.slice(0, 60);
  }
  if (username) return username;

  const emailLocal = email && email.includes("@") ? email.split("@")[0]!.trim() : "";
  if (emailLocal) return emailLocal;
  return nameRaw || "User";
}

function placeholderUserForFanBuyerSummaryServer(fanKey: string, profile: FanProfile | undefined): Record<string, unknown> {
  const email =
    (profile?.email && profile.email.trim().toLowerCase()) || (fanKey.includes("@") ? fanKey.trim().toLowerCase() : "");
  const name =
    (profile?.displayName && profile.displayName.trim()) ||
    adminUserDisplayLabelServer({
      name: "",
      email: email || undefined,
      username: profile?.username ?? undefined,
      handle: profile?.username ?? undefined,
      memberUsername: profile?.username ?? undefined,
    });
  const id = `fanhub-summary:${fanKey.replace(/[^a-zA-Z0-9@._-]/g, "_")}`;
  return {
    id,
    name: name || fanKey,
    email: email || "—",
    avatar: `https://picsum.photos/seed/${encodeURIComponent(id)}/100/100`,
    bio: "",
    plan: null,
    role: "User",
    signupDate: new Date(0).toISOString(),
    notifications: { newMessages: true, weeklySummary: false, trendAlerts: false },
    monthlyCaptionGenerationsUsed: 0,
    monthlyImageGenerationsUsed: 0,
    monthlyVideoGenerationsUsed: 0,
    storageUsed: 0,
    storageLimit: 0,
    mediaLibrary: [],
    settings: DEFAULT_FAN_HUB_PLACEHOLDER_SETTINGS,
    accountOrigin: "fan_hub",
  };
}

function firestoreUserDocToClientUser(doc: DocumentSnapshot): Record<string, unknown> {
  return { ...(doc.data() as Record<string, unknown>), id: doc.id };
}

type BuyerRosterRowJson = {
  directoryOnly: boolean;
  fanIndexKeys: string[];
  user: Record<string, unknown>;
  memberships: MembershipRow[];
  purchaseCount: number;
  purchasesCents: number;
  tipCount: number;
  tipsCents: number;
};

async function resolveFanKeysToUserSnapsBatch(
  db: Firestore,
  fanIds: string[],
  fanProfilesByFanId: Record<string, FanProfile>,
): Promise<Map<string, DocumentSnapshot | null>> {
  const out = new Map<string, DocumentSnapshot | null>();
  const uidFanIds = fanIds.filter((id) => FIREBASE_UID_RE.test(id));
  const chunk = 10;
  for (let i = 0; i < uidFanIds.length; i += chunk) {
    const part = uidFanIds.slice(i, i + chunk);
    const snaps = await db.getAll(...part.map((id) => db.collection("users").doc(id)));
    for (let j = 0; j < part.length; j++) {
      const fid = part[j]!;
      const snap = snaps[j]!;
      out.set(fid, snap.exists ? snap : null);
    }
  }
  for (const id of fanIds) {
    if (!out.has(id)) out.set(id, null);
  }

  const needEmail = fanIds.filter((id) => !out.get(id)?.exists);
  const uniqueEmails: string[] = [];
  const seenEm = new Set<string>();
  for (const fanId of needEmail) {
    if (fanId.includes("@")) {
      const e = fanId.trim().toLowerCase();
      if (e && !seenEm.has(e)) {
        seenEm.add(e);
        uniqueEmails.push(e);
      }
    }
    const pe = fanProfilesByFanId[fanId]?.email?.trim().toLowerCase();
    if (pe && !seenEm.has(pe)) {
      seenEm.add(pe);
      uniqueEmails.push(pe);
    }
  }

  const emailDocByEmail = new Map<string, DocumentSnapshot>();
  for (let i = 0; i < uniqueEmails.length; i += chunk) {
    const part = uniqueEmails.slice(i, i + chunk);
    if (part.length === 0) continue;
    const q = await db.collection("users").where("email", "in", part).get();
    for (const d of q.docs) {
      const raw = d.data().email;
      const em = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      if (em) emailDocByEmail.set(em, d);
    }
  }

  for (const fanId of needEmail) {
    if (out.get(fanId)?.exists) continue;
    const candidates: string[] = [];
    if (fanId.includes("@")) candidates.push(fanId.trim().toLowerCase());
    const pe = fanProfilesByFanId[fanId]?.email?.trim().toLowerCase();
    if (pe) candidates.push(pe);
    for (const e of candidates) {
      const doc = emailDocByEmail.get(e);
      if (doc) {
        out.set(fanId, doc);
        break;
      }
    }
  }

  for (const fanId of needEmail) {
    if (out.get(fanId)?.exists) continue;
    if (FIREBASE_UID_RE.test(fanId)) continue;
    const snap = await db.collection("users").doc(fanId).get();
    if (snap.exists) out.set(fanId, snap);
  }

  return out;
}

async function buildBuyerRosterRows(
  db: Firestore,
  byFan: Record<string, MembershipRow[]>,
  fanProfilesByFanId: Record<string, FanProfile>,
): Promise<BuyerRosterRowJson[]> {
  const fanIds = Object.keys(byFan);
  if (fanIds.length === 0) return [];

  const resolvedMap = await resolveFanKeysToUserSnapsBatch(db, fanIds, fanProfilesByFanId);

  const mergedByUid = new Map<
    string,
    { snap: DocumentSnapshot; fanIndexKeys: string[]; rawMemberships: MembershipRow[] }
  >();
  const orphanRows: BuyerRosterRowJson[] = [];

  for (const fanId of fanIds) {
    const memberships = byFan[fanId] || [];
    const snap = resolvedMap.get(fanId);
    if (!snap?.exists) {
      const deduped = dedupeFanMembershipLinksAdmin(memberships);
      const agg = aggregateBuyerRowAdmin(deduped);
      orphanRows.push({
        directoryOnly: true,
        fanIndexKeys: [fanId],
        user: placeholderUserForFanBuyerSummaryServer(fanId, fanProfilesByFanId[fanId]),
        memberships: deduped,
        ...agg,
      });
      continue;
    }
    const uid = snap.id;
    const prev = mergedByUid.get(uid);
    if (!prev) {
      mergedByUid.set(uid, { snap, fanIndexKeys: [fanId], rawMemberships: [...memberships] });
    } else {
      prev.fanIndexKeys.push(fanId);
      prev.rawMemberships.push(...memberships);
    }
  }

  const matchedRows: BuyerRosterRowJson[] = [];
  for (const { snap, fanIndexKeys, rawMemberships } of mergedByUid.values()) {
    const deduped = dedupeFanMembershipLinksAdmin(rawMemberships);
    const agg = aggregateBuyerRowAdmin(deduped);
    matchedRows.push({
      directoryOnly: false,
      fanIndexKeys,
      user: firestoreUserDocToClientUser(snap),
      memberships: deduped,
      ...agg,
    });
  }

  const rows = [...matchedRows, ...orphanRows];
  rows.sort((a, b) => {
    const na = String((a.user.name as string) || "").localeCompare(String((b.user.name as string) || ""));
    return na;
  });
  return rows;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const authUser = await verifyAuth(req);
  if (!authUser?.uid) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  if (!db) return res.status(500).json({ error: "Database unavailable" });

  const userSnap = await db.collection("users").doc(authUser.uid).get();
  const userData = userSnap.data() as Record<string, unknown> | undefined;
  if (!hasPlatformAdminAccess(userData)) return res.status(403).json({ error: "Admin access required" });

  const activeOnly = String(req.query.activeOnly || "1") !== "0";

  try {
    const fanSnap = await db.collectionGroup("fans").get();
    const creatorIds = new Set<string>();
    const byFan: Record<string, MembershipRow[]> = {};
    const fanProfilesByFanId: Record<string, FanProfile> = {};

    for (const docSnap of fanSnap.docs) {
      const data = docSnap.data() as {
        id?: string;
        creatorId?: string;
        subscriptionStatus?: string;
        displayName?: string;
        email?: string;
        username?: string;
        memberUsername?: string;
        handle?: string;
        uid?: string;
        userId?: string;
        fanUserId?: string;
        note?: string;
        notes?: string;
        bio?: string;
        description?: string;
        internalNote?: string;
        adminNote?: string;
        totalSpentCents?: number;
        purchaseCount?: number;
        tipCount?: number;
        totalTipsCents?: number;
        updatedAt?: unknown;
      };

      const identity = deriveCanonicalFanKey(docSnap.id, data.id, data.email, {
        structured: [data.uid, data.userId, data.fanUserId],
        haystack: [
          docSnap.id,
          data.id,
          data.displayName,
          data.username,
          data.memberUsername,
          data.handle,
          data.note,
          data.notes,
          data.bio,
          data.description,
          data.internalNote,
          data.adminNote,
        ],
      });
      const fanId = identity.key;
      const creatorIdRaw =
        getCreatorIdFromPath(docSnap.ref.path) || (typeof data.creatorId === "string" && data.creatorId);
      const creatorId = normalizeCreatorId(creatorIdRaw);
      const status = typeof data.subscriptionStatus === "string" ? data.subscriptionStatus : "";
      if (!fanId || !creatorId) continue;
      if (activeOnly && !ACTIVE_STATUSES.has(status)) continue;

      if (!fanProfilesByFanId[fanId]) {
        const rawDisplayName =
          typeof data.displayName === "string" && data.displayName.trim() ? data.displayName.trim() : "";
        const rawEmail =
          typeof data.email === "string" && data.email.trim()
            ? data.email.trim().toLowerCase()
            : (identity.emailHint || "");
        const rawUsername =
          (typeof data.username === "string" && data.username.trim()) ||
          (typeof data.memberUsername === "string" && data.memberUsername.trim()) ||
          (typeof data.handle === "string" && data.handle.trim()) ||
          "";
        fanProfilesByFanId[fanId] = {
          displayName: rawDisplayName || null,
          email: rawEmail || null,
          username: rawUsername ? rawUsername.replace(/^@/, "").trim().toLowerCase() : null,
          photoURL:
            (typeof (data as { photoURL?: unknown }).photoURL === "string" &&
            (data as { photoURL?: string }).photoURL!.trim())
              ? (data as { photoURL: string }).photoURL.trim()
              : null,
        };
      }

      const totalSpentCents = typeof data.totalSpentCents === "number" && Number.isFinite(data.totalSpentCents)
        ? Math.max(0, Math.round(data.totalSpentCents))
        : 0;
      const totalTipsCents = typeof data.totalTipsCents === "number" && Number.isFinite(data.totalTipsCents)
        ? Math.max(0, Math.round(data.totalTipsCents))
        : 0;
      const purchasesCents = Math.max(0, totalSpentCents - totalTipsCents);
      const subscriptionCurrentPeriodEnd =
        toIso((data as { subscriptionCurrentPeriodEnd?: unknown }).subscriptionCurrentPeriodEnd) ??
        toIso((data as { currentPeriodEnd?: unknown }).currentPeriodEnd);
      const subscribedAt = toIso((data as { subscribedAt?: unknown }).subscribedAt);
      const cancelAtPeriodEnd =
        (data as { cancelAtPeriodEnd?: unknown }).cancelAtPeriodEnd === true ||
        (data as { cancel_at_period_end?: unknown }).cancel_at_period_end === true;

      creatorIds.add(creatorId);
      if (!byFan[fanId]) byFan[fanId] = [];
      byFan[fanId].push({
        creatorId,
        creatorName: "Unknown Creator",
        creatorHandle: null,
        membershipType: status === "free" ? "free" : "paid",
        status,
        cancelAtPeriodEnd,
        subscriptionCurrentPeriodEnd,
        subscribedAt,
        subscriptionPriceCents: 0,
        totalSpentCents,
        purchaseCount: typeof data.purchaseCount === "number" && Number.isFinite(data.purchaseCount) ? Math.max(0, Math.round(data.purchaseCount)) : 0,
        purchasesCents,
        tipCount: typeof data.tipCount === "number" && Number.isFinite(data.tipCount) ? Math.max(0, Math.round(data.tipCount)) : 0,
        tipsCents: totalTipsCents,
        updatedAt: toIso(data.updatedAt),
      });
    }

    const creatorNameById: Record<string, { name: string; handle: string | null; monthlyPriceCents: number }> = {};
    const canonicalCreatorIdByAlias: Record<string, string> = {};
    await Promise.all(
      Array.from(creatorIds).map(async (creatorId) => {
        try {
          let canonicalCreatorId = creatorId;
          let creatorSnap = await db.collection("creators").doc(creatorId).get();
          if (!creatorSnap.exists) {
            const handleAlias = normalizeCreatorHandle(creatorId);
            if (handleAlias) {
              const byHandle = await db.collection("creators").where("handle", "==", handleAlias).limit(1).get();
              if (!byHandle.empty) {
                creatorSnap = byHandle.docs[0];
                canonicalCreatorId = creatorSnap.id;
              }
            }
          }
          const d = creatorSnap.data() as {
            displayName?: string;
            handle?: string;
            monetization?: { monthlyPrice?: number };
            monthlyPrice?: number;
          } | undefined;
          const handle = typeof d?.handle === "string" && d.handle.trim() ? d.handle.trim() : null;
          const name =
            (typeof d?.displayName === "string" && d.displayName.trim()) ||
            (handle ? `@${handle.replace(/^@/, "")}` : "Unknown Creator");
          const monthlyPriceRaw =
            (typeof d?.monetization?.monthlyPrice === "number" && Number.isFinite(d.monetization.monthlyPrice))
              ? d.monetization.monthlyPrice
              : (typeof d?.monthlyPrice === "number" && Number.isFinite(d.monthlyPrice) ? d.monthlyPrice : 0);
          const normalizedInfo = { name, handle, monthlyPriceCents: toPriceCents(monthlyPriceRaw) };
          creatorNameById[creatorId] = normalizedInfo;
          creatorNameById[canonicalCreatorId] = normalizedInfo;
          canonicalCreatorIdByAlias[creatorId] = canonicalCreatorId;
        } catch {
          creatorNameById[creatorId] = { name: "Unknown Creator", handle: null, monthlyPriceCents: 0 };
          canonicalCreatorIdByAlias[creatorId] = creatorId;
        }
      })
    );

    // Backfill spend/tip counters from `orders` so Admin table does not depend only on fan-row aggregates.
    const orderStatsByCreatorFan: Record<
      string,
      { purchasesCents: number; purchaseCount: number; tipsCents: number; tipCount: number; totalSpentCents: number }
    > = {};
    try {
      let orderDocs;
      try {
        orderDocs = await db.collection("orders").orderBy("createdAt", "desc").limit(10000).get();
      } catch {
        // Fallback to unsorted read when createdAt index/orderBy isn't available.
        orderDocs = await db.collection("orders").limit(10000).get();
      }
      orderDocs.docs.forEach((docSnap) => {
        const d = docSnap.data() as Record<string, unknown>;
        const creatorId = normalizeCreatorId(d.creatorId);
        if (!creatorId) return;
        const status = typeof d.status === "string" ? d.status.trim().toLowerCase() : "";
        if (status === "refunded") return;

        const fanIdentity = deriveCanonicalFanKey(
          typeof d.fanId === "string" ? d.fanId : "",
          typeof d.fanId === "string" ? d.fanId : "",
          typeof d.fanEmail === "string" ? d.fanEmail : null
        );
        const fanKey = fanIdentity.key;
        if (!fanKey) return;

        const amountCents = orderAmountCents(d.amountCents, d.amount);
        if (amountCents <= 0) return;
        const type = normalizeOrderType(d.type, d.productType, d.tipHandle);
        const key = `${creatorId}__${fanKey}`;
        const prev = orderStatsByCreatorFan[key] || {
          purchasesCents: 0,
          purchaseCount: 0,
          tipsCents: 0,
          tipCount: 0,
          totalSpentCents: 0,
        };
        if (type === "tip") {
          prev.tipsCents += amountCents;
          prev.tipCount += 1;
        } else {
          prev.purchasesCents += amountCents;
          prev.purchaseCount += 1;
        }
        prev.totalSpentCents += amountCents;
        orderStatsByCreatorFan[key] = prev;
      });
    } catch (ordersErr) {
      console.warn("adminFanHubMemberships: orders backfill skipped:", ordersErr);
    }

    // Enrich missing fan profiles from users/{fanId} so Admin UI can show usernames/names instead of IDs.
    const fanIdsToResolve = Object.keys(byFan).filter((fanId) => {
      const p = fanProfilesByFanId[fanId];
      return !p || (!p.displayName && !p.email && !p.username);
    });
    const chunkSize = 40;
    for (let i = 0; i < fanIdsToResolve.length; i += chunkSize) {
      const chunk = fanIdsToResolve.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (fanId) => {
          try {
            const userSnap = await db.collection("users").doc(fanId).get();
            if (!userSnap.exists) {
              if (fanId.includes("@")) {
                const email = fanId.trim().toLowerCase();
                fanProfilesByFanId[fanId] = {
                  displayName: fanProfilesByFanId[fanId]?.displayName || email.split("@")[0] || null,
                  email: fanProfilesByFanId[fanId]?.email || email,
                  username: fanProfilesByFanId[fanId]?.username || null,
                  photoURL: fanProfilesByFanId[fanId]?.photoURL || null,
                };
              }
              return;
            }
            const u = userSnap.data() as {
              displayName?: unknown;
              name?: unknown;
              email?: unknown;
              username?: unknown;
              handle?: unknown;
            };
            const displayName =
              (typeof u.displayName === "string" && u.displayName.trim()) ||
              (typeof u.name === "string" && u.name.trim()) ||
              null;
            const email =
              (typeof u.email === "string" && u.email.trim().toLowerCase()) ||
              fanProfilesByFanId[fanId]?.email ||
              (fanId.includes("@") ? fanId.trim().toLowerCase() : null);
            const username =
              normalizeUsername(u.username) ||
              normalizeUsername(u.handle) ||
              fanProfilesByFanId[fanId]?.username ||
              null;
            const photoURL =
              (typeof (u as { photoURL?: unknown }).photoURL === "string" &&
              (u as { photoURL?: string }).photoURL!.trim())
                ? (u as { photoURL: string }).photoURL.trim()
                : (fanProfilesByFanId[fanId]?.photoURL || null);
            fanProfilesByFanId[fanId] = {
              displayName,
              email,
              username,
              photoURL,
            };
          } catch {
            /* ignore profile enrichment failures */
          }
        })
      );
    }

    // Merge duplicate fan identities when one key is uid and another key is email for the same account.
    const uidByEmail = new Map<string, string>();
    for (const [fanId, profile] of Object.entries(fanProfilesByFanId)) {
      if (!FIREBASE_UID_RE.test(fanId)) continue;
      const email = (profile.email || "").trim().toLowerCase();
      if (email) uidByEmail.set(email, fanId);
    }
    for (const [fanId, profile] of Object.entries(fanProfilesByFanId)) {
      if (FIREBASE_UID_RE.test(fanId)) continue;
      const email = (profile.email || "").trim().toLowerCase();
      if (!email) continue;
      const uidKey = uidByEmail.get(email);
      if (!uidKey || uidKey === fanId) continue;
      const sourceRows = byFan[fanId] || [];
      if (!byFan[uidKey]) byFan[uidKey] = [];
      byFan[uidKey].push(...sourceRows);
      delete byFan[fanId];
      delete fanProfilesByFanId[fanId];
    }

    for (const fanId of Object.keys(byFan)) {
      const canonicalFanRows = (byFan[fanId] || []).map((row) => {
        const normalizedCreatorId = normalizeCreatorId(row.creatorId);
        const canonicalCreatorId = canonicalCreatorIdByAlias[normalizedCreatorId] || normalizedCreatorId;
        return { ...row, creatorId: canonicalCreatorId };
      });
      const rows = byFan[fanId]
        .map((row, idx) => ({
          ...row,
          creatorId: canonicalFanRows[idx]?.creatorId || normalizeCreatorId(row.creatorId),
          creatorName:
            creatorNameById[canonicalFanRows[idx]?.creatorId || normalizeCreatorId(row.creatorId)]?.name || row.creatorId,
          creatorHandle:
            creatorNameById[canonicalFanRows[idx]?.creatorId || normalizeCreatorId(row.creatorId)]?.handle || null,
          subscriptionPriceCents:
            creatorNameById[canonicalFanRows[idx]?.creatorId || normalizeCreatorId(row.creatorId)]?.monthlyPriceCents ?? 0,
        }));
      const dedupedByCreator = new Map<string, MembershipRow>();
      for (const row of rows) {
        const key = normalizeCreatorId(row.creatorId) || row.creatorName || "unknown_creator";
        const orderKey = `${normalizeCreatorId(row.creatorId)}__${fanId}`;
        const orderBackfill = orderStatsByCreatorFan[orderKey];
        const rowWithBackfill: MembershipRow = orderBackfill
          ? {
              ...row,
              purchasesCents: Math.max(row.purchasesCents || 0, orderBackfill.purchasesCents || 0),
              purchaseCount: Math.max(row.purchaseCount || 0, orderBackfill.purchaseCount || 0),
              tipsCents: Math.max(row.tipsCents || 0, orderBackfill.tipsCents || 0),
              tipCount: Math.max(row.tipCount || 0, orderBackfill.tipCount || 0),
              totalSpentCents: Math.max(row.totalSpentCents || 0, orderBackfill.totalSpentCents || 0),
            }
          : row;
        const existing = dedupedByCreator.get(key);
        if (!existing) {
          dedupedByCreator.set(key, rowWithBackfill);
          continue;
        }
        const chosen =
          statusRank(rowWithBackfill.status) > statusRank(existing.status) ? rowWithBackfill : existing;
        dedupedByCreator.set(key, {
          ...chosen,
          purchaseCount: Math.max(existing.purchaseCount || 0, rowWithBackfill.purchaseCount || 0),
          purchasesCents: Math.max(existing.purchasesCents || 0, rowWithBackfill.purchasesCents || 0),
          tipCount: Math.max(existing.tipCount || 0, rowWithBackfill.tipCount || 0),
          tipsCents: Math.max(existing.tipsCents || 0, rowWithBackfill.tipsCents || 0),
          totalSpentCents: Math.max(existing.totalSpentCents || 0, rowWithBackfill.totalSpentCents || 0),
          subscriptionPriceCents: Math.max(existing.subscriptionPriceCents || 0, rowWithBackfill.subscriptionPriceCents || 0),
          updatedAt: chosen.updatedAt || existing.updatedAt || rowWithBackfill.updatedAt,
        });
      }

      const mergeMembershipRows = (a: MembershipRow, b: MembershipRow): MembershipRow => {
        const primary = statusRank(b.status) > statusRank(a.status) ? b : a;
        const secondary = statusRank(b.status) > statusRank(a.status) ? a : b;
        const name = (n: string) => n.trim().toLowerCase();
        const pickName =
          primary.creatorName && name(primary.creatorName) !== "unknown creator"
            ? primary.creatorName
            : secondary.creatorName && name(secondary.creatorName) !== "unknown creator"
              ? secondary.creatorName
              : primary.creatorName || secondary.creatorName;
        const pickId =
          normalizeCreatorId(primary.creatorId) || normalizeCreatorId(secondary.creatorId) || primary.creatorId;
        return {
          ...primary,
          creatorId: pickId,
          creatorName: pickName,
          creatorHandle: primary.creatorHandle || secondary.creatorHandle,
          purchaseCount: Math.max(a.purchaseCount || 0, b.purchaseCount || 0),
          purchasesCents: Math.max(a.purchasesCents || 0, b.purchasesCents || 0),
          tipCount: Math.max(a.tipCount || 0, b.tipCount || 0),
          tipsCents: Math.max(a.tipsCents || 0, b.tipsCents || 0),
          totalSpentCents: Math.max(a.totalSpentCents || 0, b.totalSpentCents || 0),
          subscriptionPriceCents: Math.max(a.subscriptionPriceCents || 0, b.subscriptionPriceCents || 0),
        };
      };

      let merged = Array.from(dedupedByCreator.values());
      const byLowerName = new Map<string, MembershipRow>();
      const unknownOrEmpty: MembershipRow[] = [];
      for (const r of merged) {
        const n = (r.creatorName || "").trim().toLowerCase();
        if (!n || n === "unknown creator") {
          unknownOrEmpty.push(r);
          continue;
        }
        const prev = byLowerName.get(n);
        if (!prev) {
          byLowerName.set(n, r);
          continue;
        }
        byLowerName.set(n, mergeMembershipRows(prev, r));
      }

      let finalRows: MembershipRow[] = [];
      if (byLowerName.size > 0) {
        finalRows = Array.from(byLowerName.values());
        if (unknownOrEmpty.length > 0) {
          if (finalRows.length === 1) {
            let base = finalRows[0];
            for (const u of unknownOrEmpty) {
              base = mergeMembershipRows(base, u);
            }
            finalRows = [base];
          } else {
            finalRows = [...finalRows, ...unknownOrEmpty];
          }
        }
      } else if (unknownOrEmpty.length > 0) {
        finalRows = [unknownOrEmpty.reduce((acc, row) => mergeMembershipRows(acc, row))];
      }

      byFan[fanId] = finalRows.sort((a, b) => a.creatorName.localeCompare(b.creatorName));
    }

    let buyerRoster: { rows: BuyerRosterRowJson[] } | null = null;
    try {
      const rows = await buildBuyerRosterRows(db, byFan, fanProfilesByFanId);
      buyerRoster = { rows };
    } catch (rosterErr) {
      console.warn("adminFanHubMemberships: buyerRoster build skipped:", rosterErr);
    }

    return res.status(200).json({
      success: true,
      activeOnly,
      membershipsByFan: byFan,
      fanProfilesByFanId,
      fanCount: Object.keys(byFan).length,
      ...(buyerRoster ? { buyerRoster } : {}),
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("adminFanHubMemberships error:", error);
    return res.status(500).json({ error: "Failed to load fan memberships", details: error?.message || String(error) });
  }
}

