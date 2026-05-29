/**
 * POST: Creator grants a free store product to a member (no Stripe).
 * Mirrors paid product checkout: orders, entitlements, notifications, Purchases scheduling.
 *
 * Body: { fanId?, fanEmail?, productId, quantity?: number }
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { resolveFanHubMemberAuthUid } from "./_resolveFanHubMemberId.js";
import { grantFanHubStoreProductToFan } from "./_grantFanHubStoreProduct.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const rlOk = await enforceRateLimit({
    req,
    res,
    keyPrefix: "creatorGrantStoreProduct",
    limit: 30,
    windowMs: 60_000,
    identifier: decoded.uid,
  });
  if (!rlOk) return;

  const body = (req.body || {}) as {
    fanId?: string;
    fanEmail?: string;
    fanName?: string;
    productId?: string;
    quantity?: number;
  };

  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  if (!productId) {
    return res.status(400).json({ error: "productId is required", code: "MISSING_PRODUCT" });
  }

  const fanIdInput = typeof body.fanId === "string" ? body.fanId.trim() : "";
  const fanEmailInput = typeof body.fanEmail === "string" ? body.fanEmail.trim() : "";
  if (!fanIdInput && !fanEmailInput) {
    return res.status(400).json({ error: "fanId or fanEmail is required", code: "MISSING_MEMBER" });
  }

  const quantityRaw = body.quantity;
  const quantity =
    typeof quantityRaw === "number" && Number.isFinite(quantityRaw)
      ? Math.min(10, Math.max(1, Math.floor(quantityRaw)))
      : 1;

  try {
    const db = getAdminDb();
    if (!db) {
      return res.status(500).json({ error: "Database unavailable" });
    }

    const creatorId = decoded.uid;
    const resolved = await resolveFanHubMemberAuthUid(db, creatorId, {
      fanId: fanIdInput,
      fanEmail: fanEmailInput,
    });
    if (!resolved) {
      return res.status(404).json({
        error: "Could not find a member for that email or id.",
        code: "MEMBER_NOT_FOUND",
      });
    }

    const fanSnap = await db.collection("creators").doc(creatorId).collection("fans").doc(resolved.fanId).get();
    const fanDoc = fanSnap.data() as { displayName?: string; name?: string } | undefined;
    const fanNameBody = typeof body.fanName === "string" ? body.fanName.trim() : "";

    const result = await grantFanHubStoreProductToFan(db, {
      creatorId,
      fanId: resolved.fanId,
      fanEmail: resolved.email || fanEmailInput,
      fanName:
        fanNameBody ||
        (typeof fanDoc?.displayName === "string" && fanDoc.displayName.trim()) ||
        (typeof fanDoc?.name === "string" && fanDoc.name.trim()) ||
        "Member",
      productId,
      quantity,
      grantedByUid: decoded.uid,
    });

    return res.status(200).json({
      ok: true,
      message: `Granted ${result.quantity}× ${result.productTitle}.`,
      ...result,
      fanId: resolved.fanId,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Grant failed";
    const clientMsg = msg.slice(0, 240);
    if (/not found|does not belong|guest checkout|subscription products/i.test(clientMsg)) {
      return res.status(400).json({ error: clientMsg });
    }
    console.error("creatorGrantStoreProduct error:", e);
    return res.status(500).json({
      error: "Failed to grant store product",
      details: process.env.NODE_ENV === "development" ? clientMsg : undefined,
    });
  }
}
