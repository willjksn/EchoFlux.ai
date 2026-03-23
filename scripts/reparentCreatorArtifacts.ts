/**
 * Reparent EchoFlux data from a legacy creator id (e.g. `YOUR_CREATOR_ID`) onto the real Auth uid
 * (`creators/{uid}`). Safe default: dry-run. Use `--apply` to write.
 *
 * Usage:
 *   npx ts-node --esm scripts/reparentCreatorArtifacts.ts --from=YOUR_CREATOR_ID --to=ZY2JlmlsNmNkAe0LdRXYycDvHSi2
 *   npx ts-node --esm scripts/reparentCreatorArtifacts.ts --from=... --to=... --apply
 *
 * Env: ECHOFLUX_SERVICE_ACCOUNT=path/to/echoflux-service-account.json
 *
 * See: docs/REPART_CREATOR_ARTIFACTS.md
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
const DM_MUTED = "dm_muted_threads";

function getThreadId(creatorId: string, fanId: string): string {
  return [creatorId, fanId].sort().join("_");
}

/** Parse fanId from thread doc id = sort([creatorId,fanId]).join("_"); UIDs do not contain "_". */
function fanIdFromThreadDocId(threadDocId: string, creatorId: string): string | null {
  const parts = threadDocId.split("_");
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  if (a === creatorId) return b;
  if (b === creatorId) return a;
  return null;
}

function argValue(name: string): string | null {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  if (hit) return hit.slice(pref.length).trim();
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) {
    return process.argv[idx + 1].trim();
  }
  return null;
}

const fromId = argValue("from");
const toId = argValue("to");
const apply = process.argv.includes("--apply");
const deleteSourceAfter = process.argv.includes("--delete-source-after");
const skipDmThreads = process.argv.includes("--skip-dm-threads");

if (!fromId || !toId) {
  console.error(
    "Usage: npx ts-node --esm scripts/reparentCreatorArtifacts.ts --from=SOURCE_ID --to=CANONICAL_UID [--apply] [--delete-source-after] [--skip-dm-threads]"
  );
  process.exit(1);
}

if (fromId === toId) {
  console.error("--from and --to must differ.");
  process.exit(1);
}

function deepMergePreferTarget(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  const subRank = (s: string) =>
    ({ active: 5, trialing: 4, past_due: 3, free: 2, canceled: 1, unpaid: 1, incomplete_expired: 0 } as Record<
      string,
      number
    >)[s.toLowerCase()] ?? 0;

  for (const [k, v] of Object.entries(source)) {
    if (v === undefined || v === null) continue;
    const cur = out[k];
    if (cur === undefined || cur === null || cur === "") {
      out[k] = v;
      continue;
    }
    if (k === "totalSpentCents" || k === "totalSpent") {
      out[k] = Math.max(Number(cur) || 0, Number(v) || 0);
      continue;
    }
    if (k === "subscriptionStatus" && typeof v === "string" && typeof cur === "string") {
      if (subRank(v) > subRank(cur)) out[k] = v;
      continue;
    }
    if (k === "updatedAt" || k === "lastPaymentAt" || k === "subscribedAt") {
      const b = String(v);
      const a = String(cur);
      if (b > a) out[k] = v;
      continue;
    }
  }
  return out;
}

async function migrateCreatorSubcollection(
  db: Firestore,
  fromCreator: string,
  toCreator: string,
  subName: string,
  dryRun: boolean
): Promise<{ read: number; written: number }> {
  const snap = await db.collection("creators").doc(fromCreator).collection(subName).get();
  let written = 0;
  for (const doc of snap.docs) {
    const toRef = db.collection("creators").doc(toCreator).collection(subName).doc(doc.id);
    const existing = await toRef.get();
    const srcData = doc.data() as Record<string, unknown>;
    if (!existing.exists) {
      if (!dryRun) await toRef.set(srcData);
      written++;
    } else {
      const merged = deepMergePreferTarget(existing.data() as Record<string, unknown>, srcData);
      if (!dryRun) await toRef.set(merged);
      written++;
    }
  }
  return { read: snap.size, written };
}

