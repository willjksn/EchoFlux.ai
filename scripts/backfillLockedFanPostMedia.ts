/**
 * Move locked fan post full media URLs out of public fanPosts docs.
 *
 * Usage:
 *   npm run backfill:locked-fan-post-media -- --all-creators --dry-run
 *   npm run backfill:locked-fan-post-media -- --all-creators --write
 */

import admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..");
const SERVICE_ACCOUNT_PATH =
  process.env.ECHOFLUX_SERVICE_ACCOUNT || path.join(PROJECT_ROOT, "echoflux-service-account.json");
const PLACEHOLDER_PREFIX = "protected://fan-post-media/";

function parseArgs() {
  const creatorArg = process.argv.find((a) => a.startsWith("--creator-id="));
  const creatorId = creatorArg?.replace("--creator-id=", "").trim() || "";
  const allCreators = process.argv.includes("--all-creators");
  const write = process.argv.includes("--write");
  if ((allCreators && creatorId) || (!allCreators && !creatorId)) {
    console.error(
      "Usage: npm run backfill:locked-fan-post-media -- (--creator-id=CREATOR_UID | --all-creators) [--dry-run | --write]",
    );
    process.exit(1);
  }
  return { creatorId, allCreators, dryRun: !write || process.argv.includes("--dry-run") };
}

function strings(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
}

function isPlaceholder(url: string): boolean {
  return url.startsWith(PLACEHOLDER_PREFIX);
}

function previewIndex(raw: unknown, mediaCount: number): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 0;
  return Math.max(0, Math.min(Math.max(0, mediaCount - 1), n));
}

function publicUrls(mediaUrls: string[], preview: number): string[] {
  if (mediaUrls.length === 0) return [];
  if (mediaUrls.length === 1) return [`${PLACEHOLDER_PREFIX}0`];
  return mediaUrls.map((url, i) => (i === preview ? url : `${PLACEHOLDER_PREFIX}${i}`));
}

async function main() {
  const { creatorId, allCreators, dryRun } = parseArgs();
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error("Service account not found:", SERVICE_ACCOUNT_PATH);
    process.exit(1);
  }
  const key = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8")) as admin.ServiceAccount;
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key) });
  const db = admin.firestore();

  const creatorIds = allCreators
    ? (await db.collection("creators").get()).docs.map((d) => d.id)
    : [creatorId];

  let updated = 0;
  let skipped = 0;
  for (const cid of creatorIds) {
    const posts = await db.collection("creators").doc(cid).collection("fanPosts").get();
    for (const post of posts.docs) {
      const data = post.data() as Record<string, unknown>;
      const locked = data.lockedContent as Record<string, unknown> | undefined;
      if (!locked?.enabled) continue;
      const mediaUrls = strings(data.mediaUrls);
      if (mediaUrls.length === 0) continue;
      if (mediaUrls.every(isPlaceholder)) {
        skipped += 1;
        continue;
      }

      const mediaTypes = strings(data.mediaTypes);
      const preview = previewIndex(locked.previewMediaIndex, mediaUrls.length);
      const privateRef = db.collection("creators").doc(cid).collection("fanPostPrivateMedia").doc(post.id);
      const publicMediaUrls = publicUrls(mediaUrls, preview);
      if (dryRun) {
        console.log(`  [DRY RUN] ${post.ref.path}: protect ${mediaUrls.length} media URL(s)`);
      } else {
        await privateRef.set({
          creatorId: cid,
          postId: post.id,
          mediaUrls,
          mediaTypes,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        await post.ref.set({
          mediaUrls: publicMediaUrls,
          mediaTypes,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log(`  Updated ${post.ref.path}: protected ${mediaUrls.length} media URL(s)`);
      }
      updated += 1;
    }
  }

  console.log(
    dryRun
      ? `[DRY RUN] Would update ${updated} locked post(s), skipped ${skipped}`
      : `Done. Updated ${updated} locked post(s), skipped ${skipped}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
