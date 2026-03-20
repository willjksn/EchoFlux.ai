"use client";

import React, { useState, useEffect } from "react";
import { auth } from "../firebaseConfig";
import type { StorefrontSocialLinks, StorefrontLandingContent, StorefrontLegal, TextStyle } from "../types";

// Sun/Moon icons for theme toggle
const SunIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const MoonIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
  </svg>
);

// Font size mapping for text styles
const FONT_SIZE_MAP: Record<NonNullable<TextStyle['fontSize']>, string> = {
  'xs': '0.75rem',
  'sm': '0.875rem',
  'base': '1rem',
  'lg': '1.125rem',
  'xl': '1.25rem',
  '2xl': '1.5rem',
  '3xl': '1.875rem',
};

// Helper to generate inline styles from TextStyle
function getTextStyleCSS(style?: TextStyle, defaults?: { fontSize?: string; color?: string; fontFamily?: string }): React.CSSProperties {
  return {
    fontSize: style?.fontSize ? FONT_SIZE_MAP[style.fontSize] : defaults?.fontSize,
    color: style?.color || defaults?.color,
    fontFamily: style?.fontFamily || defaults?.fontFamily,
  };
}

const TIP_PRESET_AMOUNTS = [3, 5, 10, 20];

// Neutral default landing content - creators should customize
const DEFAULT_LANDING_CONTENT: StorefrontLandingContent = {
  perksTitle: "Why Join",
  perksText: "A space for exclusive content and real connection with my community.",
  perksList: [
    "Exclusive behind-the-scenes content",
    "Direct messages and personal connection",
    "Early access to new releases",
    "Special treats and surprises",
  ],
  previewTitle: "What You Get",
  previewText: "As a member, you get access to content I can only share here.",
  previewList: [
    "Daily posts and updates",
    "Exclusive photos and videos",
    "Personal messages",
    "Live sessions and Q&As",
  ],
  energyTitle: "The Vibe",
  energyLines: [
    "Authentic and real.",
    "Genuine connection.",
    "A supportive community.",
  ],
  boundaryTitle: "Community Guidelines",
  boundaryText: "This is a supportive space. Respect is everything. No negativity, no demands — just genuine connection.",
};

// Social icons
const InstagramIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
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

// Get visible social links
// Globe icon for custom social links
const GlobeIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

