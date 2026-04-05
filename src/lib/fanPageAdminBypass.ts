import type { Firestore } from "firebase-admin/firestore";
import { normalizeCreatorId } from "./creatorIdNormalize";

function parseCommaList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function normUid(uid: string): string {
  return normalizeCreatorId(uid) || uid;
}

/** Same IDs as Stripe `createFanCheckoutSession` platform-owner routing (comma-separated). */
function parsePlatformOwnerCreatorIdsFromEnv(): string[] {
  const raw =
    process.env.PLATFORM_OWNER_CREATOR_IDS ||
    process.env.platform_owner_creator_ids ||
    process.env.platform_owner_creators_ids ||
    "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

async function isCreatorEligibleForFanPageAdminBypass(
  db: Firestore,
  creatorIdParam: string
): Promise<boolean> {
  const nc = normUid(creatorIdParam);
  if (parsePlatformOwnerCreatorIdsFromEnv().some((c) => normUid(c) === nc)) return true;
  if (parseCommaList(process.env.FAN_PAGE_ADMIN_MEMBER_CREATOR_IDS).some((c) => normUid(c) === nc)) {
    return true;
  }
  const handles = parseCommaList(process.env.FAN_PAGE_ADMIN_MEMBER_HANDLES);
  for (const h of handles) {
    const clean = h.replace(/^@/, "").toLowerCase().trim();
    if (!clean) continue;
    try {
      const snap = await db.collection("creatorHandles").doc(clean).get();
      const cid = snap.data()?.creatorId;
      if (typeof cid === "string" && normUid(cid) === nc) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

async function isFanEligibleForFanPageAdminBypass(db: Firestore, fanId: string): Promise<boolean> {
  const nf = normUid(fanId);
  const listUids = parseCommaList(process.env.FAN_PAGE_ADMIN_MEMBER_UIDS);
  if (listUids.some((u) => normUid(u) === nf)) return true;
  try {
    const snap = await db.collection("users").doc(fanId).get();
    if (!snap.exists) return false;
    const role = snap.data()?.role;
    if (role === "Admin" || role === "admin") return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Synthetic member entitlement for `getFanEntitlement` when support staff view a storefront.
 *
 * **Creator** must match any of:
 * - `PLATFORM_OWNER_CREATOR_IDS` (same as Stripe platform checkout; also reads `platform_owner_creators_ids` if set)
 * - `FAN_PAGE_ADMIN_MEMBER_CREATOR_IDS`
 * - `FAN_PAGE_ADMIN_MEMBER_HANDLES` → `creatorHandles/{handle}`
 *
 * **Viewer** must match any of:
 * - `FAN_PAGE_ADMIN_MEMBER_UIDS`
 * - Firestore `users/{uid}.role` is `Admin` (Witme / EchoFlux app admin — same account as creator app)
 */
export async function shouldGrantFanPageAdminMemberAccess(
  db: Firestore,
  fanId: string,
  creatorIdParam: string
): Promise<boolean> {
  if (!(await isCreatorEligibleForFanPageAdminBypass(db, creatorIdParam))) return false;
  return isFanEligibleForFanPageAdminBypass(db, fanId);
}
