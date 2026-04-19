import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { isFanBlocked } from "./_fanDmHelpers.js";

function purchaseProductStubEnabled(): boolean {
  const v = (process.env.ALLOW_PURCHASE_PRODUCT_STUB || "").toString().toLowerCase().trim();
  return v === "true" || v === "1";
}

/**
 * Legacy stub: no Stripe — grants entitlements without payment.
 * Disabled by default; set ALLOW_PURCHASE_PRODUCT_STUB=true only for local/staging tests.
 * Production: use createFanCheckoutSession + Stripe webhooks.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!purchaseProductStubEnabled()) {
    return res.status(404).json({ error: "Not found" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const creatorId = body.creatorId as string;
  const productId = body.productId as string;
  if (!creatorId || !productId) {
    return res.status(400).json({ error: "creatorId and productId are required" });
  }

  const fanId = decoded.uid;

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    if (await isFanBlocked(db, creatorId, fanId)) {
      return res.status(403).json({ error: "You cannot purchase from this creator" });
    }

    // Verify product exists and belongs to creator
    const productSnap = await db.collection("products").doc(productId).get();
    if (!productSnap.exists) {
      return res.status(404).json({ error: "Product not found" });
    }
    const productData = productSnap.data() as { creatorId?: string };
    if (productData.creatorId !== creatorId) {
      return res.status(404).json({ error: "Product not found" });
    }

    const grantRef = db
      .collection("creatorEntitlements")
      .doc(creatorId)
      .collection("grants")
      .doc(fanId);

    const now = new Date().toISOString();
    const grantSnap = await grantRef.get();

    if (grantSnap.exists) {
      const data = grantSnap.data() as { unlockedProductIds?: string[] };
      const ids = Array.isArray(data?.unlockedProductIds) ? data.unlockedProductIds : [];
      if (ids.includes(productId)) {
        return res.status(200).json({ success: true, alreadyOwned: true });
      }
      await grantRef.update({
        unlockedProductIds: [...ids, productId],
        updatedAt: now,
      });
    } else {
      await grantRef.set({
        subscription: false,
        unlockedProductIds: [productId],
        updatedAt: now,
      });
    }

    return res.status(200).json({ success: true, alreadyOwned: false });
  } catch (e: unknown) {
    console.error("purchaseProduct error:", e);
    return res.status(500).json({
      error: "Failed to process purchase (stub)",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
}
