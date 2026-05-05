import { auth } from "../../firebaseConfig";
import { resolveApiUrl } from "./resolveApiUrl";

/** Author-facing fetch for full fan-post media URLs (locked slots hidden from public post docs). */
export async function fetchCreatorFanPostMedia(creatorId: string, postId: string): Promise<{
  mediaUrls: string[];
  mediaTypes: ("image" | "video")[];
} | null> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
  if (!token) return null;
  const qs = new URLSearchParams({ creatorId, postId });
  const res = await fetch(resolveApiUrl(`/api/fanPostMedia?${qs.toString()}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { mediaUrls?: unknown; mediaTypes?: unknown } | null;
  const mediaUrls = Array.isArray(data?.mediaUrls)
    ? data.mediaUrls.filter((u): u is string => typeof u === "string" && !!u.trim())
    : [];
  const rawTypes = Array.isArray(data?.mediaTypes)
    ? data.mediaTypes.filter((t): t is string => typeof t === "string")
    : [];
  return { mediaUrls, mediaTypes: rawTypes.map((t) => (t === "video" ? "video" : "image")) };
}
