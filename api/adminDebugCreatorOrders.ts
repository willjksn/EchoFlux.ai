import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "./_firebaseAdmin.js";
import { hasPlatformAdminAccess } from "./_platformAdminAccess.js";
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

function toIso(createdAt: unknown): string {
  const ms = createdAtToMs(createdAt);
  return ms > 0 ? new Date(ms).toISOString() : new Date(0).toISOString();
}

function toOrderRow(docSnap: QueryDocumentSnapshot): {
  id: string;
  creatorId: string;
  fanId: string;
  type: string;
  amountCents: number;
  amountUsd: number;
  status: string;
  fanEmail?: string;
  fanName?: string;
  tipHandle?: string;
  productId?: string;
  productTitle?: string;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  createdAt: string;
} {
  const d = docSnap.data() as Record<string, unknown>;
  const amountCents = Number(d.amountCents || 0);
  return {
    id: docSnap.id,
    creatorId: String(d.creatorId || ""),
    fanId: String(d.fanId || ""),
    type: String(d.type || "product"),
    amountCents,
    amountUsd: amountCents / 100,
    status: String(d.status || "paid"),
    fanEmail: typeof d.fanEmail === "string" ? d.fanEmail : undefined,
    fanName: typeof d.fanName === "string" ? d.fanName : undefined,
    tipHandle: typeof d.tipHandle === "string" ? d.tipHandle : undefined,
    productId: typeof d.productId === "string" ? d.productId : undefined,
    productTitle: typeof d.productTitle === "string" ? d.productTitle : undefined,
    stripeSessionId: typeof d.stripeSessionId === "string" ? d.stripeSessionId : undefined,
    stripePaymentIntentId: typeof d.stripePaymentIntentId === "string" ? d.stripePaymentIntentId : undefined,
    createdAt: toIso(d.createdAt),
  };
}

/**
 * Admin-only debug endpoint to validate Fan Hub order ingestion/type mapping.
 * GET /api/adminDebugCreatorOrders?creatorId=<uid>&limit=50
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) return res.status(401).json({ error: "Unauthorized" });

  const creatorId = String(req.query.creatorId || "").trim();
  if (!creatorId) return res.status(400).json({ error: "creatorId is required" });

  const limitParam = parseInt(String(req.query.limit || "50"), 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const callerSnap = await db.collection("users").doc(decoded.uid).get();
    const caller = (callerSnap.data() as Record<string, unknown> | undefined) ?? undefined;
    if (!hasPlatformAdminAccess(caller)) {
      return res.status(403).json({ error: "Admin access required" });
    }

    let docs: QueryDocumentSnapshot[] = [];
    try {
      const snap = await db
        .collection("orders")
        .where("creatorId", "==", creatorId)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();
      docs = snap.docs;
    } catch (primaryErr: unknown) {
      console.warn(
        "adminDebugCreatorOrders: indexed query failed, using fallback:",
        primaryErr instanceof Error ? primaryErr.message : primaryErr
      );
      const cap = Math.min(limit * 3, 1000);
      const snap = await db.collection("orders").where("creatorId", "==", creatorId).limit(cap).get();
      docs = snap.docs.slice();
      docs.sort((a, b) => createdAtToMs(b.data().createdAt) - createdAtToMs(a.data().createdAt));
      docs = docs.slice(0, limit);
    }

    const orders = docs.map(toOrderRow);
    const countsByType: Record<string, number> = {};
    let tipsUsd = 0;
    let totalUsd = 0;
    for (const row of orders) {
      countsByType[row.type] = (countsByType[row.type] || 0) + 1;
      totalUsd += row.amountUsd;
      if (row.type === "tip") tipsUsd += row.amountUsd;
    }

    return res.status(200).json({
      creatorId,
      limit,
      rowCount: orders.length,
      countsByType,
      totals: {
        tipsUsd: Number(tipsUsd.toFixed(2)),
        totalUsd: Number(totalUsd.toFixed(2)),
      },
      orders,
    });
  } catch (e: unknown) {
    console.error("adminDebugCreatorOrders error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return res.status(500).json({ error: "Failed to load creator orders", message: msg.slice(0, 240) });
  }
}
