/**
 * Merge creators/{creatorId}/fans/{fromFanId} into fans/{toFanId} where toFanId is the real
 * Firebase Auth UID (e.g. fan doc was created with email as doc id — see report:fans-missing-auth).
 *
 * Updates: fans, creatorEntitlements grants, creatorSubscribers subscribers, orders (fanId),
 * creatorBlocks blocked, fanDmThreads (+ messages copy), users/.../onlyfans_fan_preferences.
 *
 * Usage (dry-run by default):
 *   npx ts-node --esm scripts/mergeFansDocToAuthUid.ts --creator-id=CREATOR_UID --from-fan-id=OLD_DOC_ID --to-fan-id=AUTH_UID
 *   npx ts-node --esm scripts/mergeFansDocToAuthUid.ts --creator-id=CREATOR_UID --from-fan-id=OLD --to-fan-id=AUTH_UID --apply
 *
 * Env: ECHOFLUX_SERVICE_ACCOUNT=path/to/echoflux-service-account.json
 */
import admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..");

const ECHOFLUX_SERVICE_ACCOUNT_PATH =
  process.env.ECHOFLUX_SERVICE_ACCOUNT || path.join(PROJECT_ROOT, "echoflux-service-account.json");

const FAN_DM_THREADS = "fanDmThreads";
const FAN_DM_MESSAGES = "messages";

function getThreadId(creatorId: string, fanId: string): string {
  return [creatorId, fanId].sort().join("_");
}

function arg(name: string): string | null {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  if (hit) return hit.slice(pref.length).trim();
  return null;
}

const creatorId = arg("creator-id");
const fromFanId = arg("from-fan-id");
const toFanId = arg("to-fan-id");
const apply = process.argv.includes("--apply");

if (!creatorId || !fromFanId || !toFanId) {
  console.error(
    "Usage: npx ts-node --esm scripts/mergeFansDocToAuthUid.ts --creator-id=UID --from-fan-id=OLD --to-fan-id=AUTH_UID [--apply]",
  );
  process.exit(1);
}

if (fromFanId === toFanId) {
  console.error("--from-fan-id and --to-fan-id must differ.");
  process.exit(1);
}

function statusRank(s: unknown): number {
  const x = String(s || "")
    .toLowerCase()
    .trim();
  if (x === "active" || x === "trialing") return 4;
  if (x === "past_due") return 3;
  if (x === "free") return 2;
  if (x === "canceled" || x === "cancelled" || x === "unpaid") return 1;
  return 0;
}

function toMillis(v: unknown): number {
  if (v == null) return 0;
  if (typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().getTime();
  }
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    return v < 1e12 ? v * 1000 : v;
  }
  return 0;
}

function mergeFanRows(
  from: Record<string, unknown>,
  to: Record<string, unknown>,
  canonicalUid: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...from, ...to };
  out.id = canonicalUid;
  out.creatorId = creatorId;

  const rFrom = statusRank(from.subscriptionStatus);
  const rTo = statusRank(to.subscriptionStatus);
  if (rFrom > rTo) out.subscriptionStatus = from.subscriptionStatus;
  else if (rTo > 0) out.subscriptionStatus = to.subscriptionStatus;
  else out.subscriptionStatus = from.subscriptionStatus ?? to.subscriptionStatus;

  const peFrom = toMillis(from.subscriptionCurrentPeriodEnd);
  const peTo = toMillis(to.subscriptionCurrentPeriodEnd);
  if (peFrom > peTo) out.subscriptionCurrentPeriodEnd = from.subscriptionCurrentPeriodEnd;
  else if (peTo > 0) out.subscriptionCurrentPeriodEnd = to.subscriptionCurrentPeriodEnd;
  else out.subscriptionCurrentPeriodEnd = from.subscriptionCurrentPeriodEnd ?? to.subscriptionCurrentPeriodEnd;

  const caFrom = from.cancelAtPeriodEnd === true;
  const caTo = to.cancelAtPeriodEnd === true;
  out.cancelAtPeriodEnd = caFrom || caTo;

  const spent =
    (typeof from.totalSpentCents === "number" ? from.totalSpentCents : 0) +
    (typeof to.totalSpentCents === "number" ? to.totalSpentCents : 0);
  const pc =
    (typeof from.purchaseCount === "number" ? from.purchaseCount : 0) +
    (typeof to.purchaseCount === "number" ? to.purchaseCount : 0);
  if (spent > 0) out.totalSpentCents = spent;
  if (pc > 0) out.purchaseCount = pc;

  const em =
    (typeof from.email === "string" && from.email.trim()) ||
    (typeof to.email === "string" && to.email.trim()) ||
    "";
  if (em) out.email = em.trim().toLowerCase();

  out.mergedFromFanDocId = fromFanId;
  out.mergedIntoAuthUidAt = new Date().toISOString();
  return out;
}

