import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { mergeFanHubStorefrontTheme } from "../lib/mergeFanHubStorefrontTheme";
import type { CreatorStorefrontSettings } from "../../types";

/** Defaults match My Page / storefront when no Firestore theme yet */
export const DEFAULT_FAN_HUB_THEME = {
  primary: "#6366f1",
  background: "#fafafa",
  text: "#1f2937",
  textMuted: "#6b7280",
  border: "#e5e7eb",
  accentHover: "#4f46e5",
  fontFamily: undefined as string | undefined,
};

export type CreatorFanHubTheme = typeof DEFAULT_FAN_HUB_THEME;

const FAN_HUB_THEME_SESSION_PREFIX = "echoflux:fanhub-theme-v1:";

function readCachedTheme(creatorId: string): CreatorFanHubTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(FAN_HUB_THEME_SESSION_PREFIX + creatorId);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<CreatorFanHubTheme>;
    if (typeof o.primary !== "string" || typeof o.background !== "string") return null;
    return {
      ...DEFAULT_FAN_HUB_THEME,
      ...o,
      accentHover: typeof o.accentHover === "string" ? o.accentHover : o.primary || DEFAULT_FAN_HUB_THEME.primary,
    };
  } catch {
    return null;
  }
}

function writeCachedTheme(creatorId: string, t: CreatorFanHubTheme) {
  try {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(FAN_HUB_THEME_SESSION_PREFIX + creatorId, JSON.stringify(t));
    }
  } catch {
    /* quota / private mode */
  }
}

function mergeTheme(raw: Partial<CreatorStorefrontSettings["theme"]> | undefined): CreatorFanHubTheme {
  if (!raw) return { ...DEFAULT_FAN_HUB_THEME };
  const m = mergeFanHubStorefrontTheme(raw as Record<string, unknown>);
  const primary = m.primary || DEFAULT_FAN_HUB_THEME.primary;
  return {
    primary,
    background: m.background || DEFAULT_FAN_HUB_THEME.background,
    text: m.text || DEFAULT_FAN_HUB_THEME.text,
    textMuted: m.textMuted || DEFAULT_FAN_HUB_THEME.textMuted,
    border: m.border || DEFAULT_FAN_HUB_THEME.border,
    accentHover: m.accentHover || primary,
    fontFamily: m.fontFamily || undefined,
  };
}

/**
 * Loads `creators/{creatorId}.theme` so Fan Hub can match the public storefront (e.g. stormijxo).
 */
export function useCreatorFanHubTheme(creatorId: string | undefined): CreatorFanHubTheme {
  const [theme, setTheme] = useState<CreatorFanHubTheme>(() => {
    if (!creatorId) return DEFAULT_FAN_HUB_THEME;
    return readCachedTheme(creatorId) ?? DEFAULT_FAN_HUB_THEME;
  });

  useEffect(() => {
    if (!creatorId || !db) {
      setTheme(DEFAULT_FAN_HUB_THEME);
      return;
    }
    const cached = readCachedTheme(creatorId);
    if (cached) setTheme(cached);

    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "creators", creatorId));
        if (cancelled) return;
        if (!snap.exists()) {
          if (!cached) setTheme(DEFAULT_FAN_HUB_THEME);
          return;
        }
        const data = snap.data() as Partial<CreatorStorefrontSettings>;
        const next = mergeTheme(data.theme);
        setTheme(next);
        writeCachedTheme(creatorId, next);
      } catch {
        if (!cancelled && !cached) setTheme(DEFAULT_FAN_HUB_THEME);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creatorId]);

  return theme;
}
