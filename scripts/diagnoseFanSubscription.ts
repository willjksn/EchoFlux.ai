/**
 * Usage: npx ts-node --esm scripts/diagnoseFanSubscription.ts CREATOR_ID FAN_ID
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

async function main() {
  const creatorId = process.argv[2];
  const fanId = process.argv[3];
  if (!creatorId || !fanId) {
    console.error("Usage: npx ts-node --esm scripts/diagnoseFanSubscription.ts CREATOR_ID FAN_ID");
    process.exit(1);
  }
  init();
  const db = admin.firestore();
  const fan = await db.collection("creators").doc(creatorId).collection("fans").doc(fanId).get();
  const sub = await db.collection("creatorSubscribers").doc(creatorId).collection("subscribers").doc(fanId).get();
  const grant = await db.collection("creatorEntitlements").doc(creatorId).collection("grants").doc(fanId).get();
  const user = await db.collection("users").doc(fanId).get();
  const threads = await db
    .collection("fanDmThreads")
    .where("creatorId", "==", creatorId)
    .where("fanId", "==", fanId)
    .limit(1)
    .get();
  console.log("=== fan doc ===", fan.exists ? fan.data() : null);
  console.log("=== subscriber ===", sub.exists ? sub.data() : null);
  console.log("=== grant ===", grant.exists ? grant.data() : null);
  console.log("=== user ===", user.exists ? { email: user.data()?.email, username: user.data()?.username } : null);
  console.log("=== dm thread ===", threads.empty ? null : threads.docs[0].id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
