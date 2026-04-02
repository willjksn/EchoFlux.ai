import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import type {
  CreatorStorefrontSettings,
  StorefrontSocialLinks,
  StorefrontLandingContent,
  TextStyle,
  PresetFontSize,
  LandingSectionListMarker,
} from "../types";

/** When set, landing preview uses real auth, checkout, tips, and footer links (public storefront). */
export interface StorefrontPreviewLiveLanding {
  isLoggedIn: boolean;
  isFreeAccess: boolean;
  onOpenSignup: () => void;
  onOpenLogin: () => void;
  onLogout?: () => void;
  onSubscribe: () => void;
  onJoinFree?: () => void;
  subscribing: boolean;
  joiningFree: boolean;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  homeHref?: string;
  termsHref: string;
  privacyHref: string;
  /** Shown under perks copy (e.g. bio). */
  bio?: string;
  tipHandle: string;
  onTipHandleChange: (v: string) => void;
  tipCustomAmount: string;
  onTipCustomAmountChange: (v: string) => void;
  onTipPresetDollars: (dollars: number) => void;
  onTipCustomSubmit: () => void;
  tipLoading: boolean;
  tipError: string;
  tipsEnabled: boolean;
  /** Defaults to 5,10,25… to match public landing */
  tipPresetDollars?: number[];
  showGuestTreatsCard: boolean;
  onOpenGuestTreats: () => void;
  landingTreatsLoading: boolean;
  landingTreatProductCount: number;
  treatLinkAccountMessage: string | null;
  onTreatLinkSignIn?: () => void;
}
import { getAvatarCropStyle } from "../src/lib/avatarCrop";
import {
  clampPan,
  parseObjectPositionPercentPair,
  formatObjectPositionPercentPair,
} from "../src/lib/objectPositionPan";
import { FanHubNotificationBell, type FanHubNotificationNavigatePayload } from "./FanHubNotificationBell";
import { auth } from "../firebaseConfig";
import { useAppContext } from "./AppContext";
import {
  useUnreadNewMessageNotificationCount,
  clearNewMessageNotificationBadge,
} from "./useUnreadNewMessageNotifications";
import { resolveStoreCopy } from "../src/lib/storefrontStoreCopy";
import { resolvePricingLandingCopy } from "../src/lib/pricingLandingCopy";
import { resolveTipSectionCopy } from "../src/lib/tipSectionCopy";
import { normalizeHeroMediaForStorefront } from "../src/lib/storefrontHeroNormalize";
import { WitmeHeaderLogo } from "./WitmeHeaderLogo";
import { renderTextWithCustomEmoji, type SjHeartEmojiAccessContext } from "../src/lib/customEmoji";

export type StorefrontHeroMediaItem = NonNullable<CreatorStorefrontSettings["heroMedia"]>[number];

// Font size mapping for text styles
const FONT_SIZE_MAP: Record<PresetFontSize, string> = {
  'xs': '0.75rem',
  'sm': '0.875rem',
  'base': '1rem',
  'lg': '1.125rem',
  'xl': '1.25rem',
  '2xl': '1.5rem',
  '3xl': '1.875rem',
};

/** Default when `*Marker` is unset (saved pages without the new field). */
function resolveListMarker(
  configured: LandingSectionListMarker | undefined,
  section: "perks" | "preview" | "energy" | "boundary"
): LandingSectionListMarker {
  if (configured !== undefined) return configured;
  if (section === "perks") return "none";
  if (section === "boundary") return "check";
  return "heart";
}

/** Short gradient bar under section titles (creator primary). */
function LandingCardTitleAccent({
  as: Tag = "h2",
  titleStyle,
  primary,
  children,
  align = "left",
}: {
  as?: "h2" | "h3";
  titleStyle: React.CSSProperties;
  primary: string;
  children: React.ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "text-center mb-4" : "text-left mb-4"}>
      <Tag className={`font-bold m-0 ${Tag === "h3" ? "tracking-tight" : ""}`} style={titleStyle}>
        {children}
      </Tag>
      <div
        className={`mt-2 h-1 w-16 rounded-full ${align === "center" ? "mx-auto" : ""}`}
        style={{
          background: `linear-gradient(90deg, ${primary} 0%, ${primary}dd 55%, ${primary}44 100%)`,
        }}
        aria-hidden
      />
    </div>
  );
}

function LandingListHeart({ color, size = 11 }: { color: string; size?: number }) {
  return (
    <span className="inline-flex shrink-0 mt-[0.25rem] leading-none" aria-hidden>
      <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0">
        <path
          fill={color}
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        />
      </svg>
    </span>
  );
}

function LandingListMarkerGlyph({ marker, color }: { marker: LandingSectionListMarker; color: string }) {
  if (marker === "none") return null;
  if (marker === "check") {
    return (
      <span className="shrink-0 w-4 text-center text-sm font-light leading-none mt-0.5" style={{ color }} aria-hidden>
        ✓
      </span>
    );
  }
  if (marker === "dot") {
    return (
      <span
        className="mt-[0.35rem] h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color, boxShadow: `0 0 0 1px ${color}33` }}
        aria-hidden
      />
    );
  }
  return <LandingListHeart color={color} />;
}

/** Builder preview landing column. */
const LANDING_MAIN_MAX = "max-w-[720px] mx-auto w-full";
/** Builder preview header row. */
const LANDING_HEADER_MAX = "max-w-[720px] mx-auto w-full";

// Helper to generate inline styles from TextStyle
function getTextStyleCSS(
  style?: TextStyle,
  defaults?: { fontSize?: string; color?: string; fontFamily?: string; fontStyle?: 'normal' | 'italic' }
): React.CSSProperties {
  const rawFontSize = style?.fontSize as unknown;
  const mappedFontSize =
    typeof rawFontSize === "string" && rawFontSize in FONT_SIZE_MAP
      ? FONT_SIZE_MAP[rawFontSize as keyof typeof FONT_SIZE_MAP]
      : undefined;
  const customFontSize =
    typeof rawFontSize === "string" &&
    /^-?\d*\.?\d+(px|rem|em|%|vw|vh)$/.test(rawFontSize.trim())
      ? rawFontSize.trim()
      : undefined;
  const fontStyle = style?.fontStyle ?? defaults?.fontStyle;
  return {
    fontSize: mappedFontSize ?? customFontSize ?? defaults?.fontSize,
    color: style?.color || defaults?.color,
    fontFamily: style?.fontFamily || defaults?.fontFamily,
    ...(fontStyle ? { fontStyle } : {}),
  };
}

function scaleCssLength(
  value: React.CSSProperties["fontSize"],
  factor: number
): React.CSSProperties["fontSize"] {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const match = trimmed.match(/^(-?\d*\.?\d+)(px|rem|em)$/);
  if (!match) return value;
  const num = Number(match[1]);
  if (!Number.isFinite(num)) return value;
  return `${num * factor}${match[2]}`;
}

export type PreviewMode = "landing" | "member";

/** Controlled by My Page builder — drag interactions in the preview update draft. */
export type StorefrontPreviewFramingTool = "off" | "panBg" | "panAvatar" | "focusPhoto";

export interface StorefrontPreviewProps {
  config: Partial<CreatorStorefrontSettings>;
  previewMode: PreviewMode;
  className?: string;
  /** Builder: current framing mode + which grid hero slot is targeted for “Photo focus”. */
  previewFraming?: { tool: StorefrontPreviewFramingTool; focusPhotoSlot: number };
  /** Merge patches into `heroMedia[index]` (e.g. backgroundPosition, objectPosition). */
  onHeroMediaItemPatch?: (index: number, patch: Partial<StorefrontHeroMediaItem>) => void;
  /** Update circular avatar crop (CSS object-position, e.g. `45% 30%`). */
  onAvatarObjectPositionChange?: (objectPosition: string) => void;
  /** Public fan page: wire buttons to FanAuth + Stripe (My Page preview stays dummy). */
  liveLanding?: StorefrontPreviewLiveLanding;
}

// Neutral theme defaults - creators should customize
const DEFAULT_PRIMARY = "#6366f1";
const DEFAULT_BG = "#fafafa";
const DEFAULT_TEXT = "#1f2937";

/** Returns true if the hex color is dark (suitable for light text). */
function isDarkBackground(hex: string): boolean {
  const h = hex.replace(/^#/, "");
  const r = h.length === 3 ? parseInt(h[0] + h[0], 16) : parseInt(h.slice(0, 2), 16);
  const g = h.length === 3 ? parseInt(h[1] + h[1], 16) : parseInt(h.slice(2, 4), 16);
  const b = h.length === 3 ? parseInt(h[2] + h[2], 16) : parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.45;
}

const DEFAULT_SECTION_ORDER = ["feed", "treats", "tip", "messages", "about", "saved"];

// Map for display labels
const SECTION_LABELS: Record<string, string> = {
  home: "Home",
  feed: "Home",
  treats: "Store",
  tip: "Tip",
  messages: "Messages",
  sessions: "Chat Session",
  about: "About",
};

// Neutral default landing content - creators should customize
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
};

// Social icons
const InstagramIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="5" ry="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1.25" fill="currentColor" stroke="none" />
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

const FacebookIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

// Globe icon for custom social links
const GlobeIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

// Get visible social links
function getVisibleSocialLinks(socialLinks?: StorefrontSocialLinks) {
  if (!socialLinks) return [];
  const links: { key: string; url: string; icon: React.ReactNode; name?: string }[] = [];

  const hasUrl = (raw?: string) => typeof raw === "string" && raw.trim() !== "";
  const normalizeExternalUrl = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) || trimmed.startsWith("//")) return trimmed;
    return `https://${trimmed.replace(/^\/+/, "")}`;
  };
  const includeIfVisible = (
    key: string,
    icon: React.ReactNode,
    cfg?: { url?: string; show?: boolean },
    name?: string
  ) => {
    if (!cfg || cfg.show === false || !hasUrl(cfg.url)) return;
    const normalized = normalizeExternalUrl(cfg.url!);
    if (!normalized) return;
    links.push({ key, url: normalized, icon, name });
  };

  includeIfVisible("instagram", <InstagramIcon />, socialLinks.instagram);
  includeIfVisible("x", <XIcon />, socialLinks.x);
  includeIfVisible("tiktok", <TikTokIcon />, socialLinks.tiktok);
  includeIfVisible("youtube", <YouTubeIcon />, socialLinks.youtube);
  includeIfVisible("facebook", <FacebookIcon />, socialLinks.facebook);
  // Backward compatibility for old records that stored twitter instead of x.
  includeIfVisible(
    "x",
    <XIcon />,
    (socialLinks as StorefrontSocialLinks & { twitter?: { url?: string; show?: boolean } }).twitter
  );

  // Add custom social links
  if (socialLinks.custom && Array.isArray(socialLinks.custom)) {
    socialLinks.custom.forEach((custom, index) => {
      if (custom.show !== false && hasUrl(custom.url)) {
        const normalized = normalizeExternalUrl(custom.url);
        if (!normalized) return;
        links.push({ 
          key: `custom-${index}`, 
          url: normalized, 
          icon: <GlobeIcon />,
          name: custom.name || "Link"
        });
      }
    });
  }
  
  return links;
}

