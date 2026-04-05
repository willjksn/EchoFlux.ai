/**
 * Admin-only: merge subscription fields on existing fan rows so User Management / entitlements match Stripe.
 *
 * Safety:
 * - Dry-run by default (no writes until you pass --apply).
 * - Only updates known fields; never deletes fan docs or subcollections.
 * - If a row has subscriptionStatus "canceled" but subscriptionCurrentPeriodEnd is still in the future,
 *   the script normalizes to active + cancelAtPeriodEnd (matches Stripe "cancel at period end" and
 *   keeps getFanEntitlement returning subscribed: true until the period ends).
 *
 * Copies example config:
 *   scripts/fan-subscription-backfill.example.json
 * Prefer a gitignored local file:
 *   scripts/fan-subscription-backfill.local.json
 *
 * Usage (note the space before --config):
 *   npx ts-node --esm scripts/backfillFanSubscriptionAccess.ts --creator-id=YOUR_UID --config=scripts/fan-subscription-backfill.example.json
 *   npx ts-node --esm scripts/backfillFanSubscriptionAccess.ts --creator-id=YOUR_UID --config=scripts/fan-subscription-backfill.local.json --apply
 * Or two-token form:
 *   ... --creator-id YOUR_UID --config scripts/fan-subscription-backfill.local.json
 *
 * Env: ECHOFLUX_SERVICE_ACCOUNT=path/to/service-account.json (default: ./echoflux-service-account.json)
 */
import admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import type { Firestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..");

const ECHOFLUX_SERVICE_ACCOUNT_PATH =
  process.env.ECHOFLUX_SERVICE_ACCOUNT || path.join(PROJECT_ROOT, "echoflux-service-account.json");

/**
 * Parses --creator-id and --config. Supports:
 * - --creator-id=UID --config=path (must be separate argv tokens, or a space between =value and --config)
 * - --creator-id UID --config path
 * Heals common typo: --creator-id=UID--config=path (no space before --config)
 */
function parseCreatorAndConfig(): { creatorId: string | null; configPath: string | null } {
  let creatorId: string | null = null;
  let configPath: string | null = null;

  const ciArg = process.argv.find((a) => a.startsWith("--creator-id="));
  if (ciArg) {
    let rest = ciArg.slice("--creator-id=".length).trim();
    const glued = rest.indexOf("--config=");
    if (glued >= 0) {
      configPath = rest.slice(glued + "--config=".length).trim();
      rest = rest.slice(0, glued).trim();
    }
    creatorId = rest || null;
  } else {
    const i = process.argv.indexOf("--creator-id");
    if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) {
      creatorId = process.argv[i + 1].trim();
    }
  }

  if (!configPath) {
    const cfgArg = process.argv.find((a) => a.startsWith("--config="));
    if (cfgArg) {
      configPath = cfgArg.slice("--config=".length).trim();
    } else {
      const j = process.argv.indexOf("--config");
      if (j >= 0 && process.argv[j + 1] && !process.argv[j + 1].startsWith("--")) {
        configPath = process.argv[j + 1].trim();
      }
    }
  }

  return { creatorId, configPath };
}

const { creatorId, configPath } = parseCreatorAndConfig();
const apply = process.argv.includes("--apply");

interface MemberRow {
  authUid: string;
  email: string;
  subscriptionStatus: string;
  cancelAtPeriodEnd: boolean;
  subscriptionCurrentPeriodEnd: string | null | undefined;
  subscribedAt: string | null | undefined;
}

function compoundFanDocId(authUid: string, email: string): string {
  return `${authUid}-${email.trim().toLowerCase()}`;
}

