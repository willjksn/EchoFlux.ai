import type { Firestore } from "firebase-admin/firestore";
import { buildDigitalPackOrderDeliveryPatch } from "../src/lib/digitalPackProduct.js";
import { isGuestCheckoutFanId } from "../src/lib/fanHubOrderLedger.js";
import { reconcileFanHubFanPreferenceForMember } from "./_syncFanHubFanPreference.js";
import { sendCreatorHubNotification, sendFanNotification } from "./_fanNotifications.js";
import { applyDigitalPackFulfillmentIfNeeded } from "./_digitalPackFulfillment.js";
import { isJointLiveSessionProductId } from "../src/lib/treatSessionClassification.js";

export type GrantFanHubStoreProductInput = {
  creatorId: string;
  fanId: string;
  fanEmail: string;
  fanName: string;
  productId: string;
  quantity: number;
  grantedByUid: string;
};

export type GrantFanHubStoreProductResult = {
  orderIds: string[];
  productId: string;
  productTitle: string;
  quantity: number;
};

function orderTypeForProduct(productType: string): "tip" | "product" {
  return productType.trim().toLowerCase() === "tip" ? "tip" : "product";
}

function isNonDeliverableProductType(productType: string): boolean {
  const t = productType.trim().toLowerCase();
  return t === "tip" || t === "subscription";
}

function productNeedsCreatorScheduling(productType: string, productId: string): boolean {
  const t = productType.trim().toLowerCase();
  if (t === "chat_session") return true;
  return isJointLiveSessionProductId(productId);
}

function buildFanGrantNotificationCopy(input: {
  productTitle: string;
  quantity: number;
  autoDelivered: boolean;
  isTip: boolean;
  needsScheduling: boolean;
  needsDelivery: boolean;
}): { type: "purchase_confirmed" | "creator_gift_granted"; title: string; body: string } {
  const item =
    input.quantity > 1 ? `${input.quantity}× ${input.productTitle}` : input.productTitle;
  if (input.autoDelivered) {
    return {
      type: "purchase_confirmed",
      title: "Your gift is ready",
      body: `Your creator granted you ${item}. Open Purchases to view it now.`,
    };
  }
  if (input.isTip) {
    return {
      type: "creator_gift_granted",
      title: "You received a gift",
      body: `Your creator granted you ${item}. It's listed in Purchases.`,
    };
  }
  if (input.needsScheduling) {
    return {
      type: "creator_gift_granted",
      title: "Gift added to Purchases",
      body: `Your creator granted you ${item}. Open Purchases — they'll schedule your session when it's ready.`,
    };
  }
  if (input.needsDelivery) {
    return {
      type: "creator_gift_granted",
      title: "Gift added to Purchases",
      body: `Your creator granted you ${item}. Open Purchases to track it — they'll deliver it here when it's ready.`,
    };
  }
  return {
    type: "creator_gift_granted",
    title: "Gift added to Purchases",
    body: `Your creator granted you ${item}. Open Purchases for status.`,
  };
}

