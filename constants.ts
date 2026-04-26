import { Message, AnalyticsData, TeamMember, Client, Notification, TourStep, User, Activity, Settings, Post } from './types';

// Global feature flag: run EchoFlux as an AI Content Studio
// with planning and generation only, no live social posting.
export const OFFLINE_MODE = false;

// Social platform Inbox (IG/TikTok/X DMs) is not part of EchoFlux. Removed entirely.
// "Messages" in the app = fan DMs only (fans ↔ creator), managed in Fan Hub.
// (No INBOX_ENABLED flag - feature removed.)

/**
 * Storefront / fan-site content policy (echoflux.ai/{handle}).
 * EchoFlux storefronts are for creators sharing lifestyle, fitness, fashion, art, and similar content.
 */
export const STOREFRONT_CONTENT_POLICY = {
  label: 'Content Guidelines',
  rules: [
    'Content must comply with applicable laws.',
    'No content depicting minors inappropriately.',
    'No harassment, hate speech, or discrimination.',
    'No illegal content or scams.',
  ] as const,
} as const;

/**
 * sessionStorage key: set immediately before fan storefront email/Google signup so AuthContext
 * creates `users/{uid}` with plan Free + hasCompletedOnboarding (skips EchoFlux PlanSelectorModal).
 */
export const FAN_STOREFRONT_SIGNUP_SESSION_KEY = 'echofluxFanStorefrontSignup';

/**
 * sessionStorage key: returning from Stripe Checkout cancel suppresses auto-redirect to checkout until the fan
 * taps Subscribe again. FanStorefrontView sets this when it strips `checkout_cancel` / legacy `paywall` from the URL.
 */
export function fanStorefrontSkipAutoSubscribeKey(creatorId: string): string {
  return `echofluxFanSkipAutoSubscribe:${creatorId}`;
}

/** EchoFlux creator subscriptions: monthly USD and fixed annual totals (match Stripe yearly prices). */
export const ECHOFLUX_PRO_MONTHLY_USD = 29;
export const ECHOFLUX_ELITE_MONTHLY_USD = 59;

/** Invite-only Stripe prices: Creator Pro $1/mo, Creator Elite $2/mo (monthly only). */
export const ECHOFLUX_CREATOR_PRO_INVITE_USD = 1;
export const ECHOFLUX_CREATOR_ELITE_INVITE_USD = 2;
export const ECHOFLUX_PRO_ANNUAL_TOTAL_USD = 276;
export const ECHOFLUX_ELITE_ANNUAL_TOTAL_USD = 564;

/** Only used when `monthlyUsd` is not Pro/Elite (20% off 12× monthly). */
const ECHOFLUX_ANNUAL_FALLBACK_DISCOUNT = 0.2;

/** Total charged per year when billed annually (USD). */
export function echofluxAnnualTotalUsd(monthlyUsd: number): number {
  if (monthlyUsd === ECHOFLUX_PRO_MONTHLY_USD) return ECHOFLUX_PRO_ANNUAL_TOTAL_USD;
  if (monthlyUsd === ECHOFLUX_ELITE_MONTHLY_USD) return ECHOFLUX_ELITE_ANNUAL_TOTAL_USD;
  return Math.round(monthlyUsd * 12 * (1 - ECHOFLUX_ANNUAL_FALLBACK_DISCOUNT) * 100) / 100;
}

/** Effective monthly equivalent when on annual (for UI): annual total ÷ 12. */
export function echofluxEffectiveMonthlyWhenAnnualUsd(monthlyUsd: number): number {
  const annual = echofluxAnnualTotalUsd(monthlyUsd);
  return Math.round((annual / 12) * 100) / 100;
}

/** Stripe Checkout annual line-item override (cents). */
export function echofluxAnnualTotalCents(monthlyUsd: number): number {
  if (monthlyUsd === ECHOFLUX_PRO_MONTHLY_USD) return Math.round(ECHOFLUX_PRO_ANNUAL_TOTAL_USD * 100);
  if (monthlyUsd === ECHOFLUX_ELITE_MONTHLY_USD) return Math.round(ECHOFLUX_ELITE_ANNUAL_TOTAL_USD * 100);
  return Math.round(monthlyUsd * 100 * 12 * (1 - ECHOFLUX_ANNUAL_FALLBACK_DISCOUNT));
}

