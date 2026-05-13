import React, { useCallback, useEffect, useState } from "react";
import {
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  collection,
  setDoc,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAppContext } from "./AppContext";
import {
  STAFF_ROLES_COLLECTION,
  STAFF_ROLE_CONTENT_AUDIT,
  STAFF_ROLE_LEGAL_DISCLOSURE_RESERVE,
  normalizeMemberUids,
  type StaffRoleFirestoreDocIds,
} from "../src/lib/staffRolesFirestore";

type RoleRowState = {
  loading: boolean;
  memberUids: string[];
  error: string | null;
};

async function resolveUidInput(raw: string): Promise<{ uid: string } | { error: string }> {
  const t = raw.trim();
  if (!t) return { error: "Enter a Firebase UID or workspace email." };
  if (!t.includes("@")) {
    const snap = await getDoc(doc(db, "users", t));
    if (snap.exists()) return { uid: t };
    return { error: "No users/{uid} document for that id." };
  }
  const em = t.toLowerCase();
  const q = query(collection(db, "users"), where("email", "==", em), limit(3));
  const snap = await getDocs(q);
  if (snap.empty) return { error: "No user document with that email." };
  if (snap.docs.length > 1) return { error: "Multiple matches for email — use Firebase UID instead." };
  return { uid: snap.docs[0].id };
}

