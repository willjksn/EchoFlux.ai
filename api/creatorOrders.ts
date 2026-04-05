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

/** Earliest timestamp on a migrated / legacy `purchases` doc (Stormij uses purchasedAt). */
function purchaseActivityMs(d: Record<string, unknown>): number {
  const a = createdAtToMs(d.purchasedAt);
  const b = createdAtToMs(d.createdAt);
  if (a > 0 && b > 0) return Math.min(a, b);
  return Math.max(a, b);
}

function mapDocToOrder(docSnap: QueryDocumentSnapshot): CreatorOrder {
  const d = docSnap.data() as Record<string, unknown>;
  const rawType = typeof d.type === "string" ? d.type.trim().toLowerCase() : "";
  const normalizedType =
    rawType === "tip" ||
    rawType === "subscription" ||
    rawType === "unlock" ||
    rawType === "post_unlock" ||
    rawType === "product"
      ? rawType
      : rawType === "treat"
        ? "product"
        : "";
  const inferredType =
    normalizedType ||
    (typeof d.tipHandle === "string" && d.tipHandle.trim() ? "tip" : "") ||
    "product";
  return {
    id: docSnap.id,
    creatorId: (d.creatorId as string) ?? "",
    fanId: (d.fanId as string) ?? "",
    productId: (d.productId as string) ?? null,
    type: inferredType,
    amountCents: (d.amountCents as number) ?? 0,
    status: (d.status as string) ?? "paid",
    createdAt: createdAtToIso(d.createdAt),
    productTitle: (d.productTitle as string) ?? (d.productId as string) ?? undefined,
    fanName: (d.fanName as string) ?? (d.tipHandle as string) ?? null,
    fanEmail: typeof d.fanEmail === "string" && d.fanEmail.trim() ? d.fanEmail.trim() : undefined,
    scheduleStatus: (d.scheduleStatus as string) || "pending",
    scheduledDate: (d.scheduledDate as string) ?? null,
    scheduledTime: (d.scheduledTime as string) ?? null,
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

    const orders: CreatorOrder[] = docs.map((docSnap) => mapDocToOrder(docSnap));

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
      }
    } catch (purchaseErr: unknown) {
      console.warn(
        "creatorOrders: purchases aggregation skipped:",
        purchaseErr instanceof Error ? purchaseErr.message : purchaseErr
      );
    }

    return res.status(200).json({ orders, earliestPurchaseAtByFanId, earliestPurchaseAtByFanEmail });
  } catch (e: unknown) {
    console.error("creatorOrders error:", e);
    const msg = e instanceof Error ? e.message : "Failed to load orders";
    return res.status(500).json({ error: "Failed to load orders", hint: msg.slice(0, 200) });
  }
}
