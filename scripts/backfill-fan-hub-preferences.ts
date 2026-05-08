/**
 * One-off backfill: sync every `creators/{creatorId}/fans/{fanId}` row into
 * `users/{creatorId}/onlyfans_fan_preferences/{fanId}` and optionally create
 * placeholder `fanDmThreads` docs (same logic as Stripe webhook + joinFree).
 *
 * When to run:
 *   - After Stormij member migration (`docs/STORMIJ_MIGRATION.md`) if fan cards / chat picks are empty
 *   - Any time historical subscribers pre-date the webhook sync
 *
 * Docs:
 *   - docs/BACKFILL_FAN_HUB.md — runbook
 *   - docs/STORMIJ_MIGRATION.md — Stormij → Echo field mapping (members → fans)
 *
 * Usage (repo is "type": "module"):
 *   npx ts-node --esm scripts/backfill-fan-hub-preferences.ts --creator-id=YOUR_UID [--dry-run] [--skip-threads]
 *
 * Env:
 *   ECHOFLUX_SERVICE_ACCOUNT — path to service account JSON (default: ./echoflux-service-account.json)
 *   ECHOFLUX_CREATOR_ID — optional default creator uid if you omit --creator-id
 */
/**
 * NOTE: Fan Hub spending level must stay aligned with `api/_syncFanHubFanPreference.ts`
 * via `src/lib/fanHubSpendingLevel.ts`.
 */
import admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { spendingLevelFromLifetimeSpendCents } from "../src/lib/fanHubSpendingLevel.ts";

const FAN_DM_THREADS = "fanDmThreads";
function getThreadId(creatorId: string, fanId: string): string {
  return [creatorId, fanId].sort().join("_");
}

function subscriptionTierFromFanStatus(subStatus: string): "Free" | "Paid" {
  if (subStatus === "free") return "Free";
  if (subStatus === "canceled" || subStatus === "unpaid" || subStatus === "incomplete_expired") {
    return "Free";
  }
  if (subStatus === "active" || subStatus === "trialing" || subStatus === "past_due") {
    return "Paid";
  }
  return "Free";
}

function eqIgnoreCase(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}
function emailLocalPart(em: string): string | null {
  const e = em?.trim();
  if (!e || !e.includes("@")) return null;
  return e.split("@")[0]?.trim() || null;
}
function safeUsernameSlice(x: string | null): string | null {
  if (!x?.trim()) return null;
  const t = x.trim().toLowerCase();
  if (t.includes("@")) return t.split("@")[0]?.trim()?.slice(0, 60) ?? null;
  return t.slice(0, 60);
}
function safeDisplayNameForEmail(d: string | null, email: string): string | null {
  const v = d?.trim();
  if (!v) return null;
  if (email && eqIgnoreCase(v, email)) return null;
  if (v.includes("@")) return v.split("@")[0]?.trim() || null;
  return v;
}
function safeExtraName(n: string | null, email: string): string | null {
  const v = n?.trim();
  if (!v || v.toLowerCase() === "member") return null;
  if (email && eqIgnoreCase(v, email)) return null;
  if (v.includes("@")) return v.split("@")[0]?.trim() || null;
  return v;
}
/** Keep aligned with api/_fanHubDisplay fanHubListLabel */
function fanHubListLabelBackfill(
  username: string | null,
  displayName: string | null,
  email: string,
  extraName: string | null
): string {
  const su = safeUsernameSlice(username);
  if (su) return `@${su}`;
  const dn = safeDisplayNameForEmail(displayName, email) || safeExtraName(extraName, email);
  if (dn) return dn;
  return emailLocalPart(email) || "Member";
}

