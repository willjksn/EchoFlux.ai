import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

export type CreatorOrder = {
  id: string;
  creatorId: string;
  fanId: string;
  productId: string | null;
  type: string;
  amountCents: number;
  status: string;
  createdAt: string;
  productTitle?: string;
  fanName?: string | null;
  fanEmail?: string;
  scheduleStatus?: string;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  deliveryStatus?: "pending" | "delivered";
  deliveryType?: "video" | "image" | "audio" | "text" | "link" | null;
  deliveryText?: string | null;
  deliveryUrl?: string | null;
  deliveredAt?: string | null;
  deliveredBy?: string | null;
};

function hasPlatformAdminAccess(userData: Record<string, unknown> | undefined): boolean {
  if (!userData) return false;
  const role = typeof userData.role === "string" ? userData.role.trim().toLowerCase() : "";
  if (role === "admin" || role === "superadmin" || role === "owner") return true;
  if (userData.isAdmin === true || userData.isSuperAdmin === true || userData.isOwner === true) return true;
  return false;
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

function createdAtToIso(createdAt: unknown): string {
  const ms = createdAtToMs(createdAt);
  if (ms > 0) return new Date(ms).toISOString();
  return new Date(0).toISOString();
}

function toLowerString(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function toLegacyAmountCents(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = raw;
    if (n <= 0) return 0;
    if (Number.isInteger(n) && n >= 100) return Math.round(n);
    if (n < 100) return Math.round(n * 100);
    return Math.round(n);
  }
  if (typeof raw === "string") {
    const cleaned = raw.replace(/[^0-9.\-]/g, "").trim();
    if (!cleaned) return 0;
    const parsed = Number.parseFloat(cleaned);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    if (cleaned.includes(".")) return Math.round(parsed * 100);
    if (parsed < 100) return Math.round(parsed * 100);
    return Math.round(parsed);
  }
  return 0;
}

function inferLegacyPurchaseType(d: Record<string, unknown>): "tip" | "product" {
  const type = toLowerString(d.type);
  if (type === "tip") return "tip";
  const productType = toLowerString(d.productType);
  if (productType === "tip") return "tip";
  if (typeof d.tipHandle === "string" && d.tipHandle.trim()) return "tip";
  const productName = toLowerString(d.productName);
  if (productName.includes("tip")) return "tip";
  return "product";
}

function normalizeOrderType(
  d: Record<string, unknown>,
): "tip" | "subscription" | "unlock" | "post_unlock" | "live_stream_ticket" | "product" {
  const type = toLowerString(d.type);
  const productType = toLowerString(d.productType);
  const pick = type || productType;
  if (pick === "tip") return "tip";
  if (pick === "subscription") return "subscription";
  if (pick === "unlock" || pick === "unlock_media") return "unlock";
  if (pick === "post_unlock") return "post_unlock";
  if (pick === "live_stream_ticket") return "live_stream_ticket";
  if (pick === "product" || pick === "treat") return "product";
  if (typeof d.tipHandle === "string" && d.tipHandle.trim()) return "tip";
  const productName = toLowerString(d.productName);
  const productTitle = toLowerString(d.productTitle);
  if (productName.includes("tip") || productTitle.includes("tip")) return "tip";
  return "product";
}

/** Earliest timestamp on a migrated / legacy `purchases` doc (Stormij uses purchasedAt). */
function purchaseActivityMs(d: Record<string, unknown>): number {
  const a = createdAtToMs(d.purchasedAt);
  const b = createdAtToMs(d.createdAt);
  if (a > 0 && b > 0) return Math.min(a, b);
  return Math.max(a, b);
}

function toPositiveCents(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.round(raw));
  }
  return 0;
}

