import type { CSSProperties } from "react";

/** Use storefront background luminance — not EchoFlux app dark mode — so Fan Hub tabs match My Page colors. */
export function fanHubThemeBackgroundIsDark(backgroundHex: string): boolean {
  const h = backgroundHex.trim();
  const m = /^#([a-fA-F0-9]{6})$/i.exec(h);
  if (!m) return false;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return l < 0.45;
}

export type FanHubThemeTokens = {
  primary: string;
  background: string;
  text: string;
  border: string;
};

export function fanHubTokensFromCssBridge(
  bridge: Record<string, string> | undefined | null
): FanHubThemeTokens | null {
  if (!bridge) return null;
  const primary = bridge["--fan-primary"];
  const background = bridge["--fan-bg"];
  if (!primary || !background) return null;
  return {
    primary,
    background,
    text: bridge["--fan-text"] ?? "#374151",
    border: bridge["--fan-border"] ?? "#e5e7eb",
  };
}

/** Outline tab (Post ideas / Drop plan) — matches PremiumStudioLayout inactive/active Fan Hub nav. */
export function fanHubOutlineTabStyle(
  active: boolean,
  theme: FanHubThemeTokens,
  surfaceIsDark: boolean
): CSSProperties {
  const { primary, background, text, border } = theme;
  if (active) {
    return {
      border: `1px solid ${primary}`,
      backgroundColor: surfaceIsDark
        ? `color-mix(in srgb, ${primary} 18%, #1e293b)`
        : `color-mix(in srgb, ${primary} 12%, #fff)`,
      color: surfaceIsDark
        ? "#e2e8f0"
        : `color-mix(in srgb, ${primary} 48%, #000)`,
      boxShadow: `0 0 0 1px color-mix(in srgb, ${primary} 35%, transparent)`,
    };
  }
  return surfaceIsDark
    ? {
        backgroundColor: `color-mix(in srgb, ${primary} 8%, #1e293b)`,
        color: "#e2e8f0",
        border: `1px solid color-mix(in srgb, ${primary} 28%, #334155)`,
      }
    : {
        backgroundColor: "transparent",
        color: text,
        border: `1px solid color-mix(in srgb, ${primary} 22%, ${border})`,
      };
}
