import type { User } from "../../types";

/** Platform / dashboard admin (matches api/_platformAdminAccess + Firestore isAdminUserDoc). */
export function hasPlatformAdminAccess(
  user: Pick<User, "role"> & {
    isAdmin?: boolean;
    isSuperAdmin?: boolean;
    isOwner?: boolean;
  } | null | undefined
): boolean {
  if (!user) return false;
  const role = typeof user.role === "string" ? user.role.trim().toLowerCase() : "";
  if (role === "admin" || role === "superadmin" || role === "owner") return true;
  if (user.isAdmin === true || user.isSuperAdmin === true || user.isOwner === true) return true;
  return false;
}
