import type { Plan, User } from "../../types";

export function hasCalendarAccess(user: Pick<User, "plan" | "role"> | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "Admin") return true;
  const plan = user.plan as Plan;
  return plan === "Pro" || plan === "Elite" || plan === "Agency";
}