// Analytics UI is currently disabled in the app.
export const ANALYTICS_ENABLED = false;

/** Platforms shown on the Connections page. Add others as they are approved. */
export const CONNECTION_VISIBLE_PLATFORMS = ['Instagram', 'X', 'Facebook'] as const;

/**
 * Paths that belong to the app (dashboard, compose, settings, etc.).
 * If pathname matches a known route, use activePage; otherwise treat as /{handle} fan storefront.
 * Keep in sync with UIContext pathToPage and App.tsx storefront detection.
 */
export const KNOWN_APP_ROUTES: readonly string[] = [
  '/',
  '/creators/apply',
  '/dashboard',
  '/analytics',
  '/settings',
  '/write-captions',
  '/compose',
  '/compose/drafts',
  '/my-schedule',
  '/calendar',
  '/drafts',
  '/approvals',
  '/team',
  '/find-trends',
  '/opportunities',
  '/profile',
  '/about',
  '/contact',
  '/pricing',
  '/clients',
  '/faq',
  '/terms',
  '/privacy',
  '/dataDeletion',
  '/admin',
  '/automation',
  '/bio-link-page',
  '/bio',
  '/plan-my-week',
  '/strategy',
  '/creator-os',
  '/ads',
  '/my-vault',
  '/mediaLibrary',
  '/autopilot',
  '/studio',
  '/fan',
  '/premium-content-studio',
  '/premiumcontentstudio',
  '/onlyfansStudio',
  '/email-center',
  '/emailCenter',
  '/reset-password',
  '/premium-studio-upgrade',
  '/fan-hub',
  '/witme-page',
  '/data-deletion',
] as const;

/** Premium Studio tab IDs only (for /studio?tab=...) */
export const STUDIO_TAB_IDS = ['persona', 'ideas', 'drops', 'dmSession', 'teasers'] as const;
export type StudioTabId = (typeof STUDIO_TAB_IDS)[number];

/** Fan Hub tab IDs only (for /fan?tab=...) */
export const FAN_HUB_TAB_IDS = ['myPage', 'posts', 'treats', 'messages', 'sessions', 'videoChats', 'fans', 'analytics', 'purchases', 'payouts', 'users'] as const;
export type FanHubTabId = (typeof FAN_HUB_TAB_IDS)[number];

/** Labels for Premium Studio tabs */
export const STUDIO_TAB_LABELS: Record<StudioTabId, string> = {
  ideas: 'New Ideas',
  drops: 'Drops & PPV',
  dmSession: 'DM Session',
  persona: 'Creator Identity',
  teasers: 'Teasers',
};

/** Labels for Fan Hub tabs */
export const FAN_HUB_TAB_LABELS: Record<FanHubTabId, string> = {
  myPage: 'My Page',
  posts: 'Posts',
  treats: 'Store',
  messages: 'Messages',
  sessions: 'Chat Session',
  videoChats: 'Video Chats',
  fans: 'Fans',
  analytics: 'Analytics',
  purchases: 'Purchases',
  payouts: 'Payouts',
  users: 'Users',
};

/** @deprecated Use STUDIO_TAB_IDS or FAN_HUB_TAB_IDS depending on section */
export const PREMIUM_STUDIO_TAB_IDS = [...STUDIO_TAB_IDS, ...FAN_HUB_TAB_IDS] as const;
export type PremiumStudioTabId = (typeof PREMIUM_STUDIO_TAB_IDS)[number];

/** @deprecated Use STUDIO_TAB_LABELS or FAN_HUB_TAB_LABELS */
export const PREMIUM_STUDIO_TAB_LABELS: Record<string, string> = { ...STUDIO_TAB_LABELS, ...FAN_HUB_TAB_LABELS };

