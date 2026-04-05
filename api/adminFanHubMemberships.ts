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
};

const ACTIVE_STATUSES = new Set(["active", "trialing", "free", "past_due"]);

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

function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const clean = raw.replace(/^@/, "").trim().toLowerCase();
  if (!clean) return null;
  return clean;
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

      const fanId = typeof data.id === "string" && data.id.trim() ? data.id.trim() : docSnap.id;
      const creatorId =
        (typeof data.creatorId === "string" && data.creatorId) || getCreatorIdFromPath(docSnap.ref.path);
      const status = typeof data.subscriptionStatus === "string" ? data.subscriptionStatus : "";
      if (!fanId || !creatorId) continue;
      if (activeOnly && !ACTIVE_STATUSES.has(status)) continue;

      if (!fanProfilesByFanId[fanId]) {
        const rawDisplayName =
          typeof data.displayName === "string" && data.displayName.trim() ? data.displayName.trim() : "";
        const rawEmail =
          typeof data.email === "string" && data.email.trim() ? data.email.trim().toLowerCase() : "";
        const rawUsername =
          (typeof data.username === "string" && data.username.trim()) ||
          (typeof data.memberUsername === "string" && data.memberUsername.trim()) ||
          (typeof data.handle === "string" && data.handle.trim()) ||
          "";
        fanProfilesByFanId[fanId] = {
          displayName: rawDisplayName || null,
          email: rawEmail || null,
          username: rawUsername ? rawUsername.replace(/^@/, "").trim().toLowerCase() : null,
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
    await Promise.all(
      Array.from(creatorIds).map(async (creatorId) => {
        try {
          const creatorSnap = await db.collection("creators").doc(creatorId).get();
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
          const monthlyPrice =
            (typeof d?.monetization?.monthlyPrice === "number" && Number.isFinite(d.monetization.monthlyPrice))
              ? d.monetization.monthlyPrice
              : (typeof d?.monthlyPrice === "number" && Number.isFinite(d.monthlyPrice) ? d.monthlyPrice : 0);
          creatorNameById[creatorId] = { name, handle, monthlyPriceCents: Math.max(0, Math.round(monthlyPrice * 100)) };
        } catch {
          creatorNameById[creatorId] = { name: "Unknown Creator", handle: null, monthlyPriceCents: 0 };
        }
      })
    );

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
            fanProfilesByFanId[fanId] = {
              displayName,
              email,
              username,
            };
          } catch {
            /* ignore profile enrichment failures */
          }
        })
      );
    }

    for (const fanId of Object.keys(byFan)) {
      byFan[fanId] = byFan[fanId]
        .map((row) => ({
          ...row,
          creatorName: creatorNameById[row.creatorId]?.name || row.creatorId,
          creatorHandle: creatorNameById[row.creatorId]?.handle || null,
          subscriptionPriceCents: creatorNameById[row.creatorId]?.monthlyPriceCents ?? 0,
        }))
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

