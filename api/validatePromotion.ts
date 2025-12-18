import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

interface Promotion {
  id: string;
  code: string;
  name: string;
  type: "percentage" | "fixed" | "free";
  discountValue: number;
  startDate: string | Date;
  endDate?: string | Date | null;
  isActive: boolean;
  applicablePlans?: string[];
  maxUses?: number;
  currentUses?: number;
  maxUsesPerUser?: number;
  freeDays?: number;
  discountDurationDays?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { code, plan, price } = req.body || {};

  if (!code || !plan || price === undefined) {
    return res.status(400).json({ error: "Missing required fields: code, plan, price" });
  }

  try {
    const db = getAdminDb();
    const promotionsRef = db.collection("promotions");
    
    // Find active promotion by code
    const promoQuery = promotionsRef
      .where("code", "==", code.toUpperCase().trim())
      .where("isActive", "==", true);
    
    const promoSnapshot = await promoQuery.get();

    if (promoSnapshot.empty) {
      return res.status(404).json({ error: "Promotion code not found or inactive" });
    }

    const promotionData = promoSnapshot.docs[0].data();
    const promotion: Promotion = {
      id: promoSnapshot.docs[0].id,
      code: promotionData.code || "",
      name: promotionData.name || "",
      type: promotionData.type || "percentage",
      discountValue: promotionData.discountValue || 0,
      startDate: promotionData.startDate || new Date(),
      endDate: promotionData.endDate || null,
      isActive: promotionData.isActive !== false,
      applicablePlans: promotionData.applicablePlans || [],
      maxUses: promotionData.maxUses,
      currentUses: promotionData.currentUses || 0,
      maxUsesPerUser: promotionData.maxUsesPerUser || 1,
      freeDays: promotionData.freeDays,
      discountDurationDays: promotionData.discountDurationDays,
    };

    // Check if promotion is within date range
    const now = new Date();
    const startDate = new Date(promotion.startDate);
    const endDate = promotion.endDate ? new Date(promotion.endDate) : null;

    if (now < startDate) {
      return res.status(400).json({ error: "Promotion has not started yet" });
    }

    if (endDate && now > endDate) {
      return res.status(400).json({ error: "Promotion has expired" });
    }

    // Check if promotion applies to this plan
    if (promotion.applicablePlans && promotion.applicablePlans.length > 0) {
      if (!promotion.applicablePlans.includes(plan)) {
        return res.status(400).json({ error: "Promotion does not apply to this plan" });
      }
    }

    // Check max uses
    if (promotion.maxUses && (promotion.currentUses || 0) >= promotion.maxUses) {
      return res.status(400).json({ error: "Promotion has reached maximum uses" });
    }

    // Check user's previous uses
    const maxUsesPerUser = promotion.maxUsesPerUser || 1;
    const userUsagesRef = db.collection("promotion_usages");
    const userUsagesQuery = userUsagesRef
      .where("promotionId", "==", promotion.id)
      .where("userId", "==", user.uid);
    
    const userUsagesSnapshot = await userUsagesQuery.get();
    
    if (userUsagesSnapshot.size >= maxUsesPerUser) {
      return res.status(400).json({ error: `You have already used this promotion ${maxUsesPerUser} time(s)` });
    }

    // Calculate discount
    let discountedPrice = price;
    let discountAmount = 0;
    let expiresAt: string | undefined;

    if (promotion.type === "percentage") {
      discountAmount = (price * promotion.discountValue) / 100;
      discountedPrice = price - discountAmount;
    } else if (promotion.type === "fixed") {
      discountAmount = promotion.discountValue;
      discountedPrice = Math.max(0, price - discountAmount);
    } else if (promotion.type === "free") {
      discountAmount = price;
      discountedPrice = 0;
      // Set expiration date for free days
      if (promotion.freeDays) {
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + promotion.freeDays);
        expiresAt = expirationDate.toISOString();
      }
    }

    // Set expiration for discount duration (for recurring subscriptions)
    if (promotion.discountDurationDays && promotion.type !== "free") {
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + promotion.discountDurationDays);
      expiresAt = expirationDate.toISOString();
    }

    return res.status(200).json({
      valid: true,
      promotion: {
        id: promotion.id,
        code: promotion.code,
        name: promotion.name,
        type: promotion.type,
      },
      originalPrice: price,
      discountedPrice: Math.round(discountedPrice * 100) / 100,
      discountAmount: Math.round(discountAmount * 100) / 100,
      expiresAt,
      freeDays: promotion.freeDays,
      discountDurationDays: promotion.discountDurationDays,
    });
  } catch (error: any) {
    console.error("Error validating promotion:", error);
    return res.status(500).json({
      error: "Failed to validate promotion",
      details: error.message,
    });
  }
}