function parseMemberRow(raw: Record<string, unknown>, index: number): MemberRow {
  const authUid = typeof raw.authUid === "string" ? raw.authUid.trim() : "";
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  if (!authUid || !email) {
    throw new Error(`members[${index}]: authUid and email are required`);
  }
  const subscriptionStatus =
    typeof raw.subscriptionStatus === "string" ? raw.subscriptionStatus.trim().toLowerCase() : "";
  if (!subscriptionStatus) {
    throw new Error(`members[${index}]: subscriptionStatus is required`);
  }
  let cancelAtPeriodEnd = raw.cancelAtPeriodEnd === true;
  let subStatus = subscriptionStatus === "cancelled" ? "canceled" : subscriptionStatus;

  let periodEnd: string | null | undefined;
  if (raw.subscriptionCurrentPeriodEnd === null) {
    periodEnd = null;
  } else if (typeof raw.subscriptionCurrentPeriodEnd === "string") {
    periodEnd = raw.subscriptionCurrentPeriodEnd.trim();
  } else if (raw.subscriptionCurrentPeriodEnd !== undefined) {
    throw new Error(`members[${index}]: subscriptionCurrentPeriodEnd must be string or null`);
  }

  let subscribedAt: string | null | undefined;
  if (raw.subscribedAt === null) subscribedAt = null;
  else if (typeof raw.subscribedAt === "string") subscribedAt = raw.subscribedAt.trim();
  else if (raw.subscribedAt !== undefined) {
    throw new Error(`members[${index}]: subscribedAt must be string or null`);
  }

  const endMs = periodEnd ? Date.parse(periodEnd) : NaN;
  const future = Number.isFinite(endMs) && endMs > Date.now();
  if (future && (subStatus === "canceled" || subStatus === "cancelled")) {
    console.warn(
      `[normalize] ${authUid}: status was canceled with future period end → active + cancelAtPeriodEnd ` +
        "(required so fans still see the hub until the period ends).",
    );
    subStatus = "active";
    cancelAtPeriodEnd = true;
  }

  return {
    authUid,
    email,
    subscriptionStatus: subStatus,
    cancelAtPeriodEnd,
    subscriptionCurrentPeriodEnd: periodEnd,
    subscribedAt,
  };
}

function normalizeConfig(raw: unknown): MemberRow[] {
  if (!raw || typeof raw !== "object") throw new Error("Config root must be an object");
  const members = (raw as { members?: unknown }).members;
  if (!Array.isArray(members)) throw new Error('Config must contain a "members" array');
  return members.map((m, i) => parseMemberRow(m as Record<string, unknown>, i));
}

function buildFanPatch(row: MemberRow, nowIso: string): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    subscriptionStatus: row.subscriptionStatus,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    updatedAt: nowIso,
  };
  if (row.subscriptionCurrentPeriodEnd !== undefined) {
    patch.subscriptionCurrentPeriodEnd = row.subscriptionCurrentPeriodEnd;
  }
  if (row.subscribedAt !== undefined) {
    patch.subscribedAt = row.subscribedAt;
  }
  patch.email = row.email;
  return patch;
}

function buildSubscriberPatch(row: MemberRow, nowIso: string): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    status: row.subscriptionStatus,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    updatedAt: nowIso,
  };
  if (row.subscriptionCurrentPeriodEnd !== undefined) {
    patch.currentPeriodEnd = row.subscriptionCurrentPeriodEnd;
  }
  return patch;
}

function grantShouldBeActive(row: MemberRow): boolean {
  return row.subscriptionStatus === "active" || row.subscriptionStatus === "trialing";
}

async function existingFanDocIds(db: Firestore, fanDocCandidates: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const id of fanDocCandidates) {
    const snap = await db.collection("creators").doc(creatorId!).collection("fans").doc(id).get();
    if (snap.exists) out.push(id);
  }
  return out;
}

