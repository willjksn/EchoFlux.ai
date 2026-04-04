/**
 * One-off: set Firebase Auth custom claim `creatorApp` for every `users/{uid}` doc.
 * Logic matches `api/_creatorAppClaim.ts`.
 *
 *   npx ts-node --esm scripts/backfillCreatorAppClaims.ts [--dry-run]
 *
 * Env: ECHOFLUX_SERVICE_ACCOUNT or ./echoflux-service-account.json
 */
import admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..");
const SA =
  process.env.ECHOFLUX_SERVICE_ACCOUNT || path.join(PROJECT_ROOT, "echoflux-service-account.json");

const CREATOR_APP_CLAIM = "creatorApp";
const PAID_PLANS = new Set(["Pro", "Elite", "Agency", "OnlyFansStudio"]);

type UserDoc = {
  role?: string;
  plan?: string | null;
  hasCompletedOnboarding?: boolean;
  accountOrigin?: string;
};

function shouldHaveCreatorAppAccess(userData: UserDoc | undefined, creatorDocExists: boolean): boolean {
  const d = userData || {};
  if (d.role === "Admin") return true;
  if (creatorDocExists) return true;
  const plan = typeof d.plan === "string" ? d.plan : "";
  if (plan && PAID_PLANS.has(plan)) return true;
  if (d.hasCompletedOnboarding === true && d.accountOrigin !== "fan_hub") return true;
  return false;
}

async function applyClaim(
  db: admin.firestore.Firestore,
  auth: admin.auth.Auth,
  uid: string,
): Promise<boolean> {
  const [userSnap, creatorSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("creators").doc(uid).get(),
  ]);
  const should = shouldHaveCreatorAppAccess(
    userSnap.exists ? (userSnap.data() as UserDoc) : undefined,
    creatorSnap.exists,
  );
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
  const key = JSON.parse(fs.readFileSync(SA, "utf8")) as admin.ServiceAccount;
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(key) });
  }
  const db = admin.firestore();
  const authSvc = admin.auth();

  const snap = await db.collection("users").get();
  let ok = 0;
  let fail = 0;
  let skippedNoAuth = 0;
  for (const doc of snap.docs) {
    const uid = doc.id;
    try {
      if (dryRun) {
        const creatorSnap = await db.collection("creators").doc(uid).get();
        const should = shouldHaveCreatorAppAccess(doc.data() as UserDoc, creatorSnap.exists);
        console.log(`${uid}: would set creatorApp=${should}`);
        ok++;
        continue;
      }
      await applyClaim(db, authSvc, uid);
      ok++;
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code?: string }).code)
          : e && typeof e === "object" && "errorInfo" in e
            ? String((e as { errorInfo?: { code?: string } }).errorInfo?.code)
            : "";
      if (code === "auth/user-not-found") {
        console.log(`${uid}: skipped (users/ doc exists but no Firebase Auth user — safe to delete stale doc or ignore)`);
        skippedNoAuth++;
        continue;
      }
      console.warn(uid, e);
      fail++;
    }
  }
  if (dryRun) {
    console.log(`[DRY RUN] ${ok} users scanned`);
  } else {
    console.log(
      `Done. ${ok} updated, ${fail} failed` +
        (skippedNoAuth ? `, ${skippedNoAuth} skipped (no Auth user)` : ""),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
