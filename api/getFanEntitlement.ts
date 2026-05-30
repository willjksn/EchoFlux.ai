import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyBrowserApiCors } from "./_browserApiCors.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { shouldGrantFanPageAdminMemberAccess } from "../src/lib/fanPageAdminBypass.js";
import {
  collectPaidPostUnlockIdsFromOrders,
  normalizedFanEmail,
  readFanGrantUnlockFields,
} from "./_fanUnlockEntitlements.js";

function normalizedEmail(raw: unknown): string {
  return normalizedFanEmail(raw);
}

function isPaidLikeStatus(status: unknown): boolean {
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  return s === "active" || s === "trialing";
}

function isFreeLikeStatus(status: unknown): boolean {
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  return s === "free";
}

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

function orderAmountCentsFromRow(row: Record<string, unknown>): number {
  if (typeof row.amountCents === "number" && Number.isFinite(row.amountCents)) {
    return Math.max(0, Math.round(row.amountCents));
  }
  if (typeof row.amount === "number" && Number.isFinite(row.amount)) {
    const v = row.amount;
    if (v <= 0) return 0;
    // Legacy orders may store dollars in `amount`; newer rows often store cents.
    if (v < 100) return Math.round(v * 100);
    return Math.round(v);
  }
  return 0;
}