function RoleAssignmentCard({
  title,
  description,
  reservedNote,
  roleDocId,
  state,
  onReload,
}: {
  title: string;
  description: string;
  reservedNote?: string;
  roleDocId: StaffRoleFirestoreDocIds;
  state: RoleRowState;
  onReload: (roleDocId: StaffRoleFirestoreDocIds) => Promise<void>;
}) {
  const { user: adminUser, showToast } = useAppContext();
  const [pendingUidLookup, setPendingUidLookup] = useState("");
  const [busy, setBusy] = useState(false);

  const displayRows = async (uids: string[]) => {
    const rows: Array<{ uid: string; email: string }> = [];
    for (const uid of uids) {
      try {
        const s = await getDoc(doc(db, "users", uid));
        const em = ((s.exists() ? (s.data() as { email?: string })?.email : "") || "").trim();
        rows.push({ uid, email: em || "(no email on profile)" });
      } catch {
        rows.push({ uid, email: "(lookup failed)" });
      }
    }
    return rows;
  };

  const [memberRows, setMemberRows] = useState<Array<{ uid: string; email: string }>>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!state.memberUids.length) {
        setMemberRows([]);
        return;
      }
      const r = await displayRows(state.memberUids);
      if (alive) setMemberRows(r);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.memberUids.join("\u0001")]);

  const persistAll = async (nextUids: string[]) => {
    const actingUid = adminUser?.id;
    if (!actingUid) return;
    setBusy(true);
    try {
      await setDoc(
        doc(db, STAFF_ROLES_COLLECTION, roleDocId),
        {
          memberUids: nextUids,
          updatedAt: serverTimestamp(),
          updatedByUid: actingUid,
        },
        { merge: true },
      );
      showToast(`${title}: saved`, "success");
      await onReload(roleDocId);
    } catch (e: any) {
      showToast(e?.message || `Failed to save ${title}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const addMember = async () => {
    const resolved = await resolveUidInput(pendingUidLookup);
    if ("error" in resolved) {
      showToast(resolved.error, "error");
      return;
    }
    if (state.memberUids.includes(resolved.uid)) {
      showToast("That account is already on this list.", "error");
      return;
    }
    setPendingUidLookup("");
    await persistAll([...state.memberUids, resolved.uid]);
  };

  const removeMember = async (uid: string) => {
    await persistAll(state.memberUids.filter((x) => x !== uid));
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 p-4 sm:p-5 space-y-3">
      <div>
        <h4 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{description}</p>
        {reservedNote ? (
          <p className="text-xs text-amber-700 dark:text-amber-300/95 mt-2">{reservedNote}</p>
        ) : null}
      </div>

      {state.loading ? (
        <p className="text-sm text-gray-500">Loading roster…</p>
      ) : state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : (
        <>
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 rounded-lg border border-gray-100 dark:border-gray-800">
            {memberRows.length === 0 ? (
              <li className="px-3 py-3 text-sm text-gray-500">No members yet.</li>
            ) : (
              memberRows.map((r) => (
                <li
                  key={r.uid}
                  className="px-3 py-2 flex flex-wrap items-center gap-2 justify-between text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-gray-500 dark:text-gray-400 truncate max-w-[20rem]">
                      {r.uid}
                    </div>
                    <div className="text-gray-900 dark:text-gray-100">{r.email}</div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeMember(r.uid)}
                    className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              ))
            )}
          </ul>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Firebase UID or workspace email
              </label>
              <input
                value={pendingUidLookup}
                onChange={(ev) => setPendingUidLookup(ev.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
                placeholder="uid… or creator@..."
                spellCheck={false}
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void addMember()}
              className="rounded-lg px-4 py-2 text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              Add member
            </button>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Lists gate tools only — platform super-admins remain <code className="text-xs">role: Admin</code> on{" "}
            <code className="text-xs">users/{"{uid}"}</code>. Operators may need invite-mode bypass plus app access via
            this assignment.
          </p>
        </>
      )}
    </div>
  );
}

/** Platform admins configure trusted staff UID allowlists backed by `/staff_roles/*`. */
export const AdminStaffRolesPanel: React.FC = () => {
  const { user: acting } = useAppContext();
  const canManage = acting?.role === "Admin";

  const [audit, setAudit] = useState<RoleRowState>({
    loading: true,
    memberUids: [],
    error: null,
  });
  const [legal, setLegal] = useState<RoleRowState>({
    loading: true,
    memberUids: [],
    error: null,
  });

  const reload = useCallback(async (roleDocId: StaffRoleFirestoreDocIds) => {
    const setter = roleDocId === STAFF_ROLE_CONTENT_AUDIT ? setAudit : setLegal;
    setter((s) => ({ ...s, loading: true, error: null }));
    try {
      const snap = await getDoc(doc(db, STAFF_ROLES_COLLECTION, roleDocId));
      if (!snap.exists()) {
        setter({ loading: false, memberUids: [], error: null });
        return;
      }
      const uids = normalizeMemberUids(snap.data() as Record<string, unknown>);
      setter({ loading: false, memberUids: uids, error: null });
    } catch {
      setter({ loading: false, memberUids: [], error: "Unable to load (check Firestore rules / deploy)." });
    }
  }, []);

  useEffect(() => {
    void reload(STAFF_ROLE_CONTENT_AUDIT);
    void reload(STAFF_ROLE_LEGAL_DISCLOSURE_RESERVE);
  }, [reload]);

  if (!canManage) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Staff role management is restricted to workspace accounts with <strong>Admin</strong> privilege.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Trusted staff roles</h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 max-w-3xl">
          Only full <strong>Admin</strong> accounts manage these lists (under Admin Dashboard → Tools).{' '}
          <strong>Content audit</strong> members see Tools only and review Fan Hub feed posts plus the moderation audit trail
          — not EchoFlux billing, Overview, or the full users grid.{' '}
          <strong>Legal disclosure</strong> is a reserved UID allowlist for escalations you enable later and does{' '}
          <em>not</em> unlock DMs or inboxes today.
        </p>
      </div>

      <RoleAssignmentCard
        title="Content audit"
        description="EchoFlux admins and listed UIDs use Tools → Content audit: Fan Hub captions, public teasers, and (when needed) locked-post media resolved from moderator storage — plus reload/delete audit log rows per rules. Compose cross-post rows stay platform admins only."
        roleDocId={STAFF_ROLE_CONTENT_AUDIT}
        state={audit}
        onReload={reload}
      />
      <RoleAssignmentCard
        title="Legal disclosure (reserved)"
        description="Emergency / subpoena escalation allowlist EchoFlux configures with counsel. Not wired to elevated in-product access yet."
        reservedNote="No DM, locker, or Stripe exposure from this card alone — only scaffolding for workflows you deliberately turn on."
        roleDocId={STAFF_ROLE_LEGAL_DISCLOSURE_RESERVE}
        state={legal}
        onReload={reload}
      />
    </div>
  );
};
