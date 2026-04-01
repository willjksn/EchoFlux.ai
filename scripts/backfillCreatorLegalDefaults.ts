import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..");
const ECHOFLUX_SERVICE_ACCOUNT_PATH =
  process.env.ECHOFLUX_SERVICE_ACCOUNT || path.join(PROJECT_ROOT, "echoflux-service-account.json");

type Args = { dryRun: boolean };

function parseArgs(argv: string[]): Args {
  return { dryRun: argv.includes("--dry-run") };
}

function initAdmin() {
  if (!fs.existsSync(ECHOFLUX_SERVICE_ACCOUNT_PATH)) {
    throw new Error(`Service account not found: ${ECHOFLUX_SERVICE_ACCOUNT_PATH}`);
  }
  const key = JSON.parse(fs.readFileSync(ECHOFLUX_SERVICE_ACCOUNT_PATH, "utf8")) as admin.ServiceAccount;
  const app =
    admin.apps.length > 0
      ? admin.app()
      : admin.initializeApp({
          credential: admin.credential.cert(key),
        });
  return app.firestore();
}

function extractDefaultLegalText() {
  const constantsPath = path.join(PROJECT_ROOT, "constants.ts");
  const src = fs.readFileSync(constantsPath, "utf8");

  const termsMatch = src.match(/export const DEFAULT_TERMS_OF_SERVICE = `([\s\S]*?)`;/);
  const privacyMatch = src.match(/export const DEFAULT_PRIVACY_POLICY = `([\s\S]*?)`;/);

  if (!termsMatch?.[1] || !privacyMatch?.[1]) {
    throw new Error("Could not extract default legal text from constants.ts");
  }

  return {
    terms: termsMatch[1],
    privacy: privacyMatch[1],
  };
}

async function run() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const db = initAdmin();
  const defaults = extractDefaultLegalText();

  const termsLastUpdated = "2026-03-30";
  const privacyLastUpdated = "2026-03-30";

  const creatorsSnap = await db.collection("creators").get();
  const total = creatorsSnap.size;
  console.log(`Found ${total} creator documents.`);

  if (total === 0) {
    console.log("Nothing to update.");
    return;
  }

  let scanned = 0;
  let updated = 0;
  let batch = db.batch();
  let batchOps = 0;

  for (const doc of creatorsSnap.docs) {
    scanned += 1;
    const before = (doc.data().legal || {}) as Record<string, unknown>;
    const needsUpdate =
      before.termsText !== defaults.terms ||
      before.privacyText !== defaults.privacy ||
      before.termsLastUpdated !== termsLastUpdated ||
      before.privacyLastUpdated !== privacyLastUpdated;

    if (needsUpdate) {
      updated += 1;
      if (!dryRun) {
        batch.set(
          doc.ref,
          {
            legal: {
              termsText: defaults.terms,
              termsLastUpdated,
              privacyText: defaults.privacy,
              privacyLastUpdated,
            },
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        batchOps += 1;
      }
    }

    if (!dryRun && batchOps >= 400) {
      await batch.commit();
      batch = db.batch();
      batchOps = 0;
    }
  }

  if (!dryRun && batchOps > 0) {
    await batch.commit();
  }

  console.log(
    `${dryRun ? "[DRY RUN] " : ""}Scanned ${scanned} creators, ${
      dryRun ? "would update" : "updated"
    } ${updated}.`
  );
}

run().catch((err) => {
  console.error("backfillCreatorLegalDefaults failed:", err);
  process.exit(1);
});