async function migrateFanDmThreads(
  db: Firestore,
  from: string,
  to: string,
  dryRun: boolean
): Promise<{ threads: number; messages: number }> {
  let threads = 0;
  let messages = 0;
  let q: import("firebase-admin/firestore").QuerySnapshot;
  try {
    q = await db.collection(FAN_DM_THREADS).where("creatorId", "==", from).get();
  } catch (e) {
    console.warn(
      "fanDmThreads query failed. Create a Firestore composite index on fanDmThreads: creatorId ASC (or run from a project with the index). Error:",
      e
    );
    return { threads: 0, messages: 0 };
  }

  for (const doc of q.docs) {
    const data = doc.data() as { creatorId?: string; fanId?: string };
    let fanId = typeof data.fanId === "string" ? data.fanId : "";
    if (!fanId) {
      fanId = fanIdFromThreadDocId(doc.id, from) || "";
    }
    if (!fanId) continue;

    const newId = getThreadId(to, fanId);
    if (doc.id === newId && data.creatorId === to) continue;

    threads++;
    const newRef = db.collection(FAN_DM_THREADS).doc(newId);
    const newSnap = await newRef.get();
    const payload = { ...data, creatorId: to, updatedAt: new Date().toISOString() };

    const msgSnap = await doc.ref.collection("messages").get();
    messages += msgSnap.size;

    if (dryRun) continue;

    if (!newSnap.exists) {
      await newRef.set(payload);
    } else {
      const merged = deepMergePreferTarget(newSnap.data() as Record<string, unknown>, payload);
      await newRef.set(merged);
    }

    for (const m of msgSnap.docs) {
      const ex = await newRef.collection("messages").doc(m.id).get();
      if (!ex.exists) {
        await newRef.collection("messages").doc(m.id).set(m.data());
      }
    }
  }

  return { threads, messages };
}

/** Copy dm_muted_threads from users/{from} to users/{to} with new thread ids. */
async function migrateDmMutedThreadsUser(
  db: Firestore,
  from: string,
  to: string,
  dryRun: boolean
): Promise<number> {
  const snap = await db.collection("users").doc(from).collection(DM_MUTED).get();
  let n = 0;
  for (const d of snap.docs) {
    const fanId = fanIdFromThreadDocId(d.id, from);
    if (!fanId) continue;
    const newTid = getThreadId(to, fanId);
    n++;
    if (!dryRun) {
      const tRef = db.collection("users").doc(to).collection(DM_MUTED).doc(newTid);
      const ex = await tRef.get();
      if (!ex.exists) await tRef.set(d.data());
      else await tRef.set({ ...ex.data(), ...d.data() }, { merge: true });
    }
  }
  return n;
}

/** Remap existing mirrors on users/{to} that still reference old thread ids. */
async function remapDmMutedOnCanonicalUser(
  db: Firestore,
  from: string,
  to: string,
  dryRun: boolean
): Promise<number> {
  const col = db.collection("users").doc(to).collection(DM_MUTED);
  const snap = await col.get();
  let n = 0;
  for (const d of snap.docs) {
    const oldTid = d.id;
    const fanId = fanIdFromThreadDocId(oldTid, from);
    if (!fanId) continue;
    const newTid = getThreadId(to, fanId);
    if (newTid === oldTid) continue;
    n++;
    if (!dryRun) {
      await col.doc(newTid).set(d.data(), { merge: true });
      await col.doc(oldTid).delete();
    }
  }
  return n;
}

