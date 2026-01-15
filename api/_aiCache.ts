import { createHash } from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "./_firebaseAdmin.js";

type CachedResponse = {
  payload: any;
  createdAt: Timestamp;
  expiresAt: Timestamp;
};

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function buildCacheKey(parts: Record<string, any>): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(parts));
  return hash.digest("hex");
}

export async function getCachedResponse(key: string): Promise<any | null> {
  try {
    const db = getAdminDb();
    const doc = await db.collection("ai_cache").doc(key).get();
    if (!doc.exists) return null;
    const data = doc.data() as CachedResponse;
    if (!data?.expiresAt) return null;
    if (data.expiresAt.toDate().getTime() < Date.now()) return null;
    return data.payload ?? null;
  } catch (error) {
    console.warn("AI cache read failed:", error);
    return null;
  }
}

export async function setCachedResponse(
  key: string,
  payload: any,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<void> {
  try {
    const db = getAdminDb();
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + ttlMs));
    await db.collection("ai_cache").doc(key).set(
      {
        payload,
        createdAt: now,
        expiresAt,
      },
      { merge: true }
    );
  } catch (error) {
    console.warn("AI cache write failed:", error);
  }
}
