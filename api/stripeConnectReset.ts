import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

const PLATFORM_OWNER_IDS = (process.env.PLATFORM_OWNER_CREATOR_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isCreatorPlatformOwner(
  creatorId: string,
  creatorData:
    | { isPlatformOwner?: boolean; platformOwner?: boolean; role?: string }
    | undefined,
): boolean {
  if (PLATFORM_OWNER_IDS.includes(creatorId)) return true;
  if (creatorData?.isPlatformOwner === true) return true;
  if (creatorData?.platformOwner === true) return true;
  if (typeof creatorData?.role === "string" && creatorData.role.toLowerCase().trim() === "owner") {
    return true;
  }
  return false;
}

/**
 * POST: Clear stored Stripe Connect account IDs for the authenticated creator so they can run onboarding again.
 * Use when the connected account was deleted in Stripe or you need a fresh Express account.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const creatorId = decoded.uid;

  try {
    const db = getAdminDb();
    const creatorRef = db.collection("creators").doc(creatorId);
    const snap = await creatorRef.get();
    if (!snap.exists) {
      return res.status(200).json({ ok: true, cleared: false });
    }

    const data = snap.data() as Record<string, unknown> | undefined;
    if (isCreatorPlatformOwner(creatorId, data)) {
      return res.status(400).json({ error: "Platform owners do not use stored Connect accounts." });
    }
    const hasAny =
      !!(data?.stripeConnectAccountId || data?.stripeAccountId || data?.connectedStripeAccountId) ||
      !!(data?.stripe && typeof data.stripe === "object" && (data.stripe as { connectAccountId?: string }).connectAccountId);

    if (!hasAny) {
      return res.status(200).json({ ok: true, cleared: false });
    }

    await creatorRef.update({
      stripeConnectAccountId: FieldValue.delete(),
      stripeAccountId: FieldValue.delete(),
      connectedStripeAccountId: FieldValue.delete(),
      "stripe.connectAccountId": FieldValue.delete(),
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({ ok: true, cleared: true });
  } catch (e: unknown) {
    console.error("stripeConnectReset error:", e);
    const msg = e instanceof Error ? e.message : "Reset failed";
    return res.status(500).json({ error: "Reset failed", message: msg });
  }
}