function getVisibleSocialLinks(socialLinks?: StorefrontSocialLinks) {
  if (!socialLinks) return [];
  const links: { key: string; url: string; icon: React.ReactNode; name?: string }[] = [];
  
  if (socialLinks.instagram?.show && socialLinks.instagram.url) {
    links.push({ key: "instagram", url: socialLinks.instagram.url, icon: <InstagramIcon /> });
  }
  if (socialLinks.x?.show && socialLinks.x.url) {
    links.push({ key: "x", url: socialLinks.x.url, icon: <XIcon /> });
  }
  if (socialLinks.tiktok?.show && socialLinks.tiktok.url) {
    links.push({ key: "tiktok", url: socialLinks.tiktok.url, icon: <TikTokIcon /> });
  }
  if (socialLinks.youtube?.show && socialLinks.youtube.url) {
    links.push({ key: "youtube", url: socialLinks.youtube.url, icon: <YouTubeIcon /> });
  }
  if (socialLinks.facebook?.show && socialLinks.facebook.url) {
    links.push({ key: "facebook", url: socialLinks.facebook.url, icon: <FacebookIcon /> });
  }
  
  // Add custom social links
  if (socialLinks.custom && Array.isArray(socialLinks.custom)) {
    socialLinks.custom.forEach((custom, index) => {
      if (custom.show && custom.url) {
        links.push({ 
          key: `custom-${index}`, 
          url: custom.url, 
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
        boxShadow: "0 6px 14px rgba(0,0,0,0.18)",
      };
    case "tiktok":
      return {
        color: "#ffffff",
        background: "#0f0f10",
        border: "1px solid rgba(255,255,255,0.28)",
        boxShadow: "0 6px 14px rgba(0,0,0,0.22)",
      };
    case "x":
      return {
        color: "#ffffff",
        background: "#000000",
        border: "1px solid rgba(255,255,255,0.35)",
        boxShadow: "0 6px 14px rgba(0,0,0,0.32)",
      };
    case "facebook":
      return {
        color: "#ffffff",
        background: "#1877f2",
        border: "1px solid rgba(255,255,255,0.35)",
        boxShadow: "0 6px 14px rgba(24,119,242,0.28)",
      };
    case "youtube":
      return {
        color: "#ffffff",
        background: "#ff0000",
        border: "1px solid rgba(255,255,255,0.35)",
        boxShadow: "0 6px 14px rgba(255,0,0,0.28)",
      };
    default:
      return {
        color: "#ffffff",
        background: fallback,
        border: "1px solid rgba(255,255,255,0.3)",
        boxShadow: "0 6px 14px rgba(0,0,0,0.18)",
      };
  }
}

interface FanLandingPageProps {
  creator: {
    creatorId: string;
    displayName: string;
    handle: string;
    avatar?: string;
    /** CSS object-position inside circular hero avatar (full-background layout). */
    avatarObjectPosition?: string;
    logo?: string;
    bio?: string;
    showDisplayNameOnLanding?: boolean;
    heroImage?: string;
    heroMedia?: {
      url: string;
      size?: "small" | "medium" | "large" | "fullBackground";
      backgroundPosition?: string;
      objectPosition?: string;
      landingAvatarLeft?: string;
      landingAvatarBottom?: string;
    }[];
    heroTagline?: string;
    heroPromise?: string;
    heroSubline?: string;
    socialLinks?: StorefrontSocialLinks;
    landingContent?: StorefrontLandingContent;
    legal?: StorefrontLegal;
    theme: { primary: string; background: string; text?: string; fontFamily?: string };
    heroLayout?: "default" | "centered" | "split" | "splitRight";
    monetization?: { monthlyPrice?: number; tipsEnabled?: boolean };
    spicyMode?: boolean;
    rules?: { boundariesText?: string };
    textStyles?: {
      displayName?: TextStyle;
      bio?: TextStyle;
      heroTagline?: TextStyle;
      heroPromise?: TextStyle;
      heroSubline?: TextStyle;
      perksTitle?: TextStyle;
      perksText?: TextStyle;
      previewTitle?: TextStyle;
      previewText?: TextStyle;
      energyTitle?: TextStyle;
      boundaryTitle?: TextStyle;
      boundaryText?: TextStyle;
    };
  };
  onSubscribe: () => void;
  onJoinFree?: () => void;
  onLogin: () => void;
  subscribing: boolean;
  joiningFree?: boolean;
  isLoggedIn: boolean;
}

export const FanLandingPage: React.FC<FanLandingPageProps> = ({
  creator,
  onSubscribe,
  onJoinFree,
  onLogin,
  subscribing,
  joiningFree = false,
  isLoggedIn,
}) => {
  const { 
    displayName, 
    avatar,
    avatarObjectPosition,
    logo,
    bio, 
    theme, 
    showDisplayNameOnLanding,
    heroImage,
    heroMedia: creatorHeroMedia,
    heroTagline,
    heroPromise,
    heroSubline,
    socialLinks,
    landingContent: creatorLandingContent,
    legal,
    monetization,
    spicyMode,
    rules,
    textStyles,
  } = creator;

  const heroMedia = (creatorHeroMedia && creatorHeroMedia.length > 0)
    ? creatorHeroMedia
    : (heroImage ? [{ url: heroImage, size: "medium" as const }] : []);
  const fullBgItem = heroMedia.find((m) => m.size === "fullBackground");
  const heroImages = heroMedia.filter((m) => m.size !== "fullBackground");
  const primaryImage = heroImages[0]?.url ?? heroImage;
  
  const primary = theme?.primary || "#6366f1";
  const background = theme?.background || "#fafafa";
  const textColor = theme?.text || "#1f2937";
  const ts = textStyles ?? {};
  
  const landingContent = { ...DEFAULT_LANDING_CONTENT, ...creatorLandingContent };
  const visibleSocialLinks = getVisibleSocialLinks(socialLinks);
  const monthlyPrice = ((monetization?.monthlyPrice ?? 999) / 100).toFixed(2);
  const boundariesText = rules?.boundariesText || landingContent.boundaryText || "";
  const isFreeAccess = monetization?.freeAccessEnabled === true;

  const [tipLoading, setTipLoading] = useState(false);
  const [tipError, setTipError] = useState("");
  const [tipHandle, setTipHandle] = useState("");
  const [tipCustomAmount, setTipCustomAmount] = useState("");
  
  // Dark mode state - persisted in localStorage per creator page
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`fan-dark-mode-${creator.creatorId}`);
      if (stored !== null) return stored === 'true';
      // Default to system preference
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  
  const toggleDarkMode = () => {
    setIsDarkMode(prev => {
      const newValue = !prev;
      localStorage.setItem(`fan-dark-mode-${creator.creatorId}`, String(newValue));
      return newValue;
    });
  };

  useEffect(() => {
    const resetTipUi = () => {
      setTipLoading(false);
      setTipError("");
    };
    window.addEventListener("pageshow", resetTipUi);
    return () => window.removeEventListener("pageshow", resetTipUi);
  }, []);

  const startTip = async (amountCents: number) => {
    if (!amountCents || amountCents < 100 || amountCents > 100000 || tipLoading) return;
    setTipError("");
    setTipLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const base = window.location.origin;
      const res = await fetch("/api/createFanCheckoutSession", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          creatorId: creator.creatorId,
          type: "tip",
          amountCents,
          tipHandle: tipHandle.trim() || undefined,
          successUrl: `${base}${window.location.pathname}?tip=success`,
          cancelUrl: `${base}${window.location.pathname}`,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setTipError(data.error || "Could not start checkout.");
    } catch {
      setTipError("Could not start checkout. Try again.");
    } finally {
      setTipLoading(false);
    }
  };

  const onCustomTip = () => {
    const val = Number.parseFloat(tipCustomAmount || "");
    if (!Number.isFinite(val) || val < 1 || val > 1000) {
      setTipError("Enter an amount between $1 and $1000.");
      return;
    }
    startTip(Math.round(val * 100));
  };

  // CSS variables for theme - adjust for dark mode
  const darkBg = "#0f0f0f";
  const darkText = "#f5f5f5";
  const darkSectionBg = "rgba(30, 30, 30, 0.95)";
  
  const effectiveBg = isDarkMode ? darkBg : background;
  const effectiveText = isDarkMode ? darkText : textColor;
  
  const themeVars = {
    "--fan-primary": primary,
    "--fan-bg": effectiveBg,
    "--fan-text": effectiveText,
    "--fan-accent": primary,
  } as React.CSSProperties;

  const heroLayout = creator.heroLayout ?? "default";
  const globalFont = theme?.fontFamily || "Inter, sans-serif";

  return (
    <div 
      className={`fan-landing-page fan-landing-hero-${heroLayout} ${isDarkMode ? 'fan-dark-mode' : ''}`}
      style={{ 
        ...themeVars,
        fontFamily: globalFont,
        background: isDarkMode 
          ? `linear-gradient(135deg, ${darkBg} 0%, #1a1a1a 50%, ${darkBg} 100%)`
          : `linear-gradient(135deg, ${background} 0%, #fff 50%, ${background} 100%)`,
        color: effectiveText,
      }}
    >
      {/* Header */}
      <header className="fan-landing-header" style={{ borderColor: `${primary}20`, backgroundColor: isDarkMode ? 'rgba(20, 20, 20, 0.95)' : undefined }}>
        <a href="/" className="fan-landing-logo">
          {logo ? (
            <img src={logo} alt={displayName || ""} className="fan-landing-logo-img fan-landing-logo-custom" />
          ) : avatar ? (
            <img
              src={avatar}
              alt=""
              className="fan-landing-logo-img"
              style={{ objectPosition: avatarObjectPosition ?? "center" }}
            />
          ) : (
            <span className="fan-landing-logo-text" style={{ backgroundColor: `${primary}20`, color: primary }}>
              {displayName?.charAt(0) || "?"}
            </span>
          )}
          {!logo && <span className="fan-landing-logo-label" style={{ color: effectiveText }}>{displayName || "My Page"}</span>}
        </a>
        <nav className="fan-landing-nav">
          {/* Dark mode toggle */}
          <button 
            type="button" 
            onClick={toggleDarkMode}
            className="fan-landing-theme-toggle"
            style={{ color: effectiveText }}
            aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDarkMode ? <SunIcon /> : <MoonIcon />}
          </button>
          {!isLoggedIn && (
            <>
              <button type="button" className="fan-landing-nav-link" onClick={onLogin} style={{ color: primary }}>
                Sign up
              </button>
              <button type="button" className="fan-landing-nav-btn" onClick={onLogin} style={{ color: primary }}>
                Log in
              </button>
            </>
          )}
          {isLoggedIn && (
            <button 
              type="button" 
              className="fan-landing-nav-btn" 
              onClick={isFreeAccess ? onJoinFree : onSubscribe} 
              disabled={subscribing || joiningFree}
              style={{ backgroundColor: primary, color: "#fff" }}
            >
              {subscribing || joiningFree ? "Loading..." : isFreeAccess ? "Join Free" : "Subscribe"}
            </button>
          )}
        </nav>
      </header>

      <main className="fan-landing-main">
        {/* Hero Section — layout: default (stack) | centered | split | splitRight; supports heroMedia + fullBackground */}
        <section
          className={`fan-landing-hero fan-landing-hero--${heroLayout}${fullBgItem ? " fan-landing-hero--has-bg fan-landing-hero--bg-avatar-only" : ""}`}
          style={
            fullBgItem
              ? {
                  backgroundImage: `url(${fullBgItem.url})`,
                  backgroundSize: "cover",
                  backgroundPosition: fullBgItem.backgroundPosition ?? "center",
                }
              : undefined
          }
        >
          {fullBgItem && <div className="fan-landing-hero-bg-overlay" aria-hidden />}
          {fullBgItem && (
            <div
              className="fan-landing-hero-avatar-overlay"
              style={{
                borderColor: "rgba(255,255,255,0.9)",
                ...(fullBgItem.landingAvatarLeft != null && fullBgItem.landingAvatarLeft !== ""
                  ? { left: fullBgItem.landingAvatarLeft }
                  : {}),
                ...(fullBgItem.landingAvatarBottom != null && fullBgItem.landingAvatarBottom !== ""
                  ? { bottom: fullBgItem.landingAvatarBottom }
                  : {}),
              }}
            >
            {avatar ? (
              <img
                src={avatar}
                alt=""
                className="fan-landing-hero-avatar-img"
                style={{ objectPosition: avatarObjectPosition ?? "center" }}
              />
            ) : (
              <span className="fan-landing-hero-avatar-fallback" style={{ backgroundColor: `${primary}40`, color: primary }}>
                {(displayName || "?")[0].toUpperCase()}
              </span>
            )}
          </div>
          )}
          {!fullBgItem && heroImages.length > 0 && (
            <div className={`fan-landing-hero-images fan-landing-hero-images--count-${Math.min(heroImages.length, 6)}`}>
              {heroImages.slice(0, 6).map((item, i) => {
                const sizeClass =
                  item.size === "small"
                    ? "fan-landing-hero-image-wrap fan-landing-hero-image--small"
                    : item.size === "large"
                      ? "fan-landing-hero-image-wrap fan-landing-hero-image--large"
                      : "fan-landing-hero-image-wrap";
                return (
                  <div key={`${item.url}-${i}`} className={sizeClass} style={{ border: `1px solid ${primary}30`, boxShadow: `0 18px 44px ${primary}30, 0 0 0 5px rgba(255, 255, 255, 0.45)` }}>
                    <img
                      src={item.url}
                      alt=""
                      className="fan-landing-hero-image"
                      style={item.objectPosition ? { objectPosition: item.objectPosition } : undefined}
                    />
                  </div>
                );
              })}
            </div>
          )}
          {!fullBgItem && heroImages.length === 0 && primaryImage && (
            <div className="fan-landing-hero-image-wrap" style={{ border: `1px solid ${primary}30`, boxShadow: `0 18px 44px ${primary}30, 0 0 0 5px rgba(255, 255, 255, 0.45)` }}>
              <img
                src={primaryImage}
                alt=""
                className="fan-landing-hero-image"
                style={
                  heroImages[0]?.objectPosition
                    ? { objectPosition: heroImages[0].objectPosition }
                    : undefined
                }
              />
            </div>
          )}
          {!fullBgItem && (
            <div className="fan-landing-hero-text">
              {showDisplayNameOnLanding !== false && (
                <h1 className="fan-landing-hero-name" style={getTextStyleCSS(ts.displayName, { color: primary })}>{displayName || "Not For Everyone"}</h1>
              )}
              {heroTagline && <p className="fan-landing-hero-tagline" style={getTextStyleCSS(ts.heroTagline, { color: `${textColor}99` })}>{heroTagline}</p>}
              <p className="fan-landing-hero-promise" style={getTextStyleCSS(ts.heroPromise, { color: primary })}>{heroPromise || "Your access to the real me"}</p>
              {heroSubline && <p className="fan-landing-hero-subline" style={getTextStyleCSS(ts.heroSubline, { color: `${textColor}cc` })}>{heroSubline}</p>}
              {visibleSocialLinks.length > 0 && (
                <div className="fan-landing-social-links">
                  {visibleSocialLinks.map((link) => (
                    <a key={link.key} href={link.url} target="_blank" rel="noopener noreferrer" className="fan-landing-social-link" style={getSocialIconStyle(link.key, primary)}>
                      {link.icon}
                    </a>
                  ))}
                </div>
              )}
              <p className="fan-landing-hero-handle" style={{ color: `${textColor}66` }}>@{creator.handle}</p>
            </div>
          )}
        </section>
        {fullBgItem && (
          <section className="fan-landing-hero-meta">
            <div className="fan-landing-hero-meta-spacer" aria-hidden />
            <div className="fan-landing-hero-text">
              {showDisplayNameOnLanding !== false && (
                <h1 className="fan-landing-hero-name" style={getTextStyleCSS(ts.displayName, { color: primary })}>{displayName || "Not For Everyone"}</h1>
              )}
              {heroTagline && <p className="fan-landing-hero-tagline" style={getTextStyleCSS(ts.heroTagline, { color: `${textColor}99` })}>{heroTagline}</p>}
              <p className="fan-landing-hero-promise" style={getTextStyleCSS(ts.heroPromise, { color: primary })}>{heroPromise || "Your access to the real me"}</p>
              {heroSubline && <p className="fan-landing-hero-subline" style={getTextStyleCSS(ts.heroSubline, { color: `${textColor}cc` })}>{heroSubline}</p>}
              {visibleSocialLinks.length > 0 && (
                <div className="fan-landing-social-links">
                  {visibleSocialLinks.map((link) => (
                    <a key={link.key} href={link.url} target="_blank" rel="noopener noreferrer" className="fan-landing-social-link" style={getSocialIconStyle(link.key, primary)}>
                      {link.icon}
                    </a>
                  ))}
                </div>
              )}
              <p className="fan-landing-hero-handle" style={{ color: `${textColor}66` }}>@{creator.handle}</p>
            </div>
          </section>
        )}

        <div
          className={`fan-landing-divider${fullBgItem ? " fan-landing-divider--after-fullbg-hero" : ""}`}
          style={{ background: `linear-gradient(90deg, transparent, ${primary}40, transparent)` }}
          aria-hidden="true"
        />

        {/* Why This Exists */}
        <section className="fan-landing-section fan-landing-perks" style={{ 
          background: isDarkMode 
            ? `linear-gradient(140deg, rgba(30, 30, 30, 0.94) 0%, rgba(25, 25, 30, 0.86) 52%, rgba(20, 20, 25, 0.82) 100%)`
            : `linear-gradient(140deg, rgba(255, 255, 255, 0.94) 0%, ${primary}08 52%, ${primary}0a 100%)`, 
          border: isDarkMode ? `1px solid rgba(255,255,255,0.1)` : `1px solid ${primary}18` 
        }}>
          <h2 className="fan-landing-section-title" style={getTextStyleCSS(ts.perksTitle, { color: primary })}>{landingContent.perksTitle}</h2>
          <div className="fan-landing-copy" style={getTextStyleCSS(ts.perksText, { color: isDarkMode ? 'rgba(255,255,255,0.8)' : `${textColor}cc` })}>
            <p>{landingContent.perksText}</p>
            {bio && <p style={getTextStyleCSS(ts.bio)}>{bio}</p>}
          </div>
          {landingContent.perksList && landingContent.perksList.length > 0 && (
            <ul className="fan-landing-perks-list" style={{ color: isDarkMode ? 'rgba(255,255,255,0.6)' : `${textColor}99` }}>
              {landingContent.perksList.map((item, i) => (
                <li key={i}>
                  <span style={{ color: primary }}>✓</span> {item}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* What You Get */}
        <section className="fan-landing-section fan-landing-preview" id="preview-section" style={{ 
          background: isDarkMode 
            ? `linear-gradient(140deg, rgba(30, 30, 30, 0.94) 0%, rgba(25, 25, 30, 0.86) 52%, rgba(20, 20, 25, 0.82) 100%)`
            : `linear-gradient(140deg, rgba(255, 255, 255, 0.94) 0%, ${primary}08 52%, ${primary}0a 100%)`, 
          border: isDarkMode ? `1px solid rgba(255,255,255,0.1)` : `1px solid ${primary}18` 
        }}>
          <h2 className="fan-landing-section-title" style={getTextStyleCSS(ts.previewTitle, { color: primary })}>{landingContent.previewTitle}</h2>
          <p className="fan-landing-preview-sub" style={getTextStyleCSS(ts.previewText, { color: isDarkMode ? 'rgba(255,255,255,0.8)' : `${textColor}cc` })}>{landingContent.previewText}</p>
          {landingContent.previewList && landingContent.previewList.length > 0 && (
            <ul className="fan-landing-perks-list" style={{ color: isDarkMode ? 'rgba(255,255,255,0.6)' : `${textColor}99` }}>
              {landingContent.previewList.map((item, i) => (
                <li key={i}>
                  <span style={{ color: primary }}>✓</span> {item}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* The Energy */}
        <section className="fan-landing-section fan-landing-testimonial" style={{ 
          background: isDarkMode 
            ? `linear-gradient(140deg, rgba(30, 30, 30, 0.94) 0%, rgba(25, 25, 30, 0.86) 52%, rgba(20, 20, 25, 0.82) 100%)`
            : `linear-gradient(140deg, rgba(255, 255, 255, 0.94) 0%, ${primary}08 52%, ${primary}0a 100%)`, 
          border: isDarkMode ? `1px solid rgba(255,255,255,0.1)` : `1px solid ${primary}18` 
        }}>
          <h2 className="fan-landing-section-title" style={getTextStyleCSS(ts.energyTitle, { color: primary })}>{landingContent.energyTitle}</h2>
          <div className="fan-landing-energy-copy">
            {(landingContent.energyLines ?? []).map((line, i) => (
              <p key={i} className="fan-landing-energy-line" style={{ color: isDarkMode ? 'rgba(255,255,255,0.8)' : `${textColor}cc` }}>{line}</p>
            ))}
          </div>
        </section>

        {/* The Boundary */}
        <section className="fan-landing-section fan-landing-faq" style={{ 
          background: isDarkMode 
            ? `linear-gradient(140deg, rgba(30, 30, 30, 0.94) 0%, rgba(25, 25, 30, 0.86) 52%, rgba(20, 20, 25, 0.82) 100%)`
            : `linear-gradient(140deg, rgba(255, 255, 255, 0.94) 0%, ${primary}08 52%, ${primary}0a 100%)`, 
          border: isDarkMode ? `1px solid rgba(255,255,255,0.1)` : `1px solid ${primary}18` 
        }}>
          <h2 className="fan-landing-section-title" style={getTextStyleCSS(ts.boundaryTitle, { color: primary })}>{landingContent.boundaryTitle}</h2>
          <div className="fan-landing-copy fan-landing-boundary-copy" style={getTextStyleCSS(ts.boundaryText, { color: isDarkMode ? 'rgba(255,255,255,0.8)' : `${textColor}cc` })}>
            <p>{boundariesText}</p>
          </div>
        </section>

        {/* Pricing */}
        <section className="fan-landing-section fan-landing-pricing" id="pricing">
          <div className="fan-landing-tiers">
            <article className="fan-landing-tier-card" style={{ 
              background: isDarkMode 
                ? `linear-gradient(135deg, ${primary}25 0%, rgba(30,30,30,0.9) 100%)`
                : `linear-gradient(135deg, ${primary}15 0%, ${primary}05 100%)`, 
              border: `1px solid ${primary}30` 
            }}>
              <h3 style={{ color: effectiveText }}>{isFreeAccess ? "Free membership" : "Monthly membership"}</h3>
              <p className="fan-landing-price">
                <span className="fan-landing-amount" style={{ color: primary }}>
                  {isFreeAccess ? "Free" : `$${monthlyPrice}`}
                </span>
              </p>
              <ul style={{ color: isDarkMode ? 'rgba(255,255,255,0.6)' : `${textColor}99` }}>
                <li>✓ Exclusive content</li>
                {isFreeAccess ? (
                  <li>✓ Join instantly</li>
                ) : (
                  <li>✓ Cancel anytime</li>
                )}
              </ul>
              <button
                type="button"
                className="fan-landing-subscribe-btn"
                onClick={isLoggedIn ? (isFreeAccess ? onJoinFree : onSubscribe) : onLogin}
                disabled={subscribing || joiningFree}
                style={{ background: `linear-gradient(135deg, ${primary} 0%, ${primary}dd 100%)` }}
              >
                {subscribing || joiningFree 
                  ? "Loading..." 
                  : isLoggedIn 
                    ? (isFreeAccess ? "Join Free" : `Join - $${monthlyPrice}/mo`)
                    : (isFreeAccess ? "Sign up to Join Free" : "Sign up to Subscribe")
                }
              </button>
              <p className="fan-landing-trust-line" style={{ color: isDarkMode ? 'rgba(255,255,255,0.4)' : `${textColor}66` }}>
                {isFreeAccess ? "🎉 No payment required" : "🔒 Secure payment · Cancel anytime"}
              </p>
            </article>
          </div>

          {/* Tip Section */}
          {(monetization?.tipsEnabled !== false) && (
            <div className="fan-landing-tip-section" style={{ borderTopColor: `${primary}20` }}>
              <p className="fan-landing-tip-heading" style={{ color: effectiveText }}>Want to show love?</p>
              <p className="fan-landing-tip-sub" style={{ color: isDarkMode ? 'rgba(255,255,255,0.6)' : `${textColor}99` }}>One-time tip — no subscription</p>
              <div className="fan-landing-tip-meta">
                <input
                  type="text"
                  className="fan-landing-tip-handle-input"
                  maxLength={64}
                  placeholder="(optional) Who's showing love?"
                  aria-label="Your name or handle (optional)"
                  value={tipHandle}
                  onChange={(e) => setTipHandle(e.target.value)}
                  disabled={tipLoading}
                  style={{ borderColor: `${primary}30`, color: textColor }}
                />
              </div>
              <div className="fan-landing-tip-buttons">
                {TIP_PRESET_AMOUNTS.map((dollars) => (
                  <button
                    key={dollars}
                    type="button"
                    className="fan-landing-tip-btn"
                    onClick={() => startTip(dollars * 100)}
                    disabled={tipLoading}
                    style={{ backgroundColor: `${primary}15`, color: primary, borderColor: primary }}
                  >
                    ${dollars}
                  </button>
                ))}
              </div>
              <div className="fan-landing-tip-custom">
                <label htmlFor="tip-custom-amount" className="fan-landing-tip-custom-label" style={{ color: isDarkMode ? 'rgba(255,255,255,0.6)' : `${textColor}99` }}>
                  Or enter an amount (USD)
                </label>
                <div className="fan-landing-tip-custom-row">
                  <span className="fan-landing-tip-prefix" style={{ color: isDarkMode ? 'rgba(255,255,255,0.4)' : `${textColor}66`, marginRight: '0.35rem', fontWeight: 700 }} aria-hidden>$</span>
                  <input
                    type="number"
                    id="tip-custom-amount"
                    className="fan-landing-tip-custom-input"
                    min={1}
                    max={1000}
                    step={1}
                    placeholder="e.g. 25"
                    inputMode="decimal"
                    aria-label="Tip amount in dollars"
                    value={tipCustomAmount}
                    onChange={(e) => setTipCustomAmount(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onCustomTip();
                      }
                    }}
                    disabled={tipLoading}
                    style={{ color: effectiveText, borderColor: `${primary}20`, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : undefined }}
                  />
                  <button
                    type="button"
                    className="fan-landing-tip-btn fan-landing-tip-btn-custom"
                    onClick={onCustomTip}
                    disabled={tipLoading}
                    style={{ backgroundColor: primary, color: "#fff", borderColor: primary }}
                  >
                    {tipLoading ? "..." : "Tip"}
                  </button>
                </div>
              </div>
              {tipError && (
                <p className="fan-landing-tip-error" role="alert">
                  {tipError}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Final CTA */}
        <section className="fan-landing-section fan-landing-cta-panel" style={{ 
          background: isDarkMode 
            ? `linear-gradient(135deg, ${primary}25 0%, rgba(30,30,30,0.9) 100%)`
            : `linear-gradient(135deg, ${primary}15 0%, ${primary}05 100%)`, 
          border: `1px solid ${primary}30` 
        }}>
          <p className="fan-landing-preview-sub" style={{ color: effectiveText }}>Join {displayName || "My Page"}</p>
          <p className="fan-landing-hero-promise" style={{ color: primary }}>${monthlyPrice}/month</p>
          <p className="fan-landing-preview-sub" style={{ color: isDarkMode ? 'rgba(255,255,255,0.6)' : `${textColor}99` }}>Exclusive access.</p>
          <a href="#pricing" className="fan-landing-cta-btn" style={{ background: `linear-gradient(135deg, ${primary} 0%, ${primary}dd 100%)` }}>
            Join Now
          </a>
        </section>
      </main>

      {/* Footer */}
      <footer className="fan-landing-footer" style={{ borderColor: `${primary}20`, backgroundColor: isDarkMode ? 'rgba(20, 20, 20, 0.95)' : undefined }}>
        {/* Social Links in Footer */}
        {visibleSocialLinks.length > 0 && (
          <div className="fan-landing-footer-social">
            {visibleSocialLinks.map((link) => (
              <a
                key={link.key}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="fan-landing-social-link-sm"
                style={getSocialIconStyle(link.key, primary)}
              >
                {link.icon}
              </a>
            ))}
          </div>
        )}
        <p className="fan-landing-footer-name" style={{ color: textColor }}>{displayName}</p>
        <p className="fan-landing-footer-legal" style={{ color: `${textColor}66` }}>
          <a href={`/${creator.handle}/terms`} style={{ color: `${textColor}66` }}>Terms</a>
          {" · "}
          <a href={`/${creator.handle}/privacy`} style={{ color: `${textColor}66` }}>Privacy</a>
        </p>
        {spicyMode && (
          <p className="fan-landing-footer-spicy" style={{ color: primary }}>
            🔞 18+ Content
          </p>
        )}
      </footer>
    </div>
  );
};
