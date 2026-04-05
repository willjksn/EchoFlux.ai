import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAppContext } from "./AppContext";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage, auth } from "../firebaseConfig";
import type {
  CreatorStorefrontSettings,
  StorefrontButtonStyle,
  StorefrontSocialLinks,
  StorefrontLandingContent,
  StorefrontLegal,
  TextStyle,
  PresetFontSize,
  LandingSectionListMarker,
  LandingSectionBodyMode,
  TreatProduct,
} from "../types";
import { STOREFRONT_CONTENT_POLICY, DEFAULT_PRIVACY_POLICY, DEFAULT_TERMS_OF_SERVICE, FAN_HUB_THEME_PRESETS, HERO_LAYOUT_OPTIONS, HERO_MEDIA_SIZE_OPTIONS } from "../constants";
import { getAvatarCropStyle } from "../src/lib/avatarCrop";
import {
  clampPan,
  parseObjectPositionPercentPair,
  formatObjectPositionPercentPair,
} from "../src/lib/objectPositionPan";
import { StorefrontPreview, type StorefrontPreviewLiveLanding } from "./StorefrontPreview";
import { resolveStoreCopy } from "../src/lib/storefrontStoreCopy";
import { UserIcon, ImageIcon, GlobeIcon } from "./icons/UIIcons";
import { EmojiButton } from "./EmojiPicker";
import { canUseSjHeartEmoji } from "../src/lib/customEmoji";

const DEFAULT_SECTIONS: NonNullable<CreatorStorefrontSettings["sections"]> = {
  feed: true,
  treats: true,
  tip: true,
  messages: true,
  about: true,
};
const DEFAULT_SECTIONS_ORDER = ["feed", "treats", "tip", "messages", "about"];

// Neutral default theme - creators should customize
const DEFAULT_THEME: NonNullable<CreatorStorefrontSettings["theme"]> = {
  primary: "#6366f1",
  background: "#fafafa",
  text: "#1f2937",
  textMuted: "#6b7280",
  border: "#e5e7eb",
  accentHover: "#4f46e5",
  buttonStyle: "solid",
};

const DEFAULT_MONETIZATION: NonNullable<CreatorStorefrontSettings["monetization"]> = {
  monthlyPrice: 999,
  currency: "usd",
  lockedDefaultPrice: 499,
  tipsEnabled: true,
  chatEnabled: true,
  videoEnabled: true,
  freeAccessEnabled: false,
};

const DEFAULT_SOCIAL_LINKS: StorefrontSocialLinks = {
  instagram: { url: "", show: true },
  facebook: { url: "", show: false },
  x: { url: "", show: true },
  tiktok: { url: "", show: true },
  youtube: { url: "", show: false },
};

const DEFAULT_LANDING_CONTENT: StorefrontLandingContent = {
  perksTitle: "Demo Section Title",
  perksText: "This is demo landing copy. Update this text in My Page Builder.",
  perksList: [
    "Demo bullet one",
    "Demo bullet two",
    "Demo bullet three",
    "Demo bullet four",
  ],
  previewTitle: "Demo Preview",
  previewText: "This is demo preview text.",
  previewList: [
    "Demo feature one",
    "Demo feature two",
    "Demo feature three",
    "Demo feature four",
  ],
  previewFooterLines: ["Demo footer line one.", "Demo footer line two."],
  energyTitle: "Demo Vibe",
  energyLines: [
    "Demo vibe line one.",
    "Demo vibe line two.",
    "Demo vibe line three.",
  ],
  boundaryTitle: "Community Guidelines",
  boundaryText: "This is demo guideline text. Replace with your own policy and expectations.",
  memberStoreTitle: "Store",
  memberStoreSubtitle: "Demo member store subtitle text.",
  memberStoreEmptyMessage: "Nothing listed here yet.",
  memberStoreLoadingMessage: "Loading…",
  storeLandingHeadline: "Demo store headline",
  storeLandingDescription: "Demo store description text.",
  storeLandingCtaLabel: "Open store",
  publicStoreCardTitle: "Store",
  publicStoreCardDescription:
    "Demo public store description text.",
  publicStoreOpenCtaLabel: "Open store",
  publicStoreModalTitle: "Store",
  publicStoreModalEmptyMessage: "Nothing available right now.",
};

const DEFAULT_LEGAL: StorefrontLegal = {
  termsText: "",
  termsLastUpdated: "",
  privacyText: "",
  privacyLastUpdated: "",
};
const FAN_HUB_PREVIEW_THEME_STORAGE_KEY = "echoflux:fanhub-preview-theme";
const FAN_HUB_PREVIEW_THEME_EVENT = "echoflux:fanhub-preview-theme-changed";

function clampPercent(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function LandingBodyModeToggle({
  value,
  onChange,
  ariaLabel,
}: {
  value: LandingSectionBodyMode;
  onChange: (mode: LandingSectionBodyMode) => void;
  ariaLabel: string;
}) {
  const pill = (active: boolean) =>
    `px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
      active
        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
    }`;
  return (
    <div
      className="inline-flex rounded-lg border border-gray-200 dark:border-gray-600 p-0.5 bg-gray-100 dark:bg-gray-800/80 gap-0.5"
      role="group"
      aria-label={ariaLabel}
    >
      <button type="button" className={pill(value === "bullets")} onClick={() => onChange("bullets")}>
        Bullets
      </button>
      <button type="button" className={pill(value === "paragraph")} onClick={() => onChange("paragraph")}>
        Paragraph
      </button>
    </div>
  );
}

/** Firestore rejects nested `undefined`. `JSON.stringify` omits them, but client `setDoc` does not. */
function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out as T;
  }
  return value;
}

function normalizeForCompare(a: Partial<CreatorStorefrontSettings>): string {
  return JSON.stringify({
    handle: (a.handle ?? "").replace("@", "").toLowerCase().trim(),
    displayName: a.displayName ?? "",
    bio: a.bio ?? "",
    avatar: a.avatar ?? "",
    avatarObjectPosition: a.avatarObjectPosition ?? "",
    banner: a.banner ?? "",
    logo: a.logo ?? "",
    showDisplayNameOnLanding: a.showDisplayNameOnLanding !== false,
    heroImage: a.heroImage ?? "",
    heroMedia: Array.isArray(a.heroMedia) ? a.heroMedia : [],
    heroTagline: a.heroTagline ?? "",
    heroPromise: a.heroPromise ?? "",
    heroSubline: a.heroSubline ?? "",
    heroSubline2: a.heroSubline2 ?? "",
    socialLinks: a.socialLinks ?? DEFAULT_SOCIAL_LINKS,
    landingContent: a.landingContent ?? DEFAULT_LANDING_CONTENT,
    legal: a.legal ?? DEFAULT_LEGAL,
    theme: { ...DEFAULT_THEME, ...a.theme },
    heroLayout: a.heroLayout ?? "default",
    sections: { ...DEFAULT_SECTIONS, ...a.sections },
    sectionsOrder: a.sectionsOrder ?? DEFAULT_SECTIONS_ORDER,
    spicyMode: a.spicyMode ?? false,
    rules: a.rules ?? {},
    monetization: a.monetization ?? {},
    textStyles: a.textStyles ?? {},
    publicTreatsOnLanding: a.publicTreatsOnLanding === true,
    fanAuthBranding: a.fanAuthBranding ?? {},
  });
}

/**
 * Same normalization as `loadSettings` → preview always matches what Firestore save / public API return,
 * even when `draft` only has partial updates from individual fields.
 */
function buildStorefrontPreviewConfig(draft: Partial<CreatorStorefrontSettings>): Partial<CreatorStorefrontSettings> {
  const heroMedia =
    Array.isArray(draft.heroMedia) && draft.heroMedia.length > 0
      ? draft.heroMedia
      : draft.heroImage
        ? [{ url: String(draft.heroImage), size: "medium" as const }]
        : [];
  return {
    handle: draft.handle ?? "",
    displayName: draft.displayName ?? "",
    bio: draft.bio ?? "",
    avatar: draft.avatar ?? (draft as Record<string, unknown>).avatarUrl,
    avatarObjectPosition: draft.avatarObjectPosition,
    showDisplayNameOnLanding: draft.showDisplayNameOnLanding !== false,
    heroImage: draft.heroImage ?? "",
    heroMedia,
    heroTagline: draft.heroTagline ?? "",
    heroPromise: draft.heroPromise ?? "",
    heroSubline: draft.heroSubline ?? "",
    heroSubline2: draft.heroSubline2 ?? "",
    logo:
      (draft.logo && String(draft.logo).trim()) ||
      (draft.logoUrl && String(draft.logoUrl).trim()) ||
      "",
    socialLinks: draft.socialLinks ? { ...DEFAULT_SOCIAL_LINKS, ...draft.socialLinks } : { ...DEFAULT_SOCIAL_LINKS },
    landingContent: draft.landingContent ? { ...DEFAULT_LANDING_CONTENT, ...draft.landingContent } : { ...DEFAULT_LANDING_CONTENT },
    legal: draft.legal ? { ...DEFAULT_LEGAL, ...draft.legal } : { ...DEFAULT_LEGAL },
    theme: draft.theme ? { ...DEFAULT_THEME, ...draft.theme } : { ...DEFAULT_THEME },
    heroLayout: draft.heroLayout ?? "default",
    sections: draft.sections ? { ...DEFAULT_SECTIONS, ...draft.sections } : { ...DEFAULT_SECTIONS },
    sectionsOrder: draft.sectionsOrder ?? DEFAULT_SECTIONS_ORDER,
    spicyMode: draft.spicyMode ?? false,
    rules: draft.rules ?? {},
    monetization: draft.monetization ? { ...DEFAULT_MONETIZATION, ...draft.monetization } : { ...DEFAULT_MONETIZATION },
    textStyles: draft.textStyles ?? {},
    onboardingStatus: draft.onboardingStatus,
    updatedAt: draft.updatedAt,
    publicTreatsOnLanding: draft.publicTreatsOnLanding === true,
    fanAuthBranding: draft.fanAuthBranding ?? {},
  };
}

function storefrontVisualScore(data: Record<string, unknown> | null | undefined): number {
  if (!data) return -1;
  let score = 0;
  if (typeof data.logo === "string" && data.logo.trim()) score += 8;
  if (typeof data.logoUrl === "string" && data.logoUrl.trim()) score += 8;
  if (typeof data.avatar === "string" && data.avatar.trim()) score += 5;
  if (typeof data.avatarUrl === "string" && data.avatarUrl.trim()) score += 5;
  if (Array.isArray(data.heroMedia) && data.heroMedia.length > 0) score += 6;
  if (typeof data.heroImage === "string" && data.heroImage.trim()) score += 4;
  if (typeof data.heroImageUrl === "string" && data.heroImageUrl.trim()) score += 4;
  if (typeof data.heroTagline === "string" && data.heroTagline.trim()) score += 2;
  if (typeof data.heroPromise === "string" && data.heroPromise.trim()) score += 2;
  if (typeof data.updatedAt === "string" && data.updatedAt.trim()) score += 1;
  return score;
}

// Social media icons
const InstagramIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
);

const FacebookIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const XIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const TikTokIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
  </svg>
);

const YouTubeIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

// Font size options for text styling (with pixel labels)
const FONT_SIZE_OPTIONS: { value: PresetFontSize; label: string }[] = [
  { value: 'xs', label: '12px' },
  { value: 'sm', label: '14px' },
  { value: 'base', label: '16px' },
  { value: 'lg', label: '18px' },
  { value: 'xl', label: '20px' },
  { value: '2xl', label: '24px' },
  { value: '3xl', label: '30px' },
];

// Font family options for text styling
const FONT_FAMILY_OPTIONS: { value: string; label: string; style: string }[] = [
  // Sans-serif fonts
  { value: 'Inter, sans-serif', label: 'Inter', style: 'font-family: Inter, sans-serif' },
  { value: 'Arial, sans-serif', label: 'Arial', style: 'font-family: Arial, sans-serif' },
  { value: 'Helvetica, sans-serif', label: 'Helvetica', style: 'font-family: Helvetica, sans-serif' },
  { value: 'Verdana, sans-serif', label: 'Verdana', style: 'font-family: Verdana, sans-serif' },
  { value: 'Tahoma, sans-serif', label: 'Tahoma', style: 'font-family: Tahoma, sans-serif' },
  { value: 'Trebuchet MS, sans-serif', label: 'Trebuchet', style: 'font-family: Trebuchet MS, sans-serif' },
  { value: 'Segoe UI, sans-serif', label: 'Segoe UI', style: 'font-family: Segoe UI, sans-serif' },
  { value: 'Roboto, sans-serif', label: 'Roboto', style: 'font-family: Roboto, sans-serif' },
  { value: 'Open Sans, sans-serif', label: 'Open Sans', style: 'font-family: Open Sans, sans-serif' },
  { value: 'Lato, sans-serif', label: 'Lato', style: 'font-family: Lato, sans-serif' },
  { value: 'Montserrat, sans-serif', label: 'Montserrat', style: 'font-family: Montserrat, sans-serif' },
  { value: 'Poppins, sans-serif', label: 'Poppins', style: 'font-family: Poppins, sans-serif' },
  { value: 'Nunito, sans-serif', label: 'Nunito', style: 'font-family: Nunito, sans-serif' },
  { value: 'Raleway, sans-serif', label: 'Raleway', style: 'font-family: Raleway, sans-serif' },
  { value: 'Ubuntu, sans-serif', label: 'Ubuntu', style: 'font-family: Ubuntu, sans-serif' },
  // Serif fonts
  { value: 'Georgia, serif', label: 'Georgia', style: 'font-family: Georgia, serif' },
  { value: 'Times New Roman, serif', label: 'Times New Roman', style: 'font-family: Times New Roman, serif' },
  { value: 'Palatino, serif', label: 'Palatino', style: 'font-family: Palatino, serif' },
  { value: 'Garamond, serif', label: 'Garamond', style: 'font-family: Garamond, serif' },
  { value: 'Baskerville, serif', label: 'Baskerville', style: 'font-family: Baskerville, serif' },
  { value: 'Playfair Display, serif', label: 'Playfair Display', style: 'font-family: Playfair Display, serif' },
  { value: 'Merriweather, serif', label: 'Merriweather', style: 'font-family: Merriweather, serif' },
  { value: 'Lora, serif', label: 'Lora', style: 'font-family: Lora, serif' },
  { value: 'Crimson Text, serif', label: 'Crimson Text', style: 'font-family: Crimson Text, serif' },
  // Display & decorative fonts
  { value: 'Oswald, sans-serif', label: 'Oswald', style: 'font-family: Oswald, sans-serif' },
  { value: 'Bebas Neue, sans-serif', label: 'Bebas Neue', style: 'font-family: Bebas Neue, sans-serif' },
  { value: 'Abril Fatface, cursive', label: 'Abril Fatface', style: 'font-family: Abril Fatface, cursive' },
  { value: 'Righteous, cursive', label: 'Righteous', style: 'font-family: Righteous, cursive' },
  { value: 'Lobster, cursive', label: 'Lobster', style: 'font-family: Lobster, cursive' },
  { value: 'Pacifico, cursive', label: 'Pacifico', style: 'font-family: Pacifico, cursive' },
  { value: 'Dancing Script, cursive', label: 'Dancing Script', style: 'font-family: Dancing Script, cursive' },
  { value: 'Great Vibes, cursive', label: 'Great Vibes', style: 'font-family: Great Vibes, cursive' },
  { value: 'Satisfy, cursive', label: 'Satisfy', style: 'font-family: Satisfy, cursive' },
  { value: 'Permanent Marker, cursive', label: 'Permanent Marker', style: 'font-family: Permanent Marker, cursive' },
  { value: 'Caveat, cursive', label: 'Caveat', style: 'font-family: Caveat, cursive' },
  // Monospace fonts
  { value: 'Courier New, monospace', label: 'Courier New', style: 'font-family: Courier New, monospace' },
  { value: 'Monaco, monospace', label: 'Monaco', style: 'font-family: Monaco, monospace' },
  { value: 'Consolas, monospace', label: 'Consolas', style: 'font-family: Consolas, monospace' },
  { value: 'Fira Code, monospace', label: 'Fira Code', style: 'font-family: Fira Code, monospace' },
];

