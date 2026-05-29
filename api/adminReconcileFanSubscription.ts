/**
 * POST: Platform admin — repair Fan Hub paid membership from Stripe for a fan by email.
 * Body: { fanEmail, creatorId? , stripeConnectAccountId?, stripeSubscriptionId? }
 *
 * Use when checkout failed then succeeded (canceled first sub overwrote Firestore) and the fan cannot log in.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminApp, getAdminDb } from "./_firebaseAdmin.js";
import { hasPlatformAdminAccess } from "./_platformAdminAccess.js";
import { verifyAuth } from "./verifyAuth.js";
import {
  findCreatorIdByStripeConnectAccount,
  reconcileFanHubPaidSubscriptionFromStripe,
} from "./_fanHubSubscriptionLifecycle.js";

function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

async function fanUidFromEmail(email: string): Promise<string | null> {
  const clean = normalizeEmail(email);
  if (!clean) return null;
  try {
    return (await getAdminApp().auth().getUserByEmail(clean)).uid || null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const db = getAdminDb();
    if (!db) {
      return res.status(500).json({ error: "Database unavailable" });
    }

    const adminSnap = await db.collection("users").doc(decoded.uid).get();
    if (!hasPlatformAdminAccess(adminSnap.data() as Record<string, unknown> | undefined)) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const body = (req.body || {}) as {
      fanEmail?: unknown;
      creatorId?: unknown;
      stripeConnectAccountId?: unknown;
      stripeSubscriptionId?: unknown;
    };

    const fanEmail = normalizeEmail(body.fanEmail);
    if (!fanEmail) {
      return res.status(400).json({ error: "fanEmail is required" });
    }

    let creatorId = typeof body.creatorId === "string" ? body.creatorId.trim() : "";
    const connectAcct =
      typeof body.stripeConnectAccountId === "string" ? body.stripeConnectAccountId.trim() : "";
    if (!creatorId && connectAcct) {
      creatorId = (await findCreatorIdByStripeConnectAccount(db, connectAcct)) || "";
    }
    if (!creatorId) {
      return res.status(400).json({
        error: "creatorId or stripeConnectAccountId (succeeded Connect account) is required",
      });
    }

    const fanId = await fanUidFromEmail(fanEmail);
    if (!fanId) {
      return res.status(404).json({ error: `No Firebase user for ${fanEmail}` });
    }

    let preferSubscriptionId =
      typeof body.stripeSubscriptionId === "string" ? body.stripeSubscriptionId.trim() : "";
    if (preferSubscriptionId.startsWith("acct_")) {
      return res.status(400).json({
        error:
          "stripeSubscriptionId must be a sub_ id from Stripe (Subscriptions tab), not an acct_ Connect account id",
        hint: "Use stripeConnectAccountId for the succeeded acct_… value instead.",
      });
    }

    const result = await reconcileFanHubPaidSubscriptionFromStripe(db, creatorId, fanId, {
      fanEmail,
      ...(preferSubscriptionId ? { preferSubscriptionId } : {}),
    });

    return res.status(200).json({
      fanEmail,
      fanId,
      creatorId,
      ...result,
    });
  } catch (e: unknown) {
    console.error("adminReconcileFanSubscription error:", e);
    const msg = e instanceof Error ? e.message : "Reconcile failed";
    return res.status(500).json({ error: "Failed to reconcile subscription", message: msg.slice(0, 240) });
  }
}