export async function grantFanHubStoreProductToFan(
  db: Firestore,
  input: GrantFanHubStoreProductInput,
): Promise<GrantFanHubStoreProductResult> {
  const creatorId = input.creatorId.trim();
  const fanId = input.fanId.trim();
  const productId = input.productId.trim();
  const quantity = Math.min(10, Math.max(1, Math.floor(input.quantity)));
  const now = new Date().toISOString();

  if (!creatorId || !fanId || !productId) {
    throw new Error("creatorId, fanId, and productId are required");
  }
  if (isGuestCheckoutFanId(fanId)) {
    throw new Error("Cannot grant store items to guest checkout accounts. The member needs a full account.");
  }

  const productSnap = await db.collection("products").doc(productId).get();
  if (!productSnap.exists) {
    throw new Error("Product not found");
  }
  const product = productSnap.data() as Record<string, unknown>;
  const productCreator = typeof product.creatorId === "string" ? product.creatorId.trim() : "";
  if (productCreator !== creatorId) {
    throw new Error("Product does not belong to this creator");
  }

  const productType = typeof product.type === "string" ? product.type.trim() : "custom";
  if (productType.toLowerCase() === "subscription") {
    throw new Error("Subscription products cannot be granted here. Use membership tools instead.");
  }

  const productTitle =
    (typeof product.title === "string" && product.title.trim()) || productId;
  const orderType = orderTypeForProduct(productType);
  const nonDeliverable = isNonDeliverableProductType(productType);
  const packPatch = buildDigitalPackOrderDeliveryPatch(product, now);

  const fanEmail = input.fanEmail.trim();
  const fanName = input.fanName.trim();
  const orderIds: string[] = [];

  for (let i = 0; i < quantity; i++) {
    const orderRef = db.collection("orders").doc();
    const orderId = orderRef.id;
    orderIds.push(orderId);

    const orderPayload: Record<string, unknown> = {
      creatorId,
      fanId,
      productId,
      productTitle,
      productType,
      type: orderType,
      amountCents: 0,
      status: "paid",
      fanEmail: fanEmail || undefined,
      fanName: fanName || undefined,
      grantedByCreator: true,
      grantedByUid: input.grantedByUid,
      stripeSessionId: null,
      stripePaymentIntentId: null,
      scheduleStatus: nonDeliverable || packPatch ? "completed" : "pending",
      deliveryStatus: nonDeliverable || packPatch ? "delivered" : "pending",
      scheduledDate: null,
      scheduledTime: null,
      createdAt: now,
      updatedAt: now,
      ...(packPatch || {}),
    };

    await orderRef.set(orderPayload, { merge: true });

    if (packPatch && !nonDeliverable) {
      try {
        await applyDigitalPackFulfillmentIfNeeded(db, orderId, productId, now);
      } catch (packErr) {
        console.error("grantFanHubStoreProduct: digital pack fulfillment", packErr);
      }
    }
  }

  const grantRef = db.collection("creatorEntitlements").doc(creatorId).collection("grants").doc(fanId);
  const grantSnap = await grantRef.get();
  const existing = grantSnap.data() as { unlockedProductIds?: string[] } | undefined;
  const unlocked = Array.isArray(existing?.unlockedProductIds) ? existing.unlockedProductIds : [];
  if (!unlocked.includes(productId)) {
    await grantRef.set({ unlockedProductIds: [...unlocked, productId], updatedAt: now }, { merge: true });
  }

  const fanRef = db.collection("creators").doc(creatorId).collection("fans").doc(fanId);
  const fanSnap = await fanRef.get();
  if (!fanSnap.exists) {
    await fanRef.set({
      id: fanId,
      creatorId,
      email: fanEmail || undefined,
      displayName: fanName || undefined,
      subscriptionStatus: null,
      lastPurchaseAt: now,
      totalSpentCents: 0,
      purchaseCount: quantity,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    const fanData = fanSnap.data() as { purchaseCount?: number };
    await fanRef.update({
      lastPurchaseAt: now,
      purchaseCount: (fanData.purchaseCount || 0) + quantity,
      updatedAt: now,
      ...(fanEmail ? { email: fanEmail } : {}),
      ...(fanName ? { displayName: fanName } : {}),
    });
  }

  try {
    await reconcileFanHubFanPreferenceForMember(db, creatorId, fanId, now, "creator_grant_store");
  } catch (e) {
    console.error("reconcileFanHubFanPreference (creator grant):", e);
  }

  const buyerLabel = fanName || fanEmail || "A member";
  const qtyLabel = quantity > 1 ? `${quantity}× ` : "";
  try {
    await sendCreatorHubNotification({
      creatorId,
      type: "creator_new_purchase",
      title: "Store item granted",
      body: `${buyerLabel} received ${qtyLabel}${productTitle} (complimentary).`,
      data: {
        orderId: orderIds[0] || "",
        creatorId,
        productId,
        destination: "purchases",
      },
    });
  } catch (notifyErr) {
    console.error("grantFanHubStoreProduct: creator notification", notifyErr);
  }

  const autoDelivered = Boolean(packPatch);
  const needsScheduling =
    !nonDeliverable && !autoDelivered && productNeedsCreatorScheduling(productType, productId);
  const needsDelivery =
    !nonDeliverable && !autoDelivered && !needsScheduling;
  const fanNotify = buildFanGrantNotificationCopy({
    productTitle,
    quantity,
    autoDelivered,
    isTip: nonDeliverable && productType.toLowerCase() === "tip",
    needsScheduling,
    needsDelivery,
  });
  try {
    await sendFanNotification({
      fanId,
      type: fanNotify.type,
      title: fanNotify.title,
      body: fanNotify.body,
      data: {
        orderId: orderIds[0] || "",
        creatorId,
        productId,
        destination: "purchases",
        grantedByCreator: "true",
        readyToView: autoDelivered ? "true" : "false",
      },
    });
  } catch (notifyErr) {
    console.error("grantFanHubStoreProduct: fan notification", notifyErr);
  }

  for (const orderId of orderIds) {
    await db.collection("orders").doc(orderId).set(
      {
        creatorPurchaseBellSent: true,
        creatorPurchaseBellSentAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
  }

  return { orderIds, productId, productTitle, quantity };
}