// Text style controls component
const TextStyleControls: React.FC<{
  style?: TextStyle;
  onChange: (style: TextStyle) => void;
  defaultSize?: PresetFontSize;
}> = ({ style, onChange, defaultSize = 'base' }) => {
  const [showControls, setShowControls] = useState(false);
  const isPresetFontSize = (value?: string): value is PresetFontSize =>
    Boolean(value && FONT_SIZE_OPTIONS.some((opt) => opt.value === value));
  const customFontSize = isPresetFontSize(style?.fontSize) ? "" : (style?.fontSize ?? "");
  
  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setShowControls(!showControls)}
        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
        title="Text style"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7V4h16v3M9 20h6M12 4v16" />
        </svg>
      </button>
      
      {showControls && (
        <>
          {/* Backdrop - click to close */}
          <div 
            className="fixed inset-0 z-[9998] bg-black/20"
            onClick={() => setShowControls(false)}
          />
          {/* Modal */}
          <div 
            className="fixed z-[9999] bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 w-[320px]" 
            style={{ 
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              maxHeight: '85vh',
              overflowY: 'auto'
            }}
          >
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200 dark:border-gray-700">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">Text Style</span>
              <button
                type="button"
                onClick={() => setShowControls(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              {/* Font Family */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Font Family</label>
                <select
                  value={style?.fontFamily || ''}
                  onChange={(e) => onChange({ ...style, fontFamily: e.target.value || undefined })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Default</option>
                  <optgroup label="Sans-serif">
                    {FONT_FAMILY_OPTIONS.filter(f => f.value.includes('sans-serif')).map((font) => (
                      <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                        {font.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Serif">
                    {FONT_FAMILY_OPTIONS.filter(f => f.value.includes('serif') && !f.value.includes('sans-serif')).map((font) => (
                      <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                        {font.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Display & Script">
                    {FONT_FAMILY_OPTIONS.filter(f => f.value.includes('cursive')).map((font) => (
                      <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                        {font.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Monospace">
                    {FONT_FAMILY_OPTIONS.filter(f => f.value.includes('monospace')).map((font) => (
                      <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                        {font.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
                {style?.fontFamily && (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300" style={{ fontFamily: style.fontFamily }}>
                    Preview: The quick brown fox
                  </p>
                )}
              </div>
              {/* Font Size */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Font Size</label>
                <div className="flex flex-wrap gap-1">
                  {FONT_SIZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onChange({ ...style, fontSize: opt.value })}
                      className={`px-2 py-1 text-xs rounded ${
                        (style?.fontSize || defaultSize) === opt.value
                          ? 'bg-primary-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2">
                  <input
                    type="text"
                    value={customFontSize}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      onChange({ ...style, fontSize: raw || undefined });
                    }}
                    placeholder="Custom size (e.g. 22px, 1.35rem)"
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                    Supports px, rem, em, %, vw, vh
                  </p>
                </div>
              </div>
              {/* Color */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={style?.color || '#000000'}
                    onChange={(e) => onChange({ ...style, color: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
                  />
                  <input
                    type="text"
                    value={style?.color || ''}
                    onChange={(e) => onChange({ ...style, color: e.target.value })}
                    placeholder="#000000"
                    className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  {style?.color && (
                    <button
                      type="button"
                      onClick={() => onChange({ ...style, color: undefined })}
                      className="text-xs text-gray-500 hover:text-red-500"
                      title="Reset to default"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              {/* Italic — optional; default is normal/upright */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Style</label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 dark:border-gray-600"
                    checked={style?.fontStyle === "italic"}
                    onChange={(e) => {
                      const next: TextStyle = { ...(style ?? {}) };
                      if (e.target.checked) next.fontStyle = "italic";
                      else delete next.fontStyle;
                      onChange(next);
                    }}
                  />
                  <span className={style?.fontStyle === "italic" ? "italic" : ""}>Italic</span>
                </label>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Collapsible section component
const CollapsibleSection: React.FC<{
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, defaultOpen = false, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="p-4 pt-0 border-t border-gray-100 dark:border-gray-700">{children}</div>}
    </div>
  );
};

export const MyPageBuilder: React.FC = () => {
  const { user, showToast } = useAppContext();
  const creatorId = user?.id;

  const [saved, setSaved] = useState<Partial<CreatorStorefrontSettings>>({});
  const [draft, setDraft] = useState<Partial<CreatorStorefrontSettings>>({});
  const [handleInput, setHandleInput] = useState("");
  const [handleCheckStatus, setHandleCheckStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [handleCheckMessage, setHandleCheckMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [handleSaving, setHandleSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [previewMode, setPreviewMode] = useState<"landing" | "member">("landing");
  const [saveBtnHover, setSaveBtnHover] = useState(false);
  const [previewFramingTool, setPreviewFramingTool] = useState<
    "off" | "panBg" | "panAvatar" | "focusPhoto"
  >("off");
  const [previewFocusPhotoSlot, setPreviewFocusPhotoSlot] = useState(0);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const [builderGuestTreatModalOpen, setBuilderGuestTreatModalOpen] = useState(false);
  const [builderLandingTreatsProducts, setBuilderLandingTreatsProducts] = useState<TreatProduct[]>([]);
  const [builderLandingTreatsLoading, setBuilderLandingTreatsLoading] = useState(false);

  const includeSjHeartEmoji = useMemo(
    () => canUseSjHeartEmoji({ creatorHandle: draft.handle, viewerIsAdmin: user?.role === "Admin" }),
    [draft.handle, user?.role]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const liveTheme = { ...DEFAULT_THEME, ...(draft.theme || {}) };
    try {
      window.sessionStorage.setItem(FAN_HUB_PREVIEW_THEME_STORAGE_KEY, JSON.stringify(liveTheme));
      window.dispatchEvent(new Event(FAN_HUB_PREVIEW_THEME_EVENT));
    } catch {
      // Ignore storage errors (private mode/quota) and keep builder functional.
    }
  }, [draft.theme]);

  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return;
      try {
        window.sessionStorage.removeItem(FAN_HUB_PREVIEW_THEME_STORAGE_KEY);
        window.dispatchEvent(new Event(FAN_HUB_PREVIEW_THEME_EVENT));
      } catch {
        // Ignore cleanup storage errors.
      }
    };
  }, []);

  const heroGridSlotCount = useMemo(
    () => (draft.heroMedia ?? []).filter((m) => m.size !== "fullBackground").length,
    [draft.heroMedia]
  );
  const heroHasFullBackground = useMemo(
    () => (draft.heroMedia ?? []).some((m) => m.size === "fullBackground"),
    [draft.heroMedia]
  );

  const builderAvatarPanRef = useRef<{
    startClientX: number;
    startClientY: number;
    startOx: number;
    startOy: number;
  } | null>(null);

  useEffect(() => {
    const el = previewScrollRef.current;
    if (el) el.scrollTop = 0;
  }, [previewMode, draft.handle]);

  useEffect(() => {
    if (draft.publicTreatsOnLanding !== true || draft.sections?.treats === false) {
      setBuilderGuestTreatModalOpen(false);
    }
  }, [draft.publicTreatsOnLanding, draft.sections?.treats]);

  useEffect(() => {
    if (!creatorId || previewMode !== "landing") {
      setBuilderLandingTreatsProducts([]);
      setBuilderLandingTreatsLoading(false);
      return;
    }
    if (draft.publicTreatsOnLanding !== true || draft.sections?.treats === false) {
      setBuilderLandingTreatsProducts([]);
      setBuilderLandingTreatsLoading(false);
      return;
    }
    let cancelled = false;
    setBuilderLandingTreatsLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/products?creatorId=${encodeURIComponent(creatorId)}&context=landing`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) {
          setBuilderLandingTreatsProducts(Array.isArray(data.products) ? data.products : []);
        }
      } catch {
        if (!cancelled) setBuilderLandingTreatsProducts([]);
      } finally {
        if (!cancelled) setBuilderLandingTreatsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creatorId, previewMode, draft.publicTreatsOnLanding, draft.sections?.treats]);

  useEffect(() => {
    if (!builderGuestTreatModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBuilderGuestTreatModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [builderGuestTreatModalOpen]);

  useEffect(() => {
    if (!builderGuestTreatModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [builderGuestTreatModalOpen]);

  const openBuilderGuestTreatPreview = useCallback(() => {
    if (!creatorId) {
      showToast?.("Sign in and save your page — then you can preview landing treats here.", "info");
      return;
    }
    setBuilderGuestTreatModalOpen(true);
  }, [creatorId, showToast]);

  const onBuilderAvatarPanPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (previewFramingTool !== "panAvatar" || !draft.avatar) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const [ox, oy] = parseObjectPositionPercentPair(draft.avatarObjectPosition);
      builderAvatarPanRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startOx: ox,
        startOy: oy,
      };
    },
    [previewFramingTool, draft.avatar, draft.avatarObjectPosition]
  );

  const onBuilderAvatarPanPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (previewFramingTool !== "panAvatar" || !builderAvatarPanRef.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const w = Math.max(rect.width, 1);
      const h = Math.max(rect.height, 1);
      const dx = e.clientX - builderAvatarPanRef.current.startClientX;
      const dy = e.clientY - builderAvatarPanRef.current.startClientY;
      const sens = 0.85;
      const nx = clampPan(
        builderAvatarPanRef.current.startOx - (dx / w) * 100 * sens,
        0,
        100
      );
      const ny = clampPan(
        builderAvatarPanRef.current.startOy - (dy / h) * 100 * sens,
        0,
        100
      );
      setDraft((prev) => ({
        ...prev,
        avatarObjectPosition: formatObjectPositionPercentPair(nx, ny),
      }));
      builderAvatarPanRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startOx: nx,
        startOy: ny,
      };
    },
    [previewFramingTool]
  );

  const onBuilderAvatarPanPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    builderAvatarPanRef.current = null;
  }, []);

  const isDirty = useMemo(
    () => normalizeForCompare(draft) !== normalizeForCompare(saved),
    [draft, saved]
  );

  useEffect(() => {
    const gridCount = (draft.heroMedia ?? []).filter((m) => m.size !== "fullBackground").length;
    setPreviewFocusPhotoSlot((s) => (gridCount > 0 && s >= gridCount ? 0 : s));
  }, [draft.heroMedia]);

  // Framing tools are landing-only (pan avatar, pan bg, photo focus). Clear when leaving Landing preview.
  useEffect(() => {
    setPreviewFramingTool((tool) => {
      if (previewMode === "landing") return tool;
      if (tool === "panBg" || tool === "focusPhoto" || tool === "panAvatar") return "off";
      return tool;
    });
  }, [previewMode]);

  const loadSettings = useCallback(async () => {
    if (!creatorId) return;
    try {
      const docRef = doc(db, "creators", creatorId);
      const snap = await getDoc(docRef);
      const data = snap.exists() ? (snap.data() as Partial<CreatorStorefrontSettings>) : {};
      const merged: Partial<CreatorStorefrontSettings> = {
        handle: data.handle ?? "",
        displayName: data.displayName ?? "",
        bio: data.bio ?? "",
        avatar: data.avatar ?? (data as Record<string, unknown>).avatarUrl,
        avatarObjectPosition: data.avatarObjectPosition,
        banner: data.banner ?? (data as Record<string, unknown>).bannerUrl,
        showDisplayNameOnLanding: (data as Record<string, unknown>).showDisplayNameOnLanding !== false,
        heroImage: data.heroImage ?? "",
        heroMedia: Array.isArray(data.heroMedia) && data.heroMedia.length > 0
          ? data.heroMedia
          : (data.heroImage ? [{ url: data.heroImage, size: "medium" as const }] : []),
        heroTagline: data.heroTagline ?? "",
        heroPromise: data.heroPromise ?? "",
        heroSubline: (data as Record<string, unknown>).heroSubline ?? "",
        heroSubline2: data.heroSubline2 ?? "",
        logo:
          (data.logo && String(data.logo).trim()) ||
          ((data as { logoUrl?: string }).logoUrl && String((data as { logoUrl?: string }).logoUrl).trim()) ||
          "",
        socialLinks: data.socialLinks ? { ...DEFAULT_SOCIAL_LINKS, ...data.socialLinks } : { ...DEFAULT_SOCIAL_LINKS },
        landingContent: data.landingContent ? { ...DEFAULT_LANDING_CONTENT, ...data.landingContent } : { ...DEFAULT_LANDING_CONTENT },
        legal: data.legal ? { ...DEFAULT_LEGAL, ...data.legal } : { ...DEFAULT_LEGAL },
        theme: data.theme ? { ...DEFAULT_THEME, ...data.theme } : { ...DEFAULT_THEME },
        heroLayout: data.heroLayout ?? "default",
        sections: data.sections ? { ...DEFAULT_SECTIONS, ...data.sections } : { ...DEFAULT_SECTIONS },
        sectionsOrder: data.sectionsOrder ?? DEFAULT_SECTIONS_ORDER,
        spicyMode: data.spicyMode ?? false,
        rules: data.rules ?? {},
        monetization: data.monetization ? { ...DEFAULT_MONETIZATION, ...data.monetization } : { ...DEFAULT_MONETIZATION },
        textStyles: data.textStyles ?? {},
        onboardingStatus: data.onboardingStatus,
        updatedAt: data.updatedAt,
        publicTreatsOnLanding: data.publicTreatsOnLanding === true,
        fanAuthBranding: data.fanAuthBranding ?? {},
      };
      const handleForLookup = String(merged.handle ?? "").replace("@", "").toLowerCase().trim();
      const missingVisuals =
        !String(merged.logo ?? "").trim() &&
        !String((merged as { logoUrl?: string }).logoUrl ?? "").trim() &&
        !String(merged.avatar ?? "").trim() &&
        !String(merged.heroImage ?? "").trim() &&
        !Array.isArray(merged.heroMedia);

      if (db && handleForLookup && missingVisuals) {
        try {
          const snapByHandle = await getDocs(
            query(collection(db, "creators"), where("handle", "==", handleForLookup))
          );
          if (!snapByHandle.empty) {
            let best = snapByHandle.docs[0].data() as Record<string, unknown>;
            let bestScore = storefrontVisualScore(best);
            for (const d of snapByHandle.docs.slice(1)) {
              const cand = d.data() as Record<string, unknown>;
              const s = storefrontVisualScore(cand);
              if (s > bestScore) {
                best = cand;
                bestScore = s;
              }
            }
            if (bestScore > storefrontVisualScore(merged as Record<string, unknown>)) {
              merged.logo =
                (String(merged.logo ?? "").trim() ||
                  (typeof best.logo === "string" ? best.logo.trim() : "") ||
                  (typeof best.logoUrl === "string" ? best.logoUrl.trim() : "")) || "";
              merged.avatar =
                (String(merged.avatar ?? "").trim() ||
                  (typeof best.avatar === "string" ? best.avatar.trim() : "") ||
                  (typeof best.avatarUrl === "string" ? best.avatarUrl.trim() : "")) || "";
              merged.avatarObjectPosition =
                merged.avatarObjectPosition ??
                (typeof best.avatarObjectPosition === "string" ? best.avatarObjectPosition : undefined);
              if ((!merged.heroMedia || merged.heroMedia.length === 0) && Array.isArray(best.heroMedia)) {
                merged.heroMedia = best.heroMedia as NonNullable<CreatorStorefrontSettings["heroMedia"]>;
              }
              if (!String(merged.heroImage ?? "").trim()) {
                merged.heroImage =
                  (typeof best.heroImage === "string" && best.heroImage.trim()) ||
                  (typeof best.heroImageUrl === "string" && best.heroImageUrl.trim()) ||
                  "";
              }
              if (!String(merged.heroTagline ?? "").trim() && typeof best.heroTagline === "string") merged.heroTagline = best.heroTagline;
              if (!String(merged.heroPromise ?? "").trim() && typeof best.heroPromise === "string") merged.heroPromise = best.heroPromise;
              if (!String(merged.heroSubline ?? "").trim() && typeof best.heroSubline === "string") merged.heroSubline = best.heroSubline;
              if (!String(merged.heroSubline2 ?? "").trim() && typeof best.heroSubline2 === "string") merged.heroSubline2 = best.heroSubline2;
            }
          }
        } catch {
          // Best-effort fallback only; keep primary doc data.
        }
      }
      (merged as Record<string, unknown>).stripeConnectAccountId = (data as Record<string, unknown>).stripeConnectAccountId;
      setSaved(merged);
      setDraft(merged);
      setHandleInput(merged.handle ?? "");
    } catch (e) {
      console.error("Failed to load My Page settings:", e);
      showToast?.("Failed to load settings", "error");
    } finally {
      setLoading(false);
    }
    // showToast intentionally omitted — unstable identity was re-running this effect and wiping draft (e.g. new logo upload).
  }, [creatorId]);

  useEffect(() => {
    void loadSettings();
  }, [creatorId, loadSettings]);

  const checkHandle = useCallback(
    async (value: string) => {
      const clean = value.replace("@", "").toLowerCase().trim();
      const currentSavedHandle = String(saved.handle ?? "")
        .replace("@", "")
        .toLowerCase()
        .trim();
      if (!clean || clean.length < 3 || clean.length > 20 || !/^[a-z0-9_]+$/.test(clean)) {
        setHandleCheckStatus("idle");
        setHandleCheckMessage("");
        return;
      }
      // If creator is still using their own saved handle, never show "taken".
      if (creatorId && clean === currentSavedHandle) {
        setHandleCheckStatus("available");
        setHandleCheckMessage("Your current handle");
        return;
      }
      setHandleCheckStatus("checking");
      setHandleCheckMessage("");
      try {
        const params = new URLSearchParams({ handle: clean });
        if (creatorId) params.set("creatorId", creatorId);
        const res = await fetch(`/api/checkHandleAvailability?${params}`);
        let data: { available?: boolean; message?: string } = {};
        try {
          data = (await res.json()) as typeof data;
        } catch {
          data = {};
        }
        if (res.ok && data.available === true) {
          setHandleCheckStatus("available");
          setHandleCheckMessage("Available");
          return;
        }
        if (res.ok && data.available === false) {
          setHandleCheckStatus("taken");
          setHandleCheckMessage(data.message || "This handle is already taken");
          return;
        }
        // Vite local dev: /api/* often 404 — check creatorHandles in Firestore (needs rules: public read)
        if (!res.ok && db) {
          try {
            const snap = await getDoc(doc(db, "creatorHandles", clean));
            if (!snap.exists()) {
              setHandleCheckStatus("available");
              setHandleCheckMessage("Available (local check)");
              return;
            }
            const existing = (snap.data() as { creatorId?: string })?.creatorId;
            if (creatorId && existing === creatorId) {
              setHandleCheckStatus("available");
              setHandleCheckMessage("Your current handle");
              return;
            }
            setHandleCheckStatus("taken");
            setHandleCheckMessage("This handle is already taken");
            return;
          } catch {
            setHandleCheckStatus("idle");
            setHandleCheckMessage(
              res.status === 404
                ? "Deploy updated Firestore rules, then retry — or set DEV_API_PROXY for live API."
                : "Could not verify handle"
            );
            return;
          }
        }
        setHandleCheckStatus("idle");
        setHandleCheckMessage("Could not check availability");
      } catch {
        setHandleCheckStatus("idle");
        setHandleCheckMessage("Could not check availability");
      }
    },
    [creatorId, saved.handle]
  );

  useEffect(() => {
    const clean = handleInput.replace("@", "").toLowerCase().trim();
    if (clean.length < 3 || !/^[a-z0-9_]+$/.test(clean)) {
      setHandleCheckStatus("idle");
      setHandleCheckMessage("");
      return;
    }
    const t = setTimeout(() => checkHandle(handleInput), 400);
    return () => clearTimeout(t);
  }, [handleInput, checkHandle]);

  const updateDraft = useCallback((next: Partial<CreatorStorefrontSettings>) => {
    setDraft((prev) => ({ ...prev, ...next }));
  }, []);

  /** Update theme without clobbering other theme fields (uses latest state) */
  const updateTheme = useCallback((patch: Partial<NonNullable<CreatorStorefrontSettings["theme"]>>) => {
    setDraft((prev) => ({
      ...prev,
      theme: { ...DEFAULT_THEME, ...prev.theme, ...patch },
    }));
  }, []);

  const updateTextStyle = useCallback((field: keyof NonNullable<CreatorStorefrontSettings['textStyles']>, style: TextStyle) => {
    setDraft((prev) => ({
      ...prev,
      textStyles: {
        ...prev.textStyles,
        [field]: style,
      },
    }));
  }, []);

  const handleSaveHandle = useCallback(async () => {
    if (!creatorId) {
      showToast?.("Not authenticated", "error");
      return;
    }
    const clean = handleInput.replace("@", "").toLowerCase().trim();
    const currentSaved = String(saved.handle ?? "").replace("@", "").toLowerCase().trim();
    const isResyncOnly = clean === currentSaved;
    if (!clean || clean.length < 3 || clean.length > 20 || !/^[a-z0-9_]+$/.test(clean)) {
      showToast?.("Enter a valid handle (3-20 letters, numbers, underscores).", "error");
      return;
    }
    // Allow "save" even when the handle text didn't change so we can repair
    // stale creatorHandles mapping in backend/local dev.
    if (!isResyncOnly && handleCheckStatus === "taken") {
      showToast?.("That handle is unavailable.", "error");
      return;
    }

    setHandleSaving(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      if (!token) {
        showToast?.("Authentication token missing. Please sign in again.", "error");
        return;
      }

      const res = await fetch("/api/updateCreatorStorefront", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ handle: clean }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Local fallback when /api isn't available.
        if (res.status === 404 && db && creatorId) {
          await setDoc(
            doc(db, "creators", creatorId),
            { handle: clean, updatedAt: new Date().toISOString() },
            { merge: true }
          );
          await setDoc(doc(db, "creatorHandles", clean), { creatorId }, { merge: true });
        } else {
          throw new Error((data as { message?: string }).message || `Save failed (${res.status})`);
        }
      }

      setSaved((prev) => ({ ...prev, handle: clean, updatedAt: new Date().toISOString() }));
      setDraft((prev) => ({ ...prev, handle: clean }));
      setHandleInput(clean);
      setHandleCheckStatus("available");
      setHandleCheckMessage("Your current handle");
      showToast?.(isResyncOnly ? "Handle mapping synced" : "Handle saved", "success");
    } catch (e) {
      console.error("[MyPageBuilder] Handle save error:", e);
      showToast?.(e instanceof Error ? e.message : "Failed to save handle", "error");
    } finally {
      setHandleSaving(false);
    }
  }, [creatorId, handleInput, handleCheckStatus, saved.handle, showToast]);

  const handleSave = useCallback(async () => {
    if (!creatorId) {
      showToast?.("Not authenticated", "error");
      return;
    }
    if (!isDirty) {
      showToast?.("No changes to save", "info");
      return;
    }
    setSaving(true);
    try {
      const payload = stripUndefinedDeep({
        handle: (draft.handle ?? "").replace("@", "").toLowerCase().trim(),
        displayName: draft.displayName,
        bio: draft.bio,
        avatar: draft.avatar,
        avatarObjectPosition: draft.avatarObjectPosition,
        logo: draft.logo,
        showDisplayNameOnLanding: draft.showDisplayNameOnLanding,
        heroImage: draft.heroMedia?.[0]?.url ?? draft.heroImage,
        heroMedia: draft.heroMedia,
        heroTagline: draft.heroTagline,
        heroPromise: draft.heroPromise,
        heroSubline: draft.heroSubline,
        heroSubline2: draft.heroSubline2,
        socialLinks: draft.socialLinks,
        landingContent: draft.landingContent,
        legal: draft.legal,
        theme: draft.theme,
        heroLayout: draft.heroLayout,
        sections: draft.sections,
        sectionsOrder: draft.sectionsOrder,
        spicyMode: draft.spicyMode,
        rules: draft.rules,
        monetization: draft.monetization,
        textStyles: draft.textStyles,
        onboardingStatus: draft.onboardingStatus,
        publicTreatsOnLanding: draft.publicTreatsOnLanding === true,
        fanAuthBranding: draft.fanAuthBranding,
      });
      console.log("[MyPageBuilder] Saving payload:", payload);
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      if (!token) {
        showToast?.("Authentication token missing. Please sign in again.", "error");
        setSaving(false);
        return;
      }
      const res = await fetch("/api/updateCreatorStorefront", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      console.log("[MyPageBuilder] Save response:", res.status, data);
      if (!res.ok) {
        // Vite local dev: API routes return 404 unless proxied — persist to Firestore so My Page still saves
        if (res.status === 404 && db && creatorId) {
          console.warn("[MyPageBuilder] /api/updateCreatorStorefront 404 — writing creators/{id} via Firestore (local dev).");
          const merged = stripUndefinedDeep({
            ...payload,
            updatedAt: new Date().toISOString(),
          }) as Record<string, unknown>;
          await setDoc(doc(db, "creators", creatorId), merged, { merge: true });
          const newH = String(payload.handle ?? "")
            .replace("@", "")
            .toLowerCase()
            .trim();
          const oldH = String(saved.handle ?? "")
            .replace("@", "")
            .toLowerCase()
            .trim();
          if (newH && newH !== oldH) {
            showToast?.(
              "Saved to Firestore. Public handle links may need the deployed API to update fully.",
              "info"
            );
          } else {
            showToast?.("Changes saved (Firestore — run API or DEV_API_PROXY for full handle sync).", "success");
          }
          const updated = { ...draft, ...payload, updatedAt: new Date().toISOString() };
          setSaved(updated);
          setDraft(updated);
          setHandleInput(updated.handle ?? "");
          return;
        }
        throw new Error((data as { message?: string }).message || `Save failed (${res.status})`);
      }
      // Best-effort client-side handle mapping sync for legacy mismatches (no-op if rules deny).
      try {
        const cleanHandle = String(payload.handle ?? "")
          .replace("@", "")
          .toLowerCase()
          .trim();
        if (db && creatorId && cleanHandle) {
          await setDoc(doc(db, "creatorHandles", cleanHandle), { creatorId }, { merge: true });
        }
      } catch (handleSyncErr) {
        console.warn("[MyPageBuilder] creatorHandles sync skipped:", handleSyncErr);
      }
      const updated = { ...draft, ...payload, updatedAt: new Date().toISOString() };
      setSaved(updated);
      setDraft(updated);
      setHandleInput(updated.handle ?? "");
      showToast?.("Changes saved", "success");
    } catch (e) {
      console.error("[MyPageBuilder] Save error:", e);
      showToast?.(e instanceof Error ? e.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }, [creatorId, draft, isDirty, showToast, saved]);

  const handleReset = useCallback(() => {
    setDraft({ ...saved });
    setHandleInput(saved.handle ?? "");
  }, [saved]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !creatorId) return;
    setAvatarUploading(true);
    try {
      const path = `users/${creatorId}/storefront_avatar/${Date.now()}.${file.type.split("/")[1] || "jpg"}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file, { contentType: file.type });
      const url = await getDownloadURL(storageRef);
      updateDraft({ avatar: url });
    } catch (err) {
      console.error(err);
      showToast?.("Failed to upload avatar", "error");
    } finally {
      setAvatarUploading(false);
    }
  };

  const [heroImageUploading, setHeroImageUploading] = useState(false);
  const handleHeroImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !creatorId) return;
    setHeroImageUploading(true);
    try {
      const path = `users/${creatorId}/storefront_hero/${Date.now()}.${file.type.split("/")[1] || "jpg"}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file, { contentType: file.type });
      const url = await getDownloadURL(storageRef);
      updateDraft({ heroImage: url });
    } catch (err) {
      console.error(err);
      showToast?.("Failed to upload hero image", "error");
    } finally {
      setHeroImageUploading(false);
    }
  };

  const [heroMediaUploading, setHeroMediaUploading] = useState(false);
  const handleHeroMediaAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !creatorId) return;
    const current = draft.heroMedia ?? [];
    if (current.length >= 6) {
      showToast?.("Maximum 6 hero images.", "info");
      return;
    }
    setHeroMediaUploading(true);
    try {
      const path = `users/${creatorId}/storefront_hero/${Date.now()}.${file.type.split("/")[1] || "jpg"}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file, { contentType: file.type });
      const url = await getDownloadURL(storageRef);
      updateDraft({ heroMedia: [...current, { url, size: "medium" }] });
    } catch (err) {
      console.error(err);
      showToast?.("Failed to upload image", "error");
    } finally {
      setHeroMediaUploading(false);
    }
  };
  const removeHeroMediaItem = (index: number) => {
    const current = draft.heroMedia ?? [];
    updateDraft({ heroMedia: current.filter((_, i) => i !== index) });
  };
  const setHeroMediaItemSize = (index: number, size: "small" | "medium" | "large" | "fullBackground") => {
    const current = [...(draft.heroMedia ?? [])];
    if (current[index]) {
      current[index] = { ...current[index], size };
      updateDraft({ heroMedia: current });
    }
  };
  // Helper to update social links
  const updateSocialLink = (platform: keyof Omit<StorefrontSocialLinks, "custom">, field: "url" | "show", value: string | boolean) => {
    const current = draft.socialLinks ?? { ...DEFAULT_SOCIAL_LINKS };
    const platformData = current[platform] ?? { url: "", show: true };
    updateDraft({
      socialLinks: {
        ...current,
        [platform]: { ...platformData, [field]: value },
      },
    });
  };

  // Helper to add a custom social link
  const addCustomSocialLink = () => {
    const current = draft.socialLinks ?? { ...DEFAULT_SOCIAL_LINKS };
    const customLinks = current.custom ?? [];
    updateDraft({
      socialLinks: {
        ...current,
        custom: [...customLinks, { name: "", url: "", show: true }],
      },
    });
  };

  // Helper to update a custom social link
  const updateCustomSocialLink = (index: number, field: "name" | "url" | "show", value: string | boolean) => {
    const current = draft.socialLinks ?? { ...DEFAULT_SOCIAL_LINKS };
    const customLinks = [...(current.custom ?? [])];
    if (customLinks[index]) {
      customLinks[index] = { ...customLinks[index], [field]: value };
      updateDraft({
        socialLinks: {
          ...current,
          custom: customLinks,
        },
      });
    }
  };

  // Helper to remove a custom social link
  const removeCustomSocialLink = (index: number) => {
    const current = draft.socialLinks ?? { ...DEFAULT_SOCIAL_LINKS };
    const customLinks = [...(current.custom ?? [])];
    customLinks.splice(index, 1);
    updateDraft({
      socialLinks: {
        ...current,
        custom: customLinks,
      },
    });
  };

  // Helper to update landing content (merge only — do not spread full defaults or other fields reset)
  const updateLandingContent = <K extends keyof StorefrontLandingContent>(field: K, value: StorefrontLandingContent[K]) => {
    updateDraft({
      landingContent: {
        ...(draft.landingContent ?? DEFAULT_LANDING_CONTENT),
        [field]: value,
      },
    });
  };

  const setPerksExtraMode = useCallback((mode: LandingSectionBodyMode) => {
    setDraft((prev) => {
      const lc = { ...(prev.landingContent ?? DEFAULT_LANDING_CONTENT) };
      if (mode === "paragraph") {
        const para =
          String(lc.perksParagraph ?? "").trim() !== ""
            ? lc.perksParagraph
            : (lc.perksList ?? []).map((l) => String(l).trim()).filter(Boolean).join("\n");
        return {
          ...prev,
          landingContent: { ...lc, perksExtraMode: "paragraph", perksParagraph: para ?? "" },
        };
      }
      const lines = String(lc.perksParagraph ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const nextList = lines.length > 0 ? lines : lc.perksList ?? [];
      return {
        ...prev,
        landingContent: { ...lc, perksExtraMode: "bullets", perksList: nextList },
      };
    });
  }, []);

  const setPreviewExtraMode = useCallback((mode: LandingSectionBodyMode) => {
    setDraft((prev) => {
      const lc = { ...(prev.landingContent ?? DEFAULT_LANDING_CONTENT) };
      if (mode === "paragraph") {
        const para =
          String(lc.previewParagraph ?? "").trim() !== ""
            ? lc.previewParagraph
            : (lc.previewList ?? []).map((l) => String(l).trim()).filter(Boolean).join("\n");
        return {
          ...prev,
          landingContent: { ...lc, previewExtraMode: "paragraph", previewParagraph: para ?? "" },
        };
      }
      const lines = String(lc.previewParagraph ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const nextList = lines.length > 0 ? lines : lc.previewList ?? [];
      return {
        ...prev,
        landingContent: { ...lc, previewExtraMode: "bullets", previewList: nextList },
      };
    });
  }, []);

  const setEnergyBodyMode = useCallback((mode: LandingSectionBodyMode) => {
    setDraft((prev) => {
      const lc = { ...(prev.landingContent ?? DEFAULT_LANDING_CONTENT) };
      if (mode === "paragraph") {
        const para =
          String(lc.energyParagraph ?? "").trim() !== ""
            ? lc.energyParagraph
            : (lc.energyLines ?? []).map((l) => String(l).trim()).filter(Boolean).join("\n");
        return {
          ...prev,
          landingContent: { ...lc, energyBodyMode: "paragraph", energyParagraph: para ?? "" },
        };
      }
      const lines = String(lc.energyParagraph ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const nextLines = lines.length > 0 ? lines : lc.energyLines ?? [];
      return {
        ...prev,
        landingContent: { ...lc, energyBodyMode: "bullets", energyLines: nextLines },
      };
    });
  }, []);

  // Helper to update legal — must use functional setDraft so back-to-back updates (e.g. termsText + termsLastUpdated)
  // do not clobber each other with a stale draft.legal from the render closure.
  const updateLegal = useCallback((field: keyof StorefrontLegal, value: string) => {
    setDraft((prev) => ({
      ...prev,
      // DEFAULT_LEGAL must come first so prev.legal is not wiped by empty default strings
      // when updating a single field (e.g. termsLastUpdated after termsText).
      legal: {
        ...DEFAULT_LEGAL,
        ...prev.legal,
        [field]: value,
      },
    }));
  }, []);

  // State for legal modals
  const [legalModalOpen, setLegalModalOpen] = useState<"terms" | "privacy" | null>(null);

  const normalizedHandle = (draft.handle as string | undefined)?.replace("@", "").toLowerCase().trim() || "";
  const previewUrl = normalizedHandle ? `https://witme.io/${normalizedHandle}` : "";
  const previewLandingUrl = previewUrl ? `${previewUrl}/p` : "";
  const previewMemberUrl = previewUrl ? `${previewUrl}?preview=member` : "";

  const handleCleanForCheck = handleInput.replace("@", "").toLowerCase().trim();
  const savedHandleForCheck = String(saved.handle ?? "").replace("@", "").toLowerCase().trim();
  const handleIsCurrentSaved = !!handleCleanForCheck && handleCleanForCheck === savedHandleForCheck;
  const savePrimary = draft.theme?.primary || DEFAULT_THEME.primary;
  const explicitHover = draft.theme?.accentHover;
  const saveHoverColor =
    explicitHover && explicitHover !== DEFAULT_THEME.accentHover
      ? explicitHover
      : savePrimary;
  const handleFormatOk =
    handleCleanForCheck.length >= 3 &&
    handleCleanForCheck.length <= 20 &&
    /^[a-z0-9_]+$/.test(handleCleanForCheck);

  const storefrontPreviewConfig = useMemo(() => buildStorefrontPreviewConfig(draft), [draft]);

  /** Landing tab: mirror live guest-treat card vs “sign up for store” using draft toggles (open Live for real checkout). */
  const storefrontLandingLivePreview = useMemo((): StorefrontPreviewLiveLanding | undefined => {
    if (previewMode !== "landing") return undefined;
    const toastPreview = (msg: string) => showToast?.(msg, "info");
    const noop = () => {};
    return {
      isLoggedIn: false,
      isFreeAccess: draft.monetization?.freeAccessEnabled === true,
      onOpenSignup: () => toastPreview("Preview only — use Live to test signup."),
      onOpenLogin: () => toastPreview("Preview only — use Live to test login."),
      onSubscribe: () => toastPreview("Preview only — use Live to subscribe."),
      onJoinFree: () => toastPreview("Preview only — use Live to join."),
      subscribing: false,
      joiningFree: false,
      isDarkMode: false,
      onToggleDarkMode: noop,
      termsHref: "/terms",
      privacyHref: "/privacy",
      tipHandle: "",
      onTipHandleChange: noop,
      tipCustomAmount: "",
      onTipCustomAmountChange: noop,
      onTipPresetDollars: () => toastPreview("Preview only — tips work on your live page."),
      onTipCustomSubmit: () => toastPreview("Preview only — tips work on your live page."),
      tipLoading: false,
      tipError: "",
      tipsEnabled: draft.monetization?.tipsEnabled !== false,
      showGuestTreatsCard:
        draft.publicTreatsOnLanding === true && draft.sections?.treats !== false,
      onOpenGuestTreats: openBuilderGuestTreatPreview,
      landingTreatsLoading: builderLandingTreatsLoading,
      landingTreatProductCount: builderLandingTreatsProducts.length,
      treatLinkAccountMessage: null,
    };
  }, [
    previewMode,
    draft.publicTreatsOnLanding,
    draft.sections?.treats,
    draft.monetization?.freeAccessEnabled,
    draft.monetization?.tipsEnabled,
    showToast,
    openBuilderGuestTreatPreview,
    builderLandingTreatsLoading,
    builderLandingTreatsProducts.length,
  ]);

  const builderGuestTreatStoreCopy = useMemo(
    () => resolveStoreCopy(storefrontPreviewConfig.landingContent),
    [storefrontPreviewConfig.landingContent]
  );
  const builderGuestTreatPrimary =
    storefrontPreviewConfig.theme?.primary || DEFAULT_THEME.primary;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Loading My Page settings…</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Builder */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">My Page</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Build your public storefront. Preview updates as you edit. Save to publish.
            </p>
          </div>

          {/* Handle */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Handle (witme URL)</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 dark:text-gray-400">witme.io/</span>
              <input
                type="text"
                value={handleInput}
                onChange={(e) => {
                  const v = e.target.value.replace("@", "").toLowerCase().replace(/[^a-z0-9_]/g, "");
                  setHandleInput(v.slice(0, 20));
                  updateDraft({ handle: v.slice(0, 20) });
                }}
                placeholder="your_handle"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                maxLength={20}
              />
              <button
                type="button"
                onClick={handleSaveHandle}
                disabled={
                  handleSaving ||
                  saving ||
                  !handleFormatOk ||
                  handleCheckStatus === "checking" ||
                  handleCheckStatus === "taken" ||
                  handleIsCurrentSaved
                }
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                {handleSaving ? "Saving…" : "Save handle"}
              </button>
              {handleCheckStatus === "checking" && <span className="text-sm text-gray-500 dark:text-gray-400">Checking…</span>}
              {handleCheckStatus === "available" && (
                <span
                  className={`text-sm font-medium ${
                    handleIsCurrentSaved
                      ? "text-gray-500 dark:text-gray-400"
                      : "text-green-600 dark:text-green-400"
                  }`}
                >
                  Available
                </span>
              )}
              {handleCheckStatus === "taken" && (
                <span className="text-sm text-red-600 dark:text-red-400">
                  <span className="font-semibold">Unavailable</span>
                  <span className="font-normal opacity-90">
                    {" "}
                    — {handleCheckMessage || "This handle is already taken"}
                  </span>
                </span>
              )}
            </div>
            {handleCheckStatus === "idle" && handleFormatOk && handleCheckMessage ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{handleCheckMessage}</p>
            ) : null}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">3–20 characters, letters, numbers and underscores only.</p>
          </div>

          {/* Profile & Branding */}
          <CollapsibleSection title="Profile & Branding" defaultOpen>
            <div className="space-y-4 pt-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Display name</label>
                  <TextStyleControls
                    style={draft.textStyles?.displayName}
                    onChange={(style) => updateTextStyle('displayName', style)}
                    defaultSize="2xl"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={draft.displayName ?? ""}
                    onChange={(e) => updateDraft({ displayName: e.target.value })}
                    placeholder="Your name"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <EmojiButton includeSjHeartEmoji={includeSjHeartEmoji} onSelect={(emoji) => updateDraft({ displayName: (draft.displayName ?? "") + emoji })} />
                </div>
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.showDisplayNameOnLanding !== false}
                    onChange={(e) => updateDraft({ showDisplayNameOnLanding: e.target.checked })}
                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600"
                  />
                  <span className="text-xs text-gray-600 dark:text-gray-400">Show display name on landing page</span>
                </label>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 ml-6">When off, your name still appears in the header and in the feed.</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Bio</label>
                  <TextStyleControls
                    style={draft.textStyles?.bio}
                    onChange={(style) => updateTextStyle('bio', style)}
                    defaultSize="sm"
                  />
                </div>
                <div className="relative">
                  <textarea
                    value={draft.bio ?? ""}
                    onChange={(e) => updateDraft({ bio: e.target.value })}
                    placeholder="Short bio for your storefront"
                    rows={2}
                    maxLength={500}
                    className="w-full px-3 py-2 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <div className="absolute right-2 top-2">
                    <EmojiButton includeSjHeartEmoji={includeSjHeartEmoji} onSelect={(emoji) => updateDraft({ bio: (draft.bio ?? "") + emoji })} />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">{(draft.bio ?? "").length}/500</p>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Feed Avatar</label>
                  <p className="text-xs text-gray-400 mb-2">Shown on your posts</p>
                  {(() => {
                    const panHere = previewFramingTool === "panAvatar" && !!draft.avatar;
                    return (
                      <label
                        className={`flex flex-col items-center justify-center w-20 h-20 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 overflow-hidden ${
                          panHere
                            ? "pointer-events-none cursor-default border-primary-500 dark:border-primary-500"
                            : "cursor-pointer hover:border-primary-500"
                        }`}
                      >
                        {draft.avatar ? (
                          <div
                            className={`relative h-full w-full rounded-full overflow-hidden ${
                              panHere
                                ? "pointer-events-auto cursor-grab active:cursor-grabbing touch-none ring-2 ring-primary-500 ring-offset-2 ring-offset-gray-50 dark:ring-offset-gray-900"
                                : ""
                            }`}
                            onPointerDown={panHere ? onBuilderAvatarPanPointerDown : undefined}
                            onPointerMove={panHere ? onBuilderAvatarPanPointerMove : undefined}
                            onPointerUp={panHere ? onBuilderAvatarPanPointerUp : undefined}
                            onPointerCancel={panHere ? onBuilderAvatarPanPointerUp : undefined}
                          >
                            <img
                              src={draft.avatar}
                              alt="Avatar"
                              className="h-full w-full object-cover pointer-events-none select-none"
                              style={getAvatarCropStyle(draft.avatarObjectPosition)}
                              draggable={false}
                            />
                          </div>
                        ) : (
                          <UserIcon className="w-8 h-8 text-gray-400" />
                        )}
                        <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={avatarUploading} />
                      </label>
                    );
                  })()}
                  {avatarUploading && <p className="text-xs text-gray-500 mt-1">Uploading…</p>}
                </div>
              </div>
              {draft.avatar ? (
                <div className="mt-1.5 rounded-md border border-primary-500 bg-primary-50 dark:bg-primary-900/20 px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-medium text-primary-900 dark:text-primary-100">Avatar position</span>
                    <span className="text-[9px] text-primary-700 dark:text-primary-300 truncate max-w-[14rem]">
                      Drag directly in the avatar circle
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1 items-center">
                    <button
                      type="button"
                      onClick={() => setPreviewFramingTool((t) => (t === "panAvatar" ? "off" : "panAvatar"))}
                      className={`rounded px-1.5 py-0.5 text-[9px] font-medium border ${
                        previewFramingTool === "panAvatar"
                          ? "border-primary-600 bg-primary-600 text-white"
                          : "border-primary-500 dark:border-primary-500 bg-white dark:bg-gray-800 text-primary-900 dark:text-primary-100"
                      }`}
                    >
                      {previewFramingTool === "panAvatar" ? "Dragging — move avatar" : "Enable drag mode"}
                    </button>
                    {previewFramingTool === "panAvatar" && (
                      <button
                        type="button"
                        onClick={() => setPreviewFramingTool("off")}
                        className="rounded px-1.5 py-0.5 text-[9px] font-medium border border-primary-500 dark:border-primary-500 bg-white dark:bg-gray-800 text-primary-900 dark:text-primary-100"
                      >
                        Done
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => updateDraft({ avatarObjectPosition: undefined })}
                      className="text-[9px] text-primary-700 dark:text-primary-300 underline"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </CollapsibleSection>

          {/* Hero Section */}
          <CollapsibleSection title="Hero Section" defaultOpen>
            <div className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Hero images</label>
                <p className="text-xs text-gray-400 mb-2">Add one or more images. Portrait (4:5) recommended. Use &quot;Full background&quot; for a banner-style hero.</p>
                {(draft.heroMedia ?? []).length > 0 && (
                  <ul className="space-y-3 mb-3">
                    {(draft.heroMedia ?? []).map((item, index) => (
                      <li key={`${item.url}-${index}`} className="flex items-start gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/30">
                        <div className="w-16 h-20 rounded overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700">
                          <img src={item.url} alt="" className="w-full h-full object-cover object-top" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <select
                            value={item.size ?? "medium"}
                            onChange={(e) => setHeroMediaItemSize(index, e.target.value as "small" | "medium" | "large" | "fullBackground")}
                            className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          >
                            {HERO_MEDIA_SIZE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <button type="button" onClick={() => removeHeroMediaItem(index)} className="text-xs text-red-500 hover:text-red-600">Remove</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {(draft.heroMedia ?? []).length < 6 && (
                  <label className="inline-flex flex-col items-center justify-center w-32 h-40 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 cursor-pointer hover:border-primary-500 overflow-hidden">
                    <div className="text-center p-2">
                      <ImageIcon className="w-8 h-8 text-gray-400 mx-auto" />
                      <span className="text-xs text-gray-400 mt-1 block">{(draft.heroMedia ?? []).length === 0 ? "Add hero image" : "Add another"}</span>
                    </div>
                    <input type="file" accept="image/*" className="hidden" onChange={handleHeroMediaAdd} disabled={heroMediaUploading} />
                  </label>
                )}
                {(draft.heroMedia ?? []).length >= 6 && (
                  <p className="text-xs text-gray-500">Max 6 images. Remove one to add another.</p>
                )}
                {heroMediaUploading && <p className="text-xs text-gray-500 mt-1">Uploading…</p>}

                <div className="mt-4">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Hero layout (landing page)</label>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1.5">
                    Put your hero photo on the left or right with text beside it — same as the live landing preview.
                  </p>
                  <select
                    value={draft.heroLayout ?? "default"}
                    onChange={(e) => updateDraft({ heroLayout: e.target.value as "default" | "centered" | "split" | "splitRight" })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    {HERO_LAYOUT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} — {opt.description}
                      </option>
                    ))}
                  </select>
                </div>

                {(heroHasFullBackground || heroGridSlotCount > 0) && (
                  <div className="mt-3 rounded-lg border border-primary-500 bg-primary-50 dark:bg-primary-900/20 px-3 py-2 space-y-1.5">
                    <p className="text-xs font-semibold text-primary-900 dark:text-primary-100">Fine-tune in Landing preview →</p>
                    <p className="text-[11px] text-primary-700 dark:text-primary-300 leading-snug">
                      Turn on a mode, drag on the preview (right), then Save.
                    </p>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {heroHasFullBackground && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewMode("landing");
                              setPreviewFramingTool((t) => (t === "panBg" ? "off" : "panBg"));
                            }}
                            className={`rounded-md px-2 py-1 text-xs font-medium border ${
                              previewFramingTool === "panBg"
                                ? "border-primary-600 bg-primary-600 text-white"
                                : "border-primary-500 dark:border-primary-500 bg-white dark:bg-gray-800 text-primary-900 dark:text-primary-100"
                            }`}
                          >
                            Pan background
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewMode("landing");
                              setPreviewFramingTool((t) => (t === "panAvatar" ? "off" : "panAvatar"));
                            }}
                            className={`rounded-md px-2 py-1 text-xs font-medium border ${
                              previewFramingTool === "panAvatar"
                                ? "border-primary-600 bg-primary-600 text-white"
                                : "border-primary-500 dark:border-primary-500 bg-white dark:bg-gray-800 text-primary-900 dark:text-primary-100"
                            }`}
                          >
                            Pan overlay avatar
                          </button>
                        </>
                      )}
                      {heroGridSlotCount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewMode("landing");
                            setPreviewFramingTool((t) => (t === "focusPhoto" ? "off" : "focusPhoto"));
                          }}
                          className={`rounded-md px-2 py-1 text-xs font-medium border ${
                            previewFramingTool === "focusPhoto"
                              ? "border-primary-600 bg-primary-600 text-white"
                              : "border-primary-500 dark:border-primary-500 bg-white dark:bg-gray-800 text-primary-900 dark:text-primary-100"
                          }`}
                        >
                          Photo focus
                        </button>
                      )}
                      {previewFramingTool !== "off" && (
                        <button
                          type="button"
                          onClick={() => setPreviewFramingTool("off")}
                          className="text-xs text-primary-700 dark:text-primary-300 underline"
                        >
                          Done
                        </button>
                      )}
                    </div>
                    {previewFramingTool === "focusPhoto" && heroGridSlotCount > 1 && (
                      <div className="flex flex-wrap gap-1 items-center text-[11px] text-primary-700 dark:text-primary-300">
                        <span>Which photo:</span>
                        {Array.from({ length: heroGridSlotCount }, (_, slot) => (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => setPreviewFocusPhotoSlot(slot)}
                            className={`min-w-[1.5rem] rounded px-1.5 py-0.5 font-medium ${
                              previewFocusPhotoSlot === slot
                                ? "bg-primary-600 text-white"
                                : "bg-white dark:bg-gray-800 text-primary-900 dark:text-primary-100 border border-primary-500 dark:border-primary-500"
                            }`}
                          >
                            {slot + 1}
                          </button>
                        ))}
                      </div>
                    )}
                    {previewFramingTool === "panBg" && (
                      <p className="text-[11px] text-primary-700 dark:text-primary-300">
                        Drag on the dark banner overlay to frame the background.
                      </p>
                    )}
                    {previewFramingTool === "panAvatar" && heroHasFullBackground && (
                      <p className="text-[11px] text-primary-700 dark:text-primary-300">
                        Drag the circle on the banner in the preview.
                      </p>
                    )}
                    {previewFramingTool === "focusPhoto" && (
                      <p className="text-[11px] text-primary-700 dark:text-primary-300">
                        Drag the highlighted hero thumbnail to change what part of the image is visible.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Tagline</label>
                  <TextStyleControls
                    style={draft.textStyles?.heroTagline}
                    onChange={(style) => updateTextStyle('heroTagline', style)}
                    defaultSize="lg"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={draft.heroTagline ?? ""}
                    onChange={(e) => updateDraft({ heroTagline: e.target.value })}
                    placeholder="e.g., Content creator & model"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <EmojiButton includeSjHeartEmoji={includeSjHeartEmoji} onSelect={(emoji) => updateDraft({ heroTagline: (draft.heroTagline ?? "") + emoji })} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Promise text</label>
                  <TextStyleControls
                    style={draft.textStyles?.heroPromise}
                    onChange={(style) => updateTextStyle('heroPromise', style)}
                    defaultSize="base"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={draft.heroPromise ?? ""}
                    onChange={(e) => updateDraft({ heroPromise: e.target.value })}
                    placeholder="e.g., Your access to the real me"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <EmojiButton includeSjHeartEmoji={includeSjHeartEmoji} onSelect={(emoji) => updateDraft({ heroPromise: (draft.heroPromise ?? "") + emoji })} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Subline (after promise)</label>
                  <TextStyleControls
                    style={draft.textStyles?.heroSubline}
                    onChange={(style) => updateTextStyle('heroSubline', style)}
                    defaultSize="sm"
                  />
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1">Extra line of text shown under the promise on the landing hero.</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={draft.heroSubline ?? ""}
                    onChange={(e) => updateDraft({ heroSubline: e.target.value })}
                    placeholder="e.g., Join for exclusive content and DMs"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <EmojiButton includeSjHeartEmoji={includeSjHeartEmoji} onSelect={(emoji) => updateDraft({ heroSubline: (draft.heroSubline ?? "") + emoji })} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Second subline (optional)</label>
                  <TextStyleControls
                    style={draft.textStyles?.heroSubline2}
                    onChange={(style) => updateTextStyle("heroSubline2", style)}
                    defaultSize="sm"
                  />
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1">
                  Another line below the first subline (e.g. a short perk or disclaimer).
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={draft.heroSubline2 ?? ""}
                    onChange={(e) => updateDraft({ heroSubline2: e.target.value })}
                    placeholder="e.g., Cancel anytime · Secure checkout"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <EmojiButton includeSjHeartEmoji={includeSjHeartEmoji} onSelect={(emoji) => updateDraft({ heroSubline2: (draft.heroSubline2 ?? "") + emoji })} />
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Social Links */}
          <CollapsibleSection title="Social Links">
            <div className="space-y-3 pt-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Add your social media links. Toggle visibility on/off.</p>
              {([
                { key: "instagram" as const, icon: <InstagramIcon />, placeholder: "https://instagram.com/..." },
                { key: "x" as const, icon: <XIcon />, placeholder: "https://x.com/..." },
                { key: "tiktok" as const, icon: <TikTokIcon />, placeholder: "https://tiktok.com/@..." },
                { key: "youtube" as const, icon: <YouTubeIcon />, placeholder: "https://youtube.com/..." },
                { key: "facebook" as const, icon: <FacebookIcon />, placeholder: "https://facebook.com/..." },
              ]).map(({ key, icon, placeholder }) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400 w-6">{icon}</span>
                  <input
                    type="url"
                    value={draft.socialLinks?.[key]?.url ?? ""}
                    onChange={(e) => updateSocialLink(key, "url", e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => updateSocialLink(key, "show", !draft.socialLinks?.[key]?.show)}
                    className={`px-2 py-1 text-xs rounded ${
                      draft.socialLinks?.[key]?.show !== false
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                    }`}
                  >
                    {draft.socialLinks?.[key]?.show !== false ? "Show" : "Hide"}
                  </button>
                </div>
              ))}

              {/* Custom Social Links */}
              {(draft.socialLinks?.custom ?? []).map((link, index) => (
                <div key={`custom-${index}`} className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400 w-6">
                    <GlobeIcon className="w-5 h-5" />
                  </span>
                  <input
                    type="text"
                    value={link.name}
                    onChange={(e) => updateCustomSocialLink(index, "name", e.target.value)}
                    placeholder="Platform name"
                    className="w-24 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <input
                    type="url"
                    value={link.url}
                    onChange={(e) => updateCustomSocialLink(index, "url", e.target.value)}
                    placeholder="https://..."
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => updateCustomSocialLink(index, "show", !link.show)}
                    className={`px-2 py-1 text-xs rounded ${
                      link.show
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                    }`}
                  >
                    {link.show ? "Show" : "Hide"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCustomSocialLink(index)}
                    className="p-1.5 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    title="Remove"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}

              {/* Add Custom Social Link Button */}
              <button
                type="button"
                onClick={addCustomSocialLink}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Other Social Site
              </button>
            </div>
          </CollapsibleSection>

          {/* Landing Page Content */}
          <CollapsibleSection title="Landing Page Content">
            <div className="space-y-4 pt-4">
              {/* Perks Section */}
              <div className="border-b border-gray-100 dark:border-gray-700 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Why Subscribe Section</label>
                  <TextStyleControls
                    style={draft.textStyles?.perksTitle}
                    onChange={(style) => updateTextStyle('perksTitle', style)}
                    defaultSize="xl"
                  />
                </div>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={draft.landingContent?.perksTitle ?? DEFAULT_LANDING_CONTENT.perksTitle}
                    onChange={(e) => updateLandingContent("perksTitle", e.target.value)}
                    placeholder="Section title"
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <EmojiButton includeSjHeartEmoji={includeSjHeartEmoji} onSelect={(emoji) => updateLandingContent("perksTitle", (draft.landingContent?.perksTitle ?? "") + emoji)} />
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Description</span>
                  <TextStyleControls
                    style={draft.textStyles?.perksText}
                    onChange={(style) => updateTextStyle('perksText', style)}
                    defaultSize="sm"
                  />
                </div>
                <div className="relative">
                  <textarea
                    value={draft.landingContent?.perksText ?? DEFAULT_LANDING_CONTENT.perksText}
                    onChange={(e) => updateLandingContent("perksText", e.target.value)}
                    placeholder="Main text"
                    rows={2}
                    className="w-full px-3 py-1.5 pr-12 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <div className="absolute right-2 top-1.5">
                    <EmojiButton includeSjHeartEmoji={includeSjHeartEmoji} onSelect={(emoji) => updateLandingContent("perksText", (draft.landingContent?.perksText ?? "") + emoji)} />
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                      Under your description (optional)
                    </label>
                    <LandingBodyModeToggle
                      value={draft.landingContent?.perksExtraMode ?? "bullets"}
                      onChange={setPerksExtraMode}
                      ariaLabel="Why subscribe: bullets or paragraph"
                    />
                  </div>
                  {(draft.landingContent?.perksExtraMode ?? "bullets") === "bullets" ? (
                    <>
                      <textarea
                        rows={6}
                        placeholder="One bullet per line. Leave empty for description only."
                        value={(draft.landingContent?.perksList ?? []).join("\n")}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const lines = raw.length === 0 ? [] : raw.split("\n");
                          updateLandingContent("perksList", lines);
                        }}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Bullet style
                        </label>
                        <select
                          className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          value={draft.landingContent?.perksListMarker ?? "none"}
                          onChange={(e) =>
                            updateLandingContent("perksListMarker", e.target.value as LandingSectionListMarker)
                          }
                        >
                          <option value="none">None — plain lines</option>
                          <option value="heart">Heart</option>
                          <option value="check">Check (✓)</option>
                          <option value="dot">Dot</option>
                        </select>
                      </div>
                    </>
                  ) : (
                    <div className="relative">
                      <textarea
                        rows={6}
                        placeholder="Full paragraph under your description. Line breaks are kept on the live page."
                        value={draft.landingContent?.perksParagraph ?? ""}
                        onChange={(e) => updateLandingContent("perksParagraph", e.target.value)}
                        className="w-full px-3 py-1.5 pr-12 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <div className="absolute right-2 top-1.5">
                        <EmojiButton
                          includeSjHeartEmoji={includeSjHeartEmoji}
                          onSelect={(emoji) => {
                            setDraft((prev) => {
                              const lc = prev.landingContent ?? DEFAULT_LANDING_CONTENT;
                              return {
                                ...prev,
                                landingContent: {
                                  ...lc,
                                  perksParagraph: (lc.perksParagraph ?? "") + emoji,
                                },
                              };
                            });
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Preview Section */}
              <div className="border-b border-gray-100 dark:border-gray-700 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">What You Get Section</label>
                  <TextStyleControls
                    style={draft.textStyles?.previewTitle}
                    onChange={(style) => updateTextStyle('previewTitle', style)}
                    defaultSize="xl"
                  />
                </div>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={draft.landingContent?.previewTitle ?? DEFAULT_LANDING_CONTENT.previewTitle}
                    onChange={(e) => updateLandingContent("previewTitle", e.target.value)}
                    placeholder="Section title"
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <EmojiButton includeSjHeartEmoji={includeSjHeartEmoji} onSelect={(emoji) => updateLandingContent("previewTitle", (draft.landingContent?.previewTitle ?? "") + emoji)} />
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Subline under title (pink)</span>
                  <TextStyleControls
                    style={draft.textStyles?.previewText}
                    onChange={(style) => updateTextStyle('previewText', style)}
                    defaultSize="sm"
                  />
                </div>
                <div className="relative">
                  <textarea
                    value={draft.landingContent?.previewText ?? DEFAULT_LANDING_CONTENT.previewText}
                    onChange={(e) => updateLandingContent("previewText", e.target.value)}
                    placeholder="Inside the Inner Circle:"
                    rows={2}
                    className="w-full px-3 py-1.5 pr-12 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <div className="absolute right-2 top-1.5">
                    <EmojiButton includeSjHeartEmoji={includeSjHeartEmoji} onSelect={(emoji) => updateLandingContent("previewText", (draft.landingContent?.previewText ?? "") + emoji)} />
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                      Under subline (optional)
                    </label>
                    <LandingBodyModeToggle
                      value={draft.landingContent?.previewExtraMode ?? "bullets"}
                      onChange={setPreviewExtraMode}
                      ariaLabel="What you get: bullets or paragraph"
                    />
                  </div>
                  {(draft.landingContent?.previewExtraMode ?? "bullets") === "bullets" ? (
                    <>
                      <textarea
                        rows={6}
                        placeholder="One bullet per line under your subline."
                        value={(draft.landingContent?.previewList ?? []).join("\n")}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const lines = raw.length === 0 ? [] : raw.split("\n");
                          updateLandingContent("previewList", lines);
                        }}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Bullet style
                        </label>
                        <select
                          className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          value={draft.landingContent?.previewListMarker ?? "heart"}
                          onChange={(e) =>
                            updateLandingContent("previewListMarker", e.target.value as LandingSectionListMarker)
                          }
                        >
                          <option value="none">None — plain lines</option>
                          <option value="heart">Heart</option>
                          <option value="check">Check (✓)</option>
                          <option value="dot">Dot</option>
                        </select>
                      </div>
                    </>
                  ) : (
                    <div className="relative">
                      <textarea
                        rows={6}
                        placeholder="Full paragraph under your subline. Line breaks are kept on the live page."
                        value={draft.landingContent?.previewParagraph ?? ""}
                        onChange={(e) => updateLandingContent("previewParagraph", e.target.value)}
                        className="w-full px-3 py-1.5 pr-12 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <div className="absolute right-2 top-1.5">
                        <EmojiButton
                          includeSjHeartEmoji={includeSjHeartEmoji}
                          onSelect={(emoji) => {
                            setDraft((prev) => {
                              const lc = prev.landingContent ?? DEFAULT_LANDING_CONTENT;
                              return {
                                ...prev,
                                landingContent: {
                                  ...lc,
                                  previewParagraph: (lc.previewParagraph ?? "") + emoji,
                                },
                              };
                            });
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-3 space-y-2">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                    Footer lines (italic, below list — one per line)
                  </label>
                  <textarea
                    rows={3}
                    placeholder={"Nothing explicit.\nNothing fake.\nNothing forced."}
                    value={(draft.landingContent?.previewFooterLines ?? []).join("\n")}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const lines = raw.length === 0 ? [] : raw.split("\n");
                      updateLandingContent("previewFooterLines", lines);
                    }}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Energy Section */}
              <div className="border-b border-gray-100 dark:border-gray-700 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">The Energy Section</label>
                  <TextStyleControls
                    style={draft.textStyles?.energyTitle}
                    onChange={(style) => updateTextStyle('energyTitle', style)}
                    defaultSize="xl"
                  />
                </div>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={draft.landingContent?.energyTitle ?? DEFAULT_LANDING_CONTENT.energyTitle}
                    onChange={(e) => updateLandingContent("energyTitle", e.target.value)}
                    placeholder="Section title"
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <EmojiButton includeSjHeartEmoji={includeSjHeartEmoji} onSelect={(emoji) => updateLandingContent("energyTitle", (draft.landingContent?.energyTitle ?? "") + emoji)} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Body under title</span>
                  <LandingBodyModeToggle
                    value={draft.landingContent?.energyBodyMode ?? "bullets"}
                    onChange={setEnergyBodyMode}
                    ariaLabel="The energy section: bullets or paragraph"
                  />
                </div>
                {(draft.landingContent?.energyBodyMode ?? "bullets") === "bullets" ? (
                  <>
                    <div className="relative">
                      <textarea
                        value={(draft.landingContent?.energyLines ?? DEFAULT_LANDING_CONTENT.energyLines)?.join("\n")}
                        onChange={(e) => updateLandingContent("energyLines", e.target.value.split("\n"))}
                        placeholder="One bullet per line (e.g. Playful and honest.)"
                        rows={6}
                        className="w-full px-3 py-1.5 pr-12 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <div className="absolute right-2 top-1.5">
                        <EmojiButton
                          includeSjHeartEmoji={includeSjHeartEmoji}
                          onSelect={(emoji) => {
                            setDraft((prev) => {
                              const lc = prev.landingContent ?? DEFAULT_LANDING_CONTENT;
                              const lines = [...(lc.energyLines ?? DEFAULT_LANDING_CONTENT.energyLines ?? [])];
                              if (lines.length > 0) {
                                lines[lines.length - 1] = lines[lines.length - 1] + emoji;
                              } else {
                                lines.push(emoji);
                              }
                              return {
                                ...prev,
                                landingContent: { ...lc, energyLines: lines },
                              };
                            });
                          }}
                        />
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Bullet style
                      </label>
                      <select
                        className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        value={draft.landingContent?.energyLinesMarker ?? "heart"}
                        onChange={(e) =>
                          updateLandingContent("energyLinesMarker", e.target.value as LandingSectionListMarker)
                        }
                      >
                        <option value="none">None — plain lines</option>
                        <option value="heart">Heart</option>
                        <option value="check">Check (✓)</option>
                        <option value="dot">Dot</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <div className="relative">
                    <textarea
                      value={draft.landingContent?.energyParagraph ?? ""}
                      onChange={(e) => updateLandingContent("energyParagraph", e.target.value)}
                      placeholder="Full paragraph for this section. Line breaks are kept on the live page."
                      rows={6}
                      className="w-full px-3 py-1.5 pr-12 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <div className="absolute right-2 top-1.5">
                      <EmojiButton
                        includeSjHeartEmoji={includeSjHeartEmoji}
                        onSelect={(emoji) => {
                          setDraft((prev) => {
                            const lc = prev.landingContent ?? DEFAULT_LANDING_CONTENT;
                            return {
                              ...prev,
                              landingContent: {
                                ...lc,
                                energyParagraph: (lc.energyParagraph ?? "") + emoji,
                              },
                            };
                          });
                        }}
                      />
                    </div>
                  </div>
                )}
                <div className="mt-2">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Closing line (bold, accent color — optional)
                  </label>
                  <input
                    type="text"
                    value={draft.landingContent?.energyClosingLine ?? ""}
                    onChange={(e) => updateLandingContent("energyClosingLine", e.target.value)}
                    placeholder='e.g. And that is different.'
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                {(draft.landingContent?.energyBodyMode ?? "bullets") === "bullets" ? (
                  <p className="text-xs text-gray-400 mt-1">Bullets: one row per line in the box above.</p>
                ) : null}
              </div>

              {/* Boundary Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Guidelines title (landing + member About tab)
                  </label>
                  <TextStyleControls
                    style={draft.textStyles?.boundaryTitle}
                    onChange={(style) => updateTextStyle('boundaryTitle', style)}
                    defaultSize="xl"
                  />
                </div>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={draft.landingContent?.boundaryTitle ?? DEFAULT_LANDING_CONTENT.boundaryTitle}
                    onChange={(e) => updateLandingContent("boundaryTitle", e.target.value)}
                    placeholder="Section title"
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <EmojiButton includeSjHeartEmoji={includeSjHeartEmoji} onSelect={(emoji) => updateLandingContent("boundaryTitle", (draft.landingContent?.boundaryTitle ?? "") + emoji)} />
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Intro paragraph (optional if you use lines below)</span>
                  <TextStyleControls
                    style={draft.textStyles?.boundaryText}
                    onChange={(style) => updateTextStyle('boundaryText', style)}
                    defaultSize="sm"
                  />
                </div>
                <div className="relative">
                  <textarea
                    value={draft.landingContent?.boundaryText ?? DEFAULT_LANDING_CONTENT.boundaryText}
                    onChange={(e) => updateLandingContent("boundaryText", e.target.value)}
                    placeholder="Opening copy above the list (or use lines only, like the membership card)"
                    rows={2}
                    className="w-full px-3 py-1.5 pr-12 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <div className="absolute right-2 top-1.5">
                    <EmojiButton includeSjHeartEmoji={includeSjHeartEmoji} onSelect={(emoji) => updateLandingContent("boundaryText", (draft.landingContent?.boundaryText ?? "") + emoji)} />
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                    Guideline lines (one per line, optional — tier-style list under the intro)
                  </label>
                  <textarea
                    rows={6}
                    placeholder={"e.g.\nDo not screenshot.\nStay chill."}
                    value={(draft.landingContent?.boundaryLines ?? []).join("\n")}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const lines = raw.length === 0 ? [] : raw.split("\n");
                      updateLandingContent("boundaryLines", lines);
                    }}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Bullet style for those lines</label>
                    <select
                      className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      value={draft.landingContent?.boundaryLinesMarker ?? "check"}
                      onChange={(e) =>
                        updateLandingContent("boundaryLinesMarker", e.target.value as LandingSectionListMarker)
                      }
                    >
                      <option value="none">None — plain lines</option>
                      <option value="heart">Heart</option>
                      <option value="check">Check (✓)</option>
                      <option value="dot">Dot</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Store copy — member tab, landing promo, guest checkout */}
              <div className="pt-6 mt-6 border-t border-gray-200 dark:border-gray-600">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Store &amp; guest checkout (copy)</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Name your store, landing teaser, and guest checkout wording. Fan Hub → <strong>Store</strong> tab stays the generic label; fans see your custom name on the store itself.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Store name (member tab + store header)</label>
                    <input
                      type="text"
                      value={draft.landingContent?.memberStoreTitle ?? DEFAULT_LANDING_CONTENT.memberStoreTitle}
                      onChange={(e) => updateLandingContent("memberStoreTitle", e.target.value)}
                      placeholder="e.g. Shop, Extras, Merch"
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Store subtitle</label>
                    <textarea
                      value={draft.landingContent?.memberStoreSubtitle ?? DEFAULT_LANDING_CONTENT.memberStoreSubtitle}
                      onChange={(e) => updateLandingContent("memberStoreSubtitle", e.target.value)}
                      rows={2}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Loading message</label>
                      <input
                        type="text"
                        value={draft.landingContent?.memberStoreLoadingMessage ?? DEFAULT_LANDING_CONTENT.memberStoreLoadingMessage}
                        onChange={(e) => updateLandingContent("memberStoreLoadingMessage", e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Empty store message</label>
                      <input
                        type="text"
                        value={draft.landingContent?.memberStoreEmptyMessage ?? DEFAULT_LANDING_CONTENT.memberStoreEmptyMessage}
                        onChange={(e) => updateLandingContent("memberStoreEmptyMessage", e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-300 pt-2">Public landing — teaser (when guest store is on)</p>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Headline</label>
                    <input
                      type="text"
                      value={draft.landingContent?.storeLandingHeadline ?? DEFAULT_LANDING_CONTENT.storeLandingHeadline}
                      onChange={(e) => updateLandingContent("storeLandingHeadline", e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Description</label>
                    <textarea
                      value={draft.landingContent?.storeLandingDescription ?? DEFAULT_LANDING_CONTENT.storeLandingDescription}
                      onChange={(e) => updateLandingContent("storeLandingDescription", e.target.value)}
                      rows={2}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Button label</label>
                    <input
                      type="text"
                      value={draft.landingContent?.storeLandingCtaLabel ?? DEFAULT_LANDING_CONTENT.storeLandingCtaLabel}
                      onChange={(e) => updateLandingContent("storeLandingCtaLabel", e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-300 pt-2">Guest checkout card on landing</p>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Card title</label>
                    <input
                      type="text"
                      value={draft.landingContent?.publicStoreCardTitle ?? DEFAULT_LANDING_CONTENT.publicStoreCardTitle}
                      onChange={(e) => updateLandingContent("publicStoreCardTitle", e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Card description</label>
                    <textarea
                      value={draft.landingContent?.publicStoreCardDescription ?? DEFAULT_LANDING_CONTENT.publicStoreCardDescription}
                      onChange={(e) => updateLandingContent("publicStoreCardDescription", e.target.value)}
                      rows={3}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Open-store button (count may be added)</label>
                    <input
                      type="text"
                      value={draft.landingContent?.publicStoreOpenCtaLabel ?? DEFAULT_LANDING_CONTENT.publicStoreOpenCtaLabel}
                      onChange={(e) => updateLandingContent("publicStoreOpenCtaLabel", e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Modal title</label>
                      <input
                        type="text"
                        value={draft.landingContent?.publicStoreModalTitle ?? DEFAULT_LANDING_CONTENT.publicStoreModalTitle}
                        onChange={(e) => updateLandingContent("publicStoreModalTitle", e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Modal — empty list</label>
                      <input
                        type="text"
                        value={draft.landingContent?.publicStoreModalEmptyMessage ?? DEFAULT_LANDING_CONTENT.publicStoreModalEmptyMessage}
                        onChange={(e) => updateLandingContent("publicStoreModalEmptyMessage", e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Theme & Colors */}
          <CollapsibleSection title="Theme & Colors">
            <div className="space-y-4 pt-4">
              {/* Theme presets */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Theme preset</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {FAN_HUB_THEME_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => updateTheme({ ...preset.theme, presetId: preset.id })}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 text-left transition-colors ${
                        (draft.theme?.presetId ?? "default") === preset.id
                          ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                          : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                      }`}
                    >
                      <span className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex-shrink-0" style={{ backgroundColor: preset.theme.primary }} />
                      <span className="text-xs font-medium text-gray-900 dark:text-white truncate w-full text-center">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* Global font */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Global font</label>
                <select
                  value={draft.theme?.fontFamily ?? "Inter, sans-serif"}
                  onChange={(e) => updateTheme({ fontFamily: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {FONT_FAMILY_OPTIONS.slice(0, 18).map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              {/* Theme colors — each cell: label, description, color + hex input */}
              <div className="grid grid-cols-3 gap-4">
                <div className="min-h-[72px] flex flex-col">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5" title="Main brand and accent color">Primary</label>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">Buttons, links & accents</p>
                  <div className="flex items-center gap-2 mt-auto">
                    <input
                      type="color"
                      value={draft.theme?.primary ?? DEFAULT_THEME.primary}
                      onChange={(e) => updateTheme({ primary: e.target.value })}
                      className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer flex-shrink-0"
                    />
                    <input
                      type="text"
                      value={draft.theme?.primary ?? DEFAULT_THEME.primary}
                      onChange={(e) => updateTheme({ primary: e.target.value })}
                      className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
                <div className="min-h-[72px] flex flex-col">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5" title="Color for buttons and links when hovered">Accent Hover</label>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">Buttons & links on hover</p>
                  <div className="flex items-center gap-2 mt-auto">
                    <input
                      type="color"
                      value={draft.theme?.accentHover ?? DEFAULT_THEME.accentHover}
                      onChange={(e) => updateTheme({ accentHover: e.target.value })}
                      className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer flex-shrink-0"
                    />
                    <input
                      type="text"
                      value={draft.theme?.accentHover ?? DEFAULT_THEME.accentHover}
                      onChange={(e) => updateTheme({ accentHover: e.target.value })}
                      className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
                <div className="min-h-[72px] flex flex-col">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5" title="Page and card background">Background</label>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">Page & card background</p>
                  <div className="flex items-center gap-2 mt-auto">
                    <input
                      type="color"
                      value={draft.theme?.background ?? DEFAULT_THEME.background}
                      onChange={(e) => updateTheme({ background: e.target.value })}
                      className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer flex-shrink-0"
                    />
                    <input
                      type="text"
                      value={draft.theme?.background ?? DEFAULT_THEME.background}
                      onChange={(e) => updateTheme({ background: e.target.value })}
                      className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
                <div className="min-h-[72px] flex flex-col">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5" title="Main body text color">Text</label>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">Main body text</p>
                  <div className="flex items-center gap-2 mt-auto">
                    <input
                      type="color"
                      value={draft.theme?.text ?? DEFAULT_THEME.text}
                      onChange={(e) => updateTheme({ text: e.target.value })}
                      className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer flex-shrink-0"
                    />
                    <input
                      type="text"
                      value={draft.theme?.text ?? DEFAULT_THEME.text}
                      onChange={(e) => updateTheme({ text: e.target.value })}
                      className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
                <div className="min-h-[72px] flex flex-col">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5" title="Secondary text for captions and hints">Muted Text</label>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">Secondary text (captions, hints)</p>
                  <div className="flex items-center gap-2 mt-auto">
                    <input
                      type="color"
                      value={draft.theme?.textMuted ?? DEFAULT_THEME.textMuted}
                      onChange={(e) => updateTheme({ textMuted: e.target.value })}
                      className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer flex-shrink-0"
                    />
                    <input
                      type="text"
                      value={draft.theme?.textMuted ?? DEFAULT_THEME.textMuted}
                      onChange={(e) => updateTheme({ textMuted: e.target.value })}
                      className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
                <div className="min-h-[72px] flex flex-col">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5" title="Dividers and card outlines">Border</label>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">Dividers & card outlines</p>
                  <div className="flex items-center gap-2 mt-auto">
                    <input
                      type="color"
                      value={draft.theme?.border ?? DEFAULT_THEME.border}
                      onChange={(e) => updateTheme({ border: e.target.value })}
                      className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer flex-shrink-0"
                    />
                    <input
                      type="text"
                      value={draft.theme?.border ?? DEFAULT_THEME.border}
                      onChange={(e) => updateTheme({ border: e.target.value })}
                      className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Button style</label>
                <select
                  value={draft.theme?.buttonStyle ?? "solid"}
                  onChange={(e) => updateTheme({ buttonStyle: e.target.value as StorefrontButtonStyle })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="solid">Solid</option>
                  <option value="outline">Outline</option>
                  <option value="pill">Pill</option>
                </select>
              </div>
            </div>
          </CollapsibleSection>

          {/* Sections */}
          <CollapsibleSection title="Member Sections">
            <div className="space-y-3 pt-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Toggle what sections appear on your member page.</p>
              {([
                { key: "feed", label: "Feed", desc: "Posts and updates" },
                { key: "treats", label: "Store", desc: "Products, video calls, chat sessions" },
                { key: "tip", label: "Tip", desc: "One-time tips from fans" },
                { key: "messages", label: "Messages", desc: "Direct messages with fans" },
                { key: "about", label: "About / Boundaries", desc: "Your bio and rules" },
              ] as const).map(({ key, label, desc }) => (
                <label key={key} className="flex items-center justify-between gap-3 cursor-pointer group">
                  <div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={draft.sections?.[key] ?? true}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setDraft((prev) => {
                        const nextSections = { ...DEFAULT_SECTIONS, ...(prev.sections || {}), [key]: v };
                        if (key === "treats" && !v) {
                          return {
                            ...prev,
                            sections: { ...nextSections, treats: false },
                            publicTreatsOnLanding: false,
                          };
                        }
                        return {
                          ...prev,
                          sections: nextSections,
                        };
                      });
                    }}
                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600"
                  />
                </label>
              ))}
              <label className="flex items-center justify-between gap-3 cursor-pointer group pt-2 border-t border-gray-200 dark:border-gray-600">
                <div>
                  <span className="text-sm text-gray-700 dark:text-gray-300">Guest checkout on landing</span>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    The store promo already shows on your landing when Store is enabled. Enable this to let visitors buy without signing in (Stripe collects email).
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={draft.publicTreatsOnLanding === true}
                  disabled={draft.sections?.treats === false}
                  onChange={(e) => updateDraft({ publicTreatsOnLanding: e.target.checked })}
                  className="rounded border-gray-300 dark:border-gray-600 text-primary-600 disabled:opacity-40"
                />
              </label>
            </div>
          </CollapsibleSection>

          {/* Monetization */}
          <CollapsibleSection title="Monetization">
            <div className="space-y-4 pt-4">
              {/* Free Access Toggle */}
              <div className="p-3 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.monetization?.freeAccessEnabled ?? false}
                    onChange={(e) => updateDraft({ monetization: { ...draft.monetization, ...DEFAULT_MONETIZATION, freeAccessEnabled: e.target.checked } })}
                    className="w-5 h-5 rounded border-green-400 dark:border-green-600 text-green-600 focus:ring-green-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Free Access</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Let fans join for free. You can still sell from your store, tips, and unlockable content.
                    </p>
                  </div>
                </label>
              </div>
              
              {/* Monthly Price - only show if not free access */}
              {!draft.monetization?.freeAccessEnabled && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Monthly subscription price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-medium">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="9.99"
                      defaultValue={((draft.monetization?.monthlyPrice ?? DEFAULT_MONETIZATION.monthlyPrice) / 100).toFixed(2)}
                      onBlur={(e) => {
                        const dollars = parseFloat(e.target.value) || 0;
                        const cents = Math.round(dollars * 100);
                        updateDraft({ monetization: { ...draft.monetization, ...DEFAULT_MONETIZATION, monthlyPrice: cents } });
                        e.target.value = (cents / 100).toFixed(2);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">per month</p>
                </div>
              )}

              <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-300">Public landing — membership card</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Override the pricing section and bottom “Join” banner. Empty fields use smart defaults (free vs paid). The large price still uses your monthly price above unless you type a custom label.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Card title when paid</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder="Monthly membership"
                      value={draft.landingContent?.pricingPaidTitle ?? ""}
                      onChange={(e) =>
                        updateDraft({
                          landingContent: {
                            ...draft.landingContent,
                            pricingPaidTitle: e.target.value.trim() ? e.target.value : undefined,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Card title when free access</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder="Free membership"
                      value={draft.landingContent?.pricingFreeTitle ?? ""}
                      onChange={(e) =>
                        updateDraft({
                          landingContent: {
                            ...draft.landingContent,
                            pricingFreeTitle: e.target.value.trim() ? e.target.value : undefined,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Price line when paid</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder={`$${((draft.monetization?.monthlyPrice ?? DEFAULT_MONETIZATION.monthlyPrice) / 100).toFixed(2)}`}
                      value={draft.landingContent?.pricingPaidAmountLabel ?? ""}
                      onChange={(e) =>
                        updateDraft({
                          landingContent: {
                            ...draft.landingContent,
                            pricingPaidAmountLabel: e.target.value.trim() ? e.target.value : undefined,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Price line when free</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder="Free"
                      value={draft.landingContent?.pricingFreeAmountLabel ?? ""}
                      onChange={(e) =>
                        updateDraft({
                          landingContent: {
                            ...draft.landingContent,
                            pricingFreeAmountLabel: e.target.value.trim() ? e.target.value : undefined,
                          },
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Membership card bullets (one per line — always shown with ✓ on the landing)
                  </label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    placeholder={"Paid default:\nExclusive content\nCancel anytime\n\nFree default:\nMember perks & updates\nJoin instantly"}
                    value={(draft.landingContent?.pricingCardBullets ?? []).join("\n")}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const lines = raw.length === 0 ? [] : raw.split("\n");
                      const hasContent = lines.some((l) => String(l).trim());
                      updateDraft({
                        landingContent: {
                          ...draft.landingContent,
                          pricingCardBullets: hasContent ? lines : undefined,
                        },
                      });
                    }}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Button — signed in, paid</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder="Join - $9.99/mo"
                      value={draft.landingContent?.pricingCtaLoggedInPaid ?? ""}
                      onChange={(e) =>
                        updateDraft({
                          landingContent: {
                            ...draft.landingContent,
                            pricingCtaLoggedInPaid: e.target.value.trim() ? e.target.value : undefined,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Button — signed in, free</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder="Join Free"
                      value={draft.landingContent?.pricingCtaLoggedInFree ?? ""}
                      onChange={(e) =>
                        updateDraft({
                          landingContent: {
                            ...draft.landingContent,
                            pricingCtaLoggedInFree: e.target.value.trim() ? e.target.value : undefined,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Button — guest, paid</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder="Sign up to Subscribe"
                      value={draft.landingContent?.pricingCtaGuestPaid ?? ""}
                      onChange={(e) =>
                        updateDraft({
                          landingContent: {
                            ...draft.landingContent,
                            pricingCtaGuestPaid: e.target.value.trim() ? e.target.value : undefined,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Button — guest, free</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder="Sign up to Join Free"
                      value={draft.landingContent?.pricingCtaGuestFree ?? ""}
                      onChange={(e) =>
                        updateDraft({
                          landingContent: {
                            ...draft.landingContent,
                            pricingCtaGuestFree: e.target.value.trim() ? e.target.value : undefined,
                          },
                        })
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Trust line when paid</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder="🔒 Secure payment · Cancel anytime"
                      value={draft.landingContent?.pricingTrustLinePaid ?? ""}
                      onChange={(e) =>
                        updateDraft({
                          landingContent: {
                            ...draft.landingContent,
                            pricingTrustLinePaid: e.target.value.trim() ? e.target.value : undefined,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Trust line when free</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder="🎉 No payment required"
                      value={draft.landingContent?.pricingTrustLineFree ?? ""}
                      onChange={(e) =>
                        updateDraft({
                          landingContent: {
                            ...draft.landingContent,
                            pricingTrustLineFree: e.target.value.trim() ? e.target.value : undefined,
                          },
                        })
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Bottom banner — main line</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder="Free to join / $9.99/month"
                      value={draft.landingContent?.pricingFinalBannerPriceLine ?? ""}
                      onChange={(e) =>
                        updateDraft({
                          landingContent: {
                            ...draft.landingContent,
                            pricingFinalBannerPriceLine: e.target.value.trim() ? e.target.value : undefined,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Bottom banner — subline</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder="Exclusive access."
                      value={draft.landingContent?.pricingFinalBannerSubline ?? ""}
                      onChange={(e) =>
                        updateDraft({
                          landingContent: {
                            ...draft.landingContent,
                            pricingFinalBannerSubline: e.target.value.trim() ? e.target.value : undefined,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-300">Tip section (landing + member Tip tab)</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  The <strong>heading</strong> appears on your public landing tip block and on the member hub Tip tab. The <strong>guest subline</strong> only shows on the public page (e.g. “no subscription”). The <strong>member subline</strong> only shows after someone has joined — it never uses the guest line unless you type the same text in both.
                </p>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Heading (shared)</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    placeholder="Want to show love?"
                    value={draft.landingContent?.tipSectionHeading ?? ""}
                    onChange={(e) =>
                      updateDraft({
                        landingContent: {
                          ...draft.landingContent,
                          tipSectionHeading: e.target.value.trim() ? e.target.value : undefined,
                        },
                      })
                    }
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Subline — public landing only</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder="One-time tip — no subscription"
                      value={draft.landingContent?.tipSectionSublineGuest ?? ""}
                      onChange={(e) =>
                        updateDraft({
                          landingContent: {
                            ...draft.landingContent,
                            tipSectionSublineGuest: e.target.value.trim() ? e.target.value : undefined,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Subline — member Tip tab only</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder="No minimum — send what you like."
                      value={draft.landingContent?.tipSectionSublineMember ?? ""}
                      onChange={(e) =>
                        updateDraft({
                          landingContent: {
                            ...draft.landingContent,
                            tipSectionSublineMember: e.target.value.trim() ? e.target.value : undefined,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.monetization?.tipsEnabled ?? true}
                    onChange={(e) => updateDraft({ monetization: { ...draft.monetization, ...DEFAULT_MONETIZATION, tipsEnabled: e.target.checked } })}
                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Tips</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.monetization?.chatEnabled ?? true}
                    onChange={(e) => updateDraft({ monetization: { ...draft.monetization, ...DEFAULT_MONETIZATION, chatEnabled: e.target.checked } })}
                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Chat</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.monetization?.videoEnabled ?? true}
                    onChange={(e) => updateDraft({ monetization: { ...draft.monetization, ...DEFAULT_MONETIZATION, videoEnabled: e.target.checked } })}
                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Video in DMs</span>
                </label>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <strong>Tips</strong> — tip section on the <em>public</em> landing only.{" "}
                <strong>Chat</strong> — member hub <strong>Messages</strong> tab (turn off to hide it).{" "}
                <strong>Video in DMs</strong> — video <em>file</em> attachments in messages only (not live 1:1 or livestream; see{" "}
                <code className="text-[11px]">docs/LIVE_VIDEO_AND_STREAMS.md</code>). Off = photos only; existing video messages still play.
              </p>
              {(saved as Record<string, unknown>).stripeConnectAccountId == null && (
                <p className="text-xs text-amber-600 dark:text-amber-400">Connect Stripe in Payouts to receive payments.</p>
              )}
            </div>
          </CollapsibleSection>

          {/* Legal */}
          <CollapsibleSection title="Terms & Privacy">
            <div className="space-y-4 pt-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Your terms of service and privacy policy protect you and your content. Links appear in your page footer.
              </p>
              
              {/* Terms of Service */}
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Terms of Service</span>
                  <button
                    type="button"
                    onClick={() => setLegalModalOpen("terms")}
                    className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium"
                  >
                    Edit
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  {draft.legal?.termsText ? (
                    <>
                      <span className="text-green-600 dark:text-green-400">✓ Custom terms set</span>
                      {draft.legal?.termsLastUpdated && (
                        <span className="ml-2">• Updated {draft.legal.termsLastUpdated}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">Using default terms</span>
                  )}
                </p>
                {!draft.legal?.termsText && (
                  <button
                    type="button"
                    onClick={() => {
                      updateLegal("termsText", DEFAULT_TERMS_OF_SERVICE);
                      updateLegal("termsLastUpdated", new Date().toISOString().split("T")[0]);
                    }}
                    className="text-xs px-2 py-1 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/50"
                  >
                    Load default terms
                  </button>
                )}
              </div>
              
              {/* Privacy Policy */}
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Privacy Policy</span>
                  <button
                    type="button"
                    onClick={() => setLegalModalOpen("privacy")}
                    className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium"
                  >
                    Edit
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  {draft.legal?.privacyText ? (
                    <>
                      <span className="text-green-600 dark:text-green-400">✓ Custom policy set</span>
                      {draft.legal?.privacyLastUpdated && (
                        <span className="ml-2">• Updated {draft.legal.privacyLastUpdated}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">Using default policy</span>
                  )}
                </p>
                {!draft.legal?.privacyText && (
                  <button
                    type="button"
                    onClick={() => {
                      updateLegal("privacyText", DEFAULT_PRIVACY_POLICY);
                      updateLegal("privacyLastUpdated", new Date().toISOString().split("T")[0]);
                    }}
                    className="text-xs px-2 py-1 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/50"
                  >
                    Load default policy
                  </button>
                )}
              </div>
              
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3">
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  <strong>Important:</strong> These documents protect your content from unauthorized use. The default terms include strong language against downloading, sharing, or misusing your images, videos, and messages.
                </p>
              </div>
            </div>
          </CollapsibleSection>

          {/* 18+ Mode */}
          <CollapsibleSection title="18+ (Spicy) Mode">
            <div className="space-y-4 pt-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.spicyMode ?? false}
                  onChange={(e) => updateDraft({ spicyMode: e.target.checked })}
                  className="rounded border-gray-300 dark:border-gray-600 text-primary-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Enable Spicy Mode (18+)</span>
              </label>
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">Content policy</p>
                <ul className="text-xs text-amber-800 dark:text-amber-200 space-y-0.5">
                  {STOREFRONT_CONTENT_POLICY.rules.slice(0, 3).map((rule, i) => (
                    <li key={i}>• {rule}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CollapsibleSection>

          {/* Save / Reset / Preview */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || saving}
              onMouseEnter={() => setSaveBtnHover(true)}
              onMouseLeave={() => setSaveBtnHover(false)}
              className="px-4 py-2 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ backgroundColor: saveBtnHover ? saveHoverColor : savePrimary }}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={!isDirty}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Reset
            </button>
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <GlobeIcon className="w-4 h-4" />
                Open page
              </a>
            )}
          </div>
        </div>

        {/* Right: Live Preview — sticky so it stays visible when scrolling Theme & Colors etc. */}
        <div className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-5rem)] lg:flex lg:flex-col">
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Live preview</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPreviewMode("landing")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  previewMode === "landing"
                    ? "bg-primary-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                Landing
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("member")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  previewMode === "member"
                    ? "bg-primary-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                Member
              </button>
              {normalizedHandle && normalizedHandle !== "preview" && (
                <>
                  <button
                    type="button"
                    onClick={() => window.open(previewLandingUrl, "_blank")}
                    className="px-2 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                    title="Open public landing (/p — use while signed in to preview like a visitor)"
                  >
                    Live
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(previewMemberUrl, "_blank")}
                    className="px-2 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center gap-1"
                    title="Open member shell preview (?preview=member)"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
          <div ref={previewScrollRef} className="min-h-0 lg:flex-1 lg:overflow-auto">
            <StorefrontPreview
              config={storefrontPreviewConfig}
              previewMode={previewMode}
              liveLanding={storefrontLandingLivePreview}
              previewFraming={{ tool: previewFramingTool, focusPhotoSlot: previewFocusPhotoSlot }}
              onHeroMediaItemPatch={(index, patch) => {
                setDraft((prev) => {
                  const hm = [...(prev.heroMedia ?? [])];
                  if (index < 0 || index >= hm.length) return prev;
                  hm[index] = { ...hm[index], ...patch };
                  return { ...prev, heroMedia: hm };
                });
              }}
              onAvatarObjectPositionChange={(objectPosition) => updateDraft({ avatarObjectPosition: objectPosition })}
            />
          </div>
        </div>
      </div>

      {builderGuestTreatModalOpen ? (
        <div
          className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/55 px-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-2"
          role="presentation"
          onClick={() => setBuilderGuestTreatModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="builder-guest-treat-modal-title"
            className="w-full max-w-[min(520px,100%)] max-h-[min(calc(100vh-1.5rem),720px)] overflow-hidden flex flex-col rounded-t-2xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-[0_-8px_40px_rgba(0,0,0,0.25)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700"
            >
              <h2 id="builder-guest-treat-modal-title" className="text-base font-bold m-0" style={{ color: builderGuestTreatPrimary }}>
                {builderGuestTreatStoreCopy.publicStoreModalTitle}
              </h2>
              <button
                type="button"
                onClick={() => setBuilderGuestTreatModalOpen(false)}
                className="rounded-full px-3 py-1 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Close
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 pb-6">
              <p className="text-xs text-gray-500 dark:text-gray-400 m-0 mb-3">
                Same list fans see on your live landing (published treats with “Landing store” on). Use{" "}
                <strong>Live</strong> in the preview toolbar to test checkout.
              </p>
              {builderLandingTreatsLoading ? (
                <p className="text-sm m-0 text-gray-700 dark:text-gray-300">{builderGuestTreatStoreCopy.memberStoreLoadingMessage}</p>
              ) : builderLandingTreatsProducts.length === 0 ? (
                <p className="text-sm italic m-0 text-gray-500 dark:text-gray-400">{builderGuestTreatStoreCopy.publicStoreModalEmptyMessage}</p>
              ) : (
                <ul className="space-y-3 list-none m-0 p-0">
                  {builderLandingTreatsProducts.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl p-3 border bg-gray-50 dark:bg-gray-800/80"
                      style={{ borderColor: `${builderGuestTreatPrimary}30` }}
                    >
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide m-0" style={{ color: builderGuestTreatPrimary }}>
                          {p.type.replace(/_/g, " ")}
                        </p>
                        <p className="font-semibold m-0 mt-0.5">{p.title}</p>
                        {p.description ? (
                          <p className="text-xs mt-1 mb-0 text-gray-600 dark:text-gray-400">{p.description}</p>
                        ) : null}
                        <p className="text-sm font-bold mt-1 mb-0" style={{ color: builderGuestTreatPrimary }}>
                          ${(p.priceCents / 100).toFixed(2)}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:text-right">
                        Guest checkout on live page
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Legal Modal */}
      {legalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Edit {legalModalOpen === "terms" ? "Terms of Service" : "Privacy Policy"}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {legalModalOpen === "terms" 
                    ? "Protects your content and sets rules for members" 
                    : "Explains how you handle member data and payments"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLegalModalOpen(null)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Quick actions */}
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const defaultText = legalModalOpen === "terms" ? DEFAULT_TERMS_OF_SERVICE : DEFAULT_PRIVACY_POLICY;
                  if (legalModalOpen === "terms") {
                    updateLegal("termsText", defaultText);
                    updateLegal("termsLastUpdated", new Date().toISOString().split("T")[0]);
                  } else {
                    updateLegal("privacyText", defaultText);
                    updateLegal("privacyLastUpdated", new Date().toISOString().split("T")[0]);
                  }
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/50"
              >
                Load recommended default
              </button>
              <button
                type="button"
                onClick={() => {
                  if (legalModalOpen === "terms") {
                    updateLegal("termsText", "");
                    updateLegal("termsLastUpdated", "");
                  } else {
                    updateLegal("privacyText", "");
                    updateLegal("privacyLastUpdated", "");
                  }
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Clear
              </button>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto">
              <textarea
                value={legalModalOpen === "terms" ? (draft.legal?.termsText ?? "") : (draft.legal?.privacyText ?? "")}
                onChange={(e) => {
                  if (legalModalOpen === "terms") {
                    updateLegal("termsText", e.target.value);
                    updateLegal("termsLastUpdated", new Date().toISOString().split("T")[0]);
                  } else {
                    updateLegal("privacyText", e.target.value);
                    updateLegal("privacyLastUpdated", new Date().toISOString().split("T")[0]);
                  }
                }}
                placeholder={legalModalOpen === "terms" 
                  ? "Enter your terms of service...\n\nClick 'Load recommended default' above to start with our pre-written terms that protect your content."
                  : "Enter your privacy policy...\n\nClick 'Load recommended default' above to start with our pre-written policy."}
                rows={18}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm leading-relaxed"
                style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
              />
              
              {/* Info box */}
              <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  {legalModalOpen === "terms" ? (
                    <>
                      <strong>The default terms include:</strong> Subscription billing info, content protection (no downloading/sharing), 
                      message confidentiality, behavior expectations, and legal consequences for violations.
                    </>
                  ) : (
                    <>
                      <strong>The default policy covers:</strong> Stripe payment processing, data collection and use, 
                      no third-party sharing, security practices, content protection, and message privacy.
                    </>
                  )}
                </p>
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {(legalModalOpen === "terms" ? draft.legal?.termsLastUpdated : draft.legal?.privacyLastUpdated) 
                  ? `Last updated: ${legalModalOpen === "terms" ? draft.legal?.termsLastUpdated : draft.legal?.privacyLastUpdated}`
                  : "Not yet saved"}
              </p>
              <button
                type="button"
                onClick={() => setLegalModalOpen(null)}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};