/** Theme presets for Fan Hub storefront (creator can pick one or customize after) */
export { FAN_HUB_THEME_PRESETS, type FanHubThemePreset } from "./src/lib/fanHubThemePresets";

/** Hero layout options for storefront landing page */
export const HERO_LAYOUT_OPTIONS: { value: 'default' | 'centered' | 'split' | 'splitRight'; label: string; description: string }[] = [
  {
    value: 'default',
    label: 'Default',
    description: 'Hero photo beside text (image left) when you have hero art; stacked when you don’t',
  },
  { value: 'centered', label: 'Centered', description: 'Compact stacked hero (image above text)' },
  { value: 'split', label: 'Image left', description: 'Same as default when you have photos — always side-by-side' },
  { value: 'splitRight', label: 'Image right', description: 'Text on the left, hero photo on the right' },
];

/** Hero media size options (for multiple hero images) */
export const HERO_MEDIA_SIZE_OPTIONS: { value: 'small' | 'medium' | 'large' | 'fullBackground'; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'fullBackground', label: 'Full background' },
];

/** Full-background hero: which part of the image is visible (maps to CSS background-position) */
export const HERO_BG_POSITION_OPTIONS: { value: string; label: string }[] = [
  { value: 'center', label: 'Center' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'top left', label: 'Top left' },
  { value: 'top right', label: 'Top right' },
  { value: 'bottom left', label: 'Bottom left' },
  { value: 'bottom right', label: 'Bottom right' },
];

/** Product types for Fan Hub store (creator add/edit) */
export const TREAT_PRODUCT_TYPES = [
  { id: 'tip', label: 'Tip' },
  { id: 'unlock_media', label: 'Unlock media' },
  { id: 'bundle', label: 'Bundle' },
  { id: 'chat_session', label: 'Chat session' },
  { id: 'voice_note_30s', label: '30 sec voice note' },
  { id: 'voice_note_60s', label: '60 sec voice note' },
  { id: 'private_video_reply', label: 'Private video reply' },
  { id: 'birthday_message', label: 'Birthday message' },
  { id: 'overthinking_response', label: 'Overthinking response' },
  { id: 'random_checkin', label: 'Random check-in' },
  { id: 'live_chat_15m', label: '15 min live chat' },
  { id: 'live_chat_30m', label: '30 min live chat' },
  { id: 'live_chat_45m', label: '45 min live chat' },
  { id: 'live_chat_1h', label: '1 hr live chat' },
  { id: 'live_video_5m', label: '5 min video call' },
  { id: 'live_video_10m', label: '10 min video call' },
  { id: 'live_video_15m', label: '15 min video call' },
  { id: 'live_video_30m', label: '30 min video call' },
  { id: 'custom', label: 'Custom' },
] as const;
export type TreatProductTypeId = (typeof TREAT_PRODUCT_TYPES)[number]['id'];

/** Video minute add-on packs for creators to purchase */
export const VIDEO_MINUTE_PACKS = [
  { id: 'video_minutes_50', minutes: 50, priceCents: 999, label: '50 Minutes' },
  { id: 'video_minutes_100', minutes: 100, priceCents: 1799, label: '100 Minutes' },
  { id: 'video_minutes_250', minutes: 250, priceCents: 3999, label: '250 Minutes' },
  { id: 'video_minutes_500', minutes: 500, priceCents: 6999, label: '500 Minutes' },
] as const;
export type VideoMinutePackId = (typeof VIDEO_MINUTE_PACKS)[number]['id'];

export const COPYRIGHT_PROTECTION_NOTICE = `This content is COPYRIGHT PROTECTED © All rights reserved.

Unauthorized use, reproduction, screen recording, copying, downloading, redistribution, resale, or publication of any images, photos, videos, messages, or paid content is prohibited and may result in legal action, including financial damages and penalties. We will pursue civil and criminal litigation against anyone infringing our clients' copyrights.`;

/**
 * Default Privacy Policy for creator Fan Hub / storefront pages.
 * Creators may edit or replace this text. Not a substitute for legal advice.
 * Covers: memberships, tips, digital products, messaging, feed, EchoFlux/Fan Hub platform role, Stripe, Firebase-class hosting.
 */