function mapDocToOrder(docSnap: QueryDocumentSnapshot): CreatorOrder {
  const d = docSnap.data() as Record<string, unknown>;
  const inferredType = normalizeOrderType(d);
  const isNonDeliverable = inferredType === "tip" || inferredType === "subscription";
  const amountCents = (() => {
    const direct = typeof d.amountCents === "number" && Number.isFinite(d.amountCents)
      ? Math.max(0, Math.round(d.amountCents))
      : 0;
    if (direct > 0) return direct;
    return toLegacyAmountCents(d.amount);
  })();
  return {
    id: docSnap.id,
    creatorId: (d.creatorId as string) ?? "",
    fanId: (d.fanId as string) ?? "",
    productId: (d.productId as string) ?? null,
    type: inferredType,
    amountCents,
    status: (d.status as string) ?? "paid",
    createdAt: createdAtToIso(d.createdAt),
    productTitle: (d.productTitle as string) ?? (d.productId as string) ?? undefined,
    fanName: (d.fanName as string) ?? (d.tipHandle as string) ?? null,
    fanEmail: typeof d.fanEmail === "string" && d.fanEmail.trim() ? d.fanEmail.trim() : undefined,
    scheduleStatus: isNonDeliverable ? "completed" : ((d.scheduleStatus as string) || "pending"),
    scheduledDate: isNonDeliverable ? null : ((d.scheduledDate as string) ?? null),
    scheduledTime: isNonDeliverable ? null : ((d.scheduledTime as string) ?? null),
    deliveryStatus: isNonDeliverable ? "delivered" : (d.deliveryStatus === "delivered" ? "delivered" : "pending"),
    deliveryType:
      d.deliveryType === "video" ||
      d.deliveryType === "image" ||
      d.deliveryType === "audio" ||
      d.deliveryType === "text" ||
      d.deliveryType === "link"
        ? d.deliveryType
        : null,
    deliveryText: typeof d.deliveryText === "string" ? d.deliveryText : null,
    deliveryUrl: typeof d.deliveryUrl === "string" ? d.deliveryUrl : null,
    deliveredAt: typeof d.deliveredAt === "string" ? d.deliveredAt : null,
    deliveredBy: typeof d.deliveredBy === "string" ? d.deliveredBy : null,
  };
}

