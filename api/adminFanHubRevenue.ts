import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { resolveAdminCreatorLabels } from "./_adminCreatorLabel.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { hasPlatformAdminAccess } from "./_platformAdminAccess.js";
import { syncRecentFanHubCheckoutsForAdminRevenue } from "./_syncRecentFanHubProductCheckouts.js";
import { verifyAuth } from "./verifyAuth.js";

function createdAtToMs(createdAt: unknown): number {
  if (createdAt == null) return 0;
  if (typeof (createdAt as { toDate?: () => Date }).toDate === "function") {
    return (createdAt as { toDate: () => Date }).toDate().getTime();
  }
  if (createdAt instanceof Date) return createdAt.getTime();
  if (typeof createdAt === "string") {
    const t = Date.parse(createdAt);
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof createdAt === "number" && Number.isFinite(createdAt)) {
    return createdAt < 1e12 ? createdAt * 1000 : createdAt;
  }
  return 0;
}

function dollarsFromOrder(d: Record<string, unknown>): number {
  const cents = (d.amountCents as number) ?? 0;
  if (typeof cents === "number" && Number.isFinite(cents)) return cents / 100;
  const legacy = (d.amount as number) ?? 0;
  if (typeof legacy === "number" && Number.isFinite(legacy)) return legacy / 100;
  return 0;
}

function normalizeOrderType(d: Record<string, unknown>): string {
  const raw = typeof d.type === "string" ? d.type.trim().toLowerCase() : "";
  if (
    raw === "tip" ||
    raw === "unlock" ||
    raw === "post_unlock" ||
    raw === "live_stream_ticket" ||
    raw === "subscription" ||
    raw === "product"
  ) {
    return raw;
  }
  if (raw === "treat") return "product";
  // Legacy/backfill safety: tip rows may carry tipHandle even if type was stored as product.
  if (typeof d.tipHandle === "string" && d.tipHandle.trim()) return "tip";
  return "product";
}

function cleanCreatorHandle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/^@+/, "").toLowerCase().slice(0, 80);
}

async function resolveAdminCreatorHandles(
  db: ReturnType<typeof getAdminDb>,
  ids: string[],
): Promise<Record<string, string>> {
  if (!db) return {};
  const unique = [...new Set(ids.filter((x) => x.trim()))];
  const out: Record<string, string> = {};
  if (unique.length === 0) return out;

  const chunkSize = 30;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const creatorSnaps = await db.getAll(...chunk.map((id) => db.collection("creators").doc(id)));
    creatorSnaps.forEach((snap, j) => {
      const id = chunk[j]!;
      const handle = cleanCreatorHandle(snap.data()?.handle);
      if (handle) out[id] = handle;
    });
  }

  const missing = unique.filter((id) => !out[id]);
  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    const userSnaps = await db.getAll(...chunk.map((id) => db.collection("users").doc(id)));
    userSnaps.forEach((snap, j) => {
      const id = chunk[j]!;
      const data = snap.data();
      const handle = cleanCreatorHandle(data?.username) || cleanCreatorHandle(data?.handle);
      if (handle) out[id] = handle;
    });
  }

  const stillMissing = unique.filter((id) => !out[id]);
  await Promise.all(
    stillMissing.map(async (id) => {
      try {
        const snap = await db.collection("creatorHandles").where("creatorId", "==", id).limit(1).get();
        const handle = cleanCreatorHandle(snap.docs[0]?.id);
        if (handle) out[id] = handle;
      } catch {
        /* best-effort admin display only */
      }
    })
  );

  return out;
}