export const DEFAULT_PRIVACY_POLICY = `Last updated: April 3, 2026
WHO THIS POLICY COVERS
This Privacy Policy explains how information is handled when you use this creator page and related fan features (the "Service"), including account access, memberships, paid content, direct messages, tips, and session bookings where enabled. The page is operated by the creator shown on this profile ("we," "us," "our"). The page is hosted on witme.io and connected to EchoFlux / Fan Hub infrastructure operated by the platform.

WHAT WE COLLECT
• Account details: email, username/display name, account identifiers, and profile settings.
• Purchase and billing metadata: membership status, product type, amount, timestamps, and payment status.
• Creator-page interactions: direct messages, purchases, fan actions, and support requests.
• Device and log data: browser type, IP-based region, timestamps, and security diagnostics.
• Guest checkout details: limited account and transaction metadata needed to deliver purchased access.

HOW WE USE INFORMATION
We use information to provide the Service, process purchases, deliver paid access, send receipts and service notices, prevent fraud and abuse, enforce terms, and improve reliability.

PAYMENTS
Payments are processed by Stripe. Card and bank details are handled by Stripe and are not stored on this creator page backend. Stripe's privacy policy applies to payment data: https://stripe.com/privacy

WHO CAN SEE WHAT
• The creator can see fan data needed to deliver their offerings (for example: display name, contact details provided through purchases, and purchase history on this page).
• The creator cannot see your purchases with other creators.
• Message and safety-report data may be reviewed for policy, abuse, legal, or security reasons.

SERVICE PROVIDERS
We use providers for hosting, authentication, storage, security, analytics, notifications, and payments. These providers process data only as needed to operate the Service.

COOKIES AND SIMILAR TOOLS
We use cookies/local storage for sign-in, preferences, analytics, and abuse prevention. Required cookies are necessary for core functionality.

DATA RETENTION
Data is retained as needed to run the Service, meet legal obligations, resolve disputes, and enforce agreements. Deletion requests may be subject to legal retention exceptions.

YOUR RIGHTS
Depending on your location, you may have rights to access, correct, delete, export, or object to certain processing. To submit requests, contact the creator through this page or contact EchoFlux support at contact@echoflux.ai for platform-level requests.

SECURITY
We use reasonable administrative and technical safeguards. No system is perfectly secure.

COPYRIGHT-PROTECTED CONTENT
${COPYRIGHT_PROTECTION_NOTICE}

CHILDREN
This Service is not intended for minors. Accounts and purchases require adult eligibility.

CHANGES
We may update this policy and will revise the date above when updates are posted.

CONTACT
For creator-page privacy questions, contact the creator through this page. For EchoFlux platform privacy questions, contact: contact@echoflux.ai

This is a default template. Creators should review and adapt this text with legal counsel for their jurisdiction and business model.`;

/**
 * Default Terms of Service for creator Fan Hub / storefront pages.
 * Creators may edit or replace this text. Not a substitute for legal advice.
 * Strong content-protection language retained; expanded for subscriptions, tips, store purchases, platform role, liability.
 */
