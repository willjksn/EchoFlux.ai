import type { VercelRequest, VercelResponse } from "@vercel/node";
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
};

/**
 * GET: List orders for the authenticated creator (creatorId = uid).
 * Query: limit (default 100), status (optional filter).
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
  const limitNum = Math.min(parseInt(String(req.query.limit || "100"), 10) || 100, 500);

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const snap = await db
      .collection("orders")
      .where("creatorId", "==", creatorId)
      .orderBy("createdAt", "desc")
      .limit(limitNum)
      .get();
    const orders: CreatorOrder[] = snap.docs.map((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;
      const createdAt = d.createdAt;
      let createdAtIso: string;
      if (createdAt && typeof (createdAt as { toDate?: () => Date }).toDate === "function") {
        createdAtIso = (createdAt as { toDate: () => Date }).toDate().toISOString();
      } else if (createdAt instanceof Date) {
        createdAtIso = createdAt.toISOString();
      } else {
        createdAtIso = new Date().toISOString();
      }
      return {
        id: docSnap.id,
        creatorId: (d.creatorId as string) ?? "",
        fanId: (d.fanId as string) ?? "",
        productId: (d.productId as string) ?? null,
        type: (d.type as string) ?? "product",
        amountCents: (d.amountCents as number) ?? 0,
        status: (d.status as string) ?? "paid",
        createdAt: createdAtIso,
        productTitle: (d.productTitle as string) ?? (d.productId as string) ?? undefined,
        fanName: (d.fanName as string) ?? (d.tipHandle as string) ?? null,
        fanEmail: (d.fanEmail as string) ?? (d.fanId as string) ?? undefined,
      };
    });

    return res.status(200).json({ orders });
  } catch (e: unknown) {
    console.error("creatorOrders error:", e);
    return res.status(500).json({ error: "Failed to load orders" });
  }
}