/**
 * Check if the current user (fan) has an active subscription/entitlement to the given creator.
 * Used by fan storefront: active paid/free membership → full hub; expired paid with product/post unlocks →
 * limited hub (purchases + tip + profile); otherwise landing until they subscribe or join free.
 *
 * Firestore: creatorSubscribers/{creatorId}/subscribers/{fanId} with { status: 'active', ... }
 * or equivalent. Until that is populated, returns { subscribed: false } when no doc exists.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyBrowserApiCors(req, res)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { creatorId } = req.query;
  if (!creatorId || typeof creatorId !== "string") {
    return res.status(400).json({ error: "creatorId is required" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(200).json({
      subscribed: false,
      unlockedProductIds: [],
      unlockedFanPostIds: [],
      unlockedLiveStreamIds: [],
    });
  }

  const fanId = decoded.uid;
  const fanEmail = normalizedEmail(decoded.email);

  try {
    const db = getAdminDb();
    if (!db) {
      return res.status(500).json({ error: "Database unavailable" });
    }

    if (await shouldGrantFanPageAdminMemberAccess(db, fanId, creatorId, fanEmail || undefined)) {
      return res.status(200).json({
        subscribed: true,
        membershipType: "paid" as const,
        unlockedProductIds: [],
        unlockedFanPostIds: [],
        unlockedLiveStreamIds: [],
        memberUsername: null,
        memberUsernameRequired: false,
        fanPageAdminBypass: true,
      });
    }

    let subscribed = false;
    let membershipType: 'paid' | 'free' | null = null;
    let limitedMemberAccess = false;
    const nowIso = new Date().toISOString();
    let legacyFanDocId: string | null = null;

    // First check the primary fans collection (includes both paid and free members)
    const fanRef = db.collection("creators").doc(creatorId).collection("fans").doc(fanId);
    let fanSnap = await fanRef.get();
    let fanData = fanSnap.exists
      ? (fanSnap.data() as {
        subscriptionStatus?: string;
        totalSpentCents?: number;
        totalTipsCents?: number;
        purchaseCount?: number;
        tipCount?: number;
      } | undefined)
      : undefined;

    // Migration fallback: some legacy records were keyed by email/compound id, not uid.
    if (!fanData && fanEmail) {
      const fansCol = db.collection("creators").doc(creatorId).collection("fans");
      const candidates: Array<{ id: string; data: Record<string, unknown> }> = [];

      const byEmailIdSnap = await fansCol.doc(fanEmail).get();
      if (byEmailIdSnap.exists) {
        candidates.push({
          id: byEmailIdSnap.id,
          data: (byEmailIdSnap.data() || {}) as Record<string, unknown>,
        });
      }

      const byEmailFieldSnap = await fansCol.where("email", "==", fanEmail).limit(6).get();
      for (const d of byEmailFieldSnap.docs) {
        candidates.push({ id: d.id, data: (d.data() || {}) as Record<string, unknown> });
      }

      if (candidates.length > 0) {
        const ranked = candidates.sort((a, b) => {
          const aStatus = String(a.data.subscriptionStatus || "").toLowerCase();
          const bStatus = String(b.data.subscriptionStatus || "").toLowerCase();
          const rank = (s: string) => (s === "active" || s === "trialing" ? 0 : s === "free" ? 1 : 2);
          return rank(aStatus) - rank(bStatus);
        });
        legacyFanDocId = ranked[0].id;
        fanData = ranked[0].data as {
          subscriptionStatus?: string;
          totalSpentCents?: number;
          totalTipsCents?: number;
          purchaseCount?: number;
          tipCount?: number;
        };

        // Self-heal: ensure canonical uid-keyed fan doc exists for future reads.
        if (legacyFanDocId && legacyFanDocId !== fanId) {
          await fanRef.set(
            {
              ...(ranked[0].data || {}),
              id: fanId,
              email: fanEmail,
              updatedAt: nowIso,
              migratedFromFanDocId: legacyFanDocId,
            },
            { merge: true }
          );
          fanSnap = await fanRef.get();
        }
      }
    }

    if (fanData) {
      const status = fanData?.subscriptionStatus;
      if (isPaidLikeStatus(status)) {
        subscribed = true;
        membershipType = 'paid';
      } else if (isFreeLikeStatus(status)) {
        subscribed = true;
        membershipType = 'free';
      }
      // Purchase-only hub (expired paid, etc.): requires a la carte/post unlocks — tips alone do not grant it.
      const hasProductPurchaseEvidence =
        typeof fanData?.purchaseCount === "number" && fanData.purchaseCount > 0;
      if (hasProductPurchaseEvidence) limitedMemberAccess = true;
    }

    // Also check creatorSubscribers collection. Paid membership should override any stale free fan row.
    if (!subscribed || membershipType !== "paid") {
      const subsCol = db.collection("creatorSubscribers").doc(creatorId).collection("subscribers");
      const subscriberRef = subsCol.doc(fanId);
      let subscriberSnap = await subscriberRef.get();
      let subData = subscriberSnap.exists
        ? (subscriberSnap.data() as { status?: string } | undefined)
        : undefined;

      if (!subData && fanEmail) {
        const byEmailIdSnap = await subsCol.doc(fanEmail).get();
        if (byEmailIdSnap.exists) {
          subData = byEmailIdSnap.data() as { status?: string } | undefined;
          if (isPaidLikeStatus(subData?.status)) {
            // Self-heal into uid-keyed subscriber doc.
            await subscriberRef.set(
              { ...(subData || {}), fanId, email: fanEmail, updatedAt: nowIso, migratedFromFanDocId: fanEmail },
              { merge: true }
            );
            subscriberSnap = await subscriberRef.get();
          }
        }
      }

      if (!subData && fanEmail) {
        // Some legacy subscriber docs are keyed by old uid but still carry email/fanEmail fields.
        const [byEmailFieldSnap, byFanEmailFieldSnap] = await Promise.all([
          subsCol.where("email", "==", fanEmail).limit(6).get().catch(() => null),
          subsCol.where("fanEmail", "==", fanEmail).limit(6).get().catch(() => null),
        ]);
        const candidateDocs = [
          ...(byEmailFieldSnap?.docs || []),
          ...(byFanEmailFieldSnap?.docs || []),
        ];
        if (candidateDocs.length > 0) {
          const ranked = candidateDocs
            .map((d) => ({ id: d.id, data: (d.data() || {}) as { status?: string } }))
            .sort((a, b) => {
              const rank = (s: unknown) => (isPaidLikeStatus(s) ? 0 : 1);
              return rank(a.data.status) - rank(b.data.status);
            });
          subData = ranked[0].data;
          if (isPaidLikeStatus(subData?.status)) {
            await subscriberRef.set(
              {
                ...(subData || {}),
                fanId,
                email: fanEmail,
                fanEmail,
                updatedAt: nowIso,
                migratedFromFanDocId: ranked[0].id,
              },
              { merge: true }
            );
            subscriberSnap = await subscriberRef.get();
          }
        }
      }

      if (subData && isPaidLikeStatus(subData.status)) {
        subscribed = true;
        membershipType = 'paid';
      }
    }

    const grantsCol = db
      .collection("creatorEntitlements")
      .doc(creatorId)
      .collection("grants");
    const grantRef = grantsCol.doc(fanId);
    const grantSnap = await grantRef.get();
    const grantData = grantSnap.exists
      ? (grantSnap.data() as {
          subscription?: boolean;
          membershipType?: string;
        } | undefined)
      : undefined;

    const grantUnlockFields = await readFanGrantUnlockFields(db, creatorId, fanId, fanEmail, {
      migrateToCanonical: true,
      legacyFanDocId,
    });
    let unlockedProductIds = grantUnlockFields.unlockedProductIds;
    let unlockedFanPostIds = grantUnlockFields.unlockedFanPostIds;
    let unlockedLiveStreamIds = grantUnlockFields.unlockedLiveStreamIds;

    const orderPostUnlockIds = await collectPaidPostUnlockIdsFromOrders(
      db,
      creatorId,
      fanId,
      fanEmail,
      legacyFanDocId,
    );
    if (orderPostUnlockIds.length > 0) {
      const mergedPosts = Array.from(new Set([...unlockedFanPostIds, ...orderPostUnlockIds]));
      if (mergedPosts.length > unlockedFanPostIds.length) {
        unlockedFanPostIds = mergedPosts;
        await grantRef.set(
          { unlockedFanPostIds: mergedPosts, updatedAt: nowIso },
          { merge: true },
        );
      }
    }

    if (unlockedProductIds.length > 0 || unlockedFanPostIds.length > 0 || unlockedLiveStreamIds.length > 0) {
      limitedMemberAccess = true;
    }

    // Member username (global fan handle) — server read; clients cannot write username on users/*
    let memberUsername: string | null = null;
    let memberUsernameRequired = false;
    const userSnap = await db.collection("users").doc(fanId).get();
    const uData = userSnap.data() as { username?: string } | undefined;
    const u = typeof uData?.username === "string" ? uData.username.trim().toLowerCase() : "";
    if (u.length >= 3 && /^[a-z0-9_]+$/.test(u)) {
      memberUsername = u;
    }
    // Require username once the fan has any member-area access (subscription or purchase unlocks).
    // This prevents forcing @username before checkout completes while still covering purchase-only fans.
    if ((subscribed || limitedMemberAccess) && !memberUsername) {
      memberUsernameRequired = true;
    }

    let billedSubscriptionPriceCents: number | null = null;
    if (membershipType === "paid") {
      const orderCandidates: Array<{ amountCents: number; createdAtMs: number }> = [];
      const collectOrderCandidates = (
        docs: Array<{ data: () => Record<string, unknown> }>
      ) => {
        for (const d of docs) {
          const row = d.data() as Record<string, unknown>;
          const status = typeof row.status === "string" ? row.status.trim().toLowerCase() : "";
          if (status === "refunded") continue;
          const amount = orderAmountCentsFromRow(row);
          if (amount <= 0) continue;
          const createdAtMs = createdAtToMs(row.createdAt);
          orderCandidates.push({ amountCents: amount, createdAtMs });
        }
      };

      const runOrderLookup = async (field: "fanId" | "fanEmail", value: string) => {
        if (!value) return;
        try {
          const indexed = await db
            .collection("orders")
            .where("creatorId", "==", creatorId)
            .where("type", "==", "subscription")
            .where(field, "==", value)
            .orderBy("createdAt", "desc")
            .limit(12)
            .get();
          collectOrderCandidates(indexed.docs);
          return;
        } catch {
          const fallback = await db
            .collection("orders")
            .where("creatorId", "==", creatorId)
            .where("type", "==", "subscription")
            .where(field, "==", value)
            .limit(80)
            .get()
            .catch(() => null);
          if (fallback) collectOrderCandidates(fallback.docs);
        }
      };

      const fanIdCandidates = Array.from(
        new Set([fanId, legacyFanDocId, fanEmail ? `${fanId}-${fanEmail}` : ""].filter((v): v is string => !!v))
      );
      for (const candidate of fanIdCandidates) {
        await runOrderLookup("fanId", candidate);
      }
      if (fanEmail) {
        await runOrderLookup("fanEmail", fanEmail);
      }

      if (orderCandidates.length > 0) {
        orderCandidates.sort((a, b) => b.createdAtMs - a.createdAtMs);
        billedSubscriptionPriceCents = orderCandidates[0].amountCents;
      } else {
        // Fallback when subscription order rows are sparse/missing:
        // derive from latest invoice-backed order for this fan+creator.
        const invoiceCandidates: Array<{ amountCents: number; createdAtMs: number }> = [];
        const collectInvoiceCandidates = (docs: Array<{ data: () => Record<string, unknown> }>) => {
          for (const d of docs) {
            const row = d.data() as Record<string, unknown>;
            if (!row.stripeInvoiceId) continue;
            const status = typeof row.status === "string" ? row.status.trim().toLowerCase() : "";
            if (status === "refunded") continue;
            const amount = orderAmountCentsFromRow(row);
            if (amount <= 0) continue;
            const createdAtMs = createdAtToMs(row.createdAt);
            invoiceCandidates.push({ amountCents: amount, createdAtMs });
          }
        };
        const runInvoiceLookup = async (field: "fanId" | "fanEmail", value: string) => {
          if (!value) return;
          try {
            const indexed = await db
              .collection("orders")
              .where("creatorId", "==", creatorId)
              .where("stripeInvoiceId", "!=", null)
              .where(field, "==", value)
              .orderBy("stripeInvoiceId")
              .orderBy("createdAt", "desc")
              .limit(20)
              .get();
            collectInvoiceCandidates(indexed.docs);
          } catch {
            const fallback = await db
              .collection("orders")
              .where("creatorId", "==", creatorId)
              .where(field, "==", value)
              .limit(150)
              .get()
              .catch(() => null);
            if (fallback) collectInvoiceCandidates(fallback.docs);
          }
        };
        for (const candidate of fanIdCandidates) {
          await runInvoiceLookup("fanId", candidate);
        }
        if (fanEmail) await runInvoiceLookup("fanEmail", fanEmail);
        if (invoiceCandidates.length > 0) {
          invoiceCandidates.sort((a, b) => b.createdAtMs - a.createdAtMs);
          billedSubscriptionPriceCents = invoiceCandidates[0].amountCents;
        }
      }
    }

    return res.status(200).json({
      subscribed,
      membershipType,
      unlockedProductIds,
      unlockedFanPostIds,
      unlockedLiveStreamIds,
      limitedMemberAccess,
      memberUsername,
      memberUsernameRequired,
      billedSubscriptionPriceCents,
    });
  } catch (error: unknown) {
    console.error("getFanEntitlement error:", error);
    return res.status(500).json({
      error: "Failed to check entitlement",
      details: process.env.NODE_ENV === "development" ? (error as Error)?.message : undefined,
    });
  }
}
