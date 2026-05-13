import type { Firestore } from "firebase/firestore";
import { doc, getDoc } from "firebase/firestore";

/** Collection of role assignment docs (uids per logical role). */
export const STAFF_ROLES_COLLECTION = "staff_roles" as const;

/** Feed / surfaced content audit (trusted staff; not platform super-admin). */
export const STAFF_ROLE_CONTENT_AUDIT = "content_audit" as const;

/** Reserved list for lawful disclosure / safety escalations — no product UI wired yet. */
export const STAFF_ROLE_LEGAL_DISCLOSURE_RESERVE = "legal_disclosure_reserve" as const;

export type StaffRoleFirestoreDocIds =
  | typeof STAFF_ROLE_CONTENT_AUDIT
  | typeof STAFF_ROLE_LEGAL_DISCLOSURE_RESERVE;

export function normalizeMemberUids(raw: Record<string, unknown> | undefined): string[] {
  const v = raw?.memberUids;
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    const s = String(x ?? "").trim();
    if (!s || out.includes(s)) continue;
    out.push(s);
  }
  return out;
}

export async function fetchStaffRoleFlagsForUid(
  db: Firestore,
  uid: string,
): Promise<{ contentAudit: boolean; legalDisclosureReserve: boolean }> {
  const empty = { contentAudit: false, legalDisclosureReserve: false };
  if (!uid) return empty;
  try {
    const [ca, ld] = await Promise.all([
      getDoc(doc(db, STAFF_ROLES_COLLECTION, STAFF_ROLE_CONTENT_AUDIT)),
      getDoc(doc(db, STAFF_ROLES_COLLECTION, STAFF_ROLE_LEGAL_DISCLOSURE_RESERVE)),
    ]);
    const caUids = ca.exists() ? normalizeMemberUids(ca.data() as Record<string, unknown>) : [];
    const ldUids = ld.exists() ? normalizeMemberUids(ld.data() as Record<string, unknown>) : [];
    return {
      contentAudit: caUids.includes(uid),
      legalDisclosureReserve: ldUids.includes(uid),
    };
  } catch {
    return empty;
  }
}
