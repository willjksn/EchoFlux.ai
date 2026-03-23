/**
 * Create or update Firestore creatorDomains/{hostname} for custom storefront domains (e.g. stormijxo.com).
 * The collection is created automatically when the first document is written — no manual "create collection" in Console required.
 *
 * Usage:
 *   npx ts-node --esm scripts/upsertCreatorDomain.ts --host=stormijxo.com --handle=stormijxo --creator-id=ZY2JlmlsNmNkAe0LdRXYycDvHSi2
 *   npx ts-node --esm scripts/upsertCreatorDomain.ts --host=stormijxo.com --handle=stormijxo --creator-id=... --apply
 *
 * Default is dry-run; add --apply to write.
 *
 * Env: ECHOFLUX_SERVICE_ACCOUNT=path/to/echoflux-service-account.json
 *
 * See: docs/STORMIJXO_DOMAIN_STEP_BY_STEP.md
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

function normalizeHost(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
}

const hostRaw = argValue("host");
const handle = argValue("handle");
const creatorId = argValue("creator-id");
const apply = process.argv.includes("--apply");
const alsoWww = process.argv.includes("--www");

if (!hostRaw || !handle || !creatorId) {
  console.error(
    "Usage: npx ts-node --esm scripts/upsertCreatorDomain.ts --host=stormijxo.com --handle=stormijxo --creator-id=UID [--apply] [--www]"
  );
  console.error("  --www   Also write creatorDomains/www.stormijxo.com (same fields)");
  process.exit(1);
}

const host = normalizeHost(hostRaw);

async function main() {
  console.log("=== upsertCreatorDomain ===");
  console.log("host:       ", host);
  console.log("handle:     ", handle.trim().toLowerCase().replace(/^@/, ""));
  console.log("creator-id: ", creatorId);
  console.log("mode:       ", apply ? "APPLY" : "DRY-RUN (add --apply to write)");
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

  const cleanHandle = handle.trim().toLowerCase().replace(/^@/, "");
  const payload = {
    handle: cleanHandle,
    creatorId: creatorId.trim(),
    updatedAt: new Date().toISOString(),
  };

  const ids = [host];
  if (alsoWww) {
    ids.push(`www.${host}`);
  }

  for (const docId of ids) {
    console.log(`creatorDomains/${docId}`, "=>", JSON.stringify(payload));
    if (apply) {
      await db.collection("creatorDomains").doc(docId).set(payload, { merge: true });
      console.log("  written.");
    }
  }

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply to write to Firestore.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
