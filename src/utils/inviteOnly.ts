export function isInviteOnlyMode(): boolean {
  const v = (import.meta as any)?.env?.VITE_INVITE_ONLY_MODE;
  const s = String(v ?? "").toLowerCase().trim();

  // Preferred values (human-friendly)
  if (s === "on") return true;
  if (s === "off" || s === "") return false;

  // Backwards compatible values (so existing envs don't break immediately)
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;

  // Unknown value -> default off
  return false;
}


