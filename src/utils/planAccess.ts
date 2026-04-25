import type { User } from "../../types";
import { isCreatorIdentityPlanClient, normalizePlanForLimitsClient } from "../lib/creatorIdentity/planGate";

export function hasCalendarAccess(user: Pick<User, "plan" | "role"> | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "Admin") return true;
  if (user.plan === "Agency") return true;
  const t = normalizePlanForLimitsClient(user.plan ?? "");
  return t === "Pro" || t === "Elite";
}

/** Elite-only features: AI comment replies, chat session AI chatbot — includes CreatorElite / OnlyFansStudio (Elite tier) */
export function hasEliteAccess(user: Pick<User, "plan" | "role"> | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "Admin") return true;
  if (user.plan === "Agency") return true;
  return normalizePlanForLimitsClient(user.plan ?? "") === "Elite";
}

/** Fan Hub live streams (broadcast + tickets). Same tier gate as Premium Studio / Creator Identity (Elite + Agency). */
export function hasLiveStreamAccess(user: Pick<User, "plan" | "role"> | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "Admin") return true;
  return isCreatorIdentityPlanClient(user.plan);
}

/**
 * Routes: /fan (Fan Hub), onboarding completion — Pro & Elite paid tiers including CreatorPro / CreatorElite invites, plus Agency.
 * Aligns with api/_planLimits normalizePlanForLimits.
 */
export function hasFanHubStudioRouteAccess(user: Pick<User, "plan" | "role"> | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "Admin") return true;
  if (user.plan === "Agency") return true;
  const t = normalizePlanForLimitsClient(user.plan ?? "");
  return t === "Pro" || t === "Elite";
}

/** Creator OS: Pro and Elite creator tiers, including CreatorPro / CreatorElite invites, plus Agency/Admin. */
export function hasCreatorOSAccess(user: Pick<User, "plan" | "role"> | null | undefined): boolean {
  return hasFanHubStudioRouteAccess(user);
}

/**
 * Routes: /studio (Premium Studio), Creator Identity — Elite-equivalent (Elite, CreatorElite, OnlyFansStudio) + Agency.
 */
export function hasPremiumStudioRouteAccess(user: Pick<User, "plan" | "role"> | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "Admin") return true;
  return isCreatorIdentityPlanClient(user.plan);
}


