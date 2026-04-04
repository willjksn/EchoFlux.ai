/**
 * Why Fan Hub still shows $0 after migrate/backfill:
 * - EchoFlux `purchases` may be empty if Stormij `creatorId` ≠ your EchoFlux UID (migrate skipped all).
 * - Backfill reads `purchases` where creatorId == --creator-id; grants need fan UID + treatId.
 *
 * Usage:
 *   npm run diagnose:purchases-migration -- --creator-id=YOUR_ECHOFLUX_UID
 *
 * If Stormij service account exists, samples top-level `purchases` and prints distinct creatorId values.
 */

import admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..");

const STORMIJ_SERVICE_ACCOUNT_PATH =
  process.env.STORMIJ_SERVICE_ACCOUNT || path.join(PROJECT_ROOT, "stormij-service-account.json");
const ECHOFLUX_SERVICE_ACCOUNT_PATH =
  process.env.ECHOFLUX_SERVICE_ACCOUNT || path.join(PROJECT_ROOT, "echoflux-service-account.json");

function getCreatorId(): string {
  const arg = process.argv.find((a) => a.startsWith("--creator-id="));
  if (!arg) {
    console.error("Usage: npm run diagnose:purchases-migration -- --creator-id=YOUR_ECHOFLUX_UID");
    process.exit(1);
  }
  return arg.replace("--creator-id=", "").trim();
}

async function main() {
  const creatorId = getCreatorId();

  if (!fs.existsSync(ECHOFLUX_SERVICE_ACCOUNT_PATH)) {
    console.error("Echoflux service account not found:", ECHOFLUX_SERVICE_ACCOUNT_PATH);
    process.exit(1);
  }

  const echofluxKey = JSON.parse(
    fs.readFileSync(ECHOFLUX_SERVICE_ACCOUNT_PATH, "utf8")
  ) as admin.ServiceAccount;
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(echofluxKey) });
  }
  const db = admin.firestore();

  const forCreator = await db.collection("purchases").where("creatorId", "==", creatorId).get();
  console.log("\n=== EchoFlux: purchases where creatorId matches --creator-id ===");
  console.log(`Count: ${forCreator.size}`);
  if (!forCreator.empty) {
    const first = forCreator.docs[0];
    console.log(`Sample doc id: ${first.id}`);
    console.log(`Sample fields: ${Object.keys(first.data()).sort().join(", ")}`);
  }

  const ordersSnap = await db.collection("orders").where("creatorId", "==", creatorId).limit(200).get();
  const stormijOrders = ordersSnap.docs.filter((d) => d.get("migratedFrom") === "stormij");
  console.log("\n=== EchoFlux: orders where creatorId matches (first 200 scanned) ===");
  console.log(`Total in scan: ${ordersSnap.size}, migratedFrom=stormij: ${stormijOrders.length}`);
  stormijOrders.slice(0, 5).forEach((d) => console.log(`  order ${d.id}`));

  if (!fs.existsSync(STORMIJ_SERVICE_ACCOUNT_PATH)) {
    console.log("\n(No stormij-service-account.json — skipping Stormij sample.)");
    console.log(
      "If purchases count is 0 but you expect history, re-run migrate with:\n" +
        "  --stormij-purchases-creator-id=<value from Stormij Firebase purchases.creatorId>"
    );
    return;
  }

  const stormijKey = JSON.parse(
    fs.readFileSync(STORMIJ_SERVICE_ACCOUNT_PATH, "utf8")
  ) as admin.ServiceAccount;
  const stormijApp = admin.initializeApp(
    { credential: admin.credential.cert(stormijKey) },
    "stormij-diag"
  );
  const stormijDb = stormijApp.firestore();
  const sample = await stormijDb.collection("purchases").limit(150).get();
  const creatorIds = new Set<string>();
  let firstKeys: string[] = [];
  for (const doc of sample.docs) {
    const data = doc.data();
    const c = data.creatorId;
    if (typeof c === "string" && c.trim()) creatorIds.add(c.trim());
    if (firstKeys.length === 0) firstKeys = Object.keys(data).sort();
  }
  console.log("\n=== Stormij: sample of purchases (first 150 docs) ===");
  console.log(`Distinct creatorId values in sample: ${[...creatorIds].join(", ") || "(none / missing field)"}`);
  console.log(`Your --creator-id: ${creatorId}`);
  const match = creatorIds.has(creatorId);
  console.log(
    match
      ? "Sample includes your EchoFlux UID on creatorId — migrate should include those rows."
      : "Sample creatorId values do NOT include your EchoFlux UID — use:\n  npm run migrate:stormij -- --collection=purchases --creator-id=" +
          creatorId +
          " --stormij-purchases-creator-id=<one of the values above>"
  );
  if (firstKeys.length) console.log(`Example doc field names: ${firstKeys.join(", ")}`);

  await stormijApp.delete().catch(() => undefined);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
