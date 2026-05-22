/**
 * Firebase Auth custom claim `creatorApp` gates access to the EchoFlux creator shell (dashboard, etc.).
 * Fans (e.g. fan hub / imported members) stay on storefront surfaces; same Auth project, different UI.
 */
import type { Firestore } from "firebase-admin/firestore";
import type admin from "firebase-admin";
import {
  shouldHaveCreatorAppAccess as computeCreatorAppAccess,
  type UserDocForCreatorAppClaim,
} from "../src/lib/echoFluxSubscriptionAccess.js";

export const CREATOR_APP_CLAIM = "creatorApp";

export type UserDocForClaim = UserDocForCreatorAppClaim;

export { PAID_ECHOFLUX_PLANS } from "../src/lib/echoFluxSubscriptionAccess.js";
export {
  hasActiveEchoFluxSubscription,
  isPaidEchoFluxPlan,
  isEchoFluxPaidSubscriptionLapsed,
} from "../src/lib/echoFluxSubscriptionAccess.js";

export function shouldHaveCreatorAppAccess(params: {
  userData: UserDocForClaim | undefined;
  creatorDocExists: boolean;
}): boolean {
  return computeCreatorAppAccess(params);
}

export async function applyCreatorAppClaim(
  db: Firestore,
  adminAuth: admin.auth.Auth,
  uid: string,
): Promise<boolean> {
  const [userSnap, creatorSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("creators").doc(uid).get(),
  ]);
  const should = shouldHaveCreatorAppAccess({
    userData: userSnap.exists ? (userSnap.data() as UserDocForClaim) : undefined,
    creatorDocExists: creatorSnap.exists,
  });

  const record = await adminAuth.getUser(uid);
  const existing = (record.customClaims || {}) as Record<string, unknown>;
  await adminAuth.setCustomUserClaims(uid, {
    ...existing,
    [CREATOR_APP_CLAIM]: should,
  });
  return should;
}
