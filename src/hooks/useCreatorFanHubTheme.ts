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
  const [theme, setTheme] = useState<CreatorFanHubTheme>(DEFAULT_FAN_HUB_THEME);

  useEffect(() => {
    if (!creatorId || !db) {
      setTheme(DEFAULT_FAN_HUB_THEME);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "creators", creatorId));
        if (cancelled || !snap.exists()) return;
        const data = snap.data() as Partial<CreatorStorefrontSettings>;
        setTheme(mergeTheme(data.theme));
      } catch {
        if (!cancelled) setTheme(DEFAULT_FAN_HUB_THEME);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creatorId]);

  return theme;
}
