import { FAN_HUB_THEME_PRESETS } from "./fanHubThemePresets";

/**
 * Merge Fan Hub theme preset defaults (Ocean, etc.) with stored Firestore `theme`.
 * Stored strings override preset; empty strings are skipped so preset fills gaps.
 * Used by public `getCreatorByHandle` and client `useCreatorFanHubTheme` so dashboard + live site match My Page.
 */
export function mergeFanHubStorefrontTheme(raw: Record<string, unknown> | undefined): Record<string, string> {
  const stored = raw && typeof raw === "object" ? raw : {};
  const pid = typeof stored.presetId === "string" ? stored.presetId.trim() : "";
  const preset = FAN_HUB_THEME_PRESETS.find((p) => p.id === pid);
  const out: Record<string, string> = {};
  if (preset?.theme) {
    for (const [k, v] of Object.entries(preset.theme)) {
      if (typeof v === "string" && v.trim()) out[k] = v;
    }
  }
  for (const [k, v] of Object.entries(stored)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string") {
      if (k === "presetId" || v.trim() !== "") out[k] = v;
    }
  }
  return out;
}