/**
 * GET: Aggregate Fan Hub Stripe order revenue across all creators (top-level `orders`).
 * Admin-only. Used by AdminDashboard; matches stripeWebhook Fan Hub writes.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const authUser = await verifyAuth(req);
  if (!authUser?.uid) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  if (!db) return res.status(500).json({ error: "Database unavailable" });

  const userSnap = await db.collection("users").doc(authUser.uid).get();
  const userData = userSnap.data() as Record<string, unknown> | undefined;
  if (!hasPlatformAdminAccess(userData)) return res.status(403).json({ error: "Admin access required" });

  const limitParam = parseInt(String(req.query.limit || "5000"), 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 100), 10000) : 5000;
  const daysParam = parseInt(String(req.query.days || ""), 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 3650) : null;
  const cutoffMs = days ? Date.now() - days * 24 * 60 * 60 * 1000 : null;

  try {
    try {
      await syncRecentFanHubCheckoutsForAdminRevenue({
        db,
        days: days ?? 90,
        limitPerAccount: 100,
      });
    } catch (syncErr) {
      console.warn("adminFanHubRevenue: recent Stripe checkout sync skipped", syncErr);
    }

    let docs: QueryDocumentSnapshot[] = [];
    try {
      const snap = await db.collection("orders").orderBy("createdAt", "desc").limit(limit).get();
      docs = snap.docs;
    } catch (primaryErr: unknown) {
      console.warn(
        "adminFanHubRevenue: orderBy(createdAt) failed, using unsorted cap + sort:",
        primaryErr instanceof Error ? primaryErr.message : primaryErr
      );
      const cap = Math.min(limit * 2, 10000);
      const snap = await db.collection("orders").limit(cap).get();
      docs = snap.docs.slice();
      docs.sort((a, b) => createdAtToMs(b.data().createdAt) - createdAtToMs(a.data().createdAt));
      docs = docs.slice(0, limit);
    }

    let totalRevenue = 0;
    let tips = 0;
    let unlocks = 0;
    let treats = 0;
    let subscriptions = 0;
    const byCreatorId: Record<string, number> = {};

    const recentTransactions: Array<{
      id: string;
      creatorId: string;
      type: string;
      amount: number;
      timestamp: string;
    }> = [];

    for (const docSnap of docs) {
      const d = docSnap.data() as Record<string, unknown>;
      const creatorId = typeof d.creatorId === "string" ? d.creatorId : "";
      if (!creatorId) continue;
      const ms = createdAtToMs(d.createdAt);
      if (cutoffMs != null && ms < cutoffMs) continue;

      const status = typeof d.status === "string" ? d.status : "";
      if (status === "refunded") continue;

      const amount = dollarsFromOrder(d);
      const orderType = normalizeOrderType(d);

      totalRevenue += amount;
      byCreatorId[creatorId] = (byCreatorId[creatorId] ?? 0) + amount;

      // stripeWebhook writes post_unlock for paid post unlocks; legacy may use "unlock"
      if (orderType === "tip") tips += amount;
      else if (orderType === "unlock" || orderType === "post_unlock" || orderType === "live_stream_ticket") {
        unlocks += amount;
      }
      else if (orderType === "subscription") subscriptions += amount;
      else treats += amount;

      recentTransactions.push({
        id: docSnap.id,
        creatorId,
        type: orderType,
        amount,
        timestamp: ms > 0 ? new Date(ms).toISOString() : new Date(0).toISOString(),
      });
    }

    recentTransactions.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    const recentSlice = recentTransactions.slice(0, 50);

    const creatorIds = [...new Set(Object.keys(byCreatorId))];
    const { labels: creatorDisplayNames } = await resolveAdminCreatorLabels(db, creatorIds);
    const creatorHandles = await resolveAdminCreatorHandles(db, creatorIds);

    return res.status(200).json({
      totalRevenue,
      tips,
      unlocks,
      treats,
      subscriptions,
      byCreatorId,
      creatorDisplayNames,
      creatorHandles,
      recentTransactions: recentSlice,
      orderCount: docs.length,
      periodDays: days,
    });
  } catch (e: unknown) {
    console.error("adminFanHubRevenue error:", e);
    const msg = e instanceof Error ? e.message : "Failed to load revenue";
    return res.status(500).json({ error: msg });
  }
}