async function copyDmThread(db: Firestore, oldTid: string, newTid: string, dryRun: boolean): Promise<number> {
  const oldRef = db.collection(FAN_DM_THREADS).doc(oldTid);
  const oldSnap = await oldRef.get();
  if (!oldSnap.exists) return 0;

  const messagesSnap = await oldRef.collection(FAN_DM_MESSAGES).get();
  if (dryRun) {
    console.log(`  [DRY RUN] Would copy fanDmThreads/${oldTid} → ${newTid} (${messagesSnap.size} messages)`);
    return messagesSnap.size;
  }

  const batchSize = 400;
  const newRef = db.collection(FAN_DM_THREADS).doc(newTid);
  const data = oldSnap.data() as Record<string, unknown>;
  data.creatorId = creatorId;
  data.fanId = toFanId;
  data.updatedAt = new Date().toISOString();
  await newRef.set(data, { merge: true });

  let written = 0;
  const docs = messagesSnap.docs;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + batchSize)) {
      const dest = newRef.collection(FAN_DM_MESSAGES).doc(d.id);
      batch.set(dest, d.data() as Record<string, unknown>);
    }
    await batch.commit();
    written += Math.min(batchSize, docs.length - i);
  }

  for (const d of docs) {
    await d.ref.delete().catch(() => undefined);
  }
  await oldRef.delete().catch(() => undefined);
  return messagesSnap.size;
}

