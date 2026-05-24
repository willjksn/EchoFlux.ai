import { FieldValue } from "firebase-admin/firestore";
import { getAdminApp, getAdminDb } from "./_firebaseAdmin.js";

export type FcmMulticastResult = {
  sent: number;
  failed: number;
  invalidTokens: string[];
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Remove dead tokens from `users/{uid}.fcmTokens` after FCM rejects them. */
export async function pruneInvalidFcmTokensForUser(userId: string, invalidTokens: string[]): Promise<void> {
  const unique = [...new Set(invalidTokens.filter((t) => typeof t === "string" && t.trim()))];
  if (unique.length === 0) return;
  const db = getAdminDb();
  await db.collection("users").doc(userId).update({
    fcmTokens: FieldValue.arrayRemove(...unique),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Send web push to many device tokens (FCM multicast, 500 per batch).
 * `tokenOwners` maps token → userId for pruning invalid tokens.
 */
export async function sendFcmMulticast(params: {
  tokens: string[];
  tokenOwners: Map<string, string>;
  title: string;
  body: string;
  data?: Record<string, string>;
  link?: string;
}): Promise<FcmMulticastResult> {
  const tokens = [...new Set(params.tokens.filter((t) => typeof t === "string" && t.trim()))];
  if (tokens.length === 0) {
    return { sent: 0, failed: 0, invalidTokens: [] };
  }

  const messaging = getAdminApp().messaging();
  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];
  const invalidByUser = new Map<string, Set<string>>();

  const data: Record<string, string> = {
    title: params.title,
    body: params.body,
  };
  for (const [k, v] of Object.entries(params.data || {})) {
    if (typeof v === "string") data[k] = v;
  }
  if (params.link && !data.url) data.url = params.link;

  for (const batch of chunk(tokens, 500)) {
    try {
      // Data-only payload: SW `onBackgroundMessage` shows one notification.
      // Including `notification` here too would make the browser show a second copy.
      const response = await messaging.sendEachForMulticast({
        tokens: batch,
        data,
        webpush: params.link
          ? {
              fcmOptions: { link: params.link },
            }
          : undefined,
      });
      sent += response.successCount;
      failed += response.failureCount;
      response.responses.forEach((r, i) => {
        if (r.success) return;
        const token = batch[i];
        const code = r.error?.code || "";
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          invalidTokens.push(token);
          const owner = params.tokenOwners.get(token);
          if (owner) {
            if (!invalidByUser.has(owner)) invalidByUser.set(owner, new Set());
            invalidByUser.get(owner)!.add(token);
          }
        }
      });
    } catch (e) {
      console.error("FCM multicast batch failed:", e);
      failed += batch.length;
    }
  }

  await Promise.all(
    [...invalidByUser.entries()].map(([userId, set]) => pruneInvalidFcmTokensForUser(userId, [...set])),
  );

  return { sent, failed, invalidTokens };
}
