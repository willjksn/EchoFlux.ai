/**
 * POST: Authenticated user deletes their own account (fan / member-focused).
 * - Blocks if `creators/{uid}` exists (EchoFlux creator storefront owner — use app data deletion).
 * - Cancels active Stripe fan→creator subscriptions without proration/credits (no refund of the current period via this API), then deletes those subscriber docs.
 * - Removes `usernames/{handle}` when owned by uid
 * - Deletes all `creators/*/fans/{uid}` and mirror fan preferences
 * - Deletes all `creatorEntitlements/*/grants/{uid}`
 * - Deletes `fanDmThreads` for each creator–fan pair (messages + thread doc)
 * - Deletes `users/{uid}` and Firebase Auth user
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { FieldPath } from "firebase-admin/firestore";
import { getAdminDb, getAdminApp } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { getPlatformStripe } from "./_stripeConnect.js";
import { FAN_DM_MESSAGES, FAN_DM_THREADS, getThreadId } from "./_fanDmHelpers.js";

const PLATFORM_OWNER_IDS = (process.env.PLATFORM_OWNER_CREATOR_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isCreatorPlatformOwner(
  creatorId: string,
  creatorData: { isPlatformOwner?: boolean; platformOwner?: boolean; role?: string } | undefined
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

function resolveConnectAccountId(creatorData: Record<string, unknown> | undefined): string | null {
  if (!creatorData) return null;
  const d = creatorData as {
    stripeConnectAccountId?: string;
    stripeAccountId?: string;
    connectedStripeAccountId?: string;
    stripe?: { connectAccountId?: string };
  };
  const id =
    d.stripeConnectAccountId ||
    d.stripeAccountId ||
    d.connectedStripeAccountId ||
    d.stripe?.connectAccountId ||
    null;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/**
 * Cancel recurring memberships on Stripe (Connect or platform), then remove subscriber rows.
 * Uses prorate: false / invoice_now: false so canceling on self-delete does not create credits or
 * final invoices for unused time — the fan is not refunded the current period via this path.
 */
