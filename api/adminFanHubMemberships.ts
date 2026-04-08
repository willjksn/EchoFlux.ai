import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
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

function hasPlatformAdminAccess(userData: Record<string, unknown> | undefined): boolean {
  if (!userData) return false;
  const role = typeof userData.role === "string" ? userData.role.trim().toLowerCase() : "";
  if (role === "admin" || role === "superadmin" || role === "owner") return true;
  if (userData.isAdmin === true || userData.isSuperAdmin === true || userData.isOwner === true) return true;
  return false;
}

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

function deriveCanonicalFanKey(rawDocId: string, rawDataId: unknown, rawEmail: unknown): { key: string; emailHint: string | null } {
  const docParsed = parseCompoundFanId(rawDocId);
  const dataParsed = parseCompoundFanId(rawDataId);
  const directEmail =
    typeof rawEmail === "string" && rawEmail.trim() ? rawEmail.trim().toLowerCase() : null;
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
        totalSpentCents?: number;
        purchaseCount?: number;
        tipCount?: number;
        totalTipsCents?: number;
        updatedAt?: unknown;
      };

      const identity = deriveCanonicalFanKey(docSnap.id, data.id, data.email);
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
      let orderDocs = await db.collection("orders").limit(10000).get();
      try {
        orderDocs = await db.collection("orders").orderBy("createdAt", "desc").limit(10000).get();
      } catch {
        // Fallback to unsorted read when createdAt index/orderBy isn't available.
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
      byFan[fanId] = Array.from(dedupedByCreator.values())
        .sort((a, b) => a.creatorName.localeCompare(b.creatorName));
    }

    return res.status(200).json({
      success: true,
      activeOnly,
      membershipsByFan: byFan,
      fanProfilesByFanId,
      fanCount: Object.keys(byFan).length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("adminFanHubMemberships error:", error);
    return res.status(500).json({ error: "Failed to load fan memberships", details: error?.message || String(error) });
  }
}

