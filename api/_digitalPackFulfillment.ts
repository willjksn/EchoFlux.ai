import type { Firestore } from "firebase-admin/firestore";
import {
  buildDigitalPackOrderDeliveryPatch,
  parseDigitalPackMediaItems,
} from "../src/lib/digitalPackProduct.js";
import { sendFanNotification } from "./_fanNotifications.js";

/**
 * After a paid product checkout, auto-deliver digital pack (`bundle` + fulfillmentItems).
 */
export async function applyDigitalPackFulfillmentIfNeeded(
  db: Firestore,
  orderId: string,
  productId: string,
  nowIso: string
): Promise<boolean> {
  const [orderSnap, productSnap] = await Promise.all([
    db.collection("orders").doc(orderId).get(),
    db.collection("products").doc(productId).get(),
  ]);
  if (!orderSnap.exists || !productSnap.exists) return false;

  const orderData = orderSnap.data() as Record<string, unknown>;
  if (orderData.digitalPackFulfillment === true) return false;

  const patch = buildDigitalPackOrderDeliveryPatch(productSnap.data() as Record<string, unknown>, nowIso);
  if (!patch) return false;

  await db.collection("orders").doc(orderId).set({ ...patch, updatedAt: nowIso }, { merge: true });

  const fanId = typeof orderData.fanId === "string" ? orderData.fanId.trim() : "";
  const creatorId = typeof orderData.creatorId === "string" ? orderData.creatorId.trim() : "";
  const itemName =
    typeof orderData.productTitle === "string" && orderData.productTitle.trim()
      ? orderData.productTitle.trim()
      : "your pack";
  if (fanId) {
    try {
      await sendFanNotification({
        fanId,
        type: "purchase_confirmed",
        title: "Your purchase is ready",
        body: `Your creator delivered ${itemName}. Open Purchases to view it.`,
        data: {
          orderId,
          creatorId,
          destination: "purchases",
        },
      });
    } catch (notifyErr) {
      console.error("applyDigitalPackFulfillment: fan notification failed", notifyErr);
    }
  }

  const items = parseDigitalPackMediaItems(patch.deliveryItems);
  console.log(
    `Fan hub: digital pack auto-fulfilled order=${orderId} product=${productId} items=${items.length}`
  );
  return true;
}
