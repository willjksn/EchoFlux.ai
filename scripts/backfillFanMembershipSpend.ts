/**
 * Backfill creators/{creatorId}/fans/{fanId}.totalMembershipCents from subscription orders.
 *
 * Usage:
 *   npx ts-node --esm scripts/backfillFanMembershipSpend.ts --creator-id=CREATOR_UID --dry-run
 *   npx ts-node --esm scripts/backfillFanMembershipSpend.ts --all-creators --dry-run
 *   npx ts-node --esm scripts/backfillFanMembershipSpend.ts --all-creators --write
 */

import admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..");

const ECHOFLUX_SERVICE_ACCOUNT_PATH =
  process.env.ECHOFLUX_SERVICE_ACCOUNT || path.join(PROJECT_ROOT, "echoflux-service-account.json");

type Args = {
  creatorId: string;
  allCreators: boolean;
  dryRun: boolean;
};

type MembershipAgg = {
  creatorId: string;
  fanId: string;
  fanEmail: string | null;
  totalMembershipCents: number;
  membershipPaymentCount: number;
  latestPaymentMs: number;
};

function parseArgs(): Args {
  const creatorArg = process.argv.find((a) => a.startsWith("--creator-id="));
  const creatorId = creatorArg?.replace("--creator-id=", "").trim() || "";
  const allCreators = process.argv.includes("--all-creators");
  const write = process.argv.includes("--write");
  const dryRun = !write || process.argv.includes("--dry-run");

  if ((allCreators && creatorId) || (!allCreators && !creatorId)) {
    console.error(
      "Usage: npx ts-node --esm scripts/backfillFanMembershipSpend.ts (--creator-id=CREATOR_UID | --all-creators) [--dry-run | --write]",
    );
    process.exit(1);
  }

  return { creatorId, allCreators, dryRun };
}

function createdAtToMs(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof (raw as { toDate?: () => Date }).toDate === "function") {
    return (raw as { toDate: () => Date }).toDate().getTime();
  }
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === "string") {
    const t = Date.parse(raw);
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  return 0;
}

function positiveCents(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
}

async function resolveFanRef(
  db: admin.firestore.Firestore,
  agg: MembershipAgg,
): Promise<admin.firestore.DocumentReference | null> {
  const fansRef = db.collection("creators").doc(agg.creatorId).collection("fans");
  if (agg.fanId) {
    const directRef = fansRef.doc(agg.fanId);
    const directSnap = await directRef.get();
    if (directSnap.exists) return directRef;
  }

  if (!agg.fanEmail) return null;
  const emailSnap = await fansRef.where("email", "==", agg.fanEmail).limit(2).get();
  if (emailSnap.size === 1) return emailSnap.docs[0].ref;
  return null;
}

async function main() {
  const { creatorId, allCreators, dryRun } = parseArgs();

  if (!fs.existsSync(ECHOFLUX_SERVICE_ACCOUNT_PATH)) {
    console.error("Service account not found:", ECHOFLUX_SERVICE_ACCOUNT_PATH);
    process.exit(1);
  }

  const key = JSON.parse(fs.readFileSync(ECHOFLUX_SERVICE_ACCOUNT_PATH, "utf8")) as admin.ServiceAccount;
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(key) });
  }
  const db = admin.firestore();

  let query: admin.firestore.Query = db.collection("orders").where("type", "==", "subscription");
  if (!allCreators) {
    query = query.where("creatorId", "==", creatorId);
  }

  const snap = await query.get();
  console.log(
    `${dryRun ? "[DRY RUN] " : ""}Subscription orders${allCreators ? "" : ` for creatorId=${creatorId}`}: ${snap.size}`,
  );

  const byCreatorFan = new Map<string, MembershipAgg>();
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const status = typeof data.status === "string" ? data.status.trim().toLowerCase() : "";
    if (status === "refunded") continue;

    const rowCreatorId = typeof data.creatorId === "string" ? data.creatorId.trim() : "";
    const fanId = typeof data.fanId === "string" ? data.fanId.trim() : "";
    if (!rowCreatorId || !fanId) continue;

    const amount = positiveCents(data.amountCents);
    if (amount <= 0) continue;

    const fanEmail =
      typeof data.fanEmail === "string" && data.fanEmail.trim()
        ? data.fanEmail.trim().toLowerCase()
        : null;
    const key = `${rowCreatorId}\n${fanId}`;
    const existing = byCreatorFan.get(key);
    const ms = createdAtToMs(data.createdAt);
    if (existing) {
      existing.totalMembershipCents += amount;
      existing.membershipPaymentCount += 1;
      if (!existing.fanEmail && fanEmail) existing.fanEmail = fanEmail;
      if (ms > existing.latestPaymentMs) existing.latestPaymentMs = ms;
    } else {
      byCreatorFan.set(key, {
        creatorId: rowCreatorId,
        fanId,
        fanEmail,
        totalMembershipCents: amount,
        membershipPaymentCount: 1,
        latestPaymentMs: ms,
      });
    }
  }

  let updated = 0;
  let skipped = 0;
  for (const agg of byCreatorFan.values()) {
    const fanRef = await resolveFanRef(db, agg);
    if (!fanRef) {
      console.warn(`  Skip creator=${agg.creatorId} fan=${agg.fanId}: no unique fan doc match`);
      skipped += 1;
      continue;
    }

    const fanSnap = await fanRef.get();
    const fanData = fanSnap.data() as Record<string, unknown>;
    const existingTotalSpent = positiveCents(fanData.totalSpentCents);
    const existingMembership = positiveCents(fanData.totalMembershipCents);
    const patch: Record<string, unknown> = {
      totalMembershipCents: Math.max(existingMembership, agg.totalMembershipCents),
      membershipPaymentCount: agg.membershipPaymentCount,
      totalSpentCents: Math.max(existingTotalSpent, agg.totalMembershipCents),
      updatedAt: new Date().toISOString(),
    };
    if (agg.latestPaymentMs > 0) {
      patch.lastPaymentAt = new Date(agg.latestPaymentMs).toISOString();
    }

    if (dryRun) {
      console.log(
        `  [DRY RUN] ${fanRef.path}: membership=${patch.totalMembershipCents} payments=${patch.membershipPaymentCount} totalSpent=${patch.totalSpentCents}`,
      );
    } else {
      await fanRef.set(patch, { merge: true });
      console.log(
        `  Updated ${fanRef.path}: membership=${patch.totalMembershipCents} payments=${patch.membershipPaymentCount}`,
      );
    }
    updated += 1;
  }

  console.log(
    dryRun
      ? `[DRY RUN] Would update ${updated} fan doc(s), skipped ${skipped}`
      : `Done. Updated ${updated} fan doc(s), skipped ${skipped}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
