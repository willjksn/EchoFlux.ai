import type { User } from "../../types";
import { normalizePlanForLimitsClient } from "./creatorIdentity/planGate";

/** Mirrors `api/_captionUsage.ts` CAPTION_LIMITS + Compose UI tiers. */
export const CAPTION_LIMITS_BY_TIER: Record<string, number> = {
  Free: 10,
  Caption: 100,
  Pro: 500,
  Elite: 1500,
  Agency: 10000,
  Starter: 1000,
  Growth: 2500,
};

function currentCaptionUsageMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export type ClientCaptionAllowance = {
  tier: string;
  limit: number;
  usage: number;
  usageLeft: number;
  canGenerate: boolean;
};

/** Client-side caption allowance (aligns with server `normalizePlanForLimits`). */
export function getClientCaptionAllowance(
  user: Pick<User, "plan" | "role" | "monthlyCaptionGenerationsUsed" | "captionUsageMonth"> | null | undefined
): ClientCaptionAllowance {
  if (!user) {
    return { tier: "Free", limit: CAPTION_LIMITS_BY_TIER.Free, usage: 0, usageLeft: 0, canGenerate: false };
  }

  if (user.role === "Admin") {
    return { tier: "Admin", limit: 999999, usage: 0, usageLeft: 999999, canGenerate: true };
  }

  const tier = normalizePlanForLimitsClient(user.plan ?? "Free");
  const limit = CAPTION_LIMITS_BY_TIER[tier] ?? CAPTION_LIMITS_BY_TIER.Free;
  const month = currentCaptionUsageMonthKey();
  const usage =
    user.captionUsageMonth === month ? Math.max(0, user.monthlyCaptionGenerationsUsed ?? 0) : 0;
  const usageLeft = Math.max(0, limit - usage);

  return {
    tier,
    limit,
    usage,
    usageLeft,
    canGenerate: usage < limit,
  };
}
