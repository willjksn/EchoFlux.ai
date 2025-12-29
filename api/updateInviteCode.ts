import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

/**
 * Update an invite code (admin only).
 * Allows extending expiration and changing the granted plan.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const db = getAdminDb();
    const adminDoc = await db.collection("users").doc(user.uid).get();
    const adminData = adminDoc.data();
    if (adminData?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

    const { code, grantPlan, expiresAt, maxUses } = (req.body || {}) as {
      code?: string;
      grantPlan?: "Free" | "Pro" | "Elite";
      expiresAt?: string | null;
      maxUses?: number;
    };

    if (!code || typeof code !== "string" || !code.trim()) return res.status(400).json({ error: "code is required" });
    const normalizedCode = code.trim().toUpperCase();

    const updates: any = {};

    if (grantPlan !== undefined) {
      if (grantPlan !== "Free" && grantPlan !== "Pro" && grantPlan !== "Elite") {
        return res.status(400).json({ error: "grantPlan must be 'Free', 'Pro' or 'Elite'" });
      }
      updates.grantPlan = grantPlan;
    }

    if (expiresAt !== undefined) {
      if (expiresAt === null || expiresAt === "") {
        updates.expiresAt = FieldValue.delete();
      } else if (typeof expiresAt === "string") {
        const d = new Date(expiresAt);
        if (!Number.isFinite(d.getTime())) return res.status(400).json({ error: "expiresAt must be a valid date" });
        updates.expiresAt = d.toISOString();
      } else {
        return res.status(400).json({ error: "expiresAt must be string|null" });
      }
    }

    if (maxUses !== undefined) {
      if (typeof maxUses !== "number" || maxUses < 1 || maxUses > 100) {
        return res.status(400).json({ error: "maxUses must be between 1 and 100" });
      }
      updates.maxUses = maxUses;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    const ref = db.collection("beta_invites").doc(normalizedCode);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Invite code not found" });

    await ref.set(updates, { merge: true });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Error updating invite code:", error);
    return res.status(500).json({ error: "Failed to update invite code", message: error?.message || "Unknown error" });
  }
}


