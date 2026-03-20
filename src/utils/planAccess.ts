import type { Plan, User } from "../../types";

export function hasCalendarAccess(user: Pick<User, "plan" | "role"> | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "Admin") return true;
  const plan = user.plan as Plan;
  return plan === "Pro" || plan === "Elite" || plan === "Agency";
}

/** Elite-only features: AI comment replies, chat session AI chatbot */
export function hasEliteAccess(user: Pick<User, "plan" | "role"> | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "Admin") return true;
  const plan = user.plan as Plan;
  return plan === "Elite" || plan === "Agency";
}