async function main() {
  if (!creatorId) {
    console.error(
      "Usage: npx ts-node --esm scripts/backfillFanSubscriptionAccess.ts --creator-id=CREATOR_UID --config=path.json [--apply]",
    );
    process.exit(1);
  }
  if (!configPath) {
    console.error("Missing --config=path/to.json (see scripts/fan-subscription-backfill.example.json)");
    process.exit(1);
  }
  const resolvedConfig = path.isAbsolute(configPath) ? configPath : path.join(PROJECT_ROOT, configPath);
  if (!fs.existsSync(resolvedConfig)) {
    console.error("Config not found:", resolvedConfig);
    console.error(
      "Hint: copy scripts/fan-subscription-backfill.example.json to scripts/fan-subscription-backfill.local.json, " +
        "or pass --config=scripts/fan-subscription-backfill.example.json",
    );
    process.exit(1);
  }
  if (!fs.existsSync(ECHOFLUX_SERVICE_ACCOUNT_PATH)) {
    console.error("Service account not found:", ECHOFLUX_SERVICE_ACCOUNT_PATH);
    process.exit(1);
  }

  const key = JSON.parse(fs.readFileSync(ECHOFLUX_SERVICE_ACCOUNT_PATH, "utf8")) as admin.ServiceAccount;
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(key) });
  }
  const db = admin.firestore();

  const members = normalizeConfig(JSON.parse(fs.readFileSync(resolvedConfig, "utf8")));
  const nowIso = new Date().toISOString();

  console.log(apply ? "MODE: APPLY (writes enabled)" : "MODE: DRY RUN (no writes). Pass --apply to write.");
  console.log(`Creator: ${creatorId}`);
  console.log(`Rows: ${members.length}\n`);

  for (const row of members) {
    const compound = compoundFanDocId(row.authUid, row.email);
    const candidates = Array.from(new Set([row.authUid, compound]));
    const found = await existingFanDocIds(db, candidates);
    const fanPatch = buildFanPatch(row, nowIso);
    const subPatch = buildSubscriberPatch(row, nowIso);
    const grantActive = grantShouldBeActive(row);

    console.log(`— ${row.email} (${row.authUid})`);
    console.log(`  Fan doc candidates: ${candidates.join(" | ")}`);
    console.log(`  Existing fan docs:  ${found.length ? found.join(", ") : "(none)"}`);
    console.log(`  Fan patch:          ${JSON.stringify(fanPatch)}`);
    console.log(`  Subscriber patch: ${JSON.stringify(subPatch)}`);
    console.log(`  Grant subscription: ${grantActive} (merge on grants/${row.authUid} only)`);

    if (found.length === 0) {
      console.warn(`  SKIP: no fans doc under creators/${creatorId}/fans for this member.`);
      console.warn(`        Create or merge the fan row first (e.g. Stripe checkout / merge:fan-to-auth-uid).`);
      continue;
    }

    if (!apply) continue;

    for (const fanDocId of found) {
      await db
        .collection("creators")
        .doc(creatorId)
        .collection("fans")
        .doc(fanDocId)
        .set(fanPatch, { merge: true });
      console.log(`  ✓ merged fans/${fanDocId}`);
    }

    for (const fanDocId of found) {
      await db
        .collection("creatorSubscribers")
        .doc(creatorId)
        .collection("subscribers")
        .doc(fanDocId)
        .set(subPatch, { merge: true });
      console.log(`  ✓ merged creatorSubscribers/.../subscribers/${fanDocId}`);
    }

    const grantRef = db.collection("creatorEntitlements").doc(creatorId).collection("grants").doc(row.authUid);
    const grantSnap = await grantRef.get();
    const g = grantSnap.exists ? (grantSnap.data() as Record<string, unknown>) : {};
    const existingProducts = Array.isArray(g.unlockedProductIds) ? g.unlockedProductIds : [];
    const existingPosts = Array.isArray(g.unlockedFanPostIds) ? g.unlockedFanPostIds : [];
    await grantRef.set(
      {
        subscription: grantActive,
        unlockedProductIds: existingProducts,
        unlockedFanPostIds: existingPosts,
        updatedAt: nowIso,
      },
      { merge: true },
    );
    console.log(`  ✓ merged grants/${row.authUid}`);
  }

  console.log(apply ? "\nDone (writes applied)." : "\nDry run complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