async function cancelStripeSubscriptionsForFan(db: Firestore, uid: string, creatorIds: Set<string>): Promise<void> {
  const stripe = getPlatformStripe();
  if (!stripe || creatorIds.size === 0) return;

  const cancelParams = { prorate: false as const, invoice_now: false as const };

  for (const creatorId of creatorIds) {
    const subRef = db.collection("creatorSubscribers").doc(creatorId).collection("subscribers").doc(uid);
    const subSnap = await subRef.get();
    if (!subSnap.exists) continue;

    const subData = subSnap.data() as { stripeSubscriptionId?: string; status?: string };
    const subscriptionId =
      typeof subData.stripeSubscriptionId === "string" ? subData.stripeSubscriptionId.trim() : "";
    const alreadyCanceled = subData.status === "canceled";

    if (subscriptionId && !alreadyCanceled) {
      const [creatorSnap, creatorUserSnap] = await Promise.all([
        db.collection("creators").doc(creatorId).get(),
        db.collection("users").doc(creatorId).get(),
      ]);
      const creatorData = creatorSnap.data() as Record<string, unknown> | undefined;
      const creatorUserData = creatorUserSnap.data() as Record<string, unknown> | undefined;
      const ownerDetection = {
        isPlatformOwner:
          (creatorData as { isPlatformOwner?: boolean } | undefined)?.isPlatformOwner === true ||
          (creatorUserData as { isPlatformOwner?: boolean } | undefined)?.isPlatformOwner === true,
        platformOwner:
          (creatorData as { platformOwner?: boolean } | undefined)?.platformOwner === true ||
          (creatorUserData as { platformOwner?: boolean } | undefined)?.platformOwner === true,
        role: ((creatorData as { role?: string } | undefined)?.role ||
          (creatorUserData as { role?: string } | undefined)?.role) as string | undefined,
      };
      const isPlatform = isCreatorPlatformOwner(creatorId, ownerDetection);
      const connectId = resolveConnectAccountId(creatorData);

      try {
        if (!isPlatform && connectId) {
          await stripe.subscriptions.cancel(subscriptionId, cancelParams, { stripeAccount: connectId });
        } else {
          await stripe.subscriptions.cancel(subscriptionId, cancelParams);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`deleteMyAccount: Stripe subscriptions.cancel ${subscriptionId} creator=${creatorId}:`, msg);
      }
    }

    try {
      await subRef.delete();
    } catch {
      /* ignore */
    }
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
  const uid = decoded.uid;

  const db = getAdminDb();
  if (!db) {
    return res.status(500).json({ error: "Database unavailable" });
  }

  const creatorPageSnap = await db.collection("creators").doc(uid).get();
  if (creatorPageSnap.exists) {
    return res.status(409).json({
      error:
        "This login is also a creator account on EchoFlux. Delete or manage it from the EchoFlux app (Settings / data deletion), not from a fan page.",
    });
  }

  try {
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data() as { username?: string } | undefined;
    const usernameRaw = typeof userData?.username === "string" ? userData.username.trim().toLowerCase() : "";
    if (usernameRaw.length >= 3 && /^[a-z0-9_]+$/.test(usernameRaw)) {
      try {
        const unameRef = db.collection("usernames").doc(usernameRaw);
        const unameSnap = await unameRef.get();
        const owner = (unameSnap.data() as { uid?: string } | undefined)?.uid;
        if (owner === uid) {
          await unameRef.delete();
        }
      } catch (e) {
        console.warn("deleteMyAccount: usernames cleanup:", e);
      }
    }

    const creatorIdsFromFans = new Set<string>();
    let fanDocs: QueryDocumentSnapshot[] = [];
    try {
      const fanSnaps = await db.collectionGroup("fans").where(FieldPath.documentId(), "==", uid).get();
      fanDocs = fanSnaps.docs;
      for (const d of fanDocs) {
        const cid = d.ref.parent?.parent?.id;
        if (cid) creatorIdsFromFans.add(cid);
      }
    } catch (e) {
      console.warn("deleteMyAccount: collectionGroup fans read:", e);
    }

    await cancelStripeSubscriptionsForFan(db, uid, creatorIdsFromFans);

    try {
      for (const d of fanDocs) {
        const cid = d.ref.parent?.parent?.id;
        await d.ref.delete();
        if (cid) {
          try {
            await db.collection("users").doc(cid).collection("onlyfans_fan_preferences").doc(uid).delete();
          } catch {
            /* ignore */
          }
        }
      }
    } catch (e) {
      console.warn("deleteMyAccount: collectionGroup fans delete:", e);
    }

    try {
      const grantSnaps = await db.collectionGroup("grants").where(FieldPath.documentId(), "==", uid).get();
      for (const d of grantSnaps.docs) {
        await d.ref.delete();
      }
    } catch (e) {
      console.warn("deleteMyAccount: collectionGroup grants:", e);
    }

    for (const cid of creatorIdsFromFans) {
      const tid = getThreadId(cid, uid);
      const threadRef = db.collection(FAN_DM_THREADS).doc(tid);
      try {
        const msgs = await threadRef.collection(FAN_DM_MESSAGES).get();
        const docs = msgs.docs;
        for (let i = 0; i < docs.length; i += 450) {
          const batch = db.batch();
          for (const m of docs.slice(i, i + 450)) {
            batch.delete(m.ref);
          }
          await batch.commit();
        }
        const threadSnap = await threadRef.get();
        if (threadSnap.exists) {
          await threadRef.delete();
        }
      } catch (e) {
        console.warn(`deleteMyAccount: fanDmThread ${tid}:`, e);
      }
    }

    if (userSnap.exists) {
      await userRef.delete();
    }

    try {
      const adminApp = getAdminApp();
      await adminApp.auth().deleteUser(uid);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code !== "auth/user-not-found") {
        console.error("deleteMyAccount: auth.deleteUser:", e);
        throw e;
      }
    }

    return res.status(200).json({ success: true });
  } catch (e: unknown) {
    console.error("deleteMyAccount:", e);
    return res.status(500).json({ error: "Failed to delete account" });
  }
}