async function mergeDocCollection(
  db: Firestore,
  fromPath: [string, string, string],
  toPath: [string, string, string],
  dryRun: boolean
): Promise<{ read: number; written: number }> {
  const [c1, id1, s1] = fromPath;
  const [c2, id2, s2] = toPath;
  const snap = await db.collection(c1).doc(id1).collection(s1).get();
  let written = 0;
  for (const doc of snap.docs) {
    const tRef = db.collection(c2).doc(id2).collection(s2).doc(doc.id);
    const ex = await tRef.get();
    const src = doc.data() as Record<string, unknown>;
    if (!ex.exists) {
      if (!dryRun) await tRef.set(src);
    } else {
      if (!dryRun) await tRef.set(deepMergePreferTarget(ex.data() as Record<string, unknown>, src));
    }
    written++;
  }
  return { read: snap.size, written };
}

async function updateOrdersCreatorId(db: Firestore, from: string, to: string, dryRun: boolean): Promise<number> {
  const snap = await db.collection("orders").where("creatorId", "==", from).get();
  let n = 0;
  for (const doc of snap.docs) {
    n++;
    if (!dryRun) await doc.ref.update({ creatorId: to });
  }
  return n;
}

async function updateProductsCreatorId(db: Firestore, from: string, to: string, dryRun: boolean): Promise<number> {
  const snap = await db.collection("products").where("creatorId", "==", from).get();
  let n = 0;
  for (const doc of snap.docs) {
    n++;
    if (!dryRun) await doc.ref.update({ creatorId: to });
  }
  return n;
}

async function patchCreatorHandlesAndDomains(
  db: Firestore,
  from: string,
  to: string,
  handleHint: string | null,
  dryRun: boolean
) {
  if (handleHint) {
    const h = handleHint.trim().toLowerCase().replace(/^@/, "");
    const ref = db.collection("creatorHandles").doc(h);
    const snap = await ref.get();
    if (snap.exists) {
      const cid = (snap.data() as { creatorId?: string })?.creatorId;
      if (cid === from) {
        console.log(`[creatorHandles/${h}] creatorId: ${cid} → ${to}`);
        if (!dryRun) await ref.set({ creatorId: to }, { merge: true });
      } else if (cid && cid !== to) {
        console.log(`[creatorHandles/${h}] creatorId is ${cid} (not ${from}) — leaving unchanged; verify manually.`);
      }
    }
  }

  const domSnap = await db.collection("creatorDomains").get();
  for (const d of domSnap.docs) {
    const data = d.data() as { creatorId?: string; handle?: string };
    if (data.creatorId === from) {
      console.log(`[creatorDomains/${d.id}] creatorId: ${from} → ${to}`);
      if (!dryRun) await d.ref.set({ creatorId: to }, { merge: true });
    }
  }
}

