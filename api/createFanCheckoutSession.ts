import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import Stripe from "stripe";
import { getPlatformStripe, checkoutSessionsCreate } from "./_stripeConnect.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { isFanBlocked } from "./_fanDmHelpers.js";

const DEFAULT_SUBSCRIPTION_CENTS = 999; // $9.99
const PLATFORM_FEE_PERCENT = 0.10; // 10% platform fee on all fan payments

// Platform owner creator IDs - payments go directly to EchoFlux, no Connect needed, no fee
// Set via PLATFORM_OWNER_CREATOR_IDS env var (comma-separated)
const PLATFORM_OWNER_IDS = (process.env.PLATFORM_OWNER_CREATOR_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
const STRIPE_USE_TEST_MODE =
  (process.env.STRIPE_USE_TEST_MODE || "").toString().toLowerCase().trim() === "true" ||
  (process.env.STRIPE_USE_TEST_MODE || "").toString().toLowerCase().trim() === "1";

function isReconnectableConnectError(err: unknown): boolean {
  const e = err as { code?: string; type?: string; message?: string };
  const msg = (e?.message || "").toLowerCase();
  return (
    e?.code === "resource_missing" ||
    e?.type === "StripePermissionError" ||
    msg.includes("no such account") ||
    msg.includes("does not have access to account") ||
    msg.includes("this key cannot access account") ||
    msg.includes("cannot access the connected account")
  );
}

function toSafeCheckoutUrl(
  input: string | undefined,
  fallback: string,
  allowLocalHttp: boolean
): string {
  const sanitize = (candidate: string | undefined): string | null => {
    if (!candidate || typeof candidate !== "string") return null;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
      const host = parsed.hostname.toLowerCase();
      const isLocalHost =
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        host.endsWith(".local");
      if (isLocalHost && !allowLocalHttp) return null;
      if (parsed.protocol === "http:" && !isLocalHost) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  };
  const direct = sanitize(input);
  if (direct) return direct;
  const safeFallback = sanitize(fallback);
  if (safeFallback) return safeFallback;
  return "https://echoflux.ai/";
}

function isCreatorPlatformOwner(
  creatorId: string,
  creatorData: {
    isPlatformOwner?: boolean;
    platformOwner?: boolean;
    role?: string;
  } | undefined
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
 * POST: Create Stripe Checkout Session for fan→creator payment (subscription, product, or tip).
 * 
 * For regular creators: Funds go to creator's Connect account with 10% platform fee.
 * For platform owners (e.g., Stormij): Funds go directly to EchoFlux, no Connect account needed.
 * 
 * Body: { creatorId, type: 'subscription' | 'product' | 'tip' | 'post_unlock', productId?, postId?, subscriptionPriceCents?, amountCents?, tipHandle?, successUrl?, cancelUrl?, guestProduct?: boolean }
 * guestProduct: true → guest store checkout without Firebase auth; Stripe collects email; webhook uses guest_${stripeCustomerId}.
 * 
 * Tips can be made without authentication (anonymous tippers).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const stripe = getPlatformStripe();
  if (!stripe) {
    const useTest =
      (process.env.STRIPE_USE_TEST_MODE || "").toString().toLowerCase().trim() === "true" ||
      (process.env.STRIPE_USE_TEST_MODE || "").toString().toLowerCase().trim() === "1";
    return res.status(503).json({
      error: "Stripe is not configured",
      code: "STRIPE_NOT_CONFIGURED",
      hint: useTest
        ? "Test mode requires sk_test_ in STRIPE_SECRET_KEY_Test / STRIPE_SECRET_KEY_TEST (or STRIPE_SECRET_KEY). Key/mode mismatch is rejected."
        : "Live mode requires sk_live_ in STRIPE_SECRET_KEY_LIVE (or STRIPE_SECRET_KEY). Key/mode mismatch is rejected.",
    });
  }

  const body = (req.body || {}) as {
    creatorId?: string;
    type?: "subscription" | "product" | "tip" | "post_unlock";
    productId?: string;
    postId?: string;
    subscriptionPriceCents?: number;
    amountCents?: number;
    tipHandle?: string;
    successUrl?: string;
    cancelUrl?: string;
    guestProduct?: boolean;
  };

  const creatorId = typeof body.creatorId === "string" ? body.creatorId.trim() : "";
  const { type, productId, postId, subscriptionPriceCents, amountCents, tipHandle, successUrl, cancelUrl, guestProduct } = body;
  if (!creatorId || !type) {
    return res.status(400).json({ error: "creatorId and type are required" });
  }
  if (type !== "subscription" && type !== "product" && type !== "tip" && type !== "post_unlock") {
    return res.status(400).json({ error: "type must be 'subscription', 'product', 'tip', or 'post_unlock'" });
  }
  if (type === "product" && !productId) {
    return res.status(400).json({ error: "productId is required for product checkout" });
  }
  if (type === "post_unlock" && !postId) {
    return res.status(400).json({ error: "postId is required for post unlock checkout" });
  }
  if (type === "tip" && (!amountCents || amountCents < 100)) {
    return res.status(400).json({ error: "amountCents must be at least 100 ($1) for tips" });
  }

  const allowGuestProduct = type === "product" && guestProduct === true;

  // Tips can be anonymous; guest store checkout has no Firebase user (Stripe collects email).
  const decoded = await verifyAuth(req);
  const fanId = decoded?.uid || `anon_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  if (type !== "tip" && !decoded?.uid && !allowGuestProduct) {
    return res.status(401).json({ error: "Unauthorized - please sign in" });
  }
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL || "https://echoflux.ai";
  const requestOrigin = String(req.headers.origin || req.headers.referer || "").replace(/\/$/, "");
  const origin = toSafeCheckoutUrl(requestOrigin, configuredAppUrl, STRIPE_USE_TEST_MODE).replace(/\/$/, "");
  const defaultSuccess = `${origin}/?payment=success`;
  const defaultCancel = `${origin}/`;
  const safeSuccessUrl = toSafeCheckoutUrl(successUrl, defaultSuccess, STRIPE_USE_TEST_MODE);
  const safeCancelUrl = toSafeCheckoutUrl(cancelUrl, defaultCancel, STRIPE_USE_TEST_MODE);

  try {
    let db: ReturnType<typeof getAdminDb>;
    try {
      db = getAdminDb();
    } catch (dbErr: unknown) {
      const dbMsg = dbErr instanceof Error ? dbErr.message : "Database unavailable";
      return res.status(503).json({ error: "Database unavailable", message: dbMsg });
    }

    if (decoded?.uid && (await isFanBlocked(db, creatorId, decoded.uid))) {
      return res.status(403).json({ error: "You cannot purchase from this creator" });
    }

    const fanEmail = typeof decoded?.email === "string" ? decoded.email.trim().toLowerCase() : "";
    const creatorSnap = await db.collection("creators").doc(creatorId).get();
    const creatorData = creatorSnap.data() as {
      stripeConnectAccountId?: string;
      stripeAccountId?: string;
      connectedStripeAccountId?: string;
      stripe?: { connectAccountId?: string };
      displayName?: string;
      handle?: string;
      publicTreatsOnLanding?: boolean;
      isPlatformOwner?: boolean;
      platformOwner?: boolean;
      role?: string;
    } | undefined;
    const creatorUserSnap = await db.collection("users").doc(creatorId).get();
    const creatorUserData = creatorUserSnap.data() as {
      displayName?: string;
      handle?: string;
      isPlatformOwner?: boolean;
      platformOwner?: boolean;
      role?: string;
      publicTreatsOnLanding?: boolean;
    } | undefined;
    const ownerDetectionData = {
      isPlatformOwner:
        creatorData?.isPlatformOwner === true || creatorUserData?.isPlatformOwner === true,
      platformOwner:
        creatorData?.platformOwner === true || creatorUserData?.platformOwner === true,
      role: creatorData?.role || creatorUserData?.role,
    };

    if (allowGuestProduct) {
      if (!(creatorData?.publicTreatsOnLanding === true || creatorUserData?.publicTreatsOnLanding === true)) {
        return res.status(403).json({ error: "Store purchases are not available for guest checkout on this page" });
      }
    }
    
    // Check if this is a platform owner (e.g., Stormij) - payments go directly to EchoFlux
    const isPlatformOwner = isCreatorPlatformOwner(creatorId, ownerDetectionData);
    
    // For regular creators, require Stripe Connect; for platform owners, skip it
    const connectAccountId =
      creatorData?.stripeConnectAccountId ||
      creatorData?.stripeAccountId ||
      creatorData?.connectedStripeAccountId ||
      creatorData?.stripe?.connectAccountId ||
      null;
    if (!isPlatformOwner && !connectAccountId) {
      return res.status(400).json({ error: "Creator has not connected Stripe" });
    }
    // Backfill canonical field if we discovered a legacy key.
    if (!isPlatformOwner && connectAccountId && creatorData?.stripeConnectAccountId !== connectAccountId) {
      await db.collection("creators").doc(creatorId).set(
        { stripeConnectAccountId: connectAccountId, updatedAt: new Date().toISOString() },
        { merge: true },
      );
    }

    if (!isPlatformOwner && connectAccountId) {
      try {
        const account = await stripe.accounts.retrieve(connectAccountId);
        if (!account.charges_enabled) {
          return res.status(400).json({ error: "Creator cannot accept payments yet" });
        }
      } catch (e) {
        if (isReconnectableConnectError(e)) {
          return res.status(400).json({
            error: "Creator Stripe connection needs to be refreshed",
            code: "CREATOR_STRIPE_RECONNECT_REQUIRED",
            reconnectRequired: true,
            message:
              "This creator's Stripe account is unavailable for the current Stripe mode. Ask the creator to reconnect Stripe in Fan Hub > Payouts.",
          });
        }
        throw e;
      }
    }

    // For platform owners: create session on platform (no Stripe-Account header).
    // For regular creators: act as connected account. Never pass `{}` as 2nd arg — stripe-node rejects it.
    const connectIdForCheckout = isPlatformOwner ? null : connectAccountId;
    const displayName =
      creatorData?.displayName ||
      creatorData?.handle ||
      creatorUserData?.displayName ||
      creatorUserData?.handle ||
      "Creator";

    // ==================== SUBSCRIPTION ====================
    if (type === "subscription") {
      const subAmountCents = Math.max(100, Number(subscriptionPriceCents) || DEFAULT_SUBSCRIPTION_CENTS);
      
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Subscribe to ${displayName}`,
                description: `Monthly subscription to ${displayName}`,
              },
              unit_amount: subAmountCents,
              recurring: { interval: "month" },
            },
            quantity: 1,
          },
        ],
        success_url: safeSuccessUrl,
        cancel_url: safeCancelUrl,
        client_reference_id: fanId,
        metadata: {
          creatorId,
          fanId,
          ...(fanEmail ? { fanEmail } : {}),
          type: "subscription",
          isPlatformOwner: isPlatformOwner ? "true" : "false",
        },
        subscription_data: {
          metadata: {
            creatorId,
            fanId,
            ...(fanEmail ? { fanEmail } : {}),
            type: "subscription",
          },
          // Only add application_fee_percent for regular creators (not platform owners)
          ...(isPlatformOwner ? {} : { application_fee_percent: Math.round(PLATFORM_FEE_PERCENT * 100) }),
        },
      };
      const session = await checkoutSessionsCreate(stripe, sessionParams, connectIdForCheckout);
      return res.status(200).json({ url: session.url, sessionId: session.id });
    }

    // ==================== STORE PRODUCT ====================
    if (type === "product") {
      const productSnap = await db.collection("products").doc(productId!).get();
      if (!productSnap.exists) {
        return res.status(404).json({ error: "Product not found" });
      }
      const product = productSnap.data() as {
        creatorId?: string;
        title?: string;
        priceCents?: number;
        archived?: boolean;
        visible?: boolean;
        showOnLandingPage?: boolean;
        showInMemberStore?: boolean;
      };
      if (product.creatorId !== creatorId || product.archived) {
        return res.status(404).json({ error: "Product not found" });
      }
      if (product.visible === false) {
        return res.status(404).json({ error: "Product not found" });
      }
      if (allowGuestProduct && product.showOnLandingPage === false) {
        return res.status(404).json({ error: "Product not found" });
      }
      if (!allowGuestProduct && decoded?.uid && product.showInMemberStore === false) {
        return res.status(400).json({ error: "This product is not available in the member store" });
      }
      const priceCents = Math.max(50, Number(product.priceCents) || 0);
      const title = product.title || "Product";
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: title,
                metadata: { creatorId, productId: productId!, guestProduct: allowGuestProduct ? "true" : "false" },
              },
              unit_amount: priceCents,
            },
            quantity: 1,
          },
        ],
        success_url: safeSuccessUrl,
        cancel_url: safeCancelUrl,
        client_reference_id: allowGuestProduct ? `landing_${Date.now()}_${Math.random().toString(36).slice(2, 9)}` : fanId,
        metadata: {
          creatorId,
          fanId: allowGuestProduct ? "guest_pending" : fanId,
          type: "product",
          productId: productId!,
          productTitle: title,
          isPlatformOwner: isPlatformOwner ? "true" : "false",
          ...(allowGuestProduct ? { guestCheckout: "true", entry: "landing_treats" } : {}),
        },
        ...(allowGuestProduct
          ? {
              customer_creation: "always",
            }
          : {}),
        // Only add application_fee_amount for regular creators (not platform owners)
        ...(isPlatformOwner ? {} : {
          payment_intent_data: {
            application_fee_amount: Math.round(priceCents * PLATFORM_FEE_PERCENT),
          },
        }),
      };
      const session = await checkoutSessionsCreate(stripe, sessionParams, connectIdForCheckout);
      return res.status(200).json({ url: session.url, sessionId: session.id });
    }

    // ==================== FEED POST UNLOCK (PPV) ====================
    if (type === "post_unlock") {
      const postIdStr = String(postId!).trim();
      if (!postIdStr) {
        return res.status(400).json({ error: "postId is required for post unlock checkout" });
      }

      const postRefs = [
        db.collection("creators").doc(creatorId).collection("fanPosts").doc(postIdStr),
        db.collection("creators").doc(creatorId).collection("posts").doc(postIdStr),
        db.collection("users").doc(creatorId).collection("posts").doc(postIdStr),
      ];
      let postSnap: DocumentSnapshot | null = null;
      for (const ref of postRefs) {
        const snap = await ref.get();
        if (snap.exists) {
          postSnap = snap;
          break;
        }
      }
      if (!postSnap?.exists) {
        return res.status(404).json({ error: "Post not found" });
      }
      const pdata = postSnap.data() as Record<string, unknown>;
      const status = (pdata.status as string) || "published";
      if (status === "draft") {
        return res.status(404).json({ error: "Post not found" });
      }
      const lcRaw = pdata.lockedContent;
      if (!lcRaw || typeof lcRaw !== "object") {
        return res.status(400).json({ error: "This post is not available for purchase" });
      }
      const lc = lcRaw as Record<string, unknown>;
      if (!lc.enabled) {
        return res.status(400).json({ error: "This post is not available for purchase" });
      }
      const priceCents = typeof lc.priceCents === "number" && Number.isFinite(lc.priceCents) ? lc.priceCents : 0;
      if (priceCents < 50) {
        return res.status(400).json({ error: "Unlock price is not configured for this post" });
      }
      const unlockAmount = Math.min(100_000, priceCents);

      const grantRef = db.collection("creatorEntitlements").doc(creatorId).collection("grants").doc(fanId);
      const grantSnap = await grantRef.get();
      const existingUnlocks = (grantSnap.data() as { unlockedFanPostIds?: string[] } | undefined)?.unlockedFanPostIds;
      if (Array.isArray(existingUnlocks) && existingUnlocks.includes(postIdStr)) {
        return res.status(400).json({ error: "You already unlocked this post" });
      }

      const unlockLineTitle = `Unlock post — ${displayName}`;

      const unlockSessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: unlockLineTitle,
                description: "One-time unlock for member feed content",
                metadata: { creatorId, postId: postIdStr },
              },
              unit_amount: unlockAmount,
            },
            quantity: 1,
          },
        ],
        success_url: safeSuccessUrl,
        cancel_url: safeCancelUrl,
        client_reference_id: fanId,
        metadata: {
          creatorId,
          fanId,
          type: "post_unlock",
          postId: postIdStr,
          amountCents: String(unlockAmount),
          isPlatformOwner: isPlatformOwner ? "true" : "false",
        },
        ...(isPlatformOwner
          ? {}
          : {
              payment_intent_data: {
                application_fee_amount: Math.round(unlockAmount * PLATFORM_FEE_PERCENT),
              },
            }),
      };
      const session = await checkoutSessionsCreate(stripe, unlockSessionParams, connectIdForCheckout);
      return res.status(200).json({ url: session.url, sessionId: session.id });
    }

    // ==================== TIP ====================
    if (type === "tip") {
      const tipAmountCents = Math.min(100000, Math.max(100, Number(amountCents) || 100)); // $1 min, $1000 max
      const tipperName = tipHandle?.trim() || "Anonymous";
      
      const tipSessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: "payment",
        /** Ensures `session.customer` (cus_…) on completion so tips key to `guest_${customer}` in Firestore. */
        customer_creation: "always",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Tip for ${displayName}`,
                description: `One-time tip from ${tipperName}`,
              },
              unit_amount: tipAmountCents,
            },
            quantity: 1,
          },
        ],
        success_url: safeSuccessUrl,
        cancel_url: safeCancelUrl,
        client_reference_id: fanId,
        metadata: {
          creatorId,
          fanId,
          type: "tip",
          tipHandle: tipperName,
          isPlatformOwner: isPlatformOwner ? "true" : "false",
        },
        // Only add application_fee_amount for regular creators (not platform owners)
        ...(isPlatformOwner ? {} : {
          payment_intent_data: {
            application_fee_amount: Math.round(tipAmountCents * PLATFORM_FEE_PERCENT),
          },
        }),
      };
      const session = await checkoutSessionsCreate(stripe, tipSessionParams, connectIdForCheckout);
      return res.status(200).json({ url: session.url, sessionId: session.id });
    }

    return res.status(400).json({ error: "Invalid request type" });
  } catch (e: unknown) {
    console.error("createFanCheckoutSession error:", e);
    if (isReconnectableConnectError(e)) {
      const stripeMsg = e instanceof Stripe.errors.StripeError ? e.message : "";
      return res.status(400).json({
        error: "Creator Stripe connection needs to be refreshed",
        code: "CREATOR_STRIPE_RECONNECT_REQUIRED",
        reconnectRequired: true,
        message:
          "This creator's Stripe account is unavailable for the current Stripe mode. Ask the creator to reconnect Stripe in Fan Hub > Payouts.",
        ...(stripeMsg ? { stripeMessage: stripeMsg } : {}),
      });
    }
    if (e instanceof Stripe.errors.StripeInvalidRequestError) {
      return res.status(400).json({
        error: e.message || "Invalid checkout configuration",
        code: e.code || "STRIPE_INVALID_REQUEST",
      });
    }
    if (e instanceof Stripe.errors.StripeCardError) {
      return res.status(400).json({
        error: e.message || "Card was declined",
        code: e.code || "card_error",
        declineCode: e.decline_code,
      });
    }
    if (e instanceof Stripe.errors.StripeIdempotencyError) {
      return res.status(400).json({
        error: e.message || "Duplicate request",
        code: e.code || "idempotency_error",
      });
    }
    if (e instanceof Stripe.errors.StripeAuthenticationError) {
      return res.status(503).json({
        error: "Stripe authentication failed — check STRIPE_SECRET_KEY_* and mode (test vs live) in deployment env.",
        code: "STRIPE_AUTH",
      });
    }
    if (e instanceof Stripe.errors.StripeRateLimitError) {
      return res.status(429).json({ error: "Too many checkout attempts; try again in a moment." });
    }
    if (e instanceof Stripe.errors.StripeAPIError || e instanceof Stripe.errors.StripeConnectionError) {
      return res.status(502).json({
        error: "Stripe is temporarily unavailable; try again shortly.",
        message: e.message,
      });
    }
    if (e instanceof Stripe.errors.StripeError) {
      return res.status(400).json({
        error: e.message || "Stripe could not start checkout",
        code: e.code || e.type || "STRIPE_ERROR",
      });
    }
    const msg = e instanceof Error ? e.message : "Checkout failed";
    // Single user-visible string so clients that only read `error` still show the cause.
    return res.status(500).json({
      error: msg && msg !== "Checkout failed" ? `Checkout failed: ${msg}` : "Checkout failed",
      code: "CHECKOUT_UNEXPECTED",
      message: msg,
    });
  }
}
