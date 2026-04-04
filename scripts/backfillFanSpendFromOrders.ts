/**
 * Recompute creators/{creatorId}/fans/{fanId} spend fields from top-level `orders`
 * so totals match Fan Hub → Users / Purchases after migrating Stormij purchases → orders.
 *
 * Does not delete orders. Uses merge writes on fan docs.
 *
 * Optional: --stormij-signup-fix — for fans with migratedFrom === "stormij", set
 * subscribedAt + createdAt to the earlier of (current values, earliest order date)
 * so signup dates align with first purchase when migration used serverTimestamp().
 *
 * Usage:
 *   npm run backfill:fan-spend-from-orders -- --creator-id=YOUR_UID [--dry-run] [--stormij-signup-fix]
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

function parseArgs() {
  const creatorArg = process.argv.find((a) => a.startsWith("--creator-id="));
  const creatorId = creatorArg?.replace("--creator-id=", "").trim() || "";
  const dryRun = process.argv.includes("--dry-run");
  const stormijSignupFix = process.argv.includes("--stormij-signup-fix");
  if (!creatorId) {
    console.error(
      "Usage: npm run backfill:fan-spend-from-orders -- --creator-id=YOUR_UID [--dry-run] [--stormij-signup-fix]",
    );
    process.exit(1);
  }
  return { creatorId, dryRun, stormijSignupFix };
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

function toTimestamp(ms: number): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromMillis(ms);
}

async function main() {
  const { creatorId, dryRun, stormijSignupFix } = parseArgs();

  if (!fs.existsSync(ECHOFLUX_SERVICE_ACCOUNT_PATH)) {
    console.error("Service account not found:", ECHOFLUX_SERVICE_ACCOUNT_PATH);
    process.exit(1);
  }

  const key = JSON.parse(fs.readFileSync(ECHOFLUX_SERVICE_ACCOUNT_PATH, "utf8")) as admin.ServiceAccount;
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(key) });
  }
  const db = admin.firestore();

  const snap = await db.collection("orders").where("creatorId", "==", creatorId).get();
  console.log(`Orders for creatorId=${creatorId}: ${snap.size}`);

  type Agg = {
    totalCents: number;
    productCount: number;
    earliestMs: number;
    latestMs: number;
  };
  const byFan = new Map<string, Agg>();

  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    const fanId = typeof d.fanId === "string" ? d.fanId.trim() : "";
    if (!fanId) continue;
    const status = String(d.status || "paid").toLowerCase();
    if (status === "refunded") continue;
    const amount = typeof d.amountCents === "number" && Number.isFinite(d.amountCents) ? d.amountCents : 0;
    const type = String(d.type || "product");
    const ms = createdAtToMs(d.createdAt);
    if (!byFan.has(fanId)) {
      byFan.set(fanId, {
        totalCents: 0,
        productCount: 0,
        earliestMs: ms > 0 ? ms : Number.MAX_SAFE_INTEGER,
        latestMs: ms,
      });
    }
    const a = byFan.get(fanId)!;
    a.totalCents += amount;
    if (type === "product") a.productCount += 1;
    if (ms > 0) {
      if (ms < a.earliestMs) a.earliestMs = ms;
      if (ms > a.latestMs) a.latestMs = ms;
    }
  }

  let updated = 0;
  let skipped = 0;

  for (const [fanId, agg] of byFan) {
    if (agg.earliestMs === Number.MAX_SAFE_INTEGER) agg.earliestMs = 0;

    const fanRef = db.collection("creators").doc(creatorId).collection("fans").doc(fanId);
    const fanSnap = await fanRef.get();
    if (!fanSnap.exists) {
      console.warn(`  No fans/${fanId} — skip spend (orders reference missing fan doc)`);
      skipped++;
      continue;
    }

    const fanData = fanSnap.data() as Record<string, unknown>;
    const patch: Record<string, unknown> = {
      totalSpentCents: agg.totalCents,
      purchaseCount: agg.productCount,
      updatedAt: new Date().toISOString(),
    };
    if (agg.latestMs > 0) {
      patch.lastPurchaseAt = new Date(agg.latestMs).toISOString();
    }

    if (stormijSignupFix && fanData.migratedFrom === "stormij" && agg.earliestMs > 0) {
      const earliest = agg.earliestMs;
      const subMs = createdAtToMs(fanData.subscribedAt);
      const creMs = createdAtToMs(fanData.createdAt);
      const newSubMs = subMs > 0 ? Math.min(subMs, earliest) : earliest;
      const newCreMs = creMs > 0 ? Math.min(creMs, earliest) : earliest;
      patch.subscribedAt = toTimestamp(newSubMs);
      patch.createdAt = toTimestamp(newCreMs);
    }

    if (dryRun) {
      let signupNote = "";
      if (stormijSignupFix && fanData.migratedFrom === "stormij" && agg.earliestMs > 0) {
        signupNote = ` signup/createdAt ← min(existing, ${new Date(agg.earliestMs).toISOString()})`;
      }
      console.log(
        `  [DRY RUN] fans/${fanId}: totalSpentCents=${agg.totalCents} purchaseCount=${agg.productCount}${signupNote}`,
      );
      updated++;
      continue;
    }

    await fanRef.set(patch, { merge: true });
    updated++;
    console.log(`  Updated fans/${fanId}: spend ${(agg.totalCents / 100).toFixed(2)} purchaseCount=${agg.productCount}`);
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