async function main() {
  console.log("=== reparentCreatorArtifacts ===");
  console.log("from:", fromId);
  console.log("to:  ", toId);
  console.log("mode:", apply ? "APPLY (writes)" : "DRY-RUN (no writes — add --apply to execute)");
  console.log("");

  if (!fs.existsSync(ECHOFLUX_SERVICE_ACCOUNT_PATH)) {
    console.error("Service account not found:", ECHOFLUX_SERVICE_ACCOUNT_PATH);
    process.exit(1);
  }

  const key = JSON.parse(fs.readFileSync(ECHOFLUX_SERVICE_ACCOUNT_PATH, "utf8")) as admin.ServiceAccount;
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(key) });
  }
  const db = admin.firestore();
  const dryRun = !apply;

  const toDoc = await db.collection("creators").doc(toId).get();
  const fromDoc = await db.collection("creators").doc(fromId).get();

  if (!fromDoc.exists) {
    console.error("Source creators/{from} does not exist.");
    process.exit(1);
  }

  if (!toDoc.exists) {
    console.warn("WARNING: creators/{to} missing — merge will still write subcollections; save My Page once so the parent doc exists.");
  }

  const handleHint =
    (toDoc.data() as { handle?: string } | undefined)?.handle ||
    (fromDoc.data() as { handle?: string } | undefined)?.handle ||
    null;

  for (const sub of ["fans", "fanPosts", "posts", "fanUsers", "treatGrants", "conversations"] as const) {
    const st = await migrateCreatorSubcollection(db, fromId, toId, sub, dryRun);
    console.log(`[creators/${sub}] read ${st.read} merged/wrote ${st.written}`);
  }

  // creatorSubscribers
  const subMerge = await mergeDocCollection(
    db,
    ["creatorSubscribers", fromId, "subscribers"],
    ["creatorSubscribers", toId, "subscribers"],
    dryRun
  );
  console.log(`[creatorSubscribers/subscribers] read ${subMerge.read} wrote ${subMerge.written}`);

  // creatorEntitlements grants
  const grantMerge = await mergeDocCollection(
    db,
    ["creatorEntitlements", fromId, "grants"],
    ["creatorEntitlements", toId, "grants"],
    dryRun
  );
  console.log(`[creatorEntitlements/grants] read ${grantMerge.read} wrote ${grantMerge.written}`);

  // creatorBlocks
  const blkSnap = await db.collection("creatorBlocks").doc(fromId).collection("blocked").get();
  let bw = 0;
  for (const doc of blkSnap.docs) {
    const tRef = db.collection("creatorBlocks").doc(toId).collection("blocked").doc(doc.id);
    if (!dryRun) await tRef.set(doc.data()!, { merge: true });
    bw++;
  }
  console.log(`[creatorBlocks/blocked] read ${blkSnap.size} wrote ${bw}`);

  // users/{from}/onlyfans_fan_preferences → users/{to}/
  const prefMerge = await mergeDocCollection(
    db,
    ["users", fromId, "onlyfans_fan_preferences"],
    ["users", toId, "onlyfans_fan_preferences"],
    dryRun
  );
  console.log(`[users/onlyfans_fan_preferences] read ${prefMerge.read} wrote ${prefMerge.written}`);

  const orderCount = await updateOrdersCreatorId(db, fromId, toId, dryRun);
  console.log(`[orders] creatorId patches: ${orderCount}`);
  const prodCount = await updateProductsCreatorId(db, fromId, toId, dryRun);
  console.log(`[products] creatorId patches: ${prodCount}`);

  await patchCreatorHandlesAndDomains(db, fromId, toId, handleHint, dryRun);

  if (!skipDmThreads) {
    const dm = await migrateFanDmThreads(db, fromId, toId, dryRun);
    console.log(`[fanDmThreads] threads migrated: ${dm.threads}, messages copied: ${dm.messages}`);
    const mutedLegacy = await migrateDmMutedThreadsUser(db, fromId, toId, dryRun);
    console.log(`[users/${fromId}/dm_muted_threads → ${toId}] copied/remapped: ${mutedLegacy}`);
    const mutedRemap = await remapDmMutedOnCanonicalUser(db, fromId, toId, dryRun);
    console.log(`[users/${toId}/dm_muted_threads] remapped old thread ids: ${mutedRemap}`);
  } else {
    console.log("[fanDmThreads] skipped (--skip-dm-threads)");
  }

  if (deleteSourceAfter && !dryRun) {
    console.log("\n--delete-source-after: removing subcollections under creators/{from} ...");
    const subs = ["fans", "fanPosts", "posts", "fanUsers", "treatGrants", "conversations"];
    for (const s of subs) {
      const ss = await db.collection("creators").doc(fromId).collection(s).get();
      for (const d of ss.docs) await d.ref.delete();
    }
    await db.collection("creators").doc(fromId).delete();
    console.log("creators/{from} deleted.");
  } else if (deleteSourceAfter && dryRun) {
    console.log("[delete-source-after] ignored in dry-run");
  }

  console.log("");
  if (dryRun) {
    console.log("Dry-run done. Backup Firestore, then re-run with --apply.");
  } else {
    console.log("Done. Next: run backfill for fan prefs if needed:");
    console.log(`  npm run backfill:fan-hub -- --creator-id=${toId}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