function getSocialIconStyle(key: string, fallback: string): React.CSSProperties {
  switch (key) {
    case "instagram":
      return {
        color: "#ffffff",
        background: "radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)",
        border: "1px solid rgba(255,255,255,0.35)",
        boxShadow: "0 4px 10px rgba(0,0,0,0.2)",
      };
    case "tiktok":
      return {
        color: "#ffffff",
        background: "#0f0f10",
        border: "1px solid rgba(255,255,255,0.28)",
        boxShadow: "0 4px 10px rgba(0,0,0,0.22)",
      };
    case "x":
      return {
        color: "#ffffff",
        background: "#000000",
        border: "1px solid rgba(255,255,255,0.35)",
        boxShadow: "0 4px 10px rgba(0,0,0,0.32)",
      };
    case "facebook":
      return {
        color: "#ffffff",
        background: "#1877f2",
        border: "1px solid rgba(255,255,255,0.35)",
        boxShadow: "0 4px 10px rgba(24,119,242,0.28)",
      };
    case "youtube":
      return {
        color: "#ffffff",
        background: "#ff0000",
        border: "1px solid rgba(255,255,255,0.35)",
        boxShadow: "0 4px 10px rgba(255,0,0,0.28)",
      };
    default:
      return {
        color: "#ffffff",
        background: fallback,
        border: "1px solid rgba(255,255,255,0.3)",
        boxShadow: "0 4px 10px rgba(0,0,0,0.2)",
      };
  }
}

