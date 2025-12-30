export function isInviteOnlyMode(): boolean {
  // IMPORTANT: Use direct `import.meta.env.*` access so Vite can replace it at build time.
  // Optional chaining/casting patterns can prevent replacement, leaving `import.meta.env` undefined in production.
  const s = String(import.meta.env.VITE_INVITE_ONLY_MODE ?? "").toLowerCase().trim();

  // Preferred values (human-friendly)
  if (s === "on") return true;
  if (s === "off" || s === "") return false;

  // Backwards compatible values (so existing envs don't break immediately)
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;

  // Unknown value -> default off
  return false;
}


