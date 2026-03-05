import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAppContext } from "./AppContext";
import { doc, getDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage, auth } from "../firebaseConfig";
import type { CreatorStorefrontSettings, StorefrontButtonStyle, StorefrontSocialLinks, StorefrontLandingContent, StorefrontLegal, TextStyle } from "../types";
import { STOREFRONT_CONTENT_POLICY, DEFAULT_PRIVACY_POLICY, DEFAULT_TERMS_OF_SERVICE } from "../constants";
import { StorefrontPreview } from "./StorefrontPreview";
import { UserIcon, ImageIcon, GlobeIcon } from "./icons/UIIcons";
import { EmojiButton } from "./EmojiPicker";

const DEFAULT_SECTIONS: NonNullable<CreatorStorefrontSettings["sections"]> = {
  feed: true,
  treats: true,
  tip: true,
  messages: true,
  about: true,
};
const DEFAULT_SECTIONS_ORDER = ["feed", "treats", "tip", "messages", "about"];

// Stormij pink theme as default
const DEFAULT_THEME: NonNullable<CreatorStorefrontSettings["theme"]> = {
  primary: "#d4558b",
  background: "#fff2f8",
  text: "#2f1a24",
  textMuted: "#7c5b68",
  border: "#f3dbe5",
  accentHover: "#bc3f74",
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

const DEFAULT_LEGAL: StorefrontLegal = {
  termsText: "",
  termsLastUpdated: "",
  privacyText: "",
  privacyLastUpdated: "",
};

function normalizeForCompare(a: Partial<CreatorStorefrontSettings>): string {
  return JSON.stringify({
    handle: (a.handle ?? "").replace("@", "").toLowerCase().trim(),
    displayName: a.displayName ?? "",
    bio: a.bio ?? "",
    avatar: a.avatar ?? "",
    banner: a.banner ?? "",
    heroImage: a.heroImage ?? "",
    heroTagline: a.heroTagline ?? "",
    heroPromise: a.heroPromise ?? "",
    socialLinks: a.socialLinks ?? DEFAULT_SOCIAL_LINKS,
    landingContent: a.landingContent ?? DEFAULT_LANDING_CONTENT,
    legal: a.legal ?? DEFAULT_LEGAL,
    theme: { ...DEFAULT_THEME, ...a.theme },
    sections: { ...DEFAULT_SECTIONS, ...a.sections },
    sectionsOrder: a.sectionsOrder ?? DEFAULT_SECTIONS_ORDER,
    spicyMode: a.spicyMode ?? false,
    rules: a.rules ?? {},
    monetization: a.monetization ?? {},
    textStyles: a.textStyles ?? {},
  });
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
const FONT_SIZE_OPTIONS: { value: TextStyle['fontSize']; label: string }[] = [
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
  defaultSize?: TextStyle['fontSize'];
}> = ({ style, onChange, defaultSize = 'base' }) => {
  const [showControls, setShowControls] = useState(false);
  
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
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [previewMode, setPreviewMode] = useState<"landing" | "member">("landing");

  const isDirty = useMemo(
    () => normalizeForCompare(draft) !== normalizeForCompare(saved),
    [draft, saved]
  );

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
        banner: data.banner ?? (data as Record<string, unknown>).bannerUrl,
        heroImage: data.heroImage ?? "",
        heroTagline: data.heroTagline ?? "",
        heroPromise: data.heroPromise ?? "",
        socialLinks: data.socialLinks ? { ...DEFAULT_SOCIAL_LINKS, ...data.socialLinks } : { ...DEFAULT_SOCIAL_LINKS },
        landingContent: data.landingContent ? { ...DEFAULT_LANDING_CONTENT, ...data.landingContent } : { ...DEFAULT_LANDING_CONTENT },
        legal: data.legal ? { ...DEFAULT_LEGAL, ...data.legal } : { ...DEFAULT_LEGAL },
        theme: data.theme ? { ...DEFAULT_THEME, ...data.theme } : { ...DEFAULT_THEME },
        sections: data.sections ? { ...DEFAULT_SECTIONS, ...data.sections } : { ...DEFAULT_SECTIONS },
        sectionsOrder: data.sectionsOrder ?? DEFAULT_SECTIONS_ORDER,
        spicyMode: data.spicyMode ?? false,
        rules: data.rules ?? {},
        monetization: data.monetization ? { ...DEFAULT_MONETIZATION, ...data.monetization } : { ...DEFAULT_MONETIZATION },
        textStyles: data.textStyles ?? {},
        onboardingStatus: data.onboardingStatus,
        updatedAt: data.updatedAt,
      };
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
  }, [creatorId, showToast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const checkHandle = useCallback(
    async (value: string) => {
      const clean = value.replace("@", "").toLowerCase().trim();
      if (!clean || clean.length < 3 || clean.length > 20 || !/^[a-z0-9_]+$/.test(clean)) {
        setHandleCheckStatus("idle");
        setHandleCheckMessage("");
        return;
      }
      setHandleCheckStatus("checking");
      setHandleCheckMessage("");
      try {
        const params = new URLSearchParams({ handle: clean });
        if (creatorId) params.set("creatorId", creatorId);
        const res = await fetch(`/api/checkHandleAvailability?${params}`);
        const data = await res.json().catch(() => ({}));
        if (data.available === true) {
          setHandleCheckStatus("available");
          setHandleCheckMessage("Available");
        } else {
          setHandleCheckStatus("taken");
          setHandleCheckMessage(data.message || "This handle is already taken");
        }
      } catch {
        setHandleCheckStatus("idle");
        setHandleCheckMessage("Could not check availability");
      }
    },
    [creatorId]
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

  const updateTextStyle = useCallback((field: keyof NonNullable<CreatorStorefrontSettings['textStyles']>, style: TextStyle) => {
    setDraft((prev) => ({
      ...prev,
      textStyles: {
        ...prev.textStyles,
        [field]: style,
      },
    }));
  }, []);

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
      const payload = {
        handle: (draft.handle ?? "").replace("@", "").toLowerCase().trim(),
        displayName: draft.displayName,
        bio: draft.bio,
        avatar: draft.avatar,
        logo: draft.logo,
        heroImage: draft.heroImage,
        heroTagline: draft.heroTagline,
        heroPromise: draft.heroPromise,
        socialLinks: draft.socialLinks,
        landingContent: draft.landingContent,
        legal: draft.legal,
        theme: draft.theme,
        sections: draft.sections,
        sectionsOrder: draft.sectionsOrder,
        spicyMode: draft.spicyMode,
        rules: draft.rules,
        monetization: draft.monetization,
        textStyles: draft.textStyles,
        onboardingStatus: draft.onboardingStatus,
      };
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
      if (!res.ok) throw new Error((data as { message?: string }).message || `Save failed (${res.status})`);
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
  }, [creatorId, draft, isDirty, showToast]);

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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !creatorId) return;
    setLogoUploading(true);
    try {
      const path = `users/${creatorId}/storefront_logo/${Date.now()}.${file.type.split("/")[1] || "jpg"}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file, { contentType: file.type });
      const url = await getDownloadURL(storageRef);
      updateDraft({ logo: url });
    } catch (err) {
      console.error(err);
      showToast?.("Failed to upload logo", "error");
    } finally {
      setLogoUploading(false);
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

  // Helper to update social links
  const updateSocialLink = (platform: keyof StorefrontSocialLinks, field: "url" | "show", value: string | boolean) => {
    const current = draft.socialLinks ?? { ...DEFAULT_SOCIAL_LINKS };
    const platformData = current[platform] ?? { url: "", show: true };
    updateDraft({
      socialLinks: {
        ...current,
        [platform]: { ...platformData, [field]: value },
      },
    });
  };

  // Helper to update landing content
  const updateLandingContent = (field: keyof StorefrontLandingContent, value: string | string[]) => {
    updateDraft({
      landingContent: {
        ...draft.landingContent,
        ...DEFAULT_LANDING_CONTENT,
        [field]: value,
      },
    });
  };

  // Helper to update legal
  const updateLegal = (field: keyof StorefrontLegal, value: string) => {
    updateDraft({
      legal: {
        ...draft.legal,
        ...DEFAULT_LEGAL,
        [field]: value,
      },
    });
  };

  // State for legal modals
  const [legalModalOpen, setLegalModalOpen] = useState<"terms" | "privacy" | null>(null);

  const previewUrl =
    draft.handle && typeof window !== "undefined"
      ? `${window.location.origin}/${(draft.handle as string).replace("@", "").toLowerCase().trim()}`
      : "";

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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Handle (URL)</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 dark:text-gray-400">/</span>
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
              {handleCheckStatus === "checking" && <span className="text-sm text-gray-500">Checking…</span>}
              {handleCheckStatus === "available" && <span className="text-sm text-green-600 dark:text-green-400">Available</span>}
              {handleCheckStatus === "taken" && <span className="text-sm text-red-600 dark:text-red-400">{handleCheckMessage}</span>}
            </div>
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
                  <EmojiButton onSelect={(emoji) => updateDraft({ displayName: (draft.displayName ?? "") + emoji })} />
                </div>
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
                    <EmojiButton onSelect={(emoji) => updateDraft({ bio: (draft.bio ?? "") + emoji })} />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">{(draft.bio ?? "").length}/500</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Feed Avatar</label>
                  <p className="text-xs text-gray-400 mb-2">Shown on your posts</p>
                  <label className="flex flex-col items-center justify-center w-20 h-20 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 cursor-pointer hover:border-primary-500 overflow-hidden">
                    {draft.avatar ? (
                      <img src={draft.avatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon className="w-8 h-8 text-gray-400" />
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={avatarUploading} />
                  </label>
                  {avatarUploading && <p className="text-xs text-gray-500 mt-1">Uploading…</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Header Logo</label>
                  <p className="text-xs text-gray-400 mb-2">Shown in page header</p>
                  <label className="flex flex-col items-center justify-center w-full h-20 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 cursor-pointer hover:border-primary-500 overflow-hidden">
                    {draft.logo ? (
                      <img src={draft.logo} alt="Logo" className="w-full h-full object-contain" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-gray-400" />
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={logoUploading} />
                  </label>
                  {logoUploading && <p className="text-xs text-gray-500 mt-1">Uploading…</p>}
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Hero Section */}
          <CollapsibleSection title="Hero Section" defaultOpen>
            <div className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Hero Image</label>
                <p className="text-xs text-gray-400 mb-2">Portrait orientation recommended (4:5 aspect ratio). Shows on landing page.</p>
                <label className="flex flex-col items-center justify-center w-32 h-40 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 cursor-pointer hover:border-primary-500 overflow-hidden">
                  {draft.heroImage ? (
                    <img src={draft.heroImage} alt="Hero" className="w-full h-full object-cover object-top" />
                  ) : (
                    <div className="text-center p-2">
                      <ImageIcon className="w-8 h-8 text-gray-400 mx-auto" />
                      <span className="text-xs text-gray-400 mt-1 block">Add hero image</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={handleHeroImageUpload} disabled={heroImageUploading} />
                </label>
                {heroImageUploading && <p className="text-xs text-gray-500 mt-1">Uploading…</p>}
                {draft.heroImage && (
                  <button
                    type="button"
                    onClick={() => updateDraft({ heroImage: "" })}
                    className="text-xs text-red-500 hover:text-red-600 mt-1"
                  >
                    Remove image
                  </button>
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
                  <EmojiButton onSelect={(emoji) => updateDraft({ heroTagline: (draft.heroTagline ?? "") + emoji })} />
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
                  <EmojiButton onSelect={(emoji) => updateDraft({ heroPromise: (draft.heroPromise ?? "") + emoji })} />
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
                  <EmojiButton onSelect={(emoji) => updateLandingContent("perksTitle", (draft.landingContent?.perksTitle ?? "") + emoji)} />
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
                    <EmojiButton onSelect={(emoji) => updateLandingContent("perksText", (draft.landingContent?.perksText ?? "") + emoji)} />
                  </div>
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
                  <EmojiButton onSelect={(emoji) => updateLandingContent("previewTitle", (draft.landingContent?.previewTitle ?? "") + emoji)} />
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Description</span>
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
                    placeholder="Main text"
                    rows={2}
                    className="w-full px-3 py-1.5 pr-12 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <div className="absolute right-2 top-1.5">
                    <EmojiButton onSelect={(emoji) => updateLandingContent("previewText", (draft.landingContent?.previewText ?? "") + emoji)} />
                  </div>
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
                  <EmojiButton onSelect={(emoji) => updateLandingContent("energyTitle", (draft.landingContent?.energyTitle ?? "") + emoji)} />
                </div>
                <div className="relative">
                  <textarea
                    value={(draft.landingContent?.energyLines ?? DEFAULT_LANDING_CONTENT.energyLines)?.join("\n")}
                    onChange={(e) => updateLandingContent("energyLines", e.target.value.split("\n"))}
                    placeholder="One line per vibe (e.g., Playful and honest.)"
                    rows={3}
                    className="w-full px-3 py-1.5 pr-12 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <div className="absolute right-2 top-1.5">
                    <EmojiButton onSelect={(emoji) => {
                      const lines = draft.landingContent?.energyLines ?? DEFAULT_LANDING_CONTENT.energyLines ?? [];
                      if (lines.length > 0) {
                        lines[lines.length - 1] = lines[lines.length - 1] + emoji;
                        updateLandingContent("energyLines", [...lines]);
                      } else {
                        updateLandingContent("energyLines", [emoji]);
                      }
                    }} />
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1">One line per row</p>
              </div>

              {/* Boundary Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">The Boundary Section</label>
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
                  <EmojiButton onSelect={(emoji) => updateLandingContent("boundaryTitle", (draft.landingContent?.boundaryTitle ?? "") + emoji)} />
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Description</span>
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
                    placeholder="Your boundaries and rules"
                    rows={2}
                    className="w-full px-3 py-1.5 pr-12 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <div className="absolute right-2 top-1.5">
                    <EmojiButton onSelect={(emoji) => updateLandingContent("boundaryText", (draft.landingContent?.boundaryText ?? "") + emoji)} />
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Theme & Colors */}
          <CollapsibleSection title="Theme & Colors">
            <div className="space-y-4 pt-4">
              {/* Primary Colors Row */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Primary</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={draft.theme?.primary ?? DEFAULT_THEME.primary}
                      onChange={(e) => updateDraft({ theme: { ...draft.theme, ...DEFAULT_THEME, primary: e.target.value } })}
                      className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={draft.theme?.primary ?? DEFAULT_THEME.primary}
                      onChange={(e) => updateDraft({ theme: { ...draft.theme, ...DEFAULT_THEME, primary: e.target.value } })}
                      className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Accent Hover</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={draft.theme?.accentHover ?? DEFAULT_THEME.accentHover}
                      onChange={(e) => updateDraft({ theme: { ...draft.theme, ...DEFAULT_THEME, accentHover: e.target.value } })}
                      className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={draft.theme?.accentHover ?? DEFAULT_THEME.accentHover}
                      onChange={(e) => updateDraft({ theme: { ...draft.theme, ...DEFAULT_THEME, accentHover: e.target.value } })}
                      className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Background</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={draft.theme?.background ?? DEFAULT_THEME.background}
                      onChange={(e) => updateDraft({ theme: { ...draft.theme, ...DEFAULT_THEME, background: e.target.value } })}
                      className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={draft.theme?.background ?? DEFAULT_THEME.background}
                      onChange={(e) => updateDraft({ theme: { ...draft.theme, ...DEFAULT_THEME, background: e.target.value } })}
                      className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
              {/* Text & Border Colors Row */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Text</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={draft.theme?.text ?? DEFAULT_THEME.text}
                      onChange={(e) => updateDraft({ theme: { ...draft.theme, ...DEFAULT_THEME, text: e.target.value } })}
                      className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={draft.theme?.text ?? DEFAULT_THEME.text}
                      onChange={(e) => updateDraft({ theme: { ...draft.theme, ...DEFAULT_THEME, text: e.target.value } })}
                      className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Muted Text</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={draft.theme?.textMuted ?? DEFAULT_THEME.textMuted}
                      onChange={(e) => updateDraft({ theme: { ...draft.theme, ...DEFAULT_THEME, textMuted: e.target.value } })}
                      className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={draft.theme?.textMuted ?? DEFAULT_THEME.textMuted}
                      onChange={(e) => updateDraft({ theme: { ...draft.theme, ...DEFAULT_THEME, textMuted: e.target.value } })}
                      className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Border</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={draft.theme?.border ?? DEFAULT_THEME.border}
                      onChange={(e) => updateDraft({ theme: { ...draft.theme, ...DEFAULT_THEME, border: e.target.value } })}
                      className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={draft.theme?.border ?? DEFAULT_THEME.border}
                      onChange={(e) => updateDraft({ theme: { ...draft.theme, ...DEFAULT_THEME, border: e.target.value } })}
                      className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Button style</label>
                <select
                  value={draft.theme?.buttonStyle ?? "solid"}
                  onChange={(e) => updateDraft({ theme: { ...draft.theme, ...DEFAULT_THEME, buttonStyle: e.target.value as StorefrontButtonStyle } })}
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
                { key: "treats", label: "Treats", desc: "Products, video calls, chat sessions" },
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
                    onChange={(e) => updateDraft({ sections: { ...draft.sections, ...DEFAULT_SECTIONS, [key]: e.target.checked } })}
                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600"
                  />
                </label>
              ))}
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
                      Let fans join for free. You can still sell treats, tips, and unlockable content.
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
                  <span className="text-sm text-gray-700 dark:text-gray-300">Video</span>
                </label>
              </div>
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
              className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
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

        {/* Right: Live Preview */}
        <div className="lg:sticky lg:top-4">
          <div className="flex items-center justify-between mb-2">
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
              {draft.handle?.trim() && draft.handle !== "preview" && (
                <button
                  type="button"
                  onClick={() => window.open(`/${draft.handle}?preview=member`, "_blank")}
                  className="px-2 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center gap-1"
                  title={`Open /${draft.handle} in new tab`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <StorefrontPreview config={draft} previewMode={previewMode} />
        </div>
      </div>

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
