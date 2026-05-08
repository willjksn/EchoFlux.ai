import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPlatformStripe, checkoutSessionsRetrieve } from "./_stripeConnect.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { processFanHubCheckoutSessionCompleted } from "./stripeWebhook.js";

const PLATFORM_OWNER_IDS = (process.env.PLATFORM_OWNER_CREATOR_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isCreatorPlatformOwner(
  creatorId: string,
  creatorData:
    | {
        isPlatformOwner?: boolean;
        platformOwner?: boolean;
        role?: string;
      }
    | undefined,
): boolean {
  if (PLATFORM_OWNER_IDS.includes(creatorId)) return true;
  if (creatorData?.isPlatformOwner === true) return true;
  if (creatorData?.platformOwner === true) return true;
  if (typeof creatorData?.role === "string") {
    const role = creatorData.role.toLowerCase().trim();
    if (role === "owner" || role === "admin" || role === "platform_owner") return true;
  }
  return false;
}

/**
 * Public fallback sync for fan checkout returns (mostly logged-out landing tips).
 * Idempotent and Stripe-verified via session lookup + metadata checks.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = (req.body || {}) as { sessionId?: string; session_id?: string; creatorId?: string };
  const sessionId = (body.sessionId || body.session_id || "").trim();
  const creatorId = (body.creatorId || "").trim();
  if (!sessionId || !creatorId) {
    return res.status(400).json({ error: "sessionId and creatorId are required" });
  }

  const stripe = getPlatformStripe();
  if (!stripe) {
    return res.status(503).json({ error: "Stripe is not configured" });
  }

  try {
    const db = getAdminDb();
    if (!db) {
      return res.status(500).json({ error: "Database unavailable" });
    }

    const creatorSnap = await db.collection("creators").doc(creatorId).get();
    const creatorData = creatorSnap.data() as
      | {
          stripeConnectAccountId?: string;
          stripeAccountId?: string;
          connectedStripeAccountId?: string;
          stripe?: { connectAccountId?: string };
          isPlatformOwner?: boolean;
          platformOwner?: boolean;
          role?: string;
        }
      | undefined;
    const creatorUserSnap = await db.collection("users").doc(creatorId).get();
    const creatorUserData = creatorUserSnap.data() as
      | { isPlatformOwner?: boolean; platformOwner?: boolean; role?: string }
      | undefined;

    const ownerDetectionData = {
      isPlatformOwner:
        creatorData?.isPlatformOwner === true || creatorUserData?.isPlatformOwner === true,
      platformOwner:
        creatorData?.platformOwner === true || creatorUserData?.platformOwner === true,
      role: creatorData?.role || creatorUserData?.role,
    };
    const isPlatformOwner = isCreatorPlatformOwner(creatorId, ownerDetectionData);
    const connectAccountId =
      creatorData?.stripeConnectAccountId ||
      creatorData?.stripeAccountId ||
      creatorData?.connectedStripeAccountId ||
      creatorData?.stripe?.connectAccountId ||
      null;

    const primaryAcct = isPlatformOwner ? null : connectAccountId;
    const fallbackAcct = isPlatformOwner ? connectAccountId : null;
    const retrieveOrder: (string | null)[] =
      primaryAcct === fallbackAcct ? [primaryAcct] : [primaryAcct, fallbackAcct];

    let session: Awaited<ReturnType<typeof checkoutSessionsRetrieve>> | null = null;
    let resolvedStripeAccount: string | null = null;
    let lastErr: unknown;
    for (const acct of retrieveOrder) {
      try {
        session = await checkoutSessionsRetrieve(stripe, sessionId, acct);
        resolvedStripeAccount = acct;
        lastErr = undefined;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!session) {
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    }

    const paid =
      session.status === "complete" ||
      session.payment_status === "paid" ||
      session.payment_status === "no_payment_required";
    if (!paid) {
      return res.status(409).json({
        error: "Checkout not complete yet",
        code: "CHECKOUT_NOT_COMPLETE",
        status: session.status,
        payment_status: session.payment_status,
      });
    }

    if ((session.metadata?.creatorId || "").trim() !== creatorId) {
      return res.status(403).json({ error: "Session does not belong to this creator." });
    }

    const dup = await db.collection("orders").where("stripeSessionId", "==", session.id).limit(1).get();
    if (!dup.empty) {
      return res.status(200).json({ success: true, alreadySynced: true });
    }

    const applied = await processFanHubCheckoutSessionCompleted(db, session, {
      stripe,
      stripeAccount: resolvedStripeAccount,
    });
    if (!applied) {
      return res.status(400).json({
        error: "Could not apply this checkout (unsupported type or missing session data).",
        code: "SYNC_NOT_APPLICABLE",
      });
    }

    return res.status(200).json({ success: true, synced: true });
  } catch (e: unknown) {
    console.error("syncFanCheckoutSessionPublic error:", e);
    const msg = e instanceof Error ? e.message : "Sync failed";
    return res.status(500).json({ error: "Failed to sync checkout", message: msg.slice(0, 240) });
  }
}
