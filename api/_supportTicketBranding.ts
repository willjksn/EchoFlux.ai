/** Creator-account tickets: member-facing replies use EchoFlux in-app + email. */
export const CREATOR_SUPPORT_BRAND = "EchoFlux";

/** Fan / member tickets: match fan storefront env (often witme.io). */
export function fanFacingSupportBrandFromEnv(): string {
  const a = typeof process.env.FAN_FACING_SITE_TITLE === "string" ? process.env.FAN_FACING_SITE_TITLE.trim() : "";
  if (a) return a;
  const b =
    typeof process.env.VITE_FAN_FACING_SITE_TITLE === "string" ? process.env.VITE_FAN_FACING_SITE_TITLE.trim() : "";
  return b || "witme.io";
}

export function memberFacingReplyBrandForReporterKind(kind: "fan" | "creator"): string {
  return kind === "creator" ? CREATOR_SUPPORT_BRAND : fanFacingSupportBrandFromEnv();
}

/** Stored field wins (written at ticket creation); legacy docs infer from reporterKind. */
export function resolveMemberFacingReplyBrandFromTicket(ticket: Record<string, unknown>): string {
  const stored = typeof ticket.memberFacingReplyBrand === "string" ? ticket.memberFacingReplyBrand.trim() : "";
  if (stored) return stored;
  const kind = ticket.reporterKind === "creator" ? "creator" : "fan";
  return memberFacingReplyBrandForReporterKind(kind);
}
