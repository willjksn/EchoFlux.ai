import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPlatformStripe, checkoutSessionsRetrieve } from "./_stripeConnect.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { processFanHubCheckoutSessionCompleted } from "./stripeWebhook.js";
import { enforceRateLimit } from "./_rateLimit.js";

const PLATFORM_OWNER_IDS = (process.env.PLATFORM_OWNER_CREATOR_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isCreatorPlatformOwner(
  creatorId: string,
  creatorData: {
    isPlatformOwner?: boolean;
    platformOwner?: boolean;
    role?: string;
  } | undefined,
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

function normalizedEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/**
 * POST: After returning from Stripe Checkout, apply the same Firestore updates as
 * `checkout.session.completed` when webhooks are slow or missing.
 * Body: { sessionId: string, creatorId: string }
 *
 * Idempotent: skips if an order with this stripeSessionId already exists.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const syncRlOk = await enforceRateLimit({
    req,
    res,
    keyPrefix: "syncFanCheckoutSession",
    limit: 20,
    windowMs: 60_000,
    identifier: decoded.uid,
  });
  if (!syncRlOk) return;

  const body = (req.body || {}) as { sessionId?: string; creatorId?: string };
  const sessionId = (body.sessionId || "").trim();
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
      return res.status(403).json({ error: "This checkout does not belong to this creator page." });
    }

    if (session.metadata?.guestCheckout === "true") {
      return res.status(400).json({
        error: "Guest checkouts use claimGuestPurchase after sign-in.",
        code: "USE_CLAIM_GUEST",
      });
    }

    const metaFanId = (session.metadata?.fanId || session.client_reference_id || "").trim();
    const sessionEmail =
      normalizedEmail(session.customer_details?.email) ||
      normalizedEmail(session.customer_email) ||
      normalizedEmail(session.metadata?.fanEmail);
    const decodedEmail = normalizedEmail(decoded.email);
    const sameCheckoutEmail = !!sessionEmail && !!decodedEmail && sessionEmail === decodedEmail;
    const fanIdMatches = !!metaFanId && metaFanId === decoded.uid;
    if (!metaFanId) {
      return res.status(403).json({
        error: "This purchase is not linked to your signed-in account.",
        code: "SESSION_FAN_MISSING",
      });
    }
    // Migration-safe path: allow sync when session email matches authenticated email,
    // then bind the checkout to the current UID so entitlement can be granted correctly.
    const effectiveSession =
      fanIdMatches || !sameCheckoutEmail
        ? session
        : ({
            ...session,
            client_reference_id: decoded.uid,
            metadata: {
              ...(session.metadata || {}),
              fanId: decoded.uid,
              fanEmail: sessionEmail || decodedEmail || "",
              originalFanId: metaFanId,
            },
          } as typeof session);
    if (!fanIdMatches && !sameCheckoutEmail) {
      return res.status(403).json({
        error: "This purchase is not linked to your signed-in account.",
        code: "SESSION_FAN_MISMATCH",
      });
    }

    const dup = await db.collection("orders").where("stripeSessionId", "==", session.id).limit(1).get();
    if (!dup.empty) {
      return res.status(200).json({ success: true, alreadySynced: true });
    }

    const applied = await processFanHubCheckoutSessionCompleted(db, effectiveSession, {
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
    console.error("syncFanCheckoutSession error:", e);
    const msg = e instanceof Error ? e.message : "Sync failed";
    return res.status(500).json({ error: "Failed to sync checkout", message: msg.slice(0, 240) });
  }
}
