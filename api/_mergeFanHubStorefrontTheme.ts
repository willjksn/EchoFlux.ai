/** Keep in sync with `src/lib/mergeFanHubStorefrontTheme.ts` */
import { FAN_HUB_THEME_PRESETS } from "./_fanHubThemePresets.js";

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