export const DEFAULT_TERMS_OF_SERVICE = `Last updated: April 3, 2026
1. ACCEPTANCE
By using this creator page and related fan features (the "Service"), you agree to these Terms and the Privacy Policy on this page.

2. WHO OPERATES THIS PAGE
This page is operated by the creator shown on this profile ("we," "us," "our"). It is hosted on witme.io and powered by EchoFlux / Fan Hub technology. Your purchases are primarily with the creator operating this page.

3. ELIGIBILITY
You must be at least 18 years old (or the age of majority in your jurisdiction) to use paid features.

4. SERVICE FEATURES
Depending on what is enabled by the creator, the Service may include memberships, paid posts, direct messages, tips, one-time offers, and scheduled or live sessions.

5. VARIABLE CREATOR OFFERINGS
Not every feature is available on every creator page. The creator controls which offers are active.

6. PAYMENTS AND RENEWALS
Payments are processed through Stripe. Memberships may renew automatically until canceled. Pricing and billing terms are shown at checkout.

7. REFUNDS AND ACCOUNT DELETION
Unless required by law or stated at checkout, digital purchases are generally final after delivery. Charge issues should be reported promptly. If you delete your fan account, access ends immediately and recurring memberships are canceled so you are not charged again; that does not automatically refund amounts already billed for the current period unless required by law or stated at checkout. Canceling a membership without deleting your account usually keeps access until the end of the period you already paid for.

8. CREATOR INTERACTION
Creators may use assistants or team support for page operations, messages, and fulfillment. Response times and availability are not guaranteed.

9. CONTENT USE RULES
Content on this page is for personal, on-platform use only. You may not copy, record, scrape, redistribute, or resell creator content or private messages without written permission.

COPYRIGHT PROTECTION NOTICE
${COPYRIGHT_PROTECTION_NOTICE}

10. PROHIBITED CONDUCT
You may not use this Service for harassment, hate, impersonation, fraud, unlawful activity, non-consensual content, exploitative content, or rights infringement.

11. MODERATION AND BLOCKING
The creator and platform may block accounts, remove content, restrict features, or suspend access for safety, policy, legal, or payment reasons.

12. INTELLECTUAL PROPERTY
Creator content belongs to the creator or their licensors. Platform software and branding (EchoFlux / witme.io) belong to their respective licensors.

13. DISCLAIMER
The Service is provided as-is and as-available. We do not guarantee uninterrupted access, specific outcomes, or specific response quality.

14. LIABILITY LIMITS
To the fullest extent permitted by law, indirect or consequential damages are excluded. Disputes about creator-specific offerings are generally between the fan and the creator.

15. PLATFORM ROLE (ECHOFLUX / WITME.IO)
EchoFlux and witme.io provide infrastructure, checkout integration, authentication, and safety tooling. The platform is not the seller of the creator's offerings on this page.

16. CHANGES
We may update these Terms and will update the date above when changes are posted.

17. CONTACT
For questions about this creator page, contact the creator through available contact methods. For platform-level questions, contact EchoFlux at contact@echoflux.ai

This default template is not legal advice. Creators should review and adapt it with qualified legal counsel.`;

export const defaultSettings: Settings = {
  autoReply: true,
  autoRespond: false,
  safeMode: true,
  highQuality: false,
  tone: {
    formality: 50,
    humor: 30,
    empathy: 70,
    spiciness: 0,
  },
  voiceMode: true,
  prioritizedKeywords: 'collaboration, pricing, question',
  ignoredKeywords: 'spam, giveaway, follow back',
  connectedAccounts: {
    Instagram: true,
    TikTok: true,
    X: true,
    Threads: true,
    YouTube: false,
    LinkedIn: true,
    Facebook: true,
    Pinterest: false,
    'My Page': false,
  }
};

export const MOCK_MESSAGES: Message[] = [
  { id: '1', platform: 'Instagram', type: 'DM', user: { name: 'Sarah Jenkins', avatar: 'https://i.pravatar.cc/150?u=1' }, content: 'Hey! I love your latest post about sustainable packaging. Do you offer wholesale rates for small businesses?', timestamp: '10m ago', sentiment: 'Positive', isFavorite: true },
  { id: '2', platform: 'X', type: 'Comment', user: { name: 'TechDaily', avatar: 'https://i.pravatar.cc/150?u=2' }, content: 'This is exactly what the industry needed. Great insights on the new AI regulations.', timestamp: '45m ago', sentiment: 'Positive' },
  { id: '3', platform: 'TikTok', type: 'Comment', user: { name: 'Mike_Creator', avatar: 'https://i.pravatar.cc/150?u=3' }, content: 'Where did you get that microphone setup? The audio is crisp! 🎤', timestamp: '2h ago', sentiment: 'Neutral' },
  { id: '4', platform: 'LinkedIn', type: 'DM', user: { name: 'Enterprise Solutions Inc.', avatar: 'https://i.pravatar.cc/150?u=4' }, content: 'We would like to discuss a potential partnership for our upcoming Q4 campaign. Please let us know the best email to reach you.', timestamp: '5h ago', sentiment: 'Positive', isFlagged: true },
  { id: '5', platform: 'Instagram', type: 'Comment', user: { name: 'AnonUser99', avatar: 'https://i.pravatar.cc/150?u=5' }, content: 'Shipping took way too long. Not happy.', timestamp: '1d ago', sentiment: 'Negative', isFlagged: true },
  { id: '6', platform: 'Threads', type: 'Comment', user: { name: 'CreativeMind', avatar: 'https://i.pravatar.cc/150?u=6' }, content: 'Totally agree with this take. 🔥', timestamp: '1d ago', sentiment: 'Positive' },
  { id: '7', platform: 'Facebook', type: 'Comment', user: { name: 'Local Community Group', avatar: 'https://i.pravatar.cc/150?u=7' }, content: 'We are sharing this with our members. Very helpful information!', timestamp: '2d ago', sentiment: 'Positive' }
];

