/**
 * Resolve display labels for fan–creator DM UIs (thread list, message bubbles).
 * Merges `users/{fanId}` with `creators/{creatorId}/fans/{fanId}` so storefront/subscriber rows fill in @handle when the user doc is sparse.
 */
import type { Firestore } from "firebase-admin/firestore";
import { formatFanDisplayLabel } from "./_fanHubDisplay.js";

export async function resolveFanPartyDisplayLabel(
  db: Firestore,
  creatorId: string,
  fanId: string
): Promise<string> {
  const [userSnap, fanSubSnap] = await Promise.all([
    db.collection("users").doc(fanId).get(),
    db.collection("creators").doc(creatorId).collection("fans").doc(fanId).get(),
  ]);
  const u = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};
  const f = fanSubSnap.exists ? (fanSubSnap.data() as Record<string, unknown>) : {};
  return formatFanDisplayLabel(
    {
      username: (u.username as string | undefined) ?? (f.username as string | undefined),
      displayName: (u.displayName as string | undefined) ?? (f.displayName as string | undefined),
      name: (u.name as string | undefined) ?? (f.name as string | undefined),
      email: (u.email as string | undefined) ?? (f.email as string | undefined),
    },
    { fallback: "Member" }
  );
}

export async function resolveCreatorPartyDisplayLabel(db: Firestore, creatorId: string): Promise<string> {
  const snap = await db.collection("creators").doc(creatorId).get();
  if (!snap.exists) return "Creator";
  const c = snap.data() as { displayName?: string; handle?: string };
  const dn = c.displayName?.trim();
  if (dn) return dn;
  const h = c.handle ? String(c.handle).replace(/^@/, "").trim().toLowerCase() : "";
  if (h) return `@${h}`;
  return "Creator";
}