export const StorefrontPreview: React.FC<StorefrontPreviewProps> = ({
  config,
  previewMode,
  className = "",
  previewFraming,
  onHeroMediaItemPatch,
  onAvatarObjectPositionChange,
  liveLanding,
}) => {
  const [activeTab, setActiveTab] = useState<string>("home");
  const [tipAmount, setTipAmount] = useState<string>("");
  const framingTool = previewFraming?.tool ?? "off";
  const focusPhotoSlot = previewFraming?.focusPhotoSlot ?? 0;
  const heroSectionRef = useRef<HTMLElement>(null);
  const bgDragRef = useRef<{ startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);
  const avatarPanRef = useRef<{ startClientX: number; startClientY: number; startOx: number; startOy: number } | null>(null);
  const focusDragRef = useRef<{ startClientX: number; startClientY: number; startOx: number; startOy: number } | null>(null);

  const theme: Partial<NonNullable<CreatorStorefrontSettings["theme"]>> = config.theme ?? {};
  const primary = theme.primary || DEFAULT_PRIMARY;
  const accentHover = theme.accentHover ?? primary;
  const background = theme.background || DEFAULT_BG;
  const textColor = theme.text || DEFAULT_TEXT;
  const isDark = isDarkBackground(background);
  const live = liveLanding;
  const liveAuthScale = 1;
  const liveAuthShiftLeftPx = 0;
  // Match stormijxo.com: full-width header row, but centered readable content column.
  const landingMainMaxClass = LANDING_MAIN_MAX;
  const landingHeaderMaxClass = live ? "max-w-[1360px] mx-auto w-full" : LANDING_HEADER_MAX;
  const fanDark = Boolean(live?.isDarkMode);
  const landingPageText = live && fanDark ? "#f5f5f5" : textColor;
  const landingPageMuted = live && fanDark ? "rgba(255,255,255,0.6)" : `${textColor}99`;
  const landingPageMutedStrong = live && fanDark ? "rgba(255,255,255,0.8)" : `${textColor}cc`;
  const landingPageGradient =
    live && fanDark
      ? "linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 50%, #0f0f0f 100%)"
      : isDark
        ? background
        : /* Subtle primary wash on page background (creator theme, not fixed rose). */
          `linear-gradient(165deg, ${primary}12 0%, ${background} 38%, #ffffff 62%, ${primary}08 100%)`;
  const tipPresetsLive = live?.tipPresetDollars ?? [5, 10, 25, 50, 100, 250];
  /** Landing + member preview top bars — soft primary-tinted chrome */
  const previewHeaderChrome: React.CSSProperties = {
    borderBottom: `1px solid ${primary}25`,
    background: isDark
      ? `linear-gradient(160deg, rgba(0, 0, 0, 0.35) 0%, ${primary}12 100%)`
      : `linear-gradient(160deg, #ffffff 0%, color-mix(in srgb, ${primary} 4%, #ffffff) 100%)`,
    boxShadow: `0 8px 28px ${primary}12`,
  };
  const cardBg = isDark ? background : `linear-gradient(140deg, rgba(255, 255, 255, 0.94) 0%, ${primary}06 52%, ${primary}08 100%)`;
  const surfaceBg = isDark ? background : "#fff";
  const landingCardBg =
    live && fanDark
      ? "linear-gradient(140deg, rgba(30, 30, 30, 0.94) 0%, rgba(25, 25, 30, 0.86) 52%, rgba(20, 20, 25, 0.82) 100%)"
      : cardBg;
  const landingCardBorder =
    live && fanDark ? "1px solid rgba(255,255,255,0.1)" : isDark ? `1px solid ${primary}30` : `1px solid ${primary}18`;
  const headerChromeLanding: React.CSSProperties =
    live && fanDark
      ? {
          borderBottom: `1px solid ${primary}30`,
          backgroundColor: "rgba(20, 20, 20, 0.95)",
          boxShadow: `0 8px 28px ${primary}12`,
        }
      : previewHeaderChrome;
  const landingFaint = live && fanDark ? "rgba(255,255,255,0.4)" : `${textColor}66`;

  /** Live storefront: larger type in the four landing content cards (same max column width). */
  const landingCardTitleFs = live ? "1.0625rem" : "0.875rem";
  const landingCardBodyFs = live ? "1.0625rem" : "0.875rem";
  const landingCardListFs = live ? "1rem" : "0.875rem";
  const landingCardPreviewSerifTitleFs = live ? "1.625rem" : "1.375rem";
  const landingCardPreviewSubFs = live ? "1rem" : "0.875rem";
  const landingCardPreviewFooterFs = live ? "0.875rem" : "0.75rem";

  /** Same shell as monthly subscribe card (light + dark). */
  const landingPromoCardShell = (extra?: React.CSSProperties): React.CSSProperties => ({
    background:
      fanDark || isDark
        ? `linear-gradient(135deg, ${primary}22 0%, rgba(0,0,0,0.28) 100%)`
        : `linear-gradient(135deg, ${primary}15 0%, ${primary}05 100%)`,
    border: `1px solid ${fanDark || isDark ? `${primary}40` : `${primary}30`}`,
    ...extra,
  });

  /** Light wash behind the pricing card (tinted from creator primary, not fixed rose). */
  const landingPricingBackdrop: React.CSSProperties =
    fanDark || isDark
      ? {}
      : {
          background: `linear-gradient(180deg, ${primary}18 0%, ${primary}0a 45%, transparent 100%)`,
          borderRadius: "1rem",
          padding: "1.25rem 0",
        };

  /** White card + primary border/glow; inner fill uses primary mix (no hardcoded pink). */
  const landingPricingCardChrome: React.CSSProperties =
    fanDark || isDark
      ? {
          ...landingPromoCardShell({
            boxShadow: `0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px ${primary}35`,
          }),
        }
      : {
          background: `linear-gradient(160deg, #ffffff 0%, color-mix(in srgb, ${primary} 5%, #ffffff) 100%)`,
          border: `1px solid ${primary}`,
          boxShadow: `0 12px 34px ${primary}3d, 0 0 0 1px ${primary}14`,
        };

  // Member nav tabs from sections/sectionsOrder (Saved hidden in preview — only on live storefront)
  const sections = config.sections ?? { feed: true, treats: true, tip: true, messages: true, about: true };
  const sectionsOrder = config.sectionsOrder ?? DEFAULT_SECTION_ORDER;
  const chatEnabledPreview = config.monetization?.chatEnabled !== false;
  const memberTabs = sectionsOrder
    .filter((key) => key !== "saved" && (sections as Record<string, boolean>)?.[key] !== false)
    .filter((key) => key !== "messages" || chatEnabledPreview);
  const { user, showToast } = useAppContext();

  const sjHeartEmojiCtx: SjHeartEmojiAccessContext = useMemo(
    () => ({
      creatorHandle: config.handle,
      viewerIsAdmin: user?.role === "Admin",
    }),
    [config.handle, user?.role]
  );

  const joinFanVideoSessionPreview = useCallback(
    async (sessionId: string, creatorIdForSession: string) => {
      if (!auth.currentUser || !creatorIdForSession.trim()) return;
      try {
        const token = await auth.currentUser.getIdToken(true);
        const res = await fetch("/api/liveVideoChat?action=token", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sessionId, creatorId: creatorIdForSession }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error || "Could not open video session");
        const roomUrl = (data as { roomUrl?: string }).roomUrl;
        const tokenParam = (data as { token?: string }).token;
        if (!roomUrl || !tokenParam) throw new Error("Video room is not ready yet.");
        const joinUrl = `${roomUrl}${roomUrl.includes("?") ? "&" : "?"}t=${encodeURIComponent(tokenParam)}`;
        window.open(joinUrl, "_blank", "noopener,noreferrer");
      } catch (e) {
        showToast?.(e instanceof Error ? e.message : "Could not open video session.", "error");
      }
    },
    [showToast]
  );

  const handlePreviewNotificationNavigate = useCallback(
    (p: FanHubNotificationNavigatePayload) => {
      if (previewMode !== "member") return;
      const d = p.data;
      const selfId = user?.id;
      if (d.creatorId && selfId && d.creatorId !== selfId) return;

      const goMessages = () => {
        if (memberTabs.includes("messages")) setActiveTab("messages");
      };
      const goTreats = () => {
        if (memberTabs.includes("treats")) setActiveTab("treats");
        else if (memberTabs.includes("feed")) setActiveTab("feed");
      };

      if (p.type === "new_message") {
        goMessages();
        return;
      }
      if (
        p.type === "video_chat_accepted" ||
        p.type === "video_chat_starting" ||
        p.type === "video_chat_reminder"
      ) {
        const sid = d.sessionId?.trim();
        const cid = (d.creatorId?.trim() || selfId || "").trim();
        if (sid && cid) void joinFanVideoSessionPreview(sid, cid);
        else goMessages();
        return;
      }
      if (p.type === "purchase_confirmed" || p.type === "content_unlocked") {
        goTreats();
        return;
      }
      if (p.type === "session_starting" || p.type === "session_reminder") {
        goMessages();
        return;
      }
      if (d.threadId?.trim()) goMessages();
    },
    [joinFanVideoSessionPreview, memberTabs, previewMode, user?.id]
  );

  const effectiveTab =
    activeTab === "saved" && !memberTabs.includes("saved")
      ? "feed"
      : activeTab === "messages" && !memberTabs.includes("messages")
        ? memberTabs[0] ?? "feed"
        : activeTab;

  const unreadMessageTabCount = useUnreadNewMessageNotificationCount(
    previewMode === "member" ? null : false
  );

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (previewMode !== "member" || effectiveTab !== "messages" || !uid) return;
    void clearNewMessageNotificationBadge(uid, null);
  }, [previewMode, effectiveTab]);

  const displayName = config.displayName || config.handle || "Your name";
  const creatorHandleLabel = `@${String(config.handle || displayName || "creator")
    .replace(/^@/, "")
    .replace(/\s+/g, "")
    .toLowerCase()}`;
  const fanUsernameLabel = "@your_username";
  const bio = config.bio ?? "";
  const avatar = config.avatar;
  /** Same crop for every circular avatar in the preview. */
  const avatarCropStyle: React.CSSProperties = getAvatarCropStyle(config.avatarObjectPosition);
  const showDisplayNameOnLanding = config.showDisplayNameOnLanding !== false;
  const cfgHeroUrl = (config as { heroImageUrl?: string }).heroImageUrl;
  const heroMedia = useMemo(
    () => normalizeHeroMediaForStorefront(config.heroMedia, config.heroImage, cfgHeroUrl),
    [config.heroMedia, config.heroImage, cfgHeroUrl]
  );
  const fullBgIndex = useMemo(
    () => heroMedia.findIndex((m) => m.size === "fullBackground"),
    [heroMedia]
  );
  const fullBgItem = fullBgIndex >= 0 ? heroMedia[fullBgIndex] : undefined;
  const isFullBgLayout = Boolean(fullBgItem);
  const heroImages = heroMedia.filter((m) => m.size !== "fullBackground");
  const heroSlots = useMemo(
    () => heroMedia.map((m, idx) => ({ m, idx })).filter((x) => x.m.size !== "fullBackground"),
    [heroMedia]
  );
  const framingInteractionsEnabled =
    previewMode === "landing" &&
    previewFraming != null &&
    Boolean(onHeroMediaItemPatch || onAvatarObjectPositionChange);

  const heroImage =
    heroImages[0]?.url ??
    (typeof config.heroImage === "string" && config.heroImage.trim() ? config.heroImage.trim() : undefined) ??
    (typeof cfgHeroUrl === "string" && cfgHeroUrl.trim() ? cfgHeroUrl.trim() : undefined);
  const heroTagline = config.heroTagline ?? "";
  /** Empty string from forms/Firestore should fall back like the public page. */
  const heroPromise =
    typeof config.heroPromise === "string" && config.heroPromise.trim() !== ""
      ? config.heroPromise.trim()
      : "Demo hero promise text";
  const heroSubline = config.heroSubline ?? "";
  const heroSubline2 = config.heroSubline2 ?? "";
  const heroLayout = config.heroLayout ?? "default";
  /**
   * "Default" used to mean stacked + centered, which made live landings look like a narrow column
   * (name + taglines) even when a hero photo existed. Match the intended storefront hero: photo
   * beside copy (same as explicit "Image left") whenever there is hero art and not full-background mode.
   * Use "Centered" in My Page for a stacked compact hero with images.
   */
  const heroLayoutEffective = useMemo(() => {
    if (heroLayout !== "default") return heroLayout;
    if (fullBgIndex >= 0) return "default";
    const hasHeroVisual =
      heroSlots.length > 0 ||
      Boolean(heroImage);
    if (hasHeroVisual) return "split";
    return "default";
  }, [heroLayout, fullBgIndex, heroSlots.length, heroImage]);
  /** Side-by-side hero: image column must not use `w-full` or it steals the whole row and squeezes copy to ~100px. */
  const isHeroSplit =
    heroLayoutEffective === "split" || heroLayoutEffective === "splitRight";
  const heroMediaGridClassName = useMemo(() => {
    const n = heroSlots.length;
    const base = "grid gap-2";
    if (n === 0) return base;
    if (isHeroSplit) {
      if (n === 1) return `${base} shrink-0 w-auto max-w-[320px]`;
      if (n === 2) return `${base} grid-cols-2 shrink-0 w-auto max-w-[420px]`;
      if (n === 3) return `${base} grid-cols-3 shrink-0 w-auto max-w-[480px]`;
      if (n === 4) return `${base} grid-cols-2 shrink-0 w-auto max-w-[420px]`;
      return `${base} grid-cols-3 shrink-0 w-auto max-w-[480px]`;
    }
    if (n === 1) return `${base} w-full max-w-[320px] mx-auto`;
    if (n === 2) return `${base} grid-cols-2 max-w-[420px] mx-auto w-full`;
    if (n === 3) return `${base} grid-cols-3 max-w-[480px] mx-auto w-full`;
    if (n === 4) return `${base} grid-cols-2 max-w-[420px] mx-auto w-full`;
    return `${base} grid-cols-3 max-w-[480px] mx-auto w-full`;
  }, [heroSlots.length, isHeroSplit]);
  const textStyles = config.textStyles ?? {};
  
  const landingContent = { ...DEFAULT_LANDING_CONTENT, ...config.landingContent };
  const perksListMarker = resolveListMarker(landingContent.perksListMarker, "perks");
  const previewListMarker = resolveListMarker(landingContent.previewListMarker, "preview");
  const energyLinesMarker = resolveListMarker(landingContent.energyLinesMarker, "energy");
  const boundaryLinesMarker = resolveListMarker(landingContent.boundaryLinesMarker, "boundary");
  const storeCopy = resolveStoreCopy(landingContent);
  const socialLinks = getVisibleSocialLinks(config.socialLinks);
  
  const boundariesText = config.rules?.boundariesText ?? landingContent.boundaryText ?? "";
  /** Rules dashboard text replaces landing guidelines entirely when non-empty. */
  const rulesBoundariesRaw = config.rules?.boundariesText;
  const guidelinesFromRulesOnly =
    typeof rulesBoundariesRaw === "string" && rulesBoundariesRaw.trim() !== "";
  const boundaryIntroMerged = guidelinesFromRulesOnly
    ? rulesBoundariesRaw.trim()
    : (landingContent.boundaryText || "").trim();
  const boundaryLinesFiltered = guidelinesFromRulesOnly
    ? []
    : (landingContent.boundaryLines ?? []).filter((l) => String(l).trim());
  const spicyMode = config.spicyMode ?? false;
  const monetization = config.monetization ?? {};
  const monthlyPriceCents = monetization.monthlyPrice ?? 999;
  const monthlyPrice = (monthlyPriceCents / 100).toFixed(2);
  const isFreeAccessPreview = monetization.freeAccessEnabled === true;
  const pricingLandingPreview = resolvePricingLandingCopy(landingContent, {
    isFreeAccess: isFreeAccessPreview,
    monthlyPrice,
  });
  const tipLandingPreview = resolveTipSectionCopy(landingContent, "landing");
  const tipMemberPreview = resolveTipSectionCopy(landingContent, "member");

  const patchHeroItem = useCallback(
    (index: number, patch: Partial<StorefrontHeroMediaItem>) => {
      if (!onHeroMediaItemPatch || index < 0) return;
      onHeroMediaItemPatch(index, patch);
    },
    [onHeroMediaItemPatch]
  );

  const focusHeroMediaIndex = heroSlots[focusPhotoSlot]?.idx ?? -1;
  const focusItem = heroSlots[focusPhotoSlot]?.m;

  const handleBgPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (framingTool !== "panBg" || fullBgIndex < 0 || !heroSectionRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const [sx, sy] = parseObjectPositionPercentPair(fullBgItem?.backgroundPosition);
      bgDragRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startX: sx,
        startY: sy,
      };
    },
    [framingTool, fullBgIndex, fullBgItem?.backgroundPosition]
  );

  const handleBgPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (framingTool !== "panBg" || !bgDragRef.current || !heroSectionRef.current || fullBgIndex < 0) return;
      const rect = heroSectionRef.current.getBoundingClientRect();
      const w = Math.max(rect.width, 1);
      const h = Math.max(rect.height, 1);
      const dx = e.clientX - bgDragRef.current.startClientX;
      const dy = e.clientY - bgDragRef.current.startClientY;
      const sens = 0.65;
      const nx = clampPan(bgDragRef.current.startX - (dx / w) * 100 * sens, 0, 100);
      const ny = clampPan(bgDragRef.current.startY - (dy / h) * 100 * sens, 0, 100);
      patchHeroItem(fullBgIndex, { backgroundPosition: formatObjectPositionPercentPair(nx, ny) });
      bgDragRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startX: nx,
        startY: ny,
      };
    },
    [framingTool, fullBgIndex, patchHeroItem]
  );

  const handleBgPointerUp = useCallback((e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    bgDragRef.current = null;
  }, []);

  const handleAvatarPanPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (framingTool !== "panAvatar" || !onAvatarObjectPositionChange) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const [ox, oy] = parseObjectPositionPercentPair(config.avatarObjectPosition);
      avatarPanRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startOx: ox,
        startOy: oy,
      };
    },
    [framingTool, onAvatarObjectPositionChange, config.avatarObjectPosition]
  );

  const handleAvatarPanPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (framingTool !== "panAvatar" || !avatarPanRef.current || !onAvatarObjectPositionChange) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const w = Math.max(rect.width, 1);
      const h = Math.max(rect.height, 1);
      const dx = e.clientX - avatarPanRef.current.startClientX;
      const dy = e.clientY - avatarPanRef.current.startClientY;
      const sens = 0.85;
      const nx = clampPan(avatarPanRef.current.startOx - (dx / w) * 100 * sens, 0, 100);
      const ny = clampPan(avatarPanRef.current.startOy - (dy / h) * 100 * sens, 0, 100);
      onAvatarObjectPositionChange(formatObjectPositionPercentPair(nx, ny));
      avatarPanRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startOx: nx,
        startOy: ny,
      };
    },
    [framingTool, onAvatarObjectPositionChange]
  );

  const handleAvatarPanPointerUp = useCallback((e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    avatarPanRef.current = null;
  }, []);

  const handleFocusPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (framingTool !== "focusPhoto" || focusHeroMediaIndex < 0) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const [ox, oy] = parseObjectPositionPercentPair(focusItem?.objectPosition);
      focusDragRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startOx: ox,
        startOy: oy,
      };
    },
    [framingTool, focusHeroMediaIndex, focusItem?.objectPosition]
  );

  const handleFocusPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (framingTool !== "focusPhoto" || !focusDragRef.current || focusHeroMediaIndex < 0) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const w = Math.max(rect.width, 1);
      const h = Math.max(rect.height, 1);
      const dx = e.clientX - focusDragRef.current.startClientX;
      const dy = e.clientY - focusDragRef.current.startClientY;
      const sens = 0.85;
      const nx = clampPan(focusDragRef.current.startOx - (dx / w) * 100 * sens, 0, 100);
      const ny = clampPan(focusDragRef.current.startOy - (dy / h) * 100 * sens, 0, 100);
      patchHeroItem(focusHeroMediaIndex, { objectPosition: formatObjectPositionPercentPair(nx, ny) });
      focusDragRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startOx: nx,
        startOy: ny,
      };
    },
    [framingTool, focusHeroMediaIndex, patchHeroItem]
  );

  const handleFocusPointerUp = useCallback((e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    focusDragRef.current = null;
  }, []);

  const globalFont = theme.fontFamily || "Inter, sans-serif";
  const heroTextBase = { fontFamily: globalFont, fontStyle: "normal" as const };
  const scaleHeroSplitTextStyle = useCallback(
    (style: React.CSSProperties, hasCustomSize?: boolean): React.CSSProperties => {
      if (!(live && isHeroSplit && hasCustomSize)) return style;
      return {
        ...style,
        fontSize: scaleCssLength(style.fontSize, 1.5),
      };
    },
    [live, isHeroSplit]
  );
  // CSS variables for theme
  const themeVars = {
    "--preview-primary": primary,
    "--preview-bg": background,
    "--preview-text": textColor,
    "--preview-font": globalFont,
  } as React.CSSProperties;

  return (
    <div
      className={`stormij-theme ${
        live
          ? previewMode === "landing"
            ? "min-h-screen w-full fan-storefront-live"
            : "min-h-[400px] rounded-xl border border-gray-200 dark:border-gray-700 shadow-inner"
          : `min-h-[400px] rounded-xl border border-gray-200 dark:border-gray-700 shadow-inner`
      } ${
        previewMode === "member"
          ? "flex flex-col overflow-hidden max-h-[min(85vh,900px)]"
          : live
            ? ""
            : "overflow-auto"
      } ${live && previewMode === "landing" ? "overflow-x-hidden" : ""} ${className}`}
      style={{
        ...themeVars,
        fontFamily: globalFont,
        backgroundColor: previewMode === "landing" && !live ? background : background,
      }}
    >
      {previewMode === "landing" && (
        <div
          className="storefront-preview-landing fan-landing-page"
          style={{
            background: landingPageGradient,
            color: landingPageText,
            minHeight: live ? "100vh" : undefined,
          }}
        >
          {/* Header — full-width chrome (Stormij-style); inner row is edge-to-edge with horizontal padding */}
          <header className="w-full" style={headerChromeLanding}>
            <div
              className={`flex items-center justify-between ${live && isFullBgLayout ? "px-2 sm:px-3" : "px-4 sm:px-6"} py-3 gap-2 min-w-0 ${live && isFullBgLayout ? "w-full" : landingHeaderMaxClass}`}
            >
            {live ? (
              <a
                href={live.homeHref ?? "/"}
                className="flex items-center gap-2 min-h-[56px] min-w-0 flex-1 no-underline text-inherit"
              >
                <WitmeHeaderLogo color={primary} className="h-10 w-auto max-w-[220px] flex-shrink-0 sm:h-11" />
              </a>
            ) : (
              <div
                className="flex items-center gap-2 min-h-[56px] min-w-0 flex-1"
                aria-label="Storefront preview"
              >
                <WitmeHeaderLogo color={primary} className="h-10 w-auto max-w-[220px] flex-shrink-0 sm:h-11" />
              </div>
            )}
            <div
              className="ml-2 flex flex-shrink-0 items-center gap-2 self-center sm:gap-3"
              style={
                live
                  ? {
                      transform: isFullBgLayout
                        ? `scale(${liveAuthScale})`
                        : `translateX(-${liveAuthShiftLeftPx}px) scale(${liveAuthScale})`,
                      transformOrigin: "right center",
                    }
                  : undefined
              }
            >
              {live ? (
                <>
                  <button
                    type="button"
                    className="text-sm font-medium hover:underline"
                    style={{ color: primary }}
                    onClick={live.onOpenSignup}
                  >
                    Sign up
                  </button>
                  <button
                    type="button"
                    className="text-sm leading-none px-4 py-2 rounded-full border bg-white/70 hover:bg-white/90 dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
                    style={{ color: primary, borderColor: `${primary}66` }}
                    onClick={live.onOpenLogin}
                  >
                    Log in
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="text-sm font-medium hover:underline" style={{ color: primary }}>
                    Sign up
                  </button>
                  <button
                    type="button"
                    className="text-sm leading-none px-4 py-2 rounded-full border bg-white/70 hover:bg-white/90 dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
                    style={{ color: primary, borderColor: `${primary}66` }}
                  >
                    Log in
                  </button>
                </>
              )}
            </div>
            </div>
          </header>

          {/* Hero Section — fullBackground = avatar-only overlay on left; else auto-layout grid for 1–6 images */}
          <section
            ref={heroSectionRef}
            className={`px-4 py-6 relative overflow-visible rounded-b-lg ${fullBgItem ? "pb-0" : ""}`}
            style={
              fullBgItem
                ? {
                    backgroundImage: `url(${fullBgItem.url})`,
                    backgroundSize: "cover",
                    backgroundPosition: fullBgItem.backgroundPosition ?? "center",
                    minHeight: "160px",
                  }
                : undefined
            }
          >
            {fullBgItem && (
              <div
                className={`absolute inset-0 rounded-b-lg ${framingTool === "panBg" ? "bg-black/40 cursor-grab active:cursor-grabbing touch-none" : "bg-black/40 pointer-events-none"}`}
                aria-hidden
                onPointerDown={handleBgPointerDown}
                onPointerMove={handleBgPointerMove}
                onPointerUp={handleBgPointerUp}
                onPointerCancel={handleBgPointerUp}
              />
            )}
            <div className={landingMainMaxClass}>
            {fullBgItem && (
              <div
                className={`absolute z-10 w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-lg bg-gray-100 ${
                  framingTool === "panAvatar" && framingInteractionsEnabled
                    ? "cursor-grab active:cursor-grabbing touch-none"
                    : ""
                }`}
                style={{
                  left:
                    fullBgItem.landingAvatarLeft ??
                    (live
                      ? "max(0.75rem, calc(50% - 360px + 0.75rem))"
                      : "1rem"),
                  bottom: fullBgItem.landingAvatarBottom ?? "-3rem",
                  ...(framingTool === "panAvatar" && framingInteractionsEnabled
                    ? { boxShadow: `0 0 0 3px ${primary}99, 0 8px 24px rgba(0,0,0,0.2)` }
                    : {}),
                }}
                onPointerDown={framingInteractionsEnabled ? handleAvatarPanPointerDown : undefined}
                onPointerMove={framingInteractionsEnabled ? handleAvatarPanPointerMove : undefined}
                onPointerUp={framingInteractionsEnabled ? handleAvatarPanPointerUp : undefined}
                onPointerCancel={framingInteractionsEnabled ? handleAvatarPanPointerUp : undefined}
              >
                {avatar ? (
                  <img
                    src={avatar}
                    alt=""
                    className="w-full h-full object-cover pointer-events-none"
                    style={avatarCropStyle}
                  />
                ) : (
                  <span className="w-full h-full flex items-center justify-center text-2xl font-bold pointer-events-none" style={{ color: primary }}>{(displayName || "?")[0].toUpperCase()}</span>
                )}
              </div>
            )}
            {!fullBgItem && (
              <div
                className={
                  heroLayoutEffective === "split" || heroLayoutEffective === "splitRight"
                    ? `relative flex flex-row gap-6 items-start ${heroLayoutEffective === "splitRight" ? "flex-row-reverse" : ""}`
                    : "relative flex flex-col items-center text-center max-w-[420px] mx-auto"
                }
                style={heroLayoutEffective === "centered" ? { maxWidth: "380px", padding: "0.5rem 0" } : undefined}
              >
                {heroSlots.length > 0 && (
                  <div className={heroMediaGridClassName}>
                    {heroSlots.slice(0, 6).map(({ m: item, idx }, slotIndex) => {
                      const sizeClass =
                        item.size === "small"
                          ? live
                            ? "w-[10.08rem] h-[13.68rem]"
                            : "w-20 h-28"
                          : item.size === "large"
                            ? live
                              ? "w-[17.28rem] h-[23.04rem]"
                              : "w-36 h-44"
                            : live
                              ? "w-[14.4rem] h-[19.44rem]"
                              : "w-28 h-36";
                      const isFocusSlot = framingTool === "focusPhoto" && focusPhotoSlot === slotIndex;
                      return (
                        <div
                          key={`${item.url}-${idx}`}
                          className={`rounded-xl overflow-hidden ${sizeClass} justify-self-center ${isFocusSlot ? "ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-900" : ""}`}
                          style={{
                            border: `1px solid ${primary}30`,
                            boxShadow: isFocusSlot
                              ? `0 0 0 2px ${primary}, 0 18px 44px ${primary}40`
                              : isDark
                                ? `0 18px 44px rgba(0,0,0,0.3), 0 0 0 5px ${primary}25`
                                : `0 18px 44px ${primary}30, 0 0 0 5px rgba(255, 255, 255, 0.45)`,
                          }}
                          onPointerDown={isFocusSlot ? handleFocusPointerDown : undefined}
                          onPointerMove={isFocusSlot ? handleFocusPointerMove : undefined}
                          onPointerUp={isFocusSlot ? handleFocusPointerUp : undefined}
                          onPointerCancel={isFocusSlot ? handleFocusPointerUp : undefined}
                        >
                          <img
                            src={item.url}
                            alt=""
                            className="w-full h-full object-cover pointer-events-none"
                            style={{ objectPosition: item.objectPosition ?? "center top" }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
                {heroSlots.length === 0 && heroImage && (
                  <div
                    className={`rounded-xl overflow-hidden flex-shrink-0 ${heroLayoutEffective === "centered" ? (live ? "w-[18.72rem] h-[23.76rem] mx-auto" : "w-40 h-48 mx-auto") : isHeroSplit ? (live ? "w-[17.28rem] h-[22.32rem] self-start" : "w-32 h-40 self-start") : (live ? "w-[20.16rem] h-[25.92rem]" : "w-40 h-52")}`}
                    style={{
                      border: `1px solid ${primary}30`,
                      boxShadow: isDark ? `0 18px 44px rgba(0,0,0,0.3), 0 0 0 5px ${primary}25` : `0 18px 44px ${primary}30, 0 0 0 5px rgba(255, 255, 255, 0.45)`,
                    }}
                  >
                    <img src={heroImage} alt="" className="w-full h-full object-cover object-top" />
                  </div>
                )}
                <div
                  className={
                    isHeroSplit
                      ? live
                        ? "flex-1 min-w-0 text-left pt-16"
                        : "flex-1 min-w-0 basis-0 text-left self-center"
                      : "w-full"
                  }
                >
                  {showDisplayNameOnLanding && (
                    <h1
                      className="font-bold mb-1"
                      style={scaleHeroSplitTextStyle(
                        getTextStyleCSS(textStyles.displayName, {
                          fontSize:
                            live && isHeroSplit
                              ? "3.45rem"
                              : !live && isHeroSplit
                                ? "1.625rem"
                                : heroLayoutEffective === "centered"
                                  ? "1.125rem"
                                  : "1.25rem",
                          color: landingPageText,
                          ...heroTextBase,
                        }),
                        Boolean(textStyles.displayName?.fontSize)
                      )}
                    >
                      {displayName}
                    </h1>
                  )}
                  {heroTagline && (
                    <p
                      className="mb-2"
                      style={scaleHeroSplitTextStyle(
                        getTextStyleCSS(textStyles.heroTagline, {
                          fontSize:
                            live && isHeroSplit ? "1.725rem" : !live && isHeroSplit ? "1rem" : "0.75rem",
                          color: landingPageMuted,
                          ...heroTextBase,
                        }),
                        Boolean(textStyles.heroTagline?.fontSize)
                      )}
                    >
                      {renderTextWithCustomEmoji(heroTagline, sjHeartEmojiCtx)}
                    </p>
                  )}
                  <p
                    className={`mb-2 ${isHeroSplit ? "text-balance md:whitespace-nowrap" : ""}`}
                    style={scaleHeroSplitTextStyle(
                      getTextStyleCSS(textStyles.heroPromise, {
                        fontSize:
                          live && isHeroSplit
                            ? "2.37rem"
                            : !live && isHeroSplit
                              ? "1.125rem"
                              : "0.875rem",
                        color: primary,
                        ...heroTextBase,
                      }),
                      Boolean(textStyles.heroPromise?.fontSize)
                    )}
                  >
                    {renderTextWithCustomEmoji(heroPromise, sjHeartEmojiCtx)}
                  </p>
                  {heroSubline && (
                    <p
                      className={heroSubline2 ? "mb-1" : "mb-3"}
                      style={scaleHeroSplitTextStyle(
                        getTextStyleCSS(textStyles.heroSubline, {
                          fontSize:
                            live && isHeroSplit
                              ? "1.8rem"
                              : !live && isHeroSplit
                                ? "1.0625rem"
                                : "0.8125rem",
                          color: landingPageMutedStrong,
                          ...heroTextBase,
                        }),
                        Boolean(textStyles.heroSubline?.fontSize)
                      )}
                    >
                      {renderTextWithCustomEmoji(heroSubline, sjHeartEmojiCtx)}
                    </p>
                  )}
                  {heroSubline2 && (
                    <p
                      className="mb-3"
                      style={scaleHeroSplitTextStyle(
                        getTextStyleCSS(textStyles.heroSubline2, {
                          fontSize:
                            live && isHeroSplit ? "1.65rem" : !live && isHeroSplit ? "1rem" : "0.75rem",
                          color: landingPageMuted,
                          ...heroTextBase,
                        }),
                        Boolean(textStyles.heroSubline2?.fontSize)
                      )}
                    >
                      {renderTextWithCustomEmoji(heroSubline2, sjHeartEmojiCtx)}
                    </p>
                  )}
                  {!heroSubline && !heroSubline2 && <div className="mb-3" />}
                  {socialLinks.length > 0 && (
                    <div className={`flex gap-2 ${heroLayoutEffective === "split" || heroLayoutEffective === "splitRight" ? "justify-start" : "justify-center"}`}>
                    {socialLinks.map((link) => (
                      <a key={link.key} href={link.url} target="_blank" rel="noopener noreferrer" className="w-7 h-7 rounded-lg flex items-center justify-center transition-transform hover:scale-110" style={getSocialIconStyle(link.key, primary)}>
                        {link.icon}
                      </a>
                    ))}
                  </div>
                  )}
                </div>
              </div>
            )}
            {fullBgItem && (
              <div className={`flex gap-3 pt-14 ${live ? "pl-36" : "pl-28"} pr-4 pb-14`}>
                <div className="flex-1 min-w-0">
                  {showDisplayNameOnLanding && (
                    <h1 className="font-bold mb-0.5" style={getTextStyleCSS(textStyles.displayName, { fontSize: "1.125rem", color: landingPageText, ...heroTextBase })}>{displayName}</h1>
                  )}
                  {heroTagline && (
                    <p className="text-xs mb-0.5" style={getTextStyleCSS(textStyles.heroTagline, { fontSize: "0.75rem", color: landingPageMuted, ...heroTextBase })}>{renderTextWithCustomEmoji(heroTagline, sjHeartEmojiCtx)}</p>
                  )}
                  <p className="text-xs" style={getTextStyleCSS(textStyles.heroPromise, { fontSize: "0.75rem", color: primary, ...heroTextBase })}>{renderTextWithCustomEmoji(heroPromise, sjHeartEmojiCtx)}</p>
                  {heroSubline && (
                    <p className="text-[11px] mt-0.5 mb-0.5" style={getTextStyleCSS(textStyles.heroSubline, { color: landingPageMutedStrong, ...heroTextBase })}>{renderTextWithCustomEmoji(heroSubline, sjHeartEmojiCtx)}</p>
                  )}
                  {heroSubline2 && (
                    <p className="text-[10px] mb-1" style={getTextStyleCSS(textStyles.heroSubline2, { color: landingPageMuted, ...heroTextBase })}>{renderTextWithCustomEmoji(heroSubline2, sjHeartEmojiCtx)}</p>
                  )}
                  {socialLinks.length > 0 && (
                    <div className="flex gap-2 mt-1">
                      {socialLinks.map((link) => (
                        <a key={link.key} href={link.url} target="_blank" rel="noopener noreferrer" className="w-6 h-6 rounded flex items-center justify-center" style={getSocialIconStyle(link.key, primary)}>{link.icon}</a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>
          </section>

          {/* Below hero: one column so cards match builder / fan-landing-feed (not full-bleed). */}
          <div className={`${landingMainMaxClass} px-4 flex flex-col gap-4 ${fullBgItem ? "pt-2 pb-6" : "py-4"}`}>
            <div
              className={`h-px w-full shrink-0 ${fullBgItem ? "mt-4" : ""}`}
              style={{ background: `linear-gradient(90deg, transparent, ${primary}40, transparent)` }}
            />

            <div className="flex flex-col gap-4 min-w-0 w-full">
            {/* Why This Exists — aligns with My Page “Why Subscribe” */}
            <section
              id="perks-section"
              className="storefront-landing-panel perks rounded-2xl p-4 transition-all hover:translate-y-[-2px] flex flex-col min-w-0"
              style={{
                background: landingCardBg,
                border: landingCardBorder,
                boxShadow: isDark || fanDark ? `0 14px 42px rgba(0,0,0,0.2)` : `0 14px 42px ${primary}18`,
              }}
            >
              <LandingCardTitleAccent
                as="h2"
                primary={primary}
                titleStyle={getTextStyleCSS(textStyles.perksTitle, { fontSize: landingCardTitleFs, color: primary, fontFamily: globalFont })}
              >
                {landingContent.perksTitle}
              </LandingCardTitleAccent>
              <p
                className={`leading-relaxed mb-2 ${live ? "text-base" : "text-sm"}`}
                style={getTextStyleCSS(textStyles.perksText, { fontSize: landingCardBodyFs, color: landingPageMutedStrong, fontFamily: globalFont })}
              >
                {landingContent.perksText}
              </p>
              {live?.bio ? (
                <p
                  className={`leading-relaxed mb-2 ${live ? "text-base" : "text-sm"}`}
                  style={getTextStyleCSS(textStyles.bio, { fontSize: landingCardBodyFs, color: landingPageMutedStrong, fontFamily: globalFont })}
                >
                  {live.bio}
                </p>
              ) : null}
              {(() => {
                const perksMode = landingContent.perksExtraMode ?? "bullets";
                const perksParaTrim = String(landingContent.perksParagraph ?? "").trim();
                if (perksMode === "paragraph" && perksParaTrim) {
                  return (
                    <p
                      className={`whitespace-pre-wrap leading-relaxed mb-2 ${live ? "text-base" : "text-sm"}`}
                      style={{ color: landingPageText, fontFamily: globalFont, fontSize: landingCardListFs }}
                    >
                      {landingContent.perksParagraph}
                    </p>
                  );
                }
                const perkItems = (landingContent.perksList ?? [])
                  .filter((item) => String(item).trim())
                  .slice(0, live ? 999 : 3);
                return perkItems.length > 0 ? (
                <ul
                  className={`list-none m-0 p-0 space-y-2.5 ${live ? "text-base" : "text-sm"}`}
                  style={{ color: landingPageText, fontFamily: globalFont, fontSize: landingCardListFs }}
                >
                  {perkItems.map((item, i) =>
                    perksListMarker === "none" ? (
                      <li key={i} className="leading-relaxed">
                        {item}
                      </li>
                    ) : (
                      <li key={i} className="flex items-start gap-2.5">
                        <LandingListMarkerGlyph marker={perksListMarker} color={primary} />
                        <span className="min-w-0 leading-relaxed">{item}</span>
                      </li>
                    )
                  )}
                </ul>
                ) : null;
              })()}
            </section>

            {/* What You Get — Stormij-style: serif title, pink subline, hearts + body list, optional italic footer */}
            <section
              id="preview-section"
              className="storefront-landing-panel preview rounded-2xl p-4 transition-all hover:translate-y-[-2px] flex flex-col min-w-0"
              style={{
                background: landingCardBg,
                border: landingCardBorder,
                boxShadow: isDark || fanDark ? `0 14px 42px rgba(0,0,0,0.2)` : `0 14px 42px ${primary}18`,
              }}
            >
              <LandingCardTitleAccent
                as="h2"
                primary={primary}
                titleStyle={getTextStyleCSS(textStyles.previewTitle, {
                  fontSize: landingCardPreviewSerifTitleFs,
                  fontWeight: 700,
                  color: primary,
                  fontFamily: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
                })}
              >
                {landingContent.previewTitle}
              </LandingCardTitleAccent>
              {landingContent.previewText ? (
                <p
                  className={`leading-snug mb-3 font-semibold ${live ? "text-base" : "text-sm"}`}
                  style={getTextStyleCSS(textStyles.previewText, {
                    fontSize: landingCardPreviewSubFs,
                    fontWeight: 600,
                    color: primary,
                    fontFamily: globalFont,
                  })}
                >
                  {landingContent.previewText}
                </p>
              ) : null}
              {(() => {
                const previewMode = landingContent.previewExtraMode ?? "bullets";
                const previewParaTrim = String(landingContent.previewParagraph ?? "").trim();
                if (previewMode === "paragraph" && previewParaTrim) {
                  return (
                    <p
                      className={`whitespace-pre-wrap leading-relaxed mb-2 ${live ? "text-base" : "text-sm"}`}
                      style={{ color: landingPageText, fontFamily: globalFont, fontSize: landingCardListFs }}
                    >
                      {landingContent.previewParagraph}
                    </p>
                  );
                }
                const previewItems = (landingContent.previewList ?? [])
                  .filter((item) => String(item).trim())
                  .slice(0, live ? 999 : 3);
                return previewItems.length > 0 ? (
                  <ul
                    className={`list-none m-0 p-0 space-y-2.5 ${live ? "text-base" : "text-sm"}`}
                    style={{ color: landingPageText, fontFamily: globalFont, fontSize: landingCardListFs }}
                  >
                    {previewItems.map((item, i) =>
                      previewListMarker === "none" ? (
                        <li key={i} className="leading-relaxed">
                          {item}
                        </li>
                      ) : (
                        <li key={i} className="flex items-start gap-2.5">
                          <LandingListMarkerGlyph marker={previewListMarker} color={primary} />
                          <span className="min-w-0 leading-relaxed">{item}</span>
                        </li>
                      )
                    )}
                  </ul>
                ) : null;
              })()}
              {(() => {
                const footerLines = (landingContent.previewFooterLines ?? [])
                  .map((l) => String(l).trim())
                  .filter(Boolean)
                  .slice(0, live ? 999 : 3);
                if (footerLines.length === 0) return null;
                return (
                  <div className="mt-5 space-y-1.5 pt-1">
                    {footerLines.map((line, i) => (
                      <p
                        key={i}
                        className={`italic m-0 leading-relaxed ${live ? "text-sm" : "text-xs"}`}
                        style={{ color: landingPageMuted, fontFamily: globalFont, fontSize: landingCardPreviewFooterFs }}
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                );
              })()}
            </section>

            {/* The Energy — aligns with builder “The Energy Section” */}
            <section
              id="energy-section"
              className="storefront-landing-panel testimonial rounded-2xl p-4 transition-all hover:translate-y-[-2px] flex flex-col min-w-0"
              style={{
                background: landingCardBg,
                border: landingCardBorder,
                boxShadow: isDark || fanDark ? `0 14px 42px rgba(0,0,0,0.2)` : `0 14px 42px ${primary}18`,
              }}
            >
              <LandingCardTitleAccent
                as="h2"
                primary={primary}
                titleStyle={getTextStyleCSS(textStyles.energyTitle, { fontSize: landingCardTitleFs, color: primary, fontFamily: globalFont })}
              >
                {landingContent.energyTitle}
              </LandingCardTitleAccent>
              {(() => {
                const energyMode = landingContent.energyBodyMode ?? "bullets";
                const energyParaTrim = String(landingContent.energyParagraph ?? "").trim();
                const energyClosingTrim = String(landingContent.energyClosingLine ?? "").trim();
                if (energyMode === "paragraph") {
                  if (!energyParaTrim && !energyClosingTrim) return null;
                  return (
                    <div className="mt-2 space-y-2.5 flex flex-col min-w-0">
                      {energyParaTrim ? (
                        <p
                          className={`whitespace-pre-wrap leading-relaxed m-0 ${live ? "text-base" : "text-sm"}`}
                          style={{ color: landingPageText, fontFamily: globalFont, fontSize: landingCardListFs }}
                        >
                          {landingContent.energyParagraph}
                        </p>
                      ) : null}
                      {energyClosingTrim ? (
                        <p
                          className={`font-bold leading-relaxed m-0 ${live ? "text-base" : "text-sm"}`}
                          style={{ color: primary, fontFamily: globalFont, fontSize: landingCardListFs }}
                        >
                          {energyClosingTrim}
                        </p>
                      ) : null}
                    </div>
                  );
                }
                const rawLines = landingContent.energyLines ?? [];
                const energyLinesForDisplay = (live ? rawLines : rawLines.slice(0, 3))
                  .map((l) => String(l))
                  .filter((line) => line.trim());
                if (energyLinesForDisplay.length === 0 && !energyClosingTrim) return null;
                return (
                  <div className="mt-2 space-y-2.5 flex flex-col min-w-0">
                    {energyLinesForDisplay.map((line, i) =>
                      energyLinesMarker === "none" ? (
                        <p
                          key={i}
                          className={`leading-relaxed m-0 ${live ? "text-base" : "text-sm"}`}
                          style={{ color: landingPageText, fontFamily: globalFont, fontSize: landingCardListFs }}
                        >
                          {line}
                        </p>
                      ) : (
                        <div key={i} className="flex items-start gap-2.5 min-w-0">
                          <LandingListMarkerGlyph marker={energyLinesMarker} color={primary} />
                          <p
                            className={`min-w-0 flex-1 leading-relaxed m-0 ${live ? "text-base" : "text-sm"}`}
                            style={{ color: landingPageText, fontFamily: globalFont, fontSize: landingCardListFs }}
                          >
                            {line}
                          </p>
                        </div>
                      )
                    )}
                    {energyClosingTrim ? (
                      <p
                        className={`font-bold leading-relaxed m-0 ${live ? "text-base" : "text-sm"}`}
                        style={{ color: primary, fontFamily: globalFont, fontSize: landingCardListFs }}
                      >
                        {energyClosingTrim}
                      </p>
                    ) : null}
                  </div>
                );
              })()}
            </section>

            {/* The Boundary / Community guidelines — tier-style list optional; hidden if no intro and no lines */}
            {(boundaryIntroMerged || boundaryLinesFiltered.length > 0) && (
              <section
                id="boundary-section"
                className="storefront-landing-panel faq rounded-2xl p-4 transition-all hover:translate-y-[-2px] flex flex-col min-w-0"
                style={{
                  background: landingCardBg,
                  border: landingCardBorder,
                  boxShadow: isDark || fanDark ? `0 14px 42px rgba(0,0,0,0.2)` : `0 14px 42px ${primary}18`,
                }}
              >
                <LandingCardTitleAccent
                  as="h2"
                  primary={primary}
                  titleStyle={getTextStyleCSS(textStyles.boundaryTitle, { fontSize: landingCardTitleFs, color: primary, fontFamily: globalFont })}
                >
                  {landingContent.boundaryTitle}
                </LandingCardTitleAccent>
                {boundaryIntroMerged ? (
                  <p
                    className={`leading-relaxed m-0 ${live ? "text-base" : "text-sm"} ${boundaryLinesFiltered.length > 0 ? "mb-3" : ""}`}
                    style={getTextStyleCSS(textStyles.boundaryText, { fontSize: landingCardBodyFs, color: landingPageMutedStrong, fontFamily: globalFont })}
                  >
                    {boundaryIntroMerged}
                  </p>
                ) : null}
                {boundaryLinesFiltered.length > 0 ? (
                  <ul
                    className={`list-none m-0 p-0 space-y-2.5 text-left ${live ? "text-base" : "text-sm"}`}
                    style={{ color: landingPageText, fontFamily: globalFont, fontSize: landingCardListFs }}
                  >
                    {(live ? boundaryLinesFiltered : boundaryLinesFiltered.slice(0, 6)).map((item, i) =>
                      boundaryLinesMarker === "none" ? (
                        <li key={i} className="leading-snug">
                          {item}
                        </li>
                      ) : (
                        <li key={i} className="flex items-start gap-2.5">
                          <LandingListMarkerGlyph marker={boundaryLinesMarker} color={primary} />
                          <span className="min-w-0 leading-snug font-normal">{item}</span>
                        </li>
                      )
                    )}
                  </ul>
                ) : null}
              </section>
            )}
          </div>

          {/* Subscribe Card — anchor for “Join now” */}
          <section id="pricing" className="py-4">
            {live?.treatLinkAccountMessage ? (
              <div
                className="rounded-xl px-4 py-3 text-sm mb-4 text-left"
                style={{
                  background: fanDark ? "rgba(99,102,241,0.2)" : `${primary}12`,
                  border: `1px solid ${primary}35`,
                  color: landingPageText,
                }}
                role="status"
              >
                <p className="m-0 mb-2 leading-relaxed">{live.treatLinkAccountMessage}</p>
                {!live.isLoggedIn && live.onTreatLinkSignIn ? (
                  <div className="mt-3 space-y-2">
                    <button
                      type="button"
                      className="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold rounded-lg text-white"
                      style={{ background: `linear-gradient(135deg, ${primary} 0%, ${primary}dd 100%)` }}
                      onClick={live.onTreatLinkSignIn}
                    >
                      Sign in or create account
                    </button>
                    <p className="text-xs m-0 leading-snug" style={{ color: landingPageMuted }}>
                      Use the <strong>same email</strong> you entered at checkout.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="w-full flex flex-col items-center" style={landingPricingBackdrop}>
              <div
                className="rounded-2xl p-8 text-center w-full max-w-[360px] mx-auto"
                style={landingPricingCardChrome}
              >
                <LandingCardTitleAccent
                  as="h3"
                  align="center"
                  primary={primary}
                  titleStyle={{
                    color: primary,
                    fontFamily: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
                    fontSize: "1.25rem",
                    fontWeight: 700,
                  }}
                >
                  {pricingLandingPreview.cardTitle}
                </LandingCardTitleAccent>
                <p
                  className="text-3xl font-bold mb-4 tabular-nums"
                  style={{
                    color: fanDark || isDark ? landingPageText : "#111827",
                    fontFamily: globalFont,
                  }}
                >
                  {pricingLandingPreview.amountDisplay}
                </p>
                <ul className="list-none m-0 p-0 text-sm mb-5 space-y-2.5 text-center" style={{ color: landingPageText, fontFamily: globalFont }}>
                  {pricingLandingPreview.bullets.map((line, i) => (
                    <li key={i} className="flex items-center justify-center gap-2.5 flex-wrap">
                      <span
                        className="shrink-0 w-4 text-center text-base font-light leading-none"
                        style={{ color: primary }}
                        aria-hidden
                      >
                        ✓
                      </span>
                      <span className="leading-snug font-normal">{line}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="w-full py-3.5 rounded-full text-sm font-bold text-white transition-transform hover:scale-[1.01] disabled:opacity-60"
                  style={{
                    background: primary,
                    boxShadow: `0 6px 20px ${primary}55`,
                  }}
                  disabled={live ? live.subscribing || live.joiningFree : false}
                  onClick={
                    live
                      ? () => {
                          if (live.isLoggedIn) {
                            if (live.isFreeAccess) live.onJoinFree?.();
                            else live.onSubscribe();
                          } else if (live.isFreeAccess) live.onOpenSignup();
                          else live.onOpenLogin();
                        }
                      : undefined
                  }
                >
                  {live
                    ? live.subscribing || live.joiningFree
                      ? "Loading…"
                      : live.isLoggedIn
                        ? pricingLandingPreview.ctaLoggedIn
                        : pricingLandingPreview.ctaGuest
                    : pricingLandingPreview.ctaLoggedIn}
                </button>
              </div>
              <p
                className="text-[11px] mt-3 leading-relaxed px-2 text-center sm:px-4 max-w-[360px] w-full mx-auto"
                style={{
                  color: fanDark || isDark ? landingFaint : `${textColor}99`,
                  fontFamily: globalFont,
                }}
              >
                {pricingLandingPreview.trustLine}
              </p>
            </div>
          </section>

          {/* Same as public landing: show treat promo whenever Store is enabled (guest checkout only changes CTA). */}
          {sections.treats !== false && (
              <section className="py-3 storefront-preview-treats-section">
                <div className="rounded-xl p-4 text-center" style={landingPromoCardShell()}>
                  <p className="text-lg m-0 mb-1" aria-hidden>
                    ✨
                  </p>
                  <LandingCardTitleAccent
                    as="h3"
                    align="center"
                    primary={primary}
                    titleStyle={{ color: landingPageText, fontSize: "0.875rem", fontWeight: 600, fontFamily: globalFont }}
                  >
                    {live?.showGuestTreatsCard ? storeCopy.publicStoreCardTitle : storeCopy.storeLandingHeadline}
                  </LandingCardTitleAccent>
                  <p
                    className="text-xs leading-relaxed m-0 mb-3"
                    style={{ color: live?.showGuestTreatsCard ? landingPageMuted : `${landingPageText}aa` }}
                  >
                    {live?.showGuestTreatsCard ? storeCopy.publicStoreCardDescription : storeCopy.storeLandingDescription}
                  </p>
                  <button
                    type="button"
                    className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white ${
                      live ? "" : "cursor-default pointer-events-none"
                    }`}
                    style={{
                      background: `linear-gradient(135deg, ${primary} 0%, ${primary}dd 100%)`,
                      boxShadow: `0 4px 14px ${primary}40`,
                    }}
                    disabled={
                      live
                        ? live.showGuestTreatsCard
                          ? live.landingTreatsLoading
                          : false
                        : true
                    }
                    aria-label={
                      live
                        ? live.showGuestTreatsCard
                          ? "Open store"
                          : "Sign up to access the store"
                        : "Preview: store CTA"
                    }
                    onClick={
                      live
                        ? live.showGuestTreatsCard
                          ? live.onOpenGuestTreats
                          : () => live.onOpenSignup()
                        : undefined
                    }
                  >
                    {live
                      ? live.showGuestTreatsCard
                        ? live.landingTreatsLoading
                          ? storeCopy.memberStoreLoadingMessage
                          : `${storeCopy.publicStoreOpenCtaLabel}${live.landingTreatProductCount ? ` (${live.landingTreatProductCount})` : ""}`
                        : storeCopy.storeLandingCtaLabel
                      : storeCopy.storeLandingCtaLabel}
                  </button>
                </div>
              </section>
            )}

          {/* Tip Section */}
          {(!live || live.tipsEnabled) && (
            <section className="pb-6 pt-2">
              <div className="pt-6 border-t text-center" style={{ borderColor: `${primary}20` }}>
                <LandingCardTitleAccent
                  as="h2"
                  align="center"
                  primary={primary}
                  titleStyle={{ fontSize: "1rem", fontWeight: 600, color: landingPageText, fontFamily: globalFont }}
                >
                  {tipLandingPreview.heading}
                </LandingCardTitleAccent>
                <p className="text-sm mb-4" style={{ color: landingPageMuted }}>{tipLandingPreview.subline}</p>
                {live ? (
                  <div className="mb-4 max-w-md mx-auto">
                    <input
                      type="text"
                      className="w-full text-sm rounded-lg px-3 py-2 mb-3 border"
                      style={{ borderColor: `${primary}30`, color: landingPageText, background: fanDark ? "rgba(255,255,255,0.06)" : undefined }}
                      maxLength={64}
                      placeholder="(optional) Who's showing love?"
                      aria-label="Your name or handle (optional)"
                      value={live.tipHandle}
                      onChange={(e) => live.onTipHandleChange(e.target.value)}
                      disabled={live.tipLoading}
                    />
                  </div>
                ) : null}
                <div className="flex justify-center flex-wrap gap-2 mb-4">
                  {(live ? tipPresetsLive : [3, 5, 10, 20]).map((d) => {
                    const label = live ? `$${d}` : `$${d}`;
                    return (
                      <button
                        key={d}
                        type="button"
                        className="px-5 py-2 rounded-full text-sm font-semibold transition-all hover:scale-[1.03] disabled:opacity-50"
                        style={{ background: `${primary}15`, color: primary, border: `2px solid ${primary}` }}
                        disabled={live ? live.tipLoading : false}
                        onClick={live ? () => live.onTipPresetDollars(d) : undefined}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs mb-2" style={{ color: landingFaint }}>
                  Or enter an amount (USD)
                </p>
                <div className="flex gap-2 max-w-[280px] mx-auto">
                  <div className="flex-1 flex items-center rounded-full border-2 px-3" style={{ borderColor: `${primary}40` }}>
                    <span className="text-sm font-medium" style={{ color: landingFaint }}>
                      $
                    </span>
                    <input
                      type="number"
                      className="flex-1 py-2 px-1 text-sm bg-transparent outline-none"
                      placeholder="e.g. 25"
                      value={live ? live.tipCustomAmount : tipAmount}
                      onChange={(e) =>
                        live ? live.onTipCustomAmountChange(e.target.value) : setTipAmount(e.target.value)
                      }
                      onKeyDown={
                        live
                          ? (e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                live.onTipCustomSubmit();
                              }
                            }
                          : undefined
                      }
                      style={{ color: landingPageText }}
                      disabled={live ? live.tipLoading : false}
                    />
                  </div>
                  <button
                    type="button"
                    className="px-5 py-2 rounded-full text-sm font-semibold text-white transition-all hover:scale-[1.03] disabled:opacity-50"
                    style={{ backgroundColor: primary }}
                    disabled={live ? live.tipLoading : false}
                    onClick={live ? live.onTipCustomSubmit : undefined}
                  >
                    {live && live.tipLoading ? "…" : "Tip"}
                  </button>
                </div>
                {live?.tipError ? (
                  <p className="text-sm mt-2 text-red-500 dark:text-red-400" role="alert">
                    {live.tipError}
                  </p>
                ) : null}
              </div>
            </section>
          )}

          {/* Footer — content width matches `.fan-landing-main` */}
          <footer className="border-t" style={{ borderColor: `${primary}20` }}>
            <div className={`${landingMainMaxClass} mx-auto px-4 py-3 text-center`}>
            <div className="flex justify-center gap-3 text-xs" style={{ color: landingFaint }}>
              <a href={live ? live.termsHref : "#"} className="hover:underline" onClick={live ? undefined : (e) => e.preventDefault()}>
                Terms
              </a>
              <span>·</span>
              <a href={live ? live.privacyHref : "#"} className="hover:underline" onClick={live ? undefined : (e) => e.preventDefault()}>
                Privacy
              </a>
            </div>
            {socialLinks.length > 0 && (
              <div className="flex justify-center gap-2 mt-2">
                {socialLinks.map((link) => (
                  <a
                    key={link.key}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={getSocialIconStyle(link.key, primary)}
                  >
                    {link.icon}
                  </a>
                ))}
              </div>
            )}
            </div>
          </footer>

          {spicyMode && (
            <p className="text-center text-[10px] py-2" style={{ color: primary }}>
              🔒 18+ • Members only content
            </p>
          )}
          </div>
        </div>
      )}

      {previewMode === "member" && (
        <div
          className="flex flex-col flex-1 min-h-0"
          style={{
            backgroundColor: background,
            minHeight: 0,
            "--fan-primary": primary,
            "--fan-accent": primary,
            "--fan-accent-soft": `color-mix(in srgb, ${primary} 14%, transparent)`,
            "--fan-accent-hover": accentHover,
            "--fan-text": textColor,
            "--fan-text-muted": isDark ? `${textColor}99` : "#7c5b68",
            "--fan-bg": background,
          } as React.CSSProperties}
        >
          {/* Member Header — outside scroll so notification dropdown isn’t clipped */}
          <header className="flex items-center justify-between px-4 py-3 flex-shrink-0 gap-2" style={previewHeaderChrome}>
            <div className="flex items-center gap-2 min-h-[56px]">
              <WitmeHeaderLogo color={primary} className="h-8 w-auto max-w-[170px]" />
            </div>
            <nav className="flex items-center gap-1 flex-1 justify-center min-w-0 overflow-x-auto">
              {memberTabs.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition flex-shrink-0"
                  style={{
                    backgroundColor: effectiveTab === key ? `${primary}15` : "transparent",
                    color: effectiveTab === key ? primary : `${textColor}99`,
                    border: effectiveTab === key ? `1px solid ${primary}30` : "1px solid transparent",
                  }}
                >
                  <span className="inline-flex items-center gap-1">
                    {SECTION_LABELS[key] || key}
                    {key === "messages" && unreadMessageTabCount > 0 ? (
                      <span
                        className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none inline-flex items-center justify-center text-white"
                        style={{ backgroundColor: primary }}
                        aria-label={`${unreadMessageTabCount} unread messages`}
                      >
                        {unreadMessageTabCount > 9 ? "9+" : unreadMessageTabCount}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </nav>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <FanHubNotificationBell
                accentColor={primary}
                iconColor={`${textColor}99`}
                compact
                className="storefront-preview-notify-bell"
                onNavigate={handlePreviewNotificationNavigate}
              />
              {/* Profile avatar button */}
              <button
                type="button"
                className="rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  width: "32px",
                  height: "32px",
                  background: `linear-gradient(135deg, ${primary}20 0%, ${primary}40 100%)`,
                  border: `2px solid ${primary}30`,
                }}
                title="Profile menu"
              >
                {avatar ? (
                  <img src={avatar} alt="" className="w-full h-full rounded-full object-cover" style={avatarCropStyle} />
                ) : (
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: primary }}>
                    {(displayName || "?")[0].toUpperCase()}
                  </span>
                )}
              </button>
            </div>
          </header>
          
          {/* Content Area — matches FanStorefrontView .fan-member-content + fan-landing-feed.css */}
          <div className="flex-1 min-h-0 overflow-auto">
          <div className="fan-member-content" style={{ maxWidth: "min(480px, 100%)" }}>
            {(effectiveTab === "home" || effectiveTab === "feed") && (
              <div className="space-y-4">
                {/* Member feed header — same chrome classes as Fan Hub (stormij-fanhub.css) */}
                <div className="fan-hub-feed-chrome -mx-1 mb-1">
                  <div className="feed-header-wrap">
                    <div className="feed-header">
                      <button
                        type="button"
                        className="feed-view-toggle"
                        title="Grid view"
                        aria-label="Grid view"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="7" height="7" rx="1" />
                          <rect x="14" y="3" width="7" height="7" rx="1" />
                          <rect x="3" y="14" width="7" height="7" rx="1" />
                          <rect x="14" y="14" width="7" height="7" rx="1" />
                        </svg>
                      </button>
                      <div className="feed-header-right">
                        <button
                          type="button"
                          onClick={() => setActiveTab("saved")}
                          className="feed-saved-link"
                        >
                          Saved Posts (0)
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Sample Feed Post - same order as real feed: header > media > actions > body */}
                <article className={`feed-card${isDark ? " storefront-preview-feed-card--dark" : ""}`}>
                  <div className="feed-card-header">
                    <div className="feed-card-avatar">
                      {avatar ? (
                        <img
                          src={avatar}
                          alt=""
                          className="feed-card-avatar-img"
                          style={{ objectFit: "contain", objectPosition: "center" }}
                        />
                      ) : (
                        <span className="feed-card-avatar-initial">{(displayName || "?")[0].toUpperCase()}</span>
                      )}
                    </div>
                    <div className="feed-card-creator">
                      <span className="feed-card-username">{displayName}</span>
                    </div>
                    <span className="feed-card-time">31 mins</span>
                  </div>

                  <div className="feed-card-media-wrap">
                    <img
                      src="https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&h=700&fit=crop&crop=face"
                      alt="Demo post"
                      className="feed-card-media"
                      style={{ objectFit: "cover" }}
                    />
                  </div>

                  <div className="feed-card-actions">
                    <button type="button" className="feed-card-action-link">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                      <span className="feed-card-action-count">42</span>
                    </button>
                    <button type="button" className="feed-card-action-link">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <span className="feed-card-action-count">2</span>
                    </button>
                    <button type="button" className="feed-card-send-tip">
                      <span className="tip-currency">$</span>
                      <span>SEND TIP</span>
                    </button>
                    <button type="button" className="feed-card-action-btn bookmark-btn" title="Save post">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </svg>
                    </button>
                  </div>

                  <div className="feed-card-body">
                    <p className="m-0">
                      <span style={{ fontWeight: 600, color: primary, marginRight: "0.35rem" }}>{displayName}</span>
                      Good morning everyone 🌸
                    </p>
                    <button
                      type="button"
                      className="mt-2 fan-feed-view-comments-link"
                      style={{ color: isDark ? `${textColor}99` : undefined }}
                    >
                      View all 2 comments
                    </button>
                    <div className="mt-1.5">
                      <p className="m-0">
                        <span style={{ fontWeight: 600, marginRight: "0.35rem" }}>sarah_m</span>
                        Love this! ☕
                      </p>
                      <p className="m-0 mt-1">
                        <span style={{ fontWeight: 600, marginRight: "0.35rem" }}>jules_k</span>
                        This made my morning 💗
                      </p>
                    </div>
                    <button
                      type="button"
                      className="mt-2 fan-feed-view-post-link"
                      style={{ color: isDark ? `${textColor}cc` : undefined }}
                    >
                      View post
                    </button>
                  </div>
                </article>
                
                <p className="text-center text-xs" style={{ color: `${textColor}66` }}>
                  Preview — actual feed will show real posts
                </p>
              </div>
            )}

            {effectiveTab === "saved" && (
              <div
                className="rounded-xl border p-6 text-center"
                style={{
                  borderColor: `${primary}20`,
                  background: `${primary}06`,
                  color: `${textColor}99`,
                  fontSize: "0.9rem",
                }}
              >
                <p className="font-medium" style={{ color: textColor }}>Saved</p>
                <p className="mt-1">Posts you bookmark will appear here.</p>
              </div>
            )}
            {effectiveTab === "treats" && (
              <div
                style={{
                  background: cardBg,
                  padding: "1.5rem 1rem",
                  borderRadius: "16px",
                }}
              >
                <div className="text-center" style={{ marginBottom: "1.25rem" }}>
                  <h2
                    className="font-semibold italic"
                    style={{
                      fontSize: "clamp(1.5rem, 4vw, 1.8rem)",
                      color: textColor,
                      fontFamily: globalFont,
                      margin: "0 0 0.35rem",
                    }}
                  >
                    {storeCopy.memberStoreTitle}
                  </h2>
                  <p style={{ fontSize: "0.9rem", color: `${textColor}77`, margin: 0 }}>
                    {storeCopy.memberStoreSubtitle}
                  </p>
                </div>

                {/* Same card chrome as live Fan Hub — styles/fan-landing-feed.css */}
                <div className="fan-member-treats">
                  <div className="fan-member-treats-grid">
                    {[
                      { typeLabel: "voice note", title: "30-Second Voice Note", price: 25, desc: "I'll say your name. Keep it short.", left: 10 },
                      { typeLabel: "voice note", title: "60-Second Voice Note", price: 45, desc: "More direct. Slightly longer.", left: 8 },
                      { typeLabel: "video reply", title: "Private Video Reply", price: 35, desc: "Ask me something. I'll respond.", left: 12 },
                      { typeLabel: "custom", title: "Birthday Message", price: 50, desc: "Custom video. Don't make it weird.", left: 6 },
                    ].map((treat, i) => (
                      <div key={i} className="fan-member-treat-card">
                        <p className="fan-member-treat-type">{treat.typeLabel}</p>
                        <h3 className="fan-member-treat-title">{treat.title}</h3>
                        <p className="fan-member-treat-desc">{treat.desc}</p>
                        <p className="fan-member-treat-price">
                          ${treat.price}
                          <span style={{ fontSize: "0.75rem", verticalAlign: "super", marginLeft: "0.1rem" }} aria-hidden>
                            ♡
                          </span>
                        </p>
                        <div className="fan-member-treat-action">
                          <span style={{ fontSize: "0.85rem", color: "var(--fan-text-muted)" }}>{treat.left} left</span>
                          <button type="button" className="fan-member-treat-buy">
                            Purchase
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-center" style={{ fontSize: "0.75rem", color: `${textColor}55`, marginTop: "1rem" }}>
                  Preview — products are managed in Fan Hub → Store
                </p>
              </div>
            )}
            
            {effectiveTab === "tip" && (
              <div 
                className="rounded-2xl overflow-hidden"
                style={{ 
                  background: cardBg,
                  border: `1px solid ${isDark ? `${primary}30` : `${primary}15`}`,
                  boxShadow: isDark ? `0 14px 42px rgba(0,0,0,0.2)` : `0 14px 42px ${primary}12`,
                }}
              >
                {/* Tip Hero */}
                <div 
                  className="text-center relative overflow-hidden"
                  style={{ 
                    padding: "2.5rem 1.5rem",
                    background: `linear-gradient(135deg, ${primary}15 0%, ${primary}20 50%, ${primary}12 100%)`,
                  }}
                >
                  <h2 
                    className="font-semibold italic"
                    style={{ 
                      fontSize: "clamp(1.5rem, 4vw, 1.8rem)", 
                      color: primary, 
                      fontFamily: globalFont,
                      margin: "0 0 0.35rem",
                    }}
                  >
                    {tipMemberPreview.heading}
                  </h2>
                  <p style={{ fontSize: "0.95rem", color: `${textColor}88`, margin: 0 }}>
                    {tipMemberPreview.subline}
                  </p>
                </div>
                
                {/* Tip Amounts */}
                <div style={{ padding: "1.5rem 1.25rem 1rem" }}>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: textColor, margin: "0 0 0.85rem" }}>
                    Choose an amount
                  </h3>
                  <div className="flex flex-wrap gap-2" style={{ marginBottom: "1rem" }}>
                    {[5, 10, 25, 50, 100, 250].map((dollars) => (
                      <button
                        key={dollars}
                        type="button"
                        style={{ 
                          padding: "0.5rem 1rem", 
                          fontSize: "0.9rem", 
                          fontWeight: 500, 
                          color: `${textColor}99`,
                          background: surfaceBg,
                          border: `1px solid ${isDark ? `${primary}30` : `${primary}25`}`,
                          borderRadius: "10px",
                          cursor: "pointer",
                        }}
                      >
                        ${dollars}
                      </button>
                    ))}
                  </div>
                  
                  {/* Custom Amount */}
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: textColor, marginBottom: "0.3rem" }}>
                      Or enter custom amount ($)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 15"
                      style={{ 
                        width: "100%",
                        maxWidth: "130px",
                        padding: "0.5rem 0.65rem", 
                        border: `1px solid ${isDark ? `${primary}30` : `${primary}20`}`,
                        borderRadius: "8px",
                        fontSize: "0.9rem",
                        background: surfaceBg,
                        color: textColor,
                      }}
                    />
                  </div>
                  
                  {/* CTA Button */}
                  <button
                    type="button"
                    style={{ 
                      width: "100%",
                      padding: "0.75rem 1.25rem", 
                      fontSize: "1rem", 
                      fontWeight: 600, 
                      color: "#fff",
                      background: primary,
                      border: "none",
                      borderRadius: "10px",
                      cursor: "pointer",
                    }}
                  >
                    Tip $0.00
                  </button>
                </div>
                
                {/* Footer */}
                <div 
                  className="flex items-center justify-center gap-3"
                  style={{ padding: "1rem 1.25rem 1.5rem" }}
                >
                  <span style={{ fontSize: "0.95rem", fontWeight: 600, color: textColor }}>Thank You!</span>
                  {avatar ? (
                    <img 
                      src={avatar} 
                      alt="" 
                      style={{ 
                        width: "40px", 
                        height: "40px", 
                        borderRadius: "50%", 
                        objectFit: "cover",
                        border: `2px solid ${primary}30`,
                        ...avatarCropStyle,
                      }} 
                    />
                  ) : (
                    <div 
                      style={{ 
                        width: "40px", 
                        height: "40px", 
                        borderRadius: "50%",
                        background: `linear-gradient(135deg, ${primary}30 0%, ${primary}50 100%)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: `2px solid ${primary}30`,
                      }}
                    >
                      <span style={{ fontSize: "1rem", fontWeight: 600, color: primary }}>
                        {(displayName || "?")[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {effectiveTab === "messages" && (
              <div className="fan-member-messages">
                <p className="fan-member-messages-title">Conversation with {displayName}</p>
                <div className="fan-member-messages-list">
                  <div className="fan-member-message fan-member-message-received">
                    <div className="fh-dm-chat-row fh-dm-chat-row--in">
                      <div className="fh-dm-bubble-wrap fh-dm-bubble-wrap--in">
                        <div className="fh-dm-bubble fh-dm-bubble--them">
                          <div className="fh-dm-bubble__head">{creatorHandleLabel}</div>
                          <div className="fh-dm-bubble__body">
                            Hey! Thanks for being here — this is how DMs look for fans.
                          </div>
                        </div>
                        <div className="fh-dm-meta-below">2:31 PM</div>
                      </div>
                    </div>
                  </div>
                  <div className="fan-member-message fan-member-message-sent">
                    <div className="fh-dm-chat-row fh-dm-chat-row--out">
                      <div className="fh-dm-bubble-wrap fh-dm-bubble-wrap--out">
                        <div className="fh-dm-bubble fh-dm-bubble--me">
                          <div className="fh-dm-bubble__head">{fanUsernameLabel}</div>
                          <div className="fh-dm-bubble__body">Love the new drop! 🔥</div>
                        </div>
                        <div className="fh-dm-meta-below">2:32 PM</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="fan-member-messages-compose">
                  <textarea
                    readOnly
                    rows={2}
                    className="fan-member-messages-input"
                    placeholder="Type a message… (Shift+Enter for newline)"
                    defaultValue=""
                  />
                  <button type="button" className="fan-member-messages-send" style={{ backgroundColor: primary }}>
                    Send
                  </button>
                </div>
                <p className="text-center text-[11px] mt-2" style={{ color: "var(--fan-text-muted)" }}>
                  Preview — live thread loads for subscribed fans.
                </p>
              </div>
            )}
            {effectiveTab === "about" && (
              <div className="space-y-4">
                <h2 className="text-base font-semibold" style={{ color: textColor }}>About {displayName}</h2>
                {bio ? (
                  <div className="rounded-xl p-4" style={{ background: cardBg, border: `1px solid ${isDark ? `${primary}30` : `${primary}18`}` }}>
                    <p className="text-sm leading-relaxed" style={{ color: textColor }}>{bio}</p>
                  </div>
                ) : null}
                {(boundaryIntroMerged || boundaryLinesFiltered.length > 0) ? (
                  <div className="rounded-xl p-4" style={{ background: cardBg, border: `1px solid ${isDark ? `${primary}30` : `${primary}18`}` }}>
                    <h3 className="text-xs font-semibold mb-1.5" style={{ color: primary }}>{landingContent.boundaryTitle}</h3>
                    {boundaryIntroMerged ? (
                      <p className="text-sm leading-relaxed" style={{ color: `${textColor}cc` }}>{boundaryIntroMerged}</p>
                    ) : null}
                    {boundaryLinesFiltered.length > 0 ? (
                      <ul className="list-none m-0 mt-2 p-0 space-y-1.5 text-sm">
                        {boundaryLinesFiltered.map((line, i) =>
                          boundaryLinesMarker === "none" ? (
                            <li key={i} style={{ color: `${textColor}cc` }}>{line}</li>
                          ) : (
                            <li key={i} className="flex gap-2 items-start" style={{ color: `${textColor}cc` }}>
                              <LandingListMarkerGlyph marker={boundaryLinesMarker} color={primary} />
                              <span className="min-w-0">{line}</span>
                            </li>
                          )
                        )}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                {!bio && !boundaryIntroMerged && boundaryLinesFiltered.length === 0 && (
                  <p className="text-sm" style={{ color: `${textColor}99` }}>No about or guidelines added yet.</p>
                )}
              </div>
            )}
          </div>
          </div>
        </div>
      )}
    </div>
  );
};