/**
 * GET: List orders for the authenticated creator (creatorId = uid by default).
 * Optional query param: creatorId (admin-only cross-creator read).
 * Query: limit (default 100), status (optional filter).
 *
 * Uses orderBy(createdAt) when the composite index exists; otherwise falls back to
 * equality-only query + in-memory sort (avoids 500 when indexes are not deployed).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const limitNum = Math.min(parseInt(String(req.query.limit || "100"), 10) || 100, 1000);

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });
    let creatorIdToQuery = decoded.uid;
    const requestedCreatorId = String(req.query.creatorId || "").trim();
    if (requestedCreatorId && requestedCreatorId !== decoded.uid) {
      const callerSnap = await db.collection("users").doc(decoded.uid).get();
      const caller = (callerSnap.data() as Record<string, unknown> | undefined) ?? undefined;
      if (!hasPlatformAdminAccess(caller)) {
        return res.status(403).json({ error: "Forbidden: not authorized for this creatorId" });
      }
      creatorIdToQuery = requestedCreatorId;
    }

    const cap = Math.min(500, Math.max(limitNum, limitNum * 2));
    let docs: QueryDocumentSnapshot[] = [];

    try {
      const snap = await db
        .collection("orders")
        .where("creatorId", "==", creatorIdToQuery)
        .orderBy("createdAt", "desc")
        .limit(limitNum)
        .get();
      docs = snap.docs;
    } catch (primaryErr: unknown) {
      console.warn(
        "creatorOrders: indexed query failed, using fallback (deploy firestore index creatorId+createdAt if possible):",
        primaryErr instanceof Error ? primaryErr.message : primaryErr
      );
      const snap = await db.collection("orders").where("creatorId", "==", creatorIdToQuery).limit(cap).get();
      docs = snap.docs.slice();
      docs.sort((a, b) => {
        const ma = createdAtToMs(a.data().createdAt);
        const mb = createdAtToMs(b.data().createdAt);
        return mb - ma;
      });
      docs = docs.slice(0, limitNum);
    }

    const orderRows: Array<CreatorOrder & { __createdAtMs: number }> = docs.map((docSnap) => {
      const row = mapDocToOrder(docSnap);
      return {
        ...row,
        __createdAtMs: createdAtToMs(row.createdAt),
      };
    });

    const earliestPurchaseAtByFanId: Record<string, string> = {};
    const earliestPurchaseAtByFanEmail: Record<string, string> = {};
    try {
      const purchaseCap = 4000;
      const pSnap = await db
        .collection("purchases")
        .where("creatorId", "==", creatorIdToQuery)
        .limit(purchaseCap)
        .get();
      const bump = (map: Record<string, string>, key: string, ms: number) => {
        if (!key || ms <= 0) return;
        const iso = new Date(ms).toISOString();
        const prev = map[key];
        if (!prev || Date.parse(prev) > ms) map[key] = iso;
      };
      for (const p of pSnap.docs) {
        const raw = p.data() as Record<string, unknown>;
        const ms = purchaseActivityMs(raw);
        if (ms <= 0) continue;
        const fid = typeof raw.fanId === "string" ? raw.fanId.trim() : "";
        if (fid) bump(earliestPurchaseAtByFanId, fid, ms);
        const em = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
        if (em) bump(earliestPurchaseAtByFanEmail, em, ms);

        // Back-compat: older migrations wrote tip/store sales into top-level `purchases` only.
        // Include those rows in creator analytics so revenue totals stay accurate.
        const inferredType = inferLegacyPurchaseType(raw);
        const amountCents = (() => {
          const direct =
            typeof raw.amountCents === "number" && Number.isFinite(raw.amountCents)
              ? Math.max(0, Math.round(raw.amountCents))
              : 0;
          if (direct > 0) return direct;
          return toLegacyAmountCents(raw.amount);
        })();
        if (amountCents <= 0) continue;

        const fanId =
          (typeof raw.fanId === "string" && raw.fanId.trim()) ||
          (typeof raw.email === "string" && raw.email.trim()) ||
          "unknown";
        const fanEmail =
          typeof raw.email === "string" && raw.email.trim()
            ? raw.email.trim().toLowerCase()
            : undefined;
        const createdAtIso = new Date(ms).toISOString();
        const legacyId = `legacy_purchase_${p.id}`;
        const exists = orderRows.some((o) => o.id === legacyId);
        if (!exists) {
          orderRows.push({
            id: legacyId,
            creatorId: creatorIdToQuery,
            fanId,
            productId: typeof raw.treatId === "string" ? raw.treatId : null,
            type: inferredType,
            amountCents,
            status: "paid",
            createdAt: createdAtIso,
            productTitle:
              (typeof raw.productName === "string" && raw.productName.trim()) ||
              (typeof raw.treatId === "string" ? raw.treatId : undefined),
            fanName:
              (typeof raw.fanName === "string" && raw.fanName.trim()) ||
              (typeof raw.tipHandle === "string" && raw.tipHandle.trim()) ||
              null,
            fanEmail,
            scheduleStatus: inferredType === "tip" || inferredType === "subscription"
              ? "completed"
              : (typeof raw.scheduleStatus === "string" && raw.scheduleStatus.trim() ? raw.scheduleStatus : "pending"),
            scheduledDate: inferredType === "tip" || inferredType === "subscription"
              ? null
              : (typeof raw.scheduledDate === "string" ? raw.scheduledDate : null),
            scheduledTime: inferredType === "tip" || inferredType === "subscription"
              ? null
              : (typeof raw.scheduledTime === "string" ? raw.scheduledTime : null),
            deliveryStatus: inferredType === "tip" || inferredType === "subscription"
              ? "delivered"
              : (raw.deliveryStatus === "delivered" ? "delivered" : "pending"),
            deliveryType:
              raw.deliveryType === "video" ||
              raw.deliveryType === "image" ||
              raw.deliveryType === "audio" ||
              raw.deliveryType === "text" ||
              raw.deliveryType === "link"
                ? raw.deliveryType
                : null,
            deliveryText: typeof raw.deliveryText === "string" ? raw.deliveryText : null,
            deliveryUrl: typeof raw.deliveryUrl === "string" ? raw.deliveryUrl : null,
            deliveredAt: typeof raw.deliveredAt === "string" ? raw.deliveredAt : null,
            deliveredBy: typeof raw.deliveredBy === "string" ? raw.deliveredBy : null,
            __createdAtMs: ms,
          });
        }
      }
    } catch (purchaseErr: unknown) {
      console.warn(
        "creatorOrders: purchases aggregation skipped:",
        purchaseErr instanceof Error ? purchaseErr.message : purchaseErr
      );
    }

    // Fallback ledger reconciliation:
    // Some legacy tips updated creators/{creatorId}/fans totals without writing complete `orders` rows.
    // Add synthetic tip rows for any missing per-fan tip delta so creator analytics stay accurate.
    try {
      const fanSnap = await db
        .collection("creators")
        .doc(creatorIdToQuery)
        .collection("fans")
        .limit(5000)
        .get();

      const tipByFanFromOrders = new Map<string, number>();
      for (const row of orderRows) {
        if (row.type !== "tip" || row.status === "refunded") continue;
        const key = typeof row.fanId === "string" ? row.fanId.trim() : "";
        if (!key) continue;
        tipByFanFromOrders.set(key, (tipByFanFromOrders.get(key) || 0) + Math.max(0, Math.round(row.amountCents || 0)));
      }

      for (const fanDoc of fanSnap.docs) {
        const raw = fanDoc.data() as Record<string, unknown>;
        const fanId = (typeof raw.id === "string" && raw.id.trim()) || fanDoc.id;
        if (!fanId) continue;

        const fanTipsCents = toPositiveCents(raw.totalTipsCents);
        if (fanTipsCents <= 0) continue;

        const existingTipCents = tipByFanFromOrders.get(fanId) || 0;
        const missingTipCents = fanTipsCents - existingTipCents;
        if (missingTipCents <= 0) continue;

        const lastTipMs = createdAtToMs(raw.lastTipAt) || createdAtToMs(raw.updatedAt);
        const createdMs = lastTipMs > 0 ? lastTipMs : Date.now();
        const syntheticId = `synthetic_tip_${fanDoc.id}`;
        if (orderRows.some((o) => o.id === syntheticId)) continue;

        const fanEmail =
          typeof raw.email === "string" && raw.email.trim()
            ? raw.email.trim().toLowerCase()
            : undefined;
        const fanName =
          (typeof raw.displayName === "string" && raw.displayName.trim()) ||
          (typeof raw.fanName === "string" && raw.fanName.trim()) ||
          (typeof raw.tipHandle === "string" && raw.tipHandle.trim()) ||
          null;

        orderRows.push({
          id: syntheticId,
          creatorId: creatorIdToQuery,
          fanId,
          productId: null,
          type: "tip",
          amountCents: missingTipCents,
          status: "paid",
          createdAt: new Date(createdMs).toISOString(),
          productTitle: "Legacy tip reconciliation",
          fanName,
          fanEmail,
          scheduleStatus: "completed",
          scheduledDate: null,
          scheduledTime: null,
          deliveryStatus: "delivered",
          deliveryType: null,
          deliveryText: null,
          deliveryUrl: null,
          deliveredAt: null,
          deliveredBy: null,
          __createdAtMs: createdMs,
        });
      }
    } catch (fanLedgerErr: unknown) {
      console.warn(
        "creatorOrders: fan ledger tip fallback skipped:",
        fanLedgerErr instanceof Error ? fanLedgerErr.message : fanLedgerErr
      );
    }

    orderRows.sort((a, b) => b.__createdAtMs - a.__createdAtMs);
    const orders: CreatorOrder[] = orderRows.slice(0, limitNum).map(({ __createdAtMs, ...rest }) => rest);
    return res.status(200).json({ orders, earliestPurchaseAtByFanId, earliestPurchaseAtByFanEmail });
  } catch (e: unknown) {
    console.error("creatorOrders error:", e);
    const msg = e instanceof Error ? e.message : "Failed to load orders";
    return res.status(500).json({ error: "Failed to load orders", hint: msg.slice(0, 200) });
  }
}
