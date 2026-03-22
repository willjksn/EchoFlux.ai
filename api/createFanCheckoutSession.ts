import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { getPlatformStripe, getStripeOptions } from "./_stripeConnect.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { isFanBlocked } from "./_fanDmHelpers.js";

const DEFAULT_SUBSCRIPTION_CENTS = 999; // $9.99
const PLATFORM_FEE_PERCENT = 0.10; // 10% platform fee on all fan payments

// Platform owner creator IDs - payments go directly to EchoFlux, no Connect needed, no fee
// Set via PLATFORM_OWNER_CREATOR_IDS env var (comma-separated)
const PLATFORM_OWNER_IDS = (process.env.PLATFORM_OWNER_CREATOR_IDS || "").split(",").map(s => s.trim()).filter(Boolean);

/**
 * POST: Create Stripe Checkout Session for fan→creator payment (subscription, product, or tip).
 * 
 * For regular creators: Funds go to creator's Connect account with 10% platform fee.
 * For platform owners (e.g., Stormij): Funds go directly to EchoFlux, no Connect account needed.
 * 
 * Body: { creatorId, type: 'subscription' | 'product' | 'tip', productId?, subscriptionPriceCents?, amountCents?, tipHandle?, successUrl?, cancelUrl?, guestProduct?: boolean }
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
    return res.status(503).json({ error: "Stripe is not configured" });
  }

  const body = (req.body || {}) as {
    creatorId?: string;
    type?: "subscription" | "product" | "tip";
    productId?: string;
    subscriptionPriceCents?: number;
    amountCents?: number;
    tipHandle?: string;
    successUrl?: string;
    cancelUrl?: string;
    guestProduct?: boolean;
  };

  const { creatorId, type, productId, subscriptionPriceCents, amountCents, tipHandle, successUrl, cancelUrl, guestProduct } = body;
  if (!creatorId || !type) {
    return res.status(400).json({ error: "creatorId and type are required" });
  }
  if (type !== "subscription" && type !== "product" && type !== "tip") {
    return res.status(400).json({ error: "type must be 'subscription', 'product', or 'tip'" });
  }
  if (type === "product" && !productId) {
    return res.status(400).json({ error: "productId is required for product checkout" });
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
  const origin = (req.headers.origin || req.headers.referer || "").replace(/\/$/, "") || process.env.NEXT_PUBLIC_APP_URL || "https://echoflux.ai";
  const defaultSuccess = `${origin}/?payment=success`;
  const defaultCancel = `${origin}/`;

  try {
    const db = getAdminDb();

    if (decoded?.uid && (await isFanBlocked(db, creatorId, decoded.uid))) {
      return res.status(403).json({ error: "You cannot purchase from this creator" });
    }

    const creatorSnap = await db.collection("creators").doc(creatorId).get();
    const creatorData = creatorSnap.data() as {
      stripeConnectAccountId?: string;
      displayName?: string;
      handle?: string;
      publicTreatsOnLanding?: boolean;
    } | undefined;

    if (allowGuestProduct) {
      if (!creatorData?.publicTreatsOnLanding) {
        return res.status(403).json({ error: "Store purchases are not available for guest checkout on this page" });
      }
    }
    
    // Check if this is a platform owner (e.g., Stormij) - payments go directly to EchoFlux
    const isPlatformOwner = PLATFORM_OWNER_IDS.includes(creatorId);
    
    // For regular creators, require Stripe Connect; for platform owners, skip it
    const connectAccountId = creatorData?.stripeConnectAccountId;
    if (!isPlatformOwner && !connectAccountId) {
      return res.status(400).json({ error: "Creator has not connected Stripe" });
    }

    if (!isPlatformOwner && connectAccountId) {
      const account = await stripe.accounts.retrieve(connectAccountId);
      if (!account.charges_enabled) {
        return res.status(400).json({ error: "Creator cannot accept payments yet" });
      }
    }

    // For platform owners: no stripeAccount option (direct to platform), no fees
    // For regular creators: use Connect account with 10% platform fee
    const opts = isPlatformOwner ? {} : getStripeOptions(connectAccountId);
    const displayName = creatorData?.displayName || creatorData?.handle || "Creator";

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
        success_url: successUrl || defaultSuccess,
        cancel_url: cancelUrl || defaultCancel,
        client_reference_id: fanId,
        metadata: {
          creatorId,
          fanId,
          type: "subscription",
          isPlatformOwner: isPlatformOwner ? "true" : "false",
        },
        subscription_data: {
          metadata: {
            creatorId,
            fanId,
            type: "subscription",
          },
          // Only add application_fee_percent for regular creators (not platform owners)
          ...(isPlatformOwner ? {} : { application_fee_percent: Math.round(PLATFORM_FEE_PERCENT * 100) }),
        },
      };
      const session = await stripe.checkout.sessions.create(sessionParams, opts);
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
        success_url: successUrl || defaultSuccess,
        cancel_url: cancelUrl || defaultCancel,
        client_reference_id: allowGuestProduct ? `landing_${Date.now()}_${Math.random().toString(36).slice(2, 9)}` : fanId,
        metadata: {
          creatorId,
          fanId: allowGuestProduct ? "guest_pending" : fanId,
          type: "product",
          productId: productId!,
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
      const session = await stripe.checkout.sessions.create(sessionParams, opts);
      return res.status(200).json({ url: session.url, sessionId: session.id });
    }

    // ==================== TIP ====================
    if (type === "tip") {
      const tipAmountCents = Math.min(100000, Math.max(100, Number(amountCents) || 100)); // $1 min, $1000 max
      const tipperName = tipHandle?.trim() || "Anonymous";
      
      const tipSessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: "payment",
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
        success_url: successUrl || defaultSuccess,
        cancel_url: cancelUrl || defaultCancel,
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
      const session = await stripe.checkout.sessions.create(tipSessionParams, opts);
      return res.status(200).json({ url: session.url, sessionId: session.id });
    }

    return res.status(400).json({ error: "Invalid request type" });
  } catch (e: unknown) {
    console.error("createFanCheckoutSession error:", e);
    const msg = e instanceof Error ? e.message : "Checkout failed";
    return res.status(500).json({ error: "Checkout failed", message: msg });
  }
}
