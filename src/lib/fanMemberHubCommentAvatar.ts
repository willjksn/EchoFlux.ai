/**
 * Comment compose avatar on the fan member hub — same rules as FanStorefrontView profile photo:
 * If `users/{uid}` exists but has no photo fields (or empty strings), do not resurrect stale `auth.photoURL`.
 */
export function resolveFanMemberCommentComposePhotoFromUserDoc(
  userDocumentExists: boolean,
  d: Record<string, unknown>,
  authPhotoURL: string | null | undefined
): string | undefined {
  const hasPhotoKeys =
    Object.prototype.hasOwnProperty.call(d, "photoURL") ||
    Object.prototype.hasOwnProperty.call(d, "avatar");

  if (!userDocumentExists) {
    const fromDoc =
      hasPhotoKeys
        ? ((typeof d.photoURL === "string" && d.photoURL.trim()) ||
            (typeof d.avatar === "string" && d.avatar.trim()) ||
            "")
        : "";
    const oauth = typeof authPhotoURL === "string" ? authPhotoURL.trim() : "";
    const merged = fromDoc || oauth;
    return merged || undefined;
  }

  if (hasPhotoKeys) {
    const s =
      (typeof d.photoURL === "string" && d.photoURL.trim()) ||
      (typeof d.avatar === "string" && d.avatar.trim()) ||
      "";
    return s || undefined;
  }

  return undefined;
}