async function upsertFanHubFanPreferenceFromMember(
  db: Firestore,
  creatorId: string,
  fanId: string,
  nowIso: string,
  source: string
): Promise<void> {
  const fanRef = db.collection("creators").doc(creatorId).collection("fans").doc(fanId);
  const [fanSnap, userSnap] = await Promise.all([
    fanRef.get(),
    db.collection("users").doc(fanId).get(),
  ]);
  const fanRow = fanSnap.exists ? (fanSnap.data() as Record<string, unknown>) : {};
  const u = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};
  const email =
    (typeof fanRow.email === "string" && fanRow.email) ||
    (typeof u.email === "string" && u.email) ||
    "";
  const fanUsernameRaw =
    (typeof fanRow.username === "string" && fanRow.username.trim()) ||
    (typeof fanRow.memberUsername === "string" && fanRow.memberUsername.trim()) ||
    (typeof fanRow.handle === "string" && fanRow.handle.trim()) ||
    (typeof fanRow.instagram_handle === "string" && fanRow.instagram_handle.trim()) ||
    (typeof fanRow.instagramHandle === "string" && fanRow.instagramHandle.trim()) ||
    "";
  const fanUsername = fanUsernameRaw ? fanUsernameRaw.replace(/^@/, "").toLowerCase() : null;
  const userUsername =
    typeof u.username === "string" && u.username.trim()
      ? u.username.replace(/^@/, "").trim().toLowerCase()
      : null;
  const usernameForLabel = userUsername || fanUsername;
  const displayNameForLabel =
    (typeof fanRow.displayName === "string" && fanRow.displayName.trim()) ||
    (typeof u.displayName === "string" && u.displayName.trim()) ||
    null;
  const listName = fanHubListLabelBackfill(
    usernameForLabel,
    displayNameForLabel,
    email,
    typeof u.name === "string" ? u.name : null
  );
  const subStatus =
    typeof fanRow.subscriptionStatus === "string" ? fanRow.subscriptionStatus : "";
  const subscriptionTier = subscriptionTierFromFanStatus(subStatus);

  const prefRef = db.collection("users").doc(creatorId).collection("onlyfans_fan_preferences").doc(fanId);
  const prefSnap = await prefRef.get();
  const totalSpent = typeof fanRow.totalSpentCents === "number" ? fanRow.totalSpentCents : 0;
  const patch: Record<string, unknown> = {
    name: listName,
    email,
    subscriptionTier,
    memberSource: source,
    updatedAt: nowIso,
  };
  if (!prefSnap.exists) {
    patch.createdAt = nowIso;
    patch.spendingLevel = spendingLevelFromLifetimeSpendCents(totalSpent);
    patch.totalSessions = 0;
    patch.notes = "";
    patch.tags = [];
    patch.reminders = [];
    patch.engagementHistory = [];
  }
  await prefRef.set(patch, { merge: true });
}

async function ensureFanDmThreadForMember(
  db: Firestore,
  creatorId: string,
  fanId: string,
  nowIso: string
): Promise<void> {
  const threadId = getThreadId(creatorId, fanId);
  const ref = db.collection(FAN_DM_THREADS).doc(threadId);
  const snap = await ref.get();
  if (snap.exists) return;
  await ref.set({
    creatorId,
    fanId,
    lastMessageAt: nowIso,
    lastMessagePreview: "",
    fanHasSentMessage: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..");

function parseArgs(): { dryRun: boolean; skipThreads: boolean; creatorId: string } {
  const args = process.argv.slice(2);
  let dryRun = false;
  let skipThreads = false;
  let creatorId = process.env.ECHOFLUX_CREATOR_ID || "";
  for (const a of args) {
    if (a === "--dry-run") dryRun = true;
    if (a === "--skip-threads") skipThreads = true;
    if (a.startsWith("--creator-id=")) creatorId = a.slice("--creator-id=".length).trim();
  }
  return { dryRun, skipThreads, creatorId };
}

async function main(): Promise<void> {
  const { dryRun, skipThreads, creatorId } = parseArgs();
  if (!creatorId) {
    console.error("Missing --creator-id=YOUR_FIREBASE_UID (or set ECHOFLUX_CREATOR_ID).");
    process.exit(1);
  }

  const saPath =
    process.env.ECHOFLUX_SERVICE_ACCOUNT ||
    path.join(PROJECT_ROOT, "echoflux-service-account.json");
  if (!fs.existsSync(saPath)) {
    console.error("Service account JSON not found:", saPath);
    console.error("Set ECHOFLUX_SERVICE_ACCOUNT or place echoflux-service-account.json in project root.");
    process.exit(1);
  }

  const key = JSON.parse(fs.readFileSync(saPath, "utf8")) as admin.ServiceAccount;
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(key) });
  }
  const db = admin.firestore();

  const creatorSnap = await db.collection("creators").doc(creatorId).get();
  if (!creatorSnap.exists) {
    console.warn("Warning: creators/" + creatorId + " does not exist. Continuing anyway.");
  }

  const snap = await db.collection("creators").doc(creatorId).collection("fans").get();
  console.log(`Found ${snap.size} docs under creators/${creatorId}/fans`);

  if (dryRun) {
    for (const d of snap.docs) {
      console.log(`[dry-run] would upsert onlyfans_fan_preferences + ${skipThreads ? "(skip threads)" : "fanDmThreads"} for fanId=${d.id}`);
    }
    console.log("Dry run complete — no writes.");
    return;
  }

  const nowIso = new Date().toISOString();
  let ok = 0;
  let err = 0;
  for (const d of snap.docs) {
    const fanId = d.id;
    try {
      await upsertFanHubFanPreferenceFromMember(db, creatorId, fanId, nowIso, "backfill_script");
      if (!skipThreads) {
        await ensureFanDmThreadForMember(db, creatorId, fanId, nowIso);
      }
      ok++;
      if (ok % 5 === 0 || ok === snap.size) {
        process.stdout.write(`\rProcessed ${ok}/${snap.size}`);
      }
    } catch (e) {
      err++;
      console.error(`\nError fanId=${fanId}:`, e);
    }
  }
  console.log(`\nDone. Upserted ${ok} fan preference docs.${err ? ` Errors: ${err}.` : ""}`);
  if (skipThreads) {
    console.log("(Skipped fanDmThreads — use without --skip-threads to create message list placeholders.)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
