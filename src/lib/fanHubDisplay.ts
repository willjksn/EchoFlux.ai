/**
 * Fan-facing display labels for creator tools (Stormij-style: prefer @handle, not raw email).
 */

export type FanDisplayInput = {
  username?: string | null;
  displayName?: string | null;
  /** Legacy / manual fan name */
  name?: string | null;
  /** Only for admin secondary lines — never used as primary label */
  email?: string | null;
};

const MEMBER_USERNAME_RE = /^[a-z0-9_]{3,32}$/;

/**
 * Primary label for lists and headers: @username > displayName > name > fallback.
 * Does not use email as the visible name.
 */
export function formatFanDisplayLabel(
  input: FanDisplayInput,
  options?: { fallback?: string }
): string {
  const fallback = options?.fallback ?? "Member";
  const rawU = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
  if (rawU && MEMBER_USERNAME_RE.test(rawU)) return `@${rawU}`;
  const dn = typeof input.displayName === "string" ? input.displayName.trim() : "";
  if (dn) return dn;
  const nm = typeof input.name === "string" ? input.name.trim() : "";
  if (nm) return nm;
  return fallback;
}

/**
 * For AI prompts / plain sentences — handle without @, never exposes full email.
 */
export function formatFanPlainMoniker(input: FanDisplayInput): string | undefined {
  const rawU = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
  if (rawU && MEMBER_USERNAME_RE.test(rawU)) return rawU;
  const dn = typeof input.displayName === "string" ? input.displayName.trim() : "";
  if (dn) return dn;
  const nm = typeof input.name === "string" ? input.name.trim() : "";
  if (nm) return nm;
  return undefined;
}

/** Short local time for DM bubbles (ISO string or Firestore-like `{ seconds }`). */
export function formatDmShortTime(raw: unknown): string {
  if (raw == null || raw === "") return "";
  let ms: number | null = null;
  if (typeof raw === "string") {
    const d = new Date(raw);
    ms = Number.isNaN(d.getTime()) ? null : d.getTime();
  } else if (
    typeof raw === "object" &&
    raw !== null &&
    "seconds" in raw &&
    typeof (raw as { seconds: unknown }).seconds === "number"
  ) {
    ms = (raw as { seconds: number }).seconds * 1000;
  }
  if (ms == null) return "";
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Initials for avatars from a display label (strips leading @). */
export function initialsFromFanLabel(label: string): string {
  const s = label.replace(/^@/, "").trim();
  if (!s) return "?";
  const parts = s.split(/[\s_]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  }
  return s.slice(0, 2).toUpperCase();
}
