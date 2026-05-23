import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { StorefrontSocialLinks } from "../types";
import { AmazonBrandIcon } from "../src/lib/icons/AmazonBrandIcon";
import {
  getResolvedStorefrontSocialLinks,
  hasStorefrontSocialLinksOnSurface,
  type ResolvedStorefrontSocialLink,
  type StorefrontSocialLinkSurface,
} from "../src/lib/storefrontSocialLinks";

const InstagramIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="5" ry="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1.25" fill="currentColor" stroke="none" />
  </svg>
);

const XIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const TikTokIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
  </svg>
);

const YouTubeIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

const FacebookIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const GlobeIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

export function getStorefrontSocialIcon(key: string): React.ReactNode {
  switch (key) {
    case "instagram":
      return <InstagramIcon />;
    case "x":
      return <XIcon />;
    case "tiktok":
      return <TikTokIcon />;
    case "youtube":
      return <YouTubeIcon />;
    case "facebook":
      return <FacebookIcon />;
    case "amazon":
      return <AmazonBrandIcon className="w-5 h-5" />;
    default:
      return <GlobeIcon />;
  }
}

export function getSocialIconStyle(key: string, fallback: string): React.CSSProperties {
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
    case "amazon":
      return {
        color: "#ffffff",
        background: "#232f3e",
        border: "1px solid rgba(255,255,255,0.28)",
        boxShadow: "0 4px 10px rgba(35,47,62,0.35)",
      };
    default:
      return {
        color: "#ffffff",
        background: `color-mix(in srgb, ${fallback} 72%, #1f2937)`,
        border: "1px solid rgba(255,255,255,0.28)",
        boxShadow: "0 4px 10px rgba(0,0,0,0.18)",
      };
  }
}

export type StorefrontSocialLinkWithIcon = ResolvedStorefrontSocialLink & {
  icon: React.ReactNode;
};

export function getStorefrontSocialLinksWithIcons(
  socialLinks: StorefrontSocialLinks | undefined,
  surface: StorefrontSocialLinkSurface
): StorefrontSocialLinkWithIcon[] {
  return getResolvedStorefrontSocialLinks(socialLinks, surface).map((link) => ({
    ...link,
    icon: getStorefrontSocialIcon(link.key),
  }));
}

export function MemberHubSocialLinksButton({
  socialLinks,
  primary,
  textColor,
  variant = "storefront",
}: {
  socialLinks?: StorefrontSocialLinks;
  primary: string;
  /** Used for studio preview nav chrome only */
  textColor?: string;
  variant?: "storefront" | "preview";
}) {
  const [open, setOpen] = React.useState(false);
  const memberLinks = useMemo(
    () => getStorefrontSocialLinksWithIcons(socialLinks, "memberHub"),
    [socialLinks]
  );

  if (!hasStorefrontSocialLinksOnSurface(socialLinks, "memberHub")) return null;

  const navClassName =
    variant === "preview"
      ? "px-3 py-1.5 rounded-lg text-xs font-medium transition flex-shrink-0 inline-flex items-center gap-1"
      : "storefront-nav-btn storefront-nav-social";

  const previewNavStyle: React.CSSProperties | undefined =
    variant === "preview" && textColor
      ? { color: `${textColor}99`, background: "transparent", border: "1px solid transparent" }
      : undefined;

  return (
    <>
      <button
        type="button"
        className={navClassName}
        onClick={() => setOpen(true)}
        title="Social links"
        aria-label="Social links"
        style={previewNavStyle}
      >
        <span>Social links</span>
      </button>
      <StorefrontSocialLinksModal
        open={open}
        onClose={() => setOpen(false)}
        links={memberLinks}
        primary={primary}
        title="Social links"
      />
    </>
  );
}

export function StorefrontSocialLinksModal({
  open,
  onClose,
  links,
  primary,
  title = "Social links",
}: {
  open: boolean;
  onClose: () => void;
  links: StorefrontSocialLinkWithIcon[];
  primary: string;
  title?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="storefront-social-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="storefront-social-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="storefront-social-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="storefront-social-modal-head">
          <h3 id="storefront-social-modal-title" className="storefront-social-modal-title">
            {title}
          </h3>
          {links.length === 0 ? (
            <p className="storefront-social-modal-empty">No links to show.</p>
          ) : (
            <div className="storefront-social-modal-icons">
              {links.map((link) => (
                <a
                  key={link.key}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="storefront-social-modal-link"
                  title={link.name || link.key}
                >
                  <span
                    className="storefront-social-modal-icon"
                    style={getSocialIconStyle(link.key, primary)}
                  >
                    {link.icon}
                  </span>
                  {link.name && link.key.startsWith("custom-") ? (
                    <span className="storefront-social-modal-label">{link.name}</span>
                  ) : null}
                </a>
              ))}
            </div>
          )}
          <button type="button" className="storefront-social-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
