/**
 * Fan / member labels for creator tools (Stormij-style: prefer @handle, not raw email).
 * Aligned with fan-hub-display from commit ab5360d (required member usernames / fan labels).
 */

export type FanDisplayInput = {
  username?: string | null;
  displayName?: string | null;
  /** Legacy / manual fan name */
  name?: string | null;
  /** When set, avoids using displayName that duplicates the account email */
  email?: string | null;
};

function eqIgnoreCase(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

function emailLocalPart(email: string | null | undefined): string | null {
  const e = email?.trim();
  if (!e || !e.includes("@")) return null;
  const local = e.split("@")[0]?.trim();
  return local || null;
}

/** Lowercase handle; if `username` mistakenly holds an email, use local part only. */
export function safeUsernameForHandle(username: string | null | undefined): string | null {
  const u = username?.trim().toLowerCase();
  if (!u) return null;
  if (u.includes("@")) {
    const local = u.split("@")[0]?.trim();
    return local ? local.slice(0, 60) : null;
  }
  return u.slice(0, 60);
}

/** Auth displayName — often equals email; never treat full email as public label. */
function safeDisplayNameForHandle(
  displayName: string | null | undefined,
  email: string | null | undefined
): string | null {
  const d = displayName?.trim();
  if (!d) return null;
  const em = email?.trim();
  if (em && eqIgnoreCase(d, em)) return null;
  if (d.includes("@")) {
    const local = d.split("@")[0]?.trim();
    if (em && eqIgnoreCase(d, em)) return null;
    return local || null;
  }
  return d;
}

/** Stored name (e.g. fan card) — skip generic placeholder and email duplicates. */
function safeNameField(name: string | null | undefined, email: string | null | undefined): string | null {
  const n = name?.trim();
  if (!n || n.toLowerCase() === "member") return null;
  const em = email?.trim();
  if (em && eqIgnoreCase(n, em)) return null;
  if (n.includes("@")) {
    const local = n.split("@")[0]?.trim();
    return local || null;
  }
  return n;
}

/**
 * Short label for lists: @username, else safe display name / name, else email local part, else Member.
 */
export function fanHubListLabel(
  username: string | null | undefined,
  displayName: string | null | undefined,
  email: string | null | undefined,
  extraName?: string | null | undefined
): string {
  const u = safeUsernameForHandle(username);
  if (u) return `@${u}`;
  const dn =
    safeDisplayNameForHandle(displayName, email) || safeNameField(extraName, email);
  if (dn) return dn;
  const local = emailLocalPart(email);
  return local || "Member";
}

export function fanHubListLabelFromInput(
  input: FanDisplayInput,
  options?: { fallback?: string }
): string {
  const fallback = options?.fallback ?? "Member";
  const label = fanHubListLabel(
    input.username,
    input.displayName,
    input.email,
    input.name
  );
  if (label === "Member" && options?.fallback) return fallback;
  return label;
}

const MEMBER_USERNAME_RE = /^[a-z0-9_]{3,32}$/;

/**
 * Primary label for lists and headers.
 * When `email` is provided, uses the same rules as `fanHubListLabel` (no raw emails as primary).
 */
export function formatFanDisplayLabel(
  input: FanDisplayInput,
  options?: { fallback?: string }
): string {
  const hasEmailContext = input.email != null && String(input.email).trim().length > 0;
  if (hasEmailContext) {
    return fanHubListLabelFromInput(input, options);
  }
  const fallback = options?.fallback ?? "Member";
  const rawU = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
  if (rawU && MEMBER_USERNAME_RE.test(rawU)) return `@${rawU}`;
  const su = safeUsernameForHandle(input.username);
  if (su) return `@${su}`;
  const dn = typeof input.displayName === "string" ? input.displayName.trim() : "";
  if (dn) return dn;
  const nm = typeof input.name === "string" ? input.name.trim() : "";
  if (nm && nm.toLowerCase() !== "member") return nm;
  return fallback;
}

/**
 * For AI prompts / plain sentences — handle without @, never exposes full email.
 */
export function formatFanPlainMoniker(input: FanDisplayInput): string | undefined {
  const u = safeUsernameForHandle(input.username);
  if (u) return u;
  const dn = safeDisplayNameForHandle(input.displayName, input.email);
  if (dn) return dn;
  const nm = safeNameField(input.name, input.email);
  if (nm) return nm;
  const local = emailLocalPart(input.email);
  return local || undefined;
}

/** Parse message timestamp to epoch ms (ISO string or Firestore-like `{ seconds }`). */
export function parseDmMessageTimeMs(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  if (
    typeof raw === "object" &&
    raw !== null &&
    "seconds" in raw &&
    typeof (raw as { seconds: unknown }).seconds === "number"
  ) {
    return (raw as { seconds: number }).seconds * 1000;
  }
  return null;
}

/** Short local time only (e.g. legacy list rows). */
export function formatDmShortTime(raw: unknown): string {
  const ms = parseDmMessageTimeMs(raw);
  if (ms == null) return "";
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Stable day key for grouping (YYYY-MM-DD in local calendar). */
export function formatDmDayCalendarKey(raw: unknown): string {
  const ms = parseDmMessageTimeMs(raw);
  if (ms == null) return "";
  const d = new Date(ms);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** Centered date divider label (e.g. Sat, Mar 21, 2026). */
export function formatDmDateDividerLabel(raw: unknown): string {
  const ms = parseDmMessageTimeMs(raw);
  if (ms == null) return "";
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Full date + time for bubble footer (e.g. Sat, Mar 21, 2026, 3:40 PM). */
export function formatDmBubbleDateTime(raw: unknown): string {
  const ms = parseDmMessageTimeMs(raw);
  if (ms == null) return "";
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Initials for avatars from a display label (strips leading @). */
export function initialsFromFanLabel(label: string): string {
  const s = label.replace(/^@/, "").trim();
  if (!s) return "?";
  const parts = s.split(/[\s_]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
  }
  return s.slice(0, 2).toUpperCase();
}

/** Avatar initials: prefer username, then safe display name, then email local part. */
/**
 * Stormij-style author line inside a DM bubble (@HANDLE in caps).
 */
export function formatDmBubbleAuthorLine(label: string): string {
  const s = label.trim();
  if (!s) return "";
  if (s.startsWith("@")) {
    const h = s
      .slice(1)
      .toUpperCase()
      .replace(/[^A-Z0-9_.]/g, "")
      .replace(/^\.+|\.+$/g, "");
    return h ? `@${h}` : "@MEMBER";
  }
  return s.toUpperCase().replace(/\s+/g, "_").slice(0, 28);
}

/**
 * Outgoing creator bubble badge (username → STORMIJ_XO style; else display name).
 */
export function formatCreatorOutgoingDmBadge(username?: string | null, displayName?: string | null): string {
  const u = safeUsernameForHandle(username);
  if (u) {
    return u.toUpperCase().replace(/[^a-z0-9_]/gi, "_").replace(/_+/g, "_").slice(0, 32);
  }
  const n = (displayName || "").trim();
  if (n) return n.toUpperCase().replace(/\s+/g, "_").slice(0, 28);
  return "YOU";
}

/** Sidebar / list: short relative time (e.g. 3 mins, 13h, 1d after 24h+). */
export function formatDmRelativeShort(raw: string | undefined | null): string {
  if (raw == null || raw === "") return "";
  const ms = new Date(raw).getTime();
  if (Number.isNaN(ms)) return "";
  const diff = Date.now() - ms;
  if (diff < 0) return "now";
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "now";
  const min = Math.floor(sec / 60);
  if (min < 1) return "now";
  if (min < 60) return min === 1 ? "1 min" : `${min} mins`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 8) return `${wk}w`;
  const mo = Math.floor(day / 30);
  return `${Math.max(1, mo)}mo`;
}

/** Readable first line in creator’s outgoing bubble (name or @handle). */
export function formatCreatorDmBubblePrimaryLine(
  displayName?: string | null,
  username?: string | null
): string {
  const n = (displayName || "").trim();
  if (n) return n;
  const u = safeUsernameForHandle(username);
  if (u) return `@${u}`;
  return "You";
}

/** Second line: STORMIJ-style handle when we also show a real name. */
export function formatCreatorDmBubbleSecondaryLine(
  displayName?: string | null,
  username?: string | null
): string | null {
  const n = (displayName || "").trim();
  const u = safeUsernameForHandle(username);
  if (n && u) return formatCreatorOutgoingDmBadge(username, null);
  return null;
}

export function fanHubInitials(
  username: string | null | undefined,
  displayName: string | null | undefined,
  email: string | null | undefined
): string {
  const u = safeUsernameForHandle(username);
  if (u) {
    const alnum = u.replace(/[^a-z0-9]/gi, "");
    if (alnum.length >= 2) return alnum.slice(0, 2).toUpperCase();
    if (alnum.length === 1) return alnum[0].toUpperCase();
    return u.slice(0, 2).toUpperCase();
  }
  const dn = safeDisplayNameForHandle(displayName, email);
  if (dn) {
    const parts = dn.trim().split(/\s+/);
    if (parts.length >= 2 && parts[0].length && parts[parts.length - 1].length) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    }
    if (parts[0]?.length) return parts[0][0].toUpperCase().slice(0, 2);
  }
  const local = emailLocalPart(email);
  if (local) {
    const alnum = local.replace(/[^a-z0-9]/gi, "");
    if (alnum.length >= 2) return alnum.slice(0, 2).toUpperCase();
    if (alnum.length === 1) return alnum[0].toUpperCase();
    const c = local[0];
    if (c && /[A-Z0-9]/i.test(c)) return c.toUpperCase();
  }
  return "?";
}

/** Role stored on `creators/{creatorId}/fans/{fanId}` (Stormij, Stripe, manual). */
export type FanHubStoredRole = "admin" | "member" | "tipper" | "treat_buyer";

/**
 * Normalize admin/member/tipper from a Firestore fan (or Stormij member) document.
 * Stormij and older rows use mixed field names (`userRole`, `isAdmin`, `permissions`, etc.).
 */
export function parseFanMemberRoleFromFirestore(data: Record<string, unknown>): FanHubStoredRole | null {
  const s = (v: unknown): string => String(v ?? "").toLowerCase().trim();

  if (data.isAdmin === true || data.is_admin === true) return "admin";

  const roleStr =
    s(data.role) ||
    s(data.userRole) ||
    s(data.user_role) ||
    s(data.memberRole) ||
    s(data.member_role);

  if (
    roleStr === "admin" ||
    roleStr === "administrator" ||
    roleStr === "owner" ||
    roleStr === "moderator"
  ) {
    return "admin";
  }
  if (roleStr === "tipper") return "tipper";
  if (roleStr === "treat_buyer" || roleStr === "treat buyer") return "treat_buyer";
  if (roleStr === "member") return "member";

  const access = s(data.accessLevel) || s(data.access_level);
  if (access === "admin") return "admin";

  const perms = data.permissions;
  if (Array.isArray(perms)) {
    for (const p of perms) {
      const ps = s(p);
      if (ps === "admin" || ps === "administrator") return "admin";
    }
  }

  return null;
}
