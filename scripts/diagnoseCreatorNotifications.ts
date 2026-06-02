/**
 * One-off: creator notification + push diagnostics.
 * Usage: npx ts-node --esm scripts/diagnoseCreatorNotifications.ts stormijxo amarie
 */
import admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SA = process.env.ECHOFLUX_SERVICE_ACCOUNT || path.join(__dirname, "..", "echoflux-service-account.json");

function init() {
  if (!fs.existsSync(SA)) {
    console.error("Missing service account:", SA);
    process.exit(1);
  }
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(SA, "utf8"))) });
  }
}

async function resolveCreatorId(db: admin.firestore.Firestore, handle: string): Promise<string | null> {
  const h = handle.replace(/^@/, "").trim().toLowerCase();
  const ch = await db.collection("creatorHandles").doc(h).get();
  if (ch.exists) {
    const cid = (ch.data()?.creatorId as string | undefined)?.trim();
    if (cid) return cid;
  }
  const snap = await db.collection("creators").where("handle", "==", h).limit(1).get();
  if (!snap.empty) return snap.docs[0].id;
  return null;
}

type CreatedAtKind = "iso" | "timestamp" | "number" | "missing" | "other";

function classifyCreatedAt(v: unknown): CreatedAtKind {
  if (v == null) return "missing";
  if (typeof v === "string") return "iso";
  if (typeof v === "number") return "number";
  if (v && typeof (v as admin.firestore.Timestamp).toDate === "function") return "timestamp";
  return "other";
}

async function diagnoseHandle(db: admin.firestore.Firestore, handle: string) {
  const creatorId = await resolveCreatorId(db, handle);
  if (!creatorId) {
    console.log(`\n=== @${handle} ===\n  NOT FOUND`);
    return;
  }

  const userSnap = await db.collection("users").doc(creatorId).get();
  const user = userSnap.data() || {};
  const tokens = Array.isArray(user.fcmTokens)
    ? (user.fcmTokens as string[]).filter((t) => typeof t === "string" && t.trim())
    : [];
  const pushOff = user.pushNotificationsEnabled === false;

  const notifSnap = await db
    .collection("users")
    .doc(creatorId)
    .collection("notifications")
    .orderBy("createdAt", "desc")
    .limit(8)
    .get()
    .catch(async (err: Error) => {
      return { docs: [], queryError: err.message } as { docs: []; queryError: string };
    });

  const queryError = "queryError" in notifSnap ? (notifSnap as { queryError: string }).queryError : null;
  const docs = "docs" in notifSnap && Array.isArray(notifSnap.docs) ? notifSnap.docs : [];

  const kinds: Record<CreatedAtKind, number> = {
    iso: 0,
    timestamp: 0,
    number: 0,
    missing: 0,
    other: 0,
  };
  const sampleSnap = await db.collection("users").doc(creatorId).collection("notifications").limit(200).get();
  sampleSnap.forEach((d) => {
    kinds[classifyCreatedAt(d.data().createdAt)]++;
  });

  const mutedSnap = await db.collection("users").doc(creatorId).collection("dm_muted_threads").limit(50).get();

  console.log(`\n=== @${handle} (${creatorId}) ===`);
  console.log(`  pushNotificationsEnabled: ${pushOff ? "false (push skipped)" : "true/default"}`);
  console.log(`  fcmTokens: ${tokens.length} device(s)`);
  if (tokens.length > 0) {
    console.log(`    sample: ${tokens[0].slice(0, 24)}…`);
  }
  console.log(`  dm_muted_threads: ${mutedSnap.size}`);
  console.log(`  notifications sample (200 docs) createdAt kinds:`, kinds);
  if (queryError) {
    console.log(`  orderBy(createdAt) query FAILED: ${queryError}`);
  } else {
    console.log(`  latest ${docs.length} (ordered):`);
    for (const d of docs) {
      const data = d.data();
      const ca = data.createdAt;
      const when =
        ca && typeof (ca as admin.firestore.Timestamp).toDate === "function"
          ? (ca as admin.firestore.Timestamp).toDate().toISOString()
          : String(ca ?? "?");
      console.log(`    - ${when} | ${data.type} | read=${data.read} | ${String(data.title || "").slice(0, 50)}`);
    }
  }
}

async function main() {
  const handles = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (handles.length === 0) {
    console.error("Usage: npx ts-node --esm scripts/diagnoseCreatorNotifications.ts stormijxo amarie");
    process.exit(1);
  }
  init();
  const db = admin.firestore();
  for (const h of handles) {
    await diagnoseHandle(db, h);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
