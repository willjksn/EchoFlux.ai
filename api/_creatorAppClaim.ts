/**
 * Firebase Auth custom claim `creatorApp` gates access to the EchoFlux creator shell (dashboard, etc.).
 * Fans (e.g. fan hub / imported members) stay on storefront surfaces; same Auth project, different UI.
 */
import type { Firestore } from "firebase-admin/firestore";
import type admin from "firebase-admin";

export const CREATOR_APP_CLAIM = "creatorApp";

const PAID_PLANS = new Set([
  "Pro",
  "Elite",
  "Agency",
  "OnlyFansStudio",
  /** Invite checkout tiers ($1 / $2) after CreatorChoice Stripe subscription */
  "CreatorPro",
  "CreatorElite",
]);

export type UserDocForClaim = {
  role?: string;
  plan?: string | null;
  hasCompletedOnboarding?: boolean;
  accountOrigin?: string;
  subscriptionStatus?: string;
  inviteGrantPlan?: string;
};

export function shouldHaveCreatorAppAccess(params: {
  userData: UserDocForClaim | undefined;
  creatorDocExists: boolean;
}): boolean {
  const d = params.userData || {};
  if (d.role === "Admin") return true;
  if (params.creatorDocExists) return true;
  // CreatorChoice invite: Firestore stays plan Free until Stripe; must still use creator shell + plan picker.
  if (
    d.subscriptionStatus === "creator_invite_pending" &&
    d.inviteGrantPlan === "CreatorChoice"
  ) {
    return true;
  }
  const plan = typeof d.plan === "string" ? d.plan : "";
  if (plan && PAID_PLANS.has(plan)) return true;
  // Fan Hub–provisioned accounts: never get the EchoFlux creator shell from onboarding alone
  // (creators/{uid}, paid SaaS/invite tiers, and rules above still apply).
  if (d.accountOrigin === "fan_hub") return false;
  if (d.hasCompletedOnboarding === true) return true;
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
