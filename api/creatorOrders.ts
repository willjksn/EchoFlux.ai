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

function mapDocToOrder(docSnap: QueryDocumentSnapshot): CreatorOrder {
  const d = docSnap.data() as Record<string, unknown>;
  return {
    id: docSnap.id,
    creatorId: (d.creatorId as string) ?? "",
    fanId: (d.fanId as string) ?? "",
    productId: (d.productId as string) ?? null,
    type: (d.type as string) ?? "product",
    amountCents: (d.amountCents as number) ?? 0,
    status: (d.status as string) ?? "paid",
    createdAt: createdAtToIso(d.createdAt),
    productTitle: (d.productTitle as string) ?? (d.productId as string) ?? undefined,
    fanName: (d.fanName as string) ?? (d.tipHandle as string) ?? null,
    fanEmail: (d.fanEmail as string) ?? (d.fanId as string) ?? undefined,
    scheduleStatus: (d.scheduleStatus as string) || "pending",
    scheduledDate: (d.scheduledDate as string) ?? null,
    scheduledTime: (d.scheduledTime as string) ?? null,
  };
}

/**
 * GET: List orders for the authenticated creator (creatorId = uid).
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

  const creatorId = decoded.uid;
  const limitNum = Math.min(parseInt(String(req.query.limit || "100"), 10) || 100, 1000);

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const cap = Math.min(500, Math.max(limitNum, limitNum * 2));
    let docs: QueryDocumentSnapshot[] = [];

    try {
      const snap = await db
        .collection("orders")
        .where("creatorId", "==", creatorId)
        .orderBy("createdAt", "desc")
        .limit(limitNum)
        .get();
      docs = snap.docs;
    } catch (primaryErr: unknown) {
      console.warn(
        "creatorOrders: indexed query failed, using fallback (deploy firestore index creatorId+createdAt if possible):",
        primaryErr instanceof Error ? primaryErr.message : primaryErr
      );
      const snap = await db.collection("orders").where("creatorId", "==", creatorId).limit(cap).get();
      docs = snap.docs.slice();
      docs.sort((a, b) => {
        const ma = createdAtToMs(a.data().createdAt);
        const mb = createdAtToMs(b.data().createdAt);
        return mb - ma;
      });
      docs = docs.slice(0, limitNum);
    }

    const orders: CreatorOrder[] = docs.map((docSnap) => mapDocToOrder(docSnap));

    return res.status(200).json({ orders });
  } catch (e: unknown) {
    console.error("creatorOrders error:", e);
    const msg = e instanceof Error ? e.message : "Failed to load orders";
    return res.status(500).json({ error: "Failed to load orders", hint: msg.slice(0, 200) });
  }
}
