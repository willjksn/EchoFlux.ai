import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { getAdminDb } from "./_firebaseAdmin.js";
import { notifyCreatorMembersNewPost } from "./_notifyCreatorNewPost.js";

export type PublishScheduledFanPostsResult = {
  processed: number;
  published: number;
  errors: string[];
  skipped: number;
};

function scheduledAtMs(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = Date.parse(raw.trim());
    return Number.isFinite(t) ? t : null;
  }
  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof raw === "object" && raw !== null && "toDate" in raw) {
    try {
      const t = (raw as { toDate: () => Date }).toDate().getTime();
      return Number.isFinite(t) ? t : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Promote `creators/{creatorId}/fanPosts` with status `scheduled` when `scheduledAt` is due.
 * Used by Vercel cron and manual admin triggers.
 */
export async function publishDueScheduledFanPosts(
  db: ReturnType<typeof getAdminDb>,
  now: Date = new Date(),
): Promise<PublishScheduledFanPostsResult> {
  const nowMs = now.getTime();
  const errors: string[] = [];
  let processed = 0;
  let published = 0;
  let skipped = 0;

  let snapshot;
  try {
    snapshot = await db
      .collectionGroup("fanPosts")
      .where("status", "==", "scheduled")
      .where("scheduledAt", "<=", Timestamp.fromDate(now))
      .limit(100)
      .get();
  } catch (queryError: unknown) {
    const msg = queryError instanceof Error ? queryError.message : String(queryError);
    const needsIndex = msg.includes("index") || msg.includes("Index");
    throw new Error(
      needsIndex
        ? `Fan post schedule query needs a Firestore index (status + scheduledAt on fanPosts collection group). ${msg}`
        : msg,
    );
  }

  for (const docSnap of snapshot.docs) {
    const post = docSnap.data() as Record<string, unknown>;
    const dueMs = scheduledAtMs(post.scheduledAt);
    if (dueMs == null || dueMs > nowMs) {
      skipped += 1;
      continue;
    }

    processed += 1;

    try {
      await docSnap.ref.update({
        status: "published",
        publishedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      published += 1;

      const pathParts = docSnap.ref.path.split("/");
      const creatorIdx = pathParts.indexOf("creators");
      const creatorId = creatorIdx >= 0 ? pathParts[creatorIdx + 1] : "";
      if (creatorId) {
        try {
          await notifyCreatorMembersNewPost({
            creatorId,
            postId: docSnap.id,
            bodyPreview: typeof post.body === "string" ? post.body : "",
          });
        } catch (notifyErr) {
          console.warn("Scheduled publish: member notify failed:", docSnap.id, notifyErr);
        }
      }
    } catch (updateError: unknown) {
      const msg = updateError instanceof Error ? updateError.message : String(updateError);
      errors.push(`fanPost ${docSnap.id}: ${msg}`);
    }
  }

  return { processed, published, errors, skipped };
}