async function main() {
  if (!fs.existsSync(ECHOFLUX_SERVICE_ACCOUNT_PATH)) {
    console.error("Service account not found:", ECHOFLUX_SERVICE_ACCOUNT_PATH);
    process.exit(1);
  }

  const key = JSON.parse(fs.readFileSync(ECHOFLUX_SERVICE_ACCOUNT_PATH, "utf8")) as admin.ServiceAccount;
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(key) });
  }
  const db = admin.firestore();
  const auth = admin.auth();

  try {
    await auth.getUser(toFanId);
  } catch {
    console.error(`No Firebase Auth user with uid=${toFanId}. Create/import the user first.`);
    process.exit(1);
  }

  const fromRef = db.collection("creators").doc(creatorId).collection("fans").doc(fromFanId);
  const toRef = db.collection("creators").doc(creatorId).collection("fans").doc(toFanId);
  const [fromSnap, toSnap] = await Promise.all([fromRef.get(), toRef.get()]);

  if (!fromSnap.exists) {
    console.error(`Missing source: creators/${creatorId}/fans/${fromFanId}`);
    process.exit(1);
  }

  const fromData = fromSnap.data() as Record<string, unknown>;
  const toData = toSnap.exists ? (toSnap.data() as Record<string, unknown>) : {};
  const mergedFan = mergeFanRows(fromData, toData, toFanId);

  console.log(apply ? "APPLY" : "DRY RUN");
  console.log(`Merge fans/${fromFanId} → fans/${toFanId} (creator ${creatorId})`);

  if (!apply) {
    console.log("Merged fan keys (preview):", Object.keys(mergedFan).sort().join(", "));
  }

  const fromGrantRef = db.collection("creatorEntitlements").doc(creatorId).collection("grants").doc(fromFanId);
  const toGrantRef = db.collection("creatorEntitlements").doc(creatorId).collection("grants").doc(toFanId);
  const [gFrom, gTo] = await Promise.all([fromGrantRef.get(), toGrantRef.get()]);
  const gFromD = gFrom.data() as {
    unlockedProductIds?: string[];
    unlockedFanPostIds?: string[];
    subscription?: boolean;
  } | undefined;
  const gToD = gTo.data() as {
    unlockedProductIds?: string[];
    unlockedFanPostIds?: string[];
    subscription?: boolean;
  } | undefined;
  const uFrom = Array.isArray(gFromD?.unlockedProductIds) ? [...gFromD.unlockedProductIds] : [];
  const uTo = Array.isArray(gToD?.unlockedProductIds) ? [...gToD.unlockedProductIds] : [];
  const mergedUnlock = [...new Set([...uTo, ...uFrom])];
  const pFrom = Array.isArray(gFromD?.unlockedFanPostIds) ? [...gFromD.unlockedFanPostIds] : [];
  const pTo = Array.isArray(gToD?.unlockedFanPostIds) ? [...gToD.unlockedFanPostIds] : [];
  const mergedPosts = [...new Set([...pTo, ...pFrom])];
  const subActive = gFromD?.subscription === true || gToD?.subscription === true;

  const fromSubRef = db.collection("creatorSubscribers").doc(creatorId).collection("subscribers").doc(fromFanId);
  const toSubRef = db.collection("creatorSubscribers").doc(creatorId).collection("subscribers").doc(toFanId);
  const [sFrom, sTo] = await Promise.all([fromSubRef.get(), toSubRef.get()]);
  const mergedSubData: Record<string, unknown> = {
    ...(sFrom.exists ? (sFrom.data() as Record<string, unknown>) : {}),
    ...(sTo.exists ? (sTo.data() as Record<string, unknown>) : {}),
  };

  const ordersSnap = await db
    .collection("orders")
    .where("fanId", "==", fromFanId)
    .limit(500)
    .get();
  const ordersForCreator = ordersSnap.docs.filter((d) => (d.data() as { creatorId?: string }).creatorId === creatorId);

  const oldThreadId = getThreadId(creatorId, fromFanId);
  const newThreadId = getThreadId(creatorId, toFanId);

  const blockFromRef = db.collection("creatorBlocks").doc(creatorId).collection("blocked").doc(fromFanId);
  const blockToRef = db.collection("creatorBlocks").doc(creatorId).collection("blocked").doc(toFanId);
  const blockFromSnap = await blockFromRef.get();

  const prefFromRef = db.collection("users").doc(creatorId).collection("onlyfans_fan_preferences").doc(fromFanId);
  const prefToRef = db.collection("users").doc(creatorId).collection("onlyfans_fan_preferences").doc(toFanId);
  const prefFromSnap = await prefFromRef.get();

  console.log(
    `  Grants: products ${uFrom.length} + ${uTo.length} → ${mergedUnlock.length} unique; posts ${pFrom.length} + ${pTo.length} → ${mergedPosts.length}`,
  );
  console.log(`  Orders to repoint fanId: ${ordersForCreator.length}`);
  console.log(`  DM thread: ${oldThreadId} → ${newThreadId}${oldThreadId === newThreadId ? " (same — skip copy)" : ""}`);
  console.log(`  Blocked (from): ${blockFromSnap.exists}`);
  console.log(`  Fan hub preferences (from): ${prefFromSnap.exists}`);

  if (!apply) {
    await copyDmThread(db, oldThreadId, newThreadId, true);
    console.log("\nRe-run with --apply to write. Then:");
    console.log(`  npm run report:fans-missing-auth -- --creator-id=${creatorId}`);
    console.log(`  npm run backfill:fan-hub -- --creator-id=${creatorId}`);
    return;
  }

  await toRef.set(mergedFan, { merge: false });
  await fromRef.delete().catch(() => undefined);

  const grantPayload: Record<string, unknown> = {
    unlockedProductIds: mergedUnlock,
    subscription: subActive,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (mergedPosts.length > 0) grantPayload.unlockedFanPostIds = mergedPosts;
  await toGrantRef.set(grantPayload, { merge: true });
  await fromGrantRef.delete().catch(() => undefined);

  if (sFrom.exists || sTo.exists) {
    await toSubRef.set(mergedSubData, { merge: true });
    await fromSubRef.delete().catch(() => undefined);
  }

  for (const d of ordersForCreator) {
    await d.ref.update({
      fanId: toFanId,
      linkedFromMergedFanId: fromFanId,
    });
  }

  if (blockFromSnap.exists) {
    await blockToRef.set(blockFromSnap.data() as Record<string, unknown>, { merge: true });
    await blockFromRef.delete().catch(() => undefined);
  }

  if (oldThreadId !== newThreadId) {
    await copyDmThread(db, oldThreadId, newThreadId, false);
  }

  if (prefFromSnap.exists) {
    await prefToRef.set(prefFromSnap.data() as Record<string, unknown>, { merge: true });
    await prefFromRef.delete().catch(() => undefined);
  }

  console.log("\nDone. Run:");
  console.log(`  npm run report:fans-missing-auth -- --creator-id=${creatorId}`);
  console.log(`  npm run backfill:fan-hub -- --creator-id=${creatorId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
