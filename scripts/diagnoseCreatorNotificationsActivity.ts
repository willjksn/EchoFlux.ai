/**
 * Recent Fan Hub activity vs notifications for a creator.
 * Usage: npx ts-node --esm scripts/diagnoseCreatorNotificationsActivity.ts amarie stormijxo
 */
import admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SA = path.join(__dirname, "..", "echoflux-service-account.json");

function init() {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(SA, "utf8"))) });
}

async function resolveCreatorId(db: admin.firestore.Firestore, handle: string): Promise<string | null> {
  const h = handle.replace(/^@/, "").trim().toLowerCase();
  const ch = await db.collection("creatorHandles").doc(h).get();
  if (ch.exists) return ((ch.data()?.creatorId as string) || "").trim() || null;
  const snap = await db.collection("creators").where("handle", "==", h).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

async function run(handle: string) {
  const db = admin.firestore();
  const creatorId = await resolveCreatorId(db, handle);
  if (!creatorId) {
    console.log(`@${handle}: not found`);
    return;
  }

  const orders = await db
    .collection("orders")
    .where("creatorId", "==", creatorId)
    .where("status", "==", "paid")
    .orderBy("paidAt", "desc")
    .limit(5)
    .get()
    .catch(() => db.collection("orders").where("creatorId", "==", creatorId).limit(5).get());

  const threads = await db
    .collection("fanDmThreads")
    .where("creatorId", "==", creatorId)
    .orderBy("lastMessageAt", "desc")
    .limit(5)
    .get()
    .catch(() => db.collection("fanDmThreads").where("creatorId", "==", creatorId).limit(5).get());

  const liveSessions = await db
    .collection("chatSessions")
    .where("creatorId", "==", creatorId)
    .where("status", "in", ["active", "paused"])
    .limit(10)
    .get();

  const notifCount = (await db.collection("users").doc(creatorId).collection("notifications").count().get()).data()
    .count;

  console.log(`\n=== @${handle} activity (${creatorId}) ===`);
  console.log(`  notifications total: ${notifCount}`);
  console.log(`  recent paid orders: ${orders.size}`);
  orders.forEach((d) => {
    const o = d.data();
    console.log(`    order ${d.id.slice(0, 20)}… paidAt=${o.paidAt || o.updatedAt} type=${o.type || o.productType}`);
  });
  console.log(`  recent DM threads: ${threads.size}`);
  threads.forEach((d) => {
    const t = d.data();
    console.log(`    thread ${d.id.slice(0, 12)}… last=${t.lastMessageAt} muted=${t.creatorInboxMuted}`);
  });
  console.log(`  active/paused chatSessions: ${liveSessions.size}`);
  liveSessions.forEach((d) => {
    const s = d.data();
    console.log(`    session ${d.id} thread=${s.threadId} status=${s.status} started=${s.startedAt}`);
  });

  const productPaid = orders.docs.find((d) => (d.data().type || "").toString() === "product");
  if (productPaid) {
    const o = productPaid.data();
    console.log(`  product order bell flags:`, {
      id: productPaid.id,
      status: o.status,
      creatorPurchaseBellSent: o.creatorPurchaseBellSent,
      paidAt: o.paidAt,
    });
  }

  const fanThread = threads.docs.find((d) => {
    const fanId = (d.data().fanId as string) || "";
    return fanId && fanId !== creatorId;
  });
  if (fanThread) {
    const tid = fanThread.id;
    const liveForThread = await db
      .collection("chatSessions")
      .where("creatorId", "==", creatorId)
      .where("threadId", "==", tid)
      .limit(5)
      .get();
    console.log(`  chatSessions on fan thread: ${liveForThread.size}`);
    liveForThread.forEach((d) => console.log(`    ${d.id} status=${d.data().status} started=${d.data().startedAt}`));
    const msgs = await db
      .collection("fanDmThreads")
      .doc(tid)
      .collection("messages")
      .orderBy("createdAt", "desc")
      .limit(3)
      .get();
    console.log(`  sample fan thread ${tid.slice(0, 20)}… messages:`);
    msgs.forEach((m) => {
      const x = m.data();
      console.log(
        `    ${x.createdAt} from=${String(x.senderId || "").slice(0, 12)} ${String(x.content || "").slice(0, 50)}`,
      );
    });
  }
}

async function main() {
  init();
  const handles = process.argv.slice(2);
  for (const h of handles) await run(h);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
