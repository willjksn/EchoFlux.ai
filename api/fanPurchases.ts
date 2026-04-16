import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

type FanPurchaseType = "product" | "post_unlock" | "unlock" | "tip" | "subscription";

type FanPurchase = {
  id: string;
  creatorId: string;
  fanId: string;
  fanEmail?: string;
  type: FanPurchaseType;
  productId: string | null;
  /** Feed post id for `post_unlock` orders (Stripe checkout). */
  postId?: string | null;
  productTitle?: string;
  amountCents: number;
  status: string;
  createdAt: string;
  deliveryStatus?: "pending" | "delivered";
  deliveryType?: "video" | "image" | "audio" | "text" | "link" | null;
  deliveryText?: string | null;
  deliveryUrl?: string | null;
  deliveredAt?: string | null;
};

function normalizePurchaseType(d: Record<string, unknown>): FanPurchaseType {
  const rawType = typeof d.type === "string" ? d.type.trim().toLowerCase() : "";
  const rawProductType = typeof d.productType === "string" ? d.productType.trim().toLowerCase() : "";
  if (rawType === "tip" || rawProductType === "tip") return "tip";
  if (rawType === "subscription" || rawProductType === "subscription") return "subscription";
  if (typeof d.tipHandle === "string" && d.tipHandle.trim()) return "tip";
  if (rawType === "post_unlock" || rawProductType === "post_unlock") return "post_unlock";
  if (rawType === "unlock" || rawProductType === "unlock") return "unlock";
  return "product";
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

function mapDocToPurchase(id: string, d: Record<string, unknown>): FanPurchase {
  const normalizedType = normalizePurchaseType(d);
  const createdMs = createdAtToMs(d.createdAt);
  const isNonDeliverable = normalizedType === "tip" || normalizedType === "subscription";
  const deliveryStatus = isNonDeliverable ? undefined : (d.deliveryStatus === "delivered" ? "delivered" : "pending");
  const postIdRaw = typeof d.postId === "string" ? d.postId.trim() : "";
  return {
    id,
    creatorId: String(d.creatorId || ""),
    fanId: String(d.fanId || ""),
    fanEmail: typeof d.fanEmail === "string" ? d.fanEmail.trim().toLowerCase() : undefined,
    type: normalizedType,
    productId: typeof d.productId === "string" ? d.productId : null,
    postId: postIdRaw || null,
    productTitle: typeof d.productTitle === "string" ? d.productTitle : undefined,
    amountCents: Number.isFinite(Number(d.amountCents)) ? Math.max(0, Math.round(Number(d.amountCents))) : 0,
    status: typeof d.status === "string" ? d.status : "paid",
    createdAt: createdMs > 0 ? new Date(createdMs).toISOString() : new Date(0).toISOString(),
    deliveryStatus,
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
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) return res.status(401).json({ error: "Unauthorized" });

  const creatorId = String(req.query.creatorId || "").trim();
  if (!creatorId) return res.status(400).json({ error: "creatorId is required" });

  const db = getAdminDb();
  if (!db) return res.status(500).json({ error: "Database unavailable" });

  try {
    const authUid = decoded.uid;
    const email = typeof decoded.email === "string" ? decoded.email.trim().toLowerCase() : "";
    const limitNum = Math.min(Math.max(parseInt(String(req.query.limit || "80"), 10) || 80, 10), 1000);
    const docsById = new Map<string, FanPurchase>();

    const byFanIdPromise = db
      .collection("orders")
      .where("creatorId", "==", creatorId)
      .where("fanId", "==", authUid)
      .limit(limitNum)
      .get();

    const byEmailPromise = email
      ? db
          .collection("orders")
          .where("creatorId", "==", creatorId)
          .where("fanEmail", "==", email)
          .limit(limitNum)
          .get()
      : Promise.resolve(null);

    const [byFanIdSnap, byEmailSnap] = await Promise.all([byFanIdPromise, byEmailPromise]);

    byFanIdSnap.docs.forEach((docSnap) => {
      const mapped = mapDocToPurchase(docSnap.id, docSnap.data() as Record<string, unknown>);
      docsById.set(docSnap.id, mapped);
    });

    if (byEmailSnap) {
      byEmailSnap.docs.forEach((docSnap) => {
        const mapped = mapDocToPurchase(docSnap.id, docSnap.data() as Record<string, unknown>);
        docsById.set(docSnap.id, mapped);
      });
    }

    const purchases = Array.from(docsById.values())
      .filter((o) => o.status !== "refunded")
      .filter((o) => o.type === "product" || o.type === "post_unlock" || o.type === "unlock" || o.type === "subscription" || o.type === "tip")
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limitNum);

    return res.status(200).json({ purchases });
  } catch (e: unknown) {
    console.error("fanPurchases error:", e);
    return res.status(500).json({ error: "Failed to load purchases" });
  }
}

