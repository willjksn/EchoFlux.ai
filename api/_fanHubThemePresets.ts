/** Keep in sync with `src/lib/fanHubThemePresets.ts` — duplicated here so Vercel bundles `getCreatorByHandle` without `../src/lib/` resolution issues. */
export type FanHubThemePreset = {
  id: string;
  name: string;
  theme: { primary: string; background: string; text?: string; textMuted?: string; fontFamily?: string };
};

export const FAN_HUB_THEME_PRESETS: FanHubThemePreset[] = [
  { id: "default", name: "Default", theme: { primary: "#6366f1", background: "#fafafa", text: "#1f2937", textMuted: "#6b7280", fontFamily: "Inter, sans-serif" } },
  { id: "stormij", name: "Warm Pink", theme: { primary: "#c97082", background: "#fef8f9", text: "#2d1f24", textMuted: "#6b5a60", fontFamily: "Georgia, serif" } },
  { id: "ocean", name: "Ocean", theme: { primary: "#0ea5e9", background: "#f0f9ff", text: "#0c4a6e", textMuted: "#0369a1", fontFamily: "Inter, sans-serif" } },
  { id: "forest", name: "Forest", theme: { primary: "#22c55e", background: "#f0fdf4", text: "#14532d", textMuted: "#166534", fontFamily: "Inter, sans-serif" } },
  { id: "minimal-dark", name: "Minimal Dark", theme: { primary: "#a78bfa", background: "#1c1917", text: "#fafaf9", textMuted: "#a8a29e", fontFamily: "Inter, sans-serif" } },
  { id: "sunset", name: "Sunset", theme: { primary: "#f97316", background: "#fff7ed", text: "#431407", textMuted: "#9a3412", fontFamily: "Lato, sans-serif" } },
  {
    id: "custom",
    name: "Custom",
    theme: { primary: "", background: "", text: "", textMuted: "", fontFamily: "" },
  },
];
