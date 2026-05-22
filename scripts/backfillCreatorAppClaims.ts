/**
 * One-off: set Firebase Auth custom claim `creatorApp` for every `users/{uid}` doc.
 * Logic matches `src/lib/echoFluxSubscriptionAccess.ts`.
 *
 *   npx ts-node --esm scripts/backfillCreatorAppClaims.ts [--dry-run]
 *
 * Env: ECHOFLUX_SERVICE_ACCOUNT or ./echoflux-service-account.json
 */
import admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { shouldHaveCreatorAppAccess } from "../src/lib/echoFluxSubscriptionAccess.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..");
const SA =
  process.env.ECHOFLUX_SERVICE_ACCOUNT || path.join(PROJECT_ROOT, "echoflux-service-account.json");

const CREATOR_APP_CLAIM = "creatorApp";

type UserDoc = {
  role?: string;
  plan?: string | null;
  hasCompletedOnboarding?: boolean;
  accountOrigin?: string;
  subscriptionStatus?: string;
  inviteGrantPlan?: string;
  cancelAtPeriodEnd?: boolean;
  subscriptionEndDate?: string | null;
  subscriptionCurrentPeriodEnd?: string | null;
  stripeSubscriptionId?: string | null;
};

async function applyClaim(
  db: admin.firestore.Firestore,
  auth: admin.auth.Auth,
  uid: string,
): Promise<boolean> {
  const [userSnap, creatorSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("creators").doc(uid).get(),
  ]);
  const should = shouldHaveCreatorAppAccess({
    userData: userSnap.exists ? (userSnap.data() as UserDoc) : undefined,
    creatorDocExists: creatorSnap.exists,
  });
  const record = await auth.getUser(uid);
  const existing = (record.customClaims || {}) as Record<string, unknown>;
  await auth.setCustomUserClaims(uid, { ...existing, [CREATOR_APP_CLAIM]: should });
  return should;
}

const dryRun = process.argv.includes("--dry-run");

async function main() {
  if (!fs.existsSync(SA)) {
    console.error("Service account not found:", SA);
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(SA, "utf8"));
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }

  const db = admin.firestore();
  const auth = admin.auth();
  const snap = await db.collection("users").get();
  let changed = 0;
  let granted = 0;
  let revoked = 0;

  for (const doc of snap.docs) {
    const uid = doc.id;
    const creatorSnap = await db.collection("creators").doc(uid).get();
    const should = shouldHaveCreatorAppAccess({
      userData: doc.data() as UserDoc,
      creatorDocExists: creatorSnap.exists,
    });

    let current = false;
    try {
      const record = await auth.getUser(uid);
      current = (record.customClaims || {})[CREATOR_APP_CLAIM] === true;
    } catch {
      /* user missing in Auth */
    }

    if (current !== should) {
      changed++;
      if (should) granted++;
      else revoked++;
      if (!dryRun) {
        await applyClaim(db, auth, uid);
      }
      console.log(`${uid}: ${current ? "true" : "false"} -> ${should}`);
    }
  }

  console.log(
    dryRun
      ? `[dry-run] Would update ${changed} users (${granted} grant, ${revoked} revoke) of ${snap.size}`
      : `Updated ${changed} users (${granted} grant, ${revoked} revoke) of ${snap.size}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