export const MOCK_ANALYTICS: AnalyticsData = {
  responseRate: [ { name: 'Mon', value: 85 }, { name: 'Tue', value: 92 }, { name: 'Wed', value: 88 }, { name: 'Thu', value: 95 }, { name: 'Fri', value: 89 }, { name: 'Sat', value: 75 }, { name: 'Sun', value: 80 } ],
  followerGrowth: [ { name: 'Week 1', value: 120 }, { name: 'Week 2', value: 150 }, { name: 'Week 3', value: 180 }, { name: 'Week 4', value: 250 } ],
  sentiment: [ { name: 'Positive', value: 65 }, { name: 'Neutral', value: 25 }, { name: 'Negative', value: 10 } ],
  totalReplies: 1248,
  newFollowers: 452,
  engagementIncrease: 12.5,
  topTopics: ['AI Tools', 'Productivity', 'Remote Work'],
  suggestedFaqs: ['What is your pricing?', 'Do you offer API access?', 'How do I cancel?'],
  engagementInsights: [ { icon: 'idea', title: 'Post at 10 AM', description: 'Your audience is most active on Tuesdays at 10 AM EST.' }, { icon: 'topic', title: 'Video Content', description: 'Reels are getting 2.5x more engagement than static posts this week.' }, { icon: 'question', title: 'Pricing Questions', description: 'You received 15 questions about enterprise pricing. Consider a dedicated post.' } ],
};

export const MOCK_TEAM_MEMBERS: TeamMember[] = [
    { id: 'tm1', name: 'Alex Rivera', email: 'alex@company.com', avatar: 'https://i.pravatar.cc/150?u=20', role: 'Admin', assignedClientIds: [] },
    { id: 'tm2', name: 'Jordan Lee', email: 'jordan@company.com', avatar: 'https://i.pravatar.cc/150?u=21', role: 'Member', assignedClientIds: [] },
    { id: 'tm3', name: 'Casey Smith', email: 'casey@company.com', avatar: 'https://i.pravatar.cc/150?u=22', role: 'Member', assignedClientIds: [] },
];

export const MOCK_CLIENTS: Client[] = [
    { id: 'c1', name: 'Apex Fitness', avatar: 'https://i.pravatar.cc/150?u=30', plan: 'Pro', notifications: { newMessages: true, weeklySummary: true, trendAlerts: false }, monthlyCaptionGenerationsUsed: 12, monthlyImageGenerationsUsed: 5, monthlyVideoGenerationsUsed: 0, mediaLibrary: [], storageUsed: 120, storageLimit: 1024, settings: defaultSettings },
    { id: 'c2', name: 'Luxe Interiors', avatar: 'https://i.pravatar.cc/150?u=31', plan: 'Elite', notifications: { newMessages: true, weeklySummary: true, trendAlerts: true }, monthlyCaptionGenerationsUsed: 450, monthlyImageGenerationsUsed: 120, monthlyVideoGenerationsUsed: 5, mediaLibrary: [], storageUsed: 4500, storageLimit: 10240, settings: defaultSettings }
];

