import React, { useState } from "react";
import type { CreatorStorefrontSettings, StorefrontSocialLinks, StorefrontLandingContent, TextStyle } from "../types";

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

export type PreviewMode = "landing" | "member";

export interface StorefrontPreviewProps {
  config: Partial<CreatorStorefrontSettings>;
  previewMode: PreviewMode;
  className?: string;
}

// Stormij XO theme defaults
const DEFAULT_PRIMARY = "#d4558b";
const DEFAULT_BG = "#fff2f8";
const DEFAULT_TEXT = "#2f1a24";

const SECTION_KEYS = ["home", "treats", "tip", "messages"] as const;

// Map for display labels
const SECTION_LABELS: Record<string, string> = {
  home: "Home",
  feed: "Home",
  treats: "Treats",
  tip: "Tip",
  messages: "Messages",
  sessions: "Chat Session",
  about: "About",
};

// Default landing content (Stormij XO style)
const DEFAULT_LANDING_CONTENT: StorefrontLandingContent = {
  perksTitle: "Why This Exists",
  perksText: "This is a space just for us — no algorithm, no noise, just me and the people who really want to be here.",
  perksList: [
    "Exclusive behind-the-scenes content",
    "Direct messages and personal connection",
    "Early access to new releases",
    "Special treats and surprises",
  ],
  previewTitle: "What You Get",
  previewText: "As a member, you get access to content I can only share here — the real, unfiltered moments.",
  previewList: [
    "Daily posts and updates",
    "Exclusive photos and videos",
    "Personal messages",
    "Live sessions and Q&As",
  ],
  energyTitle: "The Energy",
  energyLines: [
    "Playful and honest.",
    "Real connection, not performance.",
    "A safe space for both of us.",
  ],
  boundaryTitle: "The Boundary",
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
function getVisibleSocialLinks(socialLinks?: StorefrontSocialLinks) {
  if (!socialLinks) return [];
  const links: { key: string; url: string; icon: React.ReactNode }[] = [];
  
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
  
  return links;
}

export const StorefrontPreview: React.FC<StorefrontPreviewProps> = ({
  config,
  previewMode,
  className = "",
}) => {
  const [activeTab, setActiveTab] = useState<string>("home");
  const [tipAmount, setTipAmount] = useState<string>("");

  const theme = config.theme ?? {};
  const primary = theme.primary || DEFAULT_PRIMARY;
  const background = theme.background || DEFAULT_BG;
  const textColor = theme.text || DEFAULT_TEXT;

  const memberTabs = SECTION_KEYS;

  const displayName = config.displayName || config.handle || "Your name";
  const bio = config.bio ?? "";
  const avatar = config.avatar;
  const logo = config.logo;
  const heroImage = config.heroImage;
  const heroTagline = config.heroTagline ?? "";
  const heroPromise = config.heroPromise ?? "Your access to the real me";
  const textStyles = config.textStyles ?? {};
  
  const landingContent = { ...DEFAULT_LANDING_CONTENT, ...config.landingContent };
  const socialLinks = getVisibleSocialLinks(config.socialLinks);
  
  const boundariesText = config.rules?.boundariesText ?? landingContent.boundaryText ?? "";
  const spicyMode = config.spicyMode ?? false;
  const monetization = config.monetization ?? {};
  const monthlyPriceCents = monetization.monthlyPrice ?? 999;
  const monthlyPrice = (monthlyPriceCents / 100).toFixed(2);

  // CSS variables for theme
  const themeVars = {
    "--preview-primary": primary,
    "--preview-bg": background,
    "--preview-text": textColor,
  } as React.CSSProperties;

  return (
    <div
      className={`stormij-theme min-h-[400px] overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 shadow-inner ${className}`}
      style={{ 
        ...themeVars,
        backgroundColor: previewMode === "landing" ? background : background,
      }}
    >
      {previewMode === "landing" && (
        <div className="storefront-preview-landing" style={{ background: `linear-gradient(135deg, ${background} 0%, #fff 50%, ${background} 100%)` }}>
          {/* Header */}
          <header className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: `${primary}20` }}>
            <div className="flex items-center gap-2">
              {logo ? (
                <img src={logo} alt={displayName} className="h-7 object-contain max-w-[120px]" />
              ) : avatar ? (
                <img src={avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : null}
              {!logo && <span className="text-xs font-medium" style={{ color: textColor }}>My Inner Circle</span>}
            </div>
            <div className="flex gap-3">
              <button type="button" className="text-xs hover:underline" style={{ color: primary }}>Sign up</button>
              <button type="button" className="text-xs hover:underline" style={{ color: primary }}>Log in</button>
            </div>
          </header>

          {/* Hero Section */}
          <section className="px-4 py-6">
            <div className="flex gap-6">
              {/* Hero Image */}
              {heroImage && (
                <div 
                  className="w-32 h-40 rounded-xl overflow-hidden flex-shrink-0" 
                  style={{ 
                    border: `1px solid ${primary}30`, 
                    boxShadow: `0 18px 44px ${primary}30, 0 0 0 5px rgba(255, 255, 255, 0.45)` 
                  }}
                >
                  <img src={heroImage} alt="" className="w-full h-full object-cover object-top" />
                </div>
              )}
              
              {/* Hero Text */}
              <div className="flex-1 min-w-0">
                <h1 className="font-bold mb-1" style={{ 
                  ...getTextStyleCSS(textStyles.displayName, { fontSize: '1.25rem', color: textColor }),
                  fontFamily: "var(--fan-serif, Georgia, serif)" 
                }}>
                  {displayName}
                </h1>
                {heroTagline && (
                  <p className="mb-2" style={getTextStyleCSS(textStyles.heroTagline, { fontSize: '0.75rem', color: `${textColor}99` })}>{heroTagline}</p>
                )}
                <p className="italic mb-3" style={getTextStyleCSS(textStyles.heroPromise, { fontSize: '0.875rem', color: primary })}>{heroPromise}</p>
                
                {/* Social Links */}
                {socialLinks.length > 0 && (
                  <div className="flex gap-2">
                    {socialLinks.map((link) => (
                      <a
                        key={link.key}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-transform hover:scale-110"
                        style={{ color: primary }}
                      >
                        {link.icon}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Divider */}
          <div className="mx-4 h-px" style={{ background: `linear-gradient(90deg, transparent, ${primary}40, transparent)` }} />

          {/* Content Sections */}
          <div className="px-4 py-4 space-y-4">
            {/* Why This Exists */}
            <section 
              className="rounded-2xl p-4 transition-all hover:translate-y-[-2px]" 
              style={{ 
                background: `linear-gradient(140deg, rgba(255, 255, 255, 0.94) 0%, rgba(255, 245, 250, 0.86) 52%, rgba(250, 241, 252, 0.82) 100%)`, 
                border: `1px solid #f3dbe5`,
                boxShadow: `0 14px 42px ${primary}18`
              }}
            >
              <h2 className="font-bold mb-2" style={getTextStyleCSS(textStyles.perksTitle, { fontSize: '0.875rem', color: primary })}>{landingContent.perksTitle}</h2>
              <p className="leading-relaxed mb-2" style={getTextStyleCSS(textStyles.perksText, { fontSize: '0.75rem', color: `${textColor}cc` })}>{landingContent.perksText}</p>
              {landingContent.perksList && landingContent.perksList.length > 0 && (
                <ul className="text-xs space-y-1" style={{ color: `${textColor}99` }}>
                  {landingContent.perksList.slice(0, 3).map((item, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span style={{ color: primary }}>✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* What You Get */}
            <section 
              className="rounded-2xl p-4 transition-all hover:translate-y-[-2px]" 
              style={{ 
                background: `linear-gradient(140deg, rgba(255, 255, 255, 0.94) 0%, rgba(255, 245, 250, 0.86) 52%, rgba(250, 241, 252, 0.82) 100%)`, 
                border: `1px solid #f3dbe5`,
                boxShadow: `0 14px 42px ${primary}18`
              }}
            >
              <h2 className="font-bold mb-2" style={getTextStyleCSS(textStyles.previewTitle, { fontSize: '0.875rem', color: primary })}>{landingContent.previewTitle}</h2>
              <p className="leading-relaxed mb-2" style={getTextStyleCSS(textStyles.previewText, { fontSize: '0.75rem', color: `${textColor}cc` })}>{landingContent.previewText}</p>
            </section>

            {/* The Energy */}
            <section 
              className="rounded-2xl p-4 transition-all hover:translate-y-[-2px]" 
              style={{ 
                background: `linear-gradient(140deg, rgba(255, 255, 255, 0.94) 0%, rgba(255, 245, 250, 0.86) 52%, rgba(250, 241, 252, 0.82) 100%)`, 
                border: `1px solid #f3dbe5`,
                boxShadow: `0 14px 42px ${primary}18`
              }}
            >
              <h2 className="font-bold mb-2" style={getTextStyleCSS(textStyles.energyTitle, { fontSize: '0.875rem', color: primary })}>{landingContent.energyTitle}</h2>
              <div className="space-y-1">
                {(landingContent.energyLines ?? []).slice(0, 3).map((line, i) => (
                  <p key={i} className="text-xs" style={{ color: `${textColor}cc` }}>{line}</p>
                ))}
              </div>
            </section>

            {/* The Boundary */}
            <section 
              className="rounded-2xl p-4 transition-all hover:translate-y-[-2px]" 
              style={{ 
                background: `linear-gradient(140deg, rgba(255, 255, 255, 0.94) 0%, rgba(255, 245, 250, 0.86) 52%, rgba(250, 241, 252, 0.82) 100%)`, 
                border: `1px solid #f3dbe5`,
                boxShadow: `0 14px 42px ${primary}18`
              }}
            >
              <h2 className="font-bold mb-2" style={getTextStyleCSS(textStyles.boundaryTitle, { fontSize: '0.875rem', color: primary })}>{landingContent.boundaryTitle}</h2>
              <p className="leading-relaxed" style={getTextStyleCSS(textStyles.boundaryText, { fontSize: '0.75rem', color: `${textColor}cc` })}>
                {boundariesText || landingContent.boundaryText}
              </p>
            </section>
          </div>

          {/* Subscribe Card */}
          <section className="px-4 py-4">
            <div className="rounded-xl p-4 text-center" style={{ background: `linear-gradient(135deg, ${primary}15 0%, ${primary}05 100%)`, border: `1px solid ${primary}30` }}>
              <h3 className="text-sm font-bold mb-1" style={{ color: textColor }}>Monthly membership</h3>
              <p className="text-2xl font-bold mb-2" style={{ color: primary }}>${monthlyPrice}</p>
              <ul className="text-xs mb-3 space-y-1" style={{ color: `${textColor}99` }}>
                <li>✓ Exclusive content</li>
                <li>✓ Cancel anytime</li>
              </ul>
              <button
                type="button"
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
                style={{ background: `linear-gradient(135deg, ${primary} 0%, ${primary}dd 100%)` }}
              >
                Join - ${monthlyPrice}/mo
              </button>
              <p className="text-[10px] mt-2" style={{ color: `${textColor}66` }}>
                🔒 Secure payment · Cancel anytime
              </p>
            </div>
          </section>

          {/* Tip Section */}
          <section className="px-4 pb-6 pt-2">
            <div className="pt-6 border-t text-center" style={{ borderColor: `${primary}20` }}>
              <p className="text-base font-semibold mb-1" style={{ color: textColor }}>Want to show love?</p>
              <p className="text-sm mb-4" style={{ color: `${textColor}99` }}>One-time tip — no subscription</p>
              <div className="flex justify-center flex-wrap gap-2 mb-4">
                {["$3", "$5", "$10", "$20"].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    className="px-5 py-2 rounded-full text-sm font-semibold transition-all hover:scale-[1.03]"
                    style={{ background: `${primary}15`, color: primary, border: `2px solid ${primary}` }}
                  >
                    {amt}
                  </button>
                ))}
              </div>
              <p className="text-xs mb-2" style={{ color: `${textColor}66` }}>Or enter an amount (USD)</p>
              <div className="flex gap-2 max-w-[280px] mx-auto">
                <div className="flex-1 flex items-center rounded-full border-2 px-3" style={{ borderColor: `${primary}40` }}>
                  <span className="text-sm font-medium" style={{ color: `${textColor}66` }}>$</span>
                  <input
                    type="number"
                    className="flex-1 py-2 px-1 text-sm bg-transparent outline-none"
                    placeholder="e.g. 25"
                    value={tipAmount}
                    onChange={(e) => setTipAmount(e.target.value)}
                    style={{ color: textColor }}
                  />
                </div>
                <button
                  type="button"
                  className="px-5 py-2 rounded-full text-sm font-semibold text-white transition-all hover:scale-[1.03]"
                  style={{ backgroundColor: primary }}
                >
                  Tip
                </button>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="px-4 py-3 text-center border-t" style={{ borderColor: `${primary}20` }}>
            <div className="flex justify-center gap-3 text-xs" style={{ color: `${textColor}66` }}>
              <a href="#" className="hover:underline">Terms</a>
              <span>·</span>
              <a href="#" className="hover:underline">Privacy</a>
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
                    style={{ color: `${textColor}66` }}
                  >
                    {link.icon}
                  </a>
                ))}
              </div>
            )}
          </footer>

          {spicyMode && (
            <p className="text-center text-[10px] py-2" style={{ color: primary }}>
              🔒 18+ • Members only content
            </p>
          )}
        </div>
      )}

      {previewMode === "member" && (
        <div style={{ backgroundColor: background, minHeight: "100%" }}>
          {/* Member Header */}
          <header 
            className="flex items-center justify-between px-4 py-3"
            style={{ 
              background: "linear-gradient(135deg, rgba(255, 246, 251, 0.98) 0%, rgba(255, 252, 254, 0.98) 50%, rgba(250, 241, 252, 0.98) 100%)",
              boxShadow: `0 6px 24px ${primary}15`,
              borderBottom: `1px solid ${primary}20`,
            }}
          >
            <div className="flex items-center gap-2">
              {avatar ? (
                <img src={avatar} alt="" className="w-8 h-8 rounded-full object-cover" style={{ border: `2px solid ${primary}40` }} />
              ) : (
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white" style={{ background: primary }}>
                  {displayName?.charAt(0) || "?"}
                </div>
              )}
              <span className="text-sm font-semibold" style={{ color: textColor }}>{displayName || "Inner Circle"}</span>
            </div>
            <nav className="flex items-center gap-1">
              {memberTabs.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition"
                  style={{
                    backgroundColor: activeTab === key ? `${primary}15` : "transparent",
                    color: activeTab === key ? primary : `${textColor}99`,
                    border: activeTab === key ? `1px solid ${primary}30` : "1px solid transparent",
                  }}
                >
                  {SECTION_LABELS[key] || key}
                </button>
              ))}
            </nav>
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
                <img src={avatar} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: primary }}>
                  {(displayName || "?")[0].toUpperCase()}
                </span>
              )}
            </button>
          </header>
          
          {/* Content Area */}
          <div className="p-4" style={{ maxWidth: "480px", margin: "0 auto" }}>
            {(activeTab === "home" || activeTab === "feed") && (
              <div className="space-y-4">
                {/* Sample Feed Post - matches .feed-card structure */}
                <article 
                  className="rounded-2xl overflow-hidden"
                  style={{ 
                    background: "linear-gradient(160deg, rgba(255, 255, 255, 1) 0%, rgba(255, 244, 249, 0.95) 100%)",
                    border: `1px solid ${primary}15`,
                    boxShadow: `0 4px 16px ${primary}10, 0 1px 3px rgba(0,0,0,0.04)`,
                  }}
                >
                  {/* Header - matches .feed-card-header */}
                  <div 
                    className="flex items-center gap-3"
                    style={{ 
                      padding: "0.85rem 1rem",
                      background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(249, 250, 251, 0.6) 100%)",
                      borderBottom: "1px solid rgba(156, 163, 175, 0.15)",
                    }}
                  >
                    {/* Avatar - matches .feed-card-avatar */}
                    <div 
                      className="rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                      style={{ 
                        width: "38px", 
                        height: "38px",
                        border: "2px solid rgba(255, 255, 255, 0.9)",
                        boxShadow: `0 2px 8px ${primary}20`,
                        background: avatar ? "transparent" : `linear-gradient(135deg, ${primary}88 0%, ${primary} 100%)`,
                      }}
                    >
                      {avatar ? (
                        <img src={avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#fff" }}>
                          {(displayName || "?")[0].toUpperCase()}
                        </span>
                      )}
                    </div>
                    {/* Creator info - matches .feed-card-creator */}
                    <div className="flex-1 min-w-0">
                      <span 
                        className="block font-semibold"
                        style={{ fontSize: "0.95rem", color: primary, letterSpacing: "0.01em" }}
                      >
                        {displayName}
                      </span>
                    </div>
                    {/* Time - matches .feed-card-time */}
                    <span style={{ fontSize: "0.8rem", color: "#9ca3af", fontWeight: 400 }}>31 mins</span>
                  </div>
                  
                  {/* Media - matches .feed-card-media-wrap */}
                  <div 
                    className="aspect-square"
                    style={{ position: "relative", overflow: "hidden" }}
                  >
                    <img 
                      src="https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&h=600&fit=crop&crop=face"
                      alt="Demo post"
                      style={{ 
                        width: "100%", 
                        height: "100%", 
                        objectFit: "cover",
                      }}
                    />
                  </div>
                  
                  {/* Actions - matches .feed-card-actions */}
                  <div 
                    className="flex items-center gap-2"
                    style={{ 
                      padding: "0.6rem 1rem",
                      background: "linear-gradient(180deg, rgba(249, 250, 251, 0.5) 0%, rgba(255, 255, 255, 0.9) 100%)",
                      borderBottom: "1px solid rgba(156, 163, 175, 0.12)",
                    }}
                  >
                    <span className="inline-flex items-center gap-1">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#6b7280" }}>42</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#6b7280" }}>2</span>
                    </span>
                    <span 
                      className="inline-flex items-center gap-1"
                      style={{ 
                        padding: "0.3rem 0.6rem", 
                        borderRadius: "8px", 
                        background: `${primary}12`,
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ fontWeight: 700, color: primary, fontSize: "0.85rem" }}>$</span>
                      <span style={{ fontSize: "0.75rem", fontWeight: 600, color: primary, letterSpacing: "0.02em" }}>SEND TIP</span>
                    </span>
                  </div>
                  
                  {/* Body - matches .feed-card-body */}
                  <div style={{ padding: "0.75rem 1rem 1rem" }}>
                    <p style={{ fontSize: "0.9rem", color: textColor, lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 600, color: primary, marginRight: "0.35rem" }}>{displayName}</span>
                      Good morning everyone 🌸
                    </p>
                    {/* Comments preview */}
                    <button 
                      type="button"
                      style={{ 
                        fontSize: "0.8rem", 
                        color: "#9ca3af", 
                        marginTop: "0.5rem",
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                      }}
                    >
                      View all 2 comments
                    </button>
                    <div style={{ marginTop: "0.4rem" }}>
                      <p style={{ fontSize: "0.85rem", color: textColor }}>
                        <span style={{ fontWeight: 600, marginRight: "0.35rem" }}>sarah_m</span>
                        Love this! ☕
                      </p>
                    </div>
                  </div>
                </article>
                
                <p className="text-center text-xs" style={{ color: `${textColor}66` }}>
                  Preview — actual feed will show real posts
                </p>
              </div>
            )}
            
            {activeTab === "treats" && (
              <div 
                style={{ 
                  background: "linear-gradient(140deg, rgba(255, 255, 255, 0.94) 0%, rgba(255, 245, 250, 0.86) 52%, rgba(250, 241, 252, 0.82) 100%)",
                  padding: "1.5rem 1rem",
                  borderRadius: "16px",
                }}
              >
                {/* Header */}
                <div className="text-center" style={{ marginBottom: "1.25rem" }}>
                  <h2 
                    style={{ 
                      fontSize: "clamp(1.5rem, 4vw, 1.8rem)", 
                      fontWeight: 600,
                      fontStyle: "italic",
                      color: textColor, 
                      fontFamily: "var(--fan-serif, Georgia, serif)",
                      margin: "0 0 0.35rem",
                    }}
                  >
                    Treats
                  </h2>
                  <p style={{ fontSize: "0.9rem", color: `${textColor}77`, margin: 0 }}>
                    Personal messages, voice notes, and more — just for you.
                  </p>
                </div>
                
                {/* Treat Cards Grid */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { name: "30-Second Voice Note", price: 25, desc: "I'll say your name. Keep it short.", left: 10 },
                    { name: "60-Second Voice Note", price: 45, desc: "More direct. Slightly longer.", left: 8 },
                    { name: "Private Video Reply", price: 35, desc: "Ask me something. I'll respond.", left: 12 },
                    { name: "Birthday Message", price: 50, desc: "Custom video. Don't make it weird.", left: 6 },
                  ].map((treat, i) => (
                    <div 
                      key={i}
                      className="rounded-xl"
                      style={{ 
                        background: "#fff",
                        border: `1px solid ${primary}15`,
                        boxShadow: `0 4px 16px ${primary}08`,
                        padding: "1rem",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      {/* Title & Price Row */}
                      <div className="flex items-start justify-between" style={{ marginBottom: "0.5rem" }}>
                        <h3 
                          style={{ 
                            fontSize: "0.85rem", 
                            fontWeight: 600, 
                            fontStyle: "italic",
                            color: textColor,
                            fontFamily: "var(--fan-serif, Georgia, serif)",
                            margin: 0,
                            flex: 1,
                            paddingRight: "0.5rem",
                          }}
                        >
                          {treat.name}
                        </h3>
                        <span style={{ fontSize: "1rem", fontWeight: 700, color: primary }}>
                          ${treat.price}
                          <span style={{ fontSize: "0.7rem", verticalAlign: "super", color: primary }}>♡</span>
                        </span>
                      </div>
                      
                      {/* Description */}
                      <p style={{ fontSize: "0.75rem", color: `${textColor}88`, margin: "0 0 0.75rem", lineHeight: 1.4 }}>
                        {treat.desc}
                      </p>
                      
                      {/* Footer */}
                      <div 
                        className="flex items-center justify-between"
                        style={{ 
                          marginTop: "auto",
                          paddingTop: "0.5rem",
                          borderTop: `1px solid ${primary}10`,
                        }}
                      >
                        <span style={{ fontSize: "0.7rem", color: `${textColor}66` }}>{treat.left} left</span>
                        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: primary, cursor: "pointer" }}>Purchase</span>
                      </div>
                    </div>
                  ))}
                </div>
                
                <p className="text-center" style={{ fontSize: "0.75rem", color: `${textColor}55`, marginTop: "1rem" }}>
                  Preview — configure treats in the store
                </p>
              </div>
            )}
            
            {activeTab === "tip" && (
              <div 
                className="rounded-2xl overflow-hidden"
                style={{ 
                  background: "linear-gradient(140deg, rgba(255, 255, 255, 0.94) 0%, rgba(255, 245, 250, 0.86) 52%, rgba(250, 241, 252, 0.82) 100%)",
                  border: `1px solid ${primary}15`,
                  boxShadow: `0 14px 42px ${primary}12`,
                }}
              >
                {/* Tip Hero */}
                <div 
                  className="text-center relative overflow-hidden"
                  style={{ 
                    padding: "2.5rem 1.5rem",
                    background: `linear-gradient(135deg, ${primary}15 0%, ${primary}20 50%, rgba(168, 85, 247, 0.12) 100%)`,
                  }}
                >
                  <h2 
                    className="font-semibold italic"
                    style={{ 
                      fontSize: "clamp(1.5rem, 4vw, 1.8rem)", 
                      color: primary, 
                      fontFamily: "var(--fan-serif, Georgia, serif)",
                      margin: "0 0 0.35rem",
                    }}
                  >
                    Show Your Love
                  </h2>
                  <p style={{ fontSize: "0.95rem", color: `${textColor}88`, margin: 0 }}>
                    No minimum — send what you like.
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
                          background: "#fff",
                          border: `1px solid ${primary}25`,
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
                        border: `1px solid ${primary}20`,
                        borderRadius: "8px",
                        fontSize: "0.9rem",
                        background: "#fff",
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
            
            {activeTab === "messages" && (
              <div className="space-y-3">
                <p className="text-sm font-semibold" style={{ color: textColor }}>Conversation with {displayName}</p>
                <div 
                  className="rounded-xl p-4 min-h-[150px] flex items-center justify-center"
                  style={{ background: "#fff", border: `1px solid ${primary}15` }}
                >
                  <p className="text-sm text-center" style={{ color: `${textColor}66` }}>
                    Start a conversation with {displayName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Type a message..." 
                    className="flex-1 px-3 py-2 rounded-xl text-sm"
                    style={{ border: `1px solid ${primary}20`, background: "#fff" }}
                  />
                  <button 
                    type="button"
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                    style={{ background: primary }}
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
