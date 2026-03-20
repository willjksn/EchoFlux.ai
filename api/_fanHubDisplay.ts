/**
 * Server-side copy of fan display rules (keep in sync with src/lib/fanHubDisplay.ts).
 */

export type FanDisplayInput = {
  username?: string | null;
  displayName?: string | null;
  name?: string | null;
  email?: string | null;
};

const MEMBER_USERNAME_RE = /^[a-z0-9_]{3,32}$/;

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
