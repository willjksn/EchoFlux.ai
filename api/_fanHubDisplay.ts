/**
 * Server-side copy of fan display rules (keep in sync with src/lib/fanHubDisplay.ts).
 */

export type FanDisplayInput = {
  username?: string | null;
  displayName?: string | null;
  name?: string | null;
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

export function safeUsernameForHandle(username: string | null | undefined): string | null {
  const u = username?.trim().toLowerCase();
  if (!u) return null;
  if (u.includes("@")) {
    const local = u.split("@")[0]?.trim();
    return local ? local.slice(0, 60) : null;
  }
  return u.slice(0, 60);
}

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

export function formatFanDisplayLabel(input: FanDisplayInput, options?: { fallback?: string }): string {
  const hasEmailContext = input.email != null && String(input.email).trim().length > 0;
  if (hasEmailContext) {
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
  const fallback = options?.fallback ?? "Member";
  const su = safeUsernameForHandle(input.username);
  if (su) return `@${su}`;
  const dn = typeof input.displayName === "string" ? input.displayName.trim() : "";
  if (dn) return dn;
  const nm = typeof input.name === "string" ? input.name.trim() : "";
  if (nm && nm.toLowerCase() !== "member") return nm;
  return fallback;
}
