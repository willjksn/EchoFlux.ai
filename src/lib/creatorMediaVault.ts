import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";

export type MediaVaultItemType = "image" | "video" | "audio";

export type MediaVaultItem = {
  url: string;
  name: string;
  type: MediaVaultItemType;
  uploadedAt?: string;
};

export const CREATOR_MEDIA_VAULT_PAGE_SIZE = 24;

export function vaultUploadedAtMs(raw: Record<string, unknown>): number {
  const u = raw.uploadedAt;
  if (u && typeof u === "object" && "toMillis" in u && typeof (u as Timestamp).toMillis === "function") {
    return (u as Timestamp).toMillis();
  }
  if (typeof u === "string") {
    const t = new Date(u).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

export function inferVaultMediaType(raw: Record<string, unknown>, url: string): MediaVaultItemType {
  const t = raw.type;
  if (t === "video" || t === "audio" || t === "image") return t;
  const mime = typeof raw.mimeType === "string" ? raw.mimeType.toLowerCase() : "";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  const path = url.split("?")[0].toLowerCase();
  if (/\.(mp4|mov|webm|m4v|mkv)(\b|$)/.test(path)) return "video";
  if (/\.(mp3|m4a|wav|aac|ogg|flac|webm)(\b|$)/.test(path)) return "audio";
  return "image";
}

export type LoadCreatorMediaVaultResult = {
  items: MediaVaultItem[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  orderSupported: boolean;
  hasMore: boolean;
};

/** Load one page from `users/{uid}/media_library` (My Vault). */
export async function loadCreatorMediaVaultPage(
  userId: string,
  mode: "reset" | "more",
  state: {
    cursor: QueryDocumentSnapshot<DocumentData> | null;
    orderSupported: boolean;
  },
  filterType?: MediaVaultItemType
): Promise<LoadCreatorMediaVaultResult> {
  if (!db) throw new Error("Database unavailable");

  let cursor = mode === "reset" ? null : state.cursor;
  let orderSupported = mode === "reset" ? true : state.orderSupported;

  const col = collection(db, "users", userId, "media_library");
  const pageSize = CREATOR_MEDIA_VAULT_PAGE_SIZE;
  let snap;

  if (orderSupported) {
    try {
      const q =
        mode === "more" && cursor
          ? query(col, orderBy("uploadedAt", "desc"), startAfter(cursor), limit(pageSize))
          : query(col, orderBy("uploadedAt", "desc"), limit(pageSize));
      snap = await getDocs(q);
    } catch {
      if (mode === "more") {
        return { items: [], cursor, orderSupported, hasMore: false };
      }
      orderSupported = false;
      cursor = null;
      snap = await getDocs(query(col, limit(pageSize)));
    }
  } else {
    snap = await getDocs(query(col, limit(pageSize)));
  }

  const items: MediaVaultItem[] = [];
  for (const d of snap.docs) {
    const raw = d.data() as Record<string, unknown>;
    if (typeof raw.url !== "string" || !raw.url.trim()) continue;
    const type = inferVaultMediaType(raw, raw.url);
    if (filterType && type !== filterType) continue;
    const ms = vaultUploadedAtMs(raw);
    items.push({
      url: raw.url,
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name : d.id,
      type,
      uploadedAt: ms ? new Date(ms).toISOString() : undefined,
    });
  }
  items.sort((a, b) => {
    const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
    const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
    return tb - ta;
  });

  const docs = snap.docs;
  if (orderSupported && docs.length) {
    cursor = docs[docs.length - 1] ?? null;
  } else if (mode === "reset") {
    cursor = null;
  }

  return {
    items,
    cursor,
    orderSupported,
    hasMore: orderSupported && docs.length === pageSize,
  };
}