export const MOCK_NOTIFICATIONS: Notification[] = [
    { id: 'n1', text: 'New DM from Sarah Jenkins', timestamp: '10m ago', read: false, messageId: '1' },
    { id: 'n2', text: 'Trend Alert: #SummerVibes is spiking', timestamp: '2h ago', read: false, messageId: '0' },
    { id: 'n3', text: 'Weekly Analytics Summary Available', timestamp: '1d ago', read: true, messageId: '0' },
];

export const MOCK_POSTS: Post[] = [
      { id: 'p1', content: 'Check out our new summer collection! 🌞 #SummerVibes #Fashion', platforms: ['Instagram', 'X'], status: 'Draft', author: { name: 'Alice Manager', avatar: 'https://i.pravatar.cc/150?u=60' }, comments: [] },
      { id: 'p2', content: 'Why AI is changing the game for marketers. Read more on our blog.', platforms: ['LinkedIn'], status: 'In Review', author: { name: 'Bob Creator', avatar: 'https://i.pravatar.cc/150?u=61' }, comments: [ { id: 'c1', user: 'Alice Manager', text: 'Can we make the tone a bit more professional?', timestamp: new Date().toISOString() } ] },
      { id: 'p3', content: 'Big announcement coming tomorrow! Stay tuned.', platforms: ['X', 'Threads'], status: 'Approved', author: { name: 'Alice Manager', avatar: 'https://i.pravatar.cc/150?u=60' }, comments: [] },
      { id: 'p4', content: 'Happy Friday everyone! What are your plans for the weekend?', mediaType: 'image', mediaUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60', platforms: ['Instagram', 'LinkedIn'], status: 'Scheduled', author: { name: 'Bob Creator', avatar: 'https://i.pravatar.cc/150?u=61' }, scheduledDate: new Date(Date.now() + 86400000).toISOString(), comments: [] }
];

export const getTourStepsForPlan = (user: User): TourStep[] => {
    const plan = user.plan || 'Free';
    const hasFanHubAccess = ['Pro', 'Elite', 'CreatorPro', 'CreatorElite', 'Agency', 'OnlyFansStudio'].includes(plan);
    let steps: TourStep[] = [
      { elementId: 'tour-step-1-dashboard', page: 'dashboard', title: 'Your Command Center', content: 'This is your home base. Check stats, upcoming posts, and urgent items.', position: 'top' },
      { elementId: 'tour-step-theme-toggle', page: 'dashboard', title: 'Light / Dark Mode', content: 'Use the sun/moon button (top right) to toggle themes anytime.', position: 'left' },
      { elementId: 'tour-step-3-compose-nav', page: 'compose', title: 'Write Captions', content: 'Generate caption ideas quickly and keep your posting flow moving.', position: 'right' },
    ];

    if (user.hasAutopilot) {
        steps.push({ elementId: 'tour-step-autopilot-nav', page: 'autopilot', title: 'AI Autopilot', content: 'Define a goal, and Autopilot will generate a full content strategy and create posts for your approval.', position: 'right' });
    }

    if (hasFanHubAccess) {
        steps.push({ elementId: 'tour-step-fanhub-nav', page: 'fanHub', title: 'Fan Hub', content: 'Build your fan community: customize your page, post to the feed, sell from your store, and message fans.', position: 'right' });
        steps.push({ elementId: 'tour-step-fanhub-mypage', page: 'fanHub', title: 'My Page', content: 'Set your handle (witme.io/you), theme, and landing content. Preview how fans see your page.', position: 'bottom' });
    }

    steps.push({
        elementId: 'tour-step-5-ai-training-tab',
        page: 'settings',
        title: 'Profile & AI',
        content: 'Set Creator Profile, tone sliders, and Personality Override in one place. Elite: use Creator Identity for your default brand direction.',
        position: 'bottom',
    });

    steps.push({ elementId: 'tour-step-5-profile-avatar', title: 'Your Profile & Settings', content: 'Access your profile, manage billing, or sign out. You can also create your "Bio Link Page" from the sidebar!', position: 'bottom' });

    return steps;
};
