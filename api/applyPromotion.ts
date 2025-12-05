import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { promotionId, plan, originalPrice, discountedPrice, discountAmount, expiresAt } = req.body || {};

  if (!promotionId || !plan || originalPrice === undefined || discountedPrice === undefined) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const db = getAdminDb();
    
    // Record promotion usage
    const usageData = {
      promotionId,
      userId: user.uid,
      userEmail: user.email || "",
      plan,
      originalPrice,
      discountedPrice,
      discountAmount,
      usedAt: new Date().toISOString(),
      expiresAt: expiresAt || null,
    };

    await db.collection("promotion_usages").add(usageData);

    // Increment promotion usage count
    const promotionRef = db.collection("promotions").doc(promotionId);
    await promotionRef.update({
      currentUses: FieldValue.increment(1),
    });

    return res.status(200).json({
      success: true,
      message: "Promotion applied successfully",
    });
  } catch (error: any) {
    console.error("Error applying promotion:", error);
    return res.status(500).json({
      error: "Failed to apply promotion",
      details: error.message,
    });
  }
}

