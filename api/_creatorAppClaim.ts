/**
 * Firebase Auth custom claim `creatorApp` gates access to the EchoFlux creator shell (dashboard, etc.).
 * Fans (e.g. fan hub / imported members) stay on storefront surfaces; same Auth project, different UI.
 */
import type { Firestore } from "firebase-admin/firestore";
import type admin from "firebase-admin";

export const CREATOR_APP_CLAIM = "creatorApp";

const PAID_PLANS = new Set(["Pro", "Elite", "Agency", "OnlyFansStudio"]);

export type UserDocForClaim = {
  role?: string;
  plan?: string | null;
  hasCompletedOnboarding?: boolean;
  accountOrigin?: string;
};

export function shouldHaveCreatorAppAccess(params: {
  userData: UserDocForClaim | undefined;
  creatorDocExists: boolean;
}): boolean {
  const d = params.userData || {};
  if (d.role === "Admin") return true;
  if (params.creatorDocExists) return true;
  const plan = typeof d.plan === "string" ? d.plan : "";
  if (plan && PAID_PLANS.has(plan)) return true;
  if (d.hasCompletedOnboarding === true && d.accountOrigin !== "fan_hub") return true;
  return false;
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
