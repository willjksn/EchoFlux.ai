/**
 * List migrated / fan rows under creators/{creatorId}/fans where we can check Auth coverage.
 * For each doc, if `email` is present, checks whether ANY Auth user has that email (EchoFlux project).
 *
 * Usage:
 *   npx ts-node --esm scripts/reportFansMissingAuth.ts --creator-id=ZY2JlmlsNmNkAe0LdRXYycDvHSi2
 *
 * Env: ECHOFLUX_SERVICE_ACCOUNT=path/to/echoflux-service-account.json
 *
 * See: docs/MIGRATED_FANS_AUTH.md
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

const creatorId = argValue("creator-id");
if (!creatorId) {
  console.error("Usage: npx ts-node --esm scripts/reportFansMissingAuth.ts --creator-id=UID");
  process.exit(1);
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

  const snap = await db.collection("creators").doc(creatorId).collection("fans").get();
  console.log(`creators/${creatorId}/fans: ${snap.size} docs\n`);

  const missingEmail: string[] = [];
  const noAuthForEmail: { email: string; fanDocId: string }[] = [];
  const uidMismatch: { fanDocId: string; email: string; authUid: string }[] = [];
  const ok: string[] = [];

  for (const doc of snap.docs) {
    const d = doc.data() as {
      email?: string;
      uid?: string;
      migratedFrom?: string;
    };
    const email = typeof d.email === "string" ? d.email.trim().toLowerCase() : "";
    const fanDocId = doc.id;

    if (!email) {
      missingEmail.push(fanDocId);
      continue;
    }

    const userRecord = await auth.getUserByEmail(email).catch(() => null);
    if (!userRecord) {
      noAuthForEmail.push({ email, fanDocId });
      continue;
    }

    if (fanDocId !== userRecord.uid) {
      uidMismatch.push({ fanDocId, email, authUid: userRecord.uid });
    } else {
      ok.push(`${email} (${fanDocId})`);
    }
  }

  if (missingEmail.length) {
    console.log("No email on fan doc (cannot match Auth by email):");
    missingEmail.forEach((id) => console.log(`  - fans/${id}`));
    console.log("");
  }

  if (noAuthForEmail.length) {
    console.log("Email exists on fan doc but NO Auth user in EchoFlux with that email:");
    noAuthForEmail.forEach(({ email, fanDocId }) => console.log(`  - ${email}  (fans doc id: ${fanDocId})`));
    console.log("  → Import these users (Firebase Auth import) or invite them once.\n");
  }

  if (uidMismatch.length) {
    console.log("Auth user exists but fans doc id ≠ Auth uid (may need re-key or merge):");
    uidMismatch.forEach(({ email, fanDocId, authUid }) =>
      console.log(`  - ${email}  fans/${fanDocId}  auth uid=${authUid}`)
    );
    console.log("");
  }

  console.log(`OK (doc id matches Auth uid for same email): ${ok.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
