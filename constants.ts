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
  '/data-deletion',
] as const;

/** Premium Studio tab IDs only (for /studio?tab=...) */
export const STUDIO_TAB_IDS = ['ideas', 'drops', 'dmSession', 'persona', 'teasers'] as const;
export type StudioTabId = (typeof STUDIO_TAB_IDS)[number];

/** Fan Hub tab IDs only (for /fan?tab=...) */
export const FAN_HUB_TAB_IDS = ['myPage', 'posts', 'treats', 'messages', 'sessions', 'videoChats', 'fans', 'analytics', 'purchases', 'payouts', 'users'] as const;
export type FanHubTabId = (typeof FAN_HUB_TAB_IDS)[number];

/** Labels for Premium Studio tabs */
export const STUDIO_TAB_LABELS: Record<StudioTabId, string> = {
  ideas: 'New Ideas',
  drops: 'Drops & PPV',
  dmSession: 'DM Session',
  persona: 'Persona Builder',
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
export type FanHubThemePreset = {
  id: string;
  name: string;
  theme: { primary: string; background: string; text?: string; textMuted?: string; fontFamily?: string };
};
export const FAN_HUB_THEME_PRESETS: FanHubThemePreset[] = [
  { id: 'default', name: 'Default', theme: { primary: '#6366f1', background: '#fafafa', text: '#1f2937', textMuted: '#6b7280', fontFamily: 'Inter, sans-serif' } },
  { id: 'stormij', name: 'Warm Pink', theme: { primary: '#c97082', background: '#fef8f9', text: '#2d1f24', textMuted: '#6b5a60', fontFamily: 'Georgia, serif' } },
  { id: 'ocean', name: 'Ocean', theme: { primary: '#0ea5e9', background: '#f0f9ff', text: '#0c4a6e', textMuted: '#0369a1', fontFamily: 'Inter, sans-serif' } },
  { id: 'forest', name: 'Forest', theme: { primary: '#22c55e', background: '#f0fdf4', text: '#14532d', textMuted: '#166534', fontFamily: 'Inter, sans-serif' } },
  { id: 'minimal-dark', name: 'Minimal Dark', theme: { primary: '#a78bfa', background: '#1c1917', text: '#fafaf9', textMuted: '#a8a29e', fontFamily: 'Inter, sans-serif' } },
  { id: 'sunset', name: 'Sunset', theme: { primary: '#f97316', background: '#fff7ed', text: '#431407', textMuted: '#9a3412', fontFamily: 'Lato, sans-serif' } },
];

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

/**
 * Default Privacy Policy for creator Fan Hub / storefront pages.
 * Creators may edit or replace this text. Not a substitute for legal advice.
 * Covers: memberships, tips, digital products, messaging, feed, EchoFlux/Fan Hub platform role, Stripe, Firebase-class hosting.
 */
export const DEFAULT_PRIVACY_POLICY = `Last updated: March 28, 2026

WHO WE ARE AND WHAT THIS PAGE COVERS
This Privacy Policy describes how information is collected, used, shared, and protected when you visit this creator page, create an account, purchase a membership or other offerings, send messages, or otherwise use this Fan Hub experience (the "Service"). The Service may be operated by the creator or brand shown on this page ("we," "us," or "our"). Certain technology used to run this page (including hosting, authentication, payments, and related infrastructure) may be provided by EchoFlux, Fan Hub, EngageSuite, or affiliated service providers (together, the "Platform"). Where the Platform processes personal data on our behalf, we remain responsible to you for how the Service uses your information as described here, subject to the practices of independent payment and infrastructure providers as noted below.

ECHOFLUX PLATFORM POLICIES
EchoFlux publishes platform-wide terms and privacy information at https://echoflux.ai/terms and https://echoflux.ai/privacy. Those documents describe how the Platform processes data for shared login, checkout, fraud prevention, security, and operations when you use Fan Hub or related EchoFlux services. This page supplements (and does not replace) those disclosures for creator-specific practices we describe here.

ECHOFLUX DOES NOT CONTROL OR ANSWER FOR THE CREATOR
The creator or brand operating this Fan Hub ("we" in this Policy) decides what to post, sell, message, and how to use fan information they can see in their tools. EchoFlux and the Platform do not endorse, verify, supervise, or take responsibility for the creator's content, promises, refund decisions, tax or legal compliance, or how the creator handles personal data beyond what the Platform processes as described at echoflux.ai/privacy. Questions about this creator's practices should go to the creator first. EchoFlux is not liable to you for the creator's actions or omissions, except where mandatory law does not allow that limitation.

SCOPE
This policy applies to visitors, registered users, paying members, guests who check out with limited profiles, and anyone who interacts with this site or linked checkout flows. It does not apply to third-party websites, apps, or social networks you access through links we provide; those sites have their own policies.

FAN HUB FEATURES THIS POLICY MAY COVER
Depending on what the creator enables, the Service may include: a public landing page; member-only feed and saved posts; direct messaging between you and the creator; tips and recurring memberships; digital products and unlocks; live or scheduled video sessions (often via a third-party video provider); notifications; and optional custom domains. Data needed to run each feature is processed as described in the sections below.

INFORMATION WE COLLECT
• Account and identity: When you sign up or log in, we may collect your email address, display name or username, profile details you choose to provide, and a unique user identifier tied to your account.
• Guest or limited checkout: If you purchase before completing a full member profile, we may still collect email, Stripe customer identifiers, and purchase metadata needed to deliver access and, where applicable, link the purchase when you later create or sign in to an account.
• Membership and purchases: If you subscribe, tip, unlock content, or buy digital products or sessions from the creator's store, we receive transaction-related information (such as amount, product type, and status). We do not receive your full card number or CVV on our servers; payment data is handled by our payment processor as described under Payments below.
• Content and activity: We collect content you submit (for example posts you comment on, likes, saved items where the feature exists, and direct messages you send or receive through the Service). We may also collect technical data such as device type, browser, approximate location derived from IP address, timestamps, and diagnostic logs needed to operate and secure the Service.
• Communications: If you contact us by email or through the Service, we retain those communications to respond and improve support.
• Creator-added tools: If we enable additional features (for example waitlists, forms, or integrations), we will use information you submit through those features only as disclosed when you use them.

HOW WE USE INFORMATION
We use personal information to: create and manage accounts; authenticate you; process memberships, tips, unlocks, and other purchases; deliver member-only content and features (including feeds and messaging); send service-related notices (such as receipts, password resets, and important policy updates); enforce our Terms of Service; detect, prevent, and address fraud, abuse, and security issues; comply with legal obligations; and improve reliability and performance of the Service. With your consent where required, we may also send promotional messages about this creator's offerings; you may opt out of marketing where applicable.

LEGAL BASES (WHERE APPLICABLE)
If you are in the European Economic Area, UK, or similar regions, we rely on: performance of a contract (to provide what you paid for); legitimate interests (security, analytics, improving the Service, and protecting our rights); consent (where we ask for it, e.g. certain cookies or marketing); and legal obligation where the law requires us to process data.

PAYMENTS — STRIPE
Payments (including subscriptions, tips, and purchases) are processed by Stripe, Inc. and/or its affiliates, including where Stripe Connect is used so that payouts may go to the creator or their business. Card and bank details are collected and stored by Stripe according to Stripe's own privacy policy: https://stripe.com/privacy
We receive limited payment information from Stripe (such as payment status, last four digits of a card where shown, and customer identifiers) to fulfill your orders and support billing questions.

PLATFORM AND INFRASTRUCTURE PROVIDERS
To operate the Service, data may be processed by trusted service providers (subprocessors), which may include: cloud hosting and databases; authentication services; email or notification delivery; error monitoring; and security tools. These providers are permitted to use data only to perform services for us and are subject to confidentiality and security obligations. The Platform may update subprocessors over time; material changes are typically reflected in the operator's main site privacy policy or notices where required.

COOKIES AND SIMILAR TECHNOLOGIES
We and our providers may use cookies, local storage, and similar technologies to keep you signed in, remember preferences, prevent fraud, and understand how the Service is used. You can control some cookies through your browser settings; blocking required cookies may limit certain features.

MESSAGES AND MEMBER-ONLY CONTENT
Direct messages and member-only posts or media are stored so we can display them to you and the creator (and authorized moderators) within the Service. You must not export, scrape, or misuse this data outside the Service; see our Terms of Service. We do not use your private messages to train public AI models unless we separately disclose that and obtain any required consent.

AUTOMATED OR AI-ASSISTED FEATURES
If the Service includes chatbots, content recommendations, or other automated features, we will process inputs and outputs as needed to run those features. Do not submit sensitive personal data (such as government IDs, health information, or payment details) in free-text fields unless a form explicitly requests it.

SAFETY, BLOCKING, AND REPORTS
Creators may block specific fans from sending messages or completing new purchases as implemented on the Platform. If you submit a safety report, we collect the information you provide (such as reason, message references, and timestamps) to review abuse, protect users, and comply with law. Report data may be accessible to the creator, the Platform, and law enforcement when required.

SHARING OF INFORMATION
We do not sell your personal information for money. We may share information: with the Platform and service providers as described above; with the creator's authorized team members or agents who help run this page; when required by law, legal process, or to protect rights and safety; and in connection with a business transfer (e.g. merger), subject to appropriate safeguards. Aggregated or de-identified data that cannot reasonably identify you may be used for analytics or reporting.

INTERNATIONAL TRANSFERS
If you access the Service from outside the country where our servers or providers are located, your information may be transferred to and processed in the United States or other countries. Where required, we use appropriate safeguards (such as standard contractual clauses) for cross-border transfers.

RETENTION
We retain information as long as your account is active, as needed to provide the Service, and as required for legal, tax, audit, and dispute-resolution purposes. Message and transaction records may be kept for a period consistent with those needs. When data is no longer required, we delete or anonymize it subject to backup and archival practices.

YOUR RIGHTS AND CHOICES
Depending on where you live, you may have rights to access, correct, delete, or export your personal data; object to or restrict certain processing; withdraw consent; and opt out of certain "sales" or "sharing" as defined under U.S. state laws. To exercise rights, contact us using the method shown on this page or in your account settings. You may also have the right to complain to a data protection authority. We will not discriminate against you for exercising privacy rights. For requests that concern only how the creator uses information in their business (for example, marketing lists they maintain outside the Platform), contact the creator; EchoFlux cannot control the creator's independent practices and is not responsible for them.

SECURITY
We use administrative, technical, and organizational measures designed to protect personal information. No online service is completely secure; you are responsible for maintaining the confidentiality of your password and for activity under your account.

CHILDREN
The Service is not directed to children under 13 (or the age of digital consent in your region). We do not knowingly collect personal information from children. If you believe we have collected information from a child, contact us so we can delete it.

CHANGES TO THIS POLICY
We may update this Privacy Policy from time to time. We will post the updated version on this page and may change the "Last updated" date. For material changes, we may provide additional notice (for example by email or a banner). Continued use of the Service after the effective date of changes constitutes acceptance of the updated policy where permitted by law.

CONTACT
For privacy questions, data requests, or concerns about this creator page, contact the creator using the contact options provided on this site. For questions specifically about EchoFlux / Fan Hub platform practices, you may also refer to the contact information published on echoflux.ai or the main application privacy policy.

NOTICE TO CALIFORNIA AND OTHER U.S. STATE RESIDENTS (SUMMARY)
Residents of California and certain other states may have rights to know, access, delete, or correct personal information, and to opt out of certain processing or appeal our responses, depending on applicable law. California residents may request information about categories of personal information collected, sources, purposes, disclosures, and rights to access, delete, and opt out of certain sharing. We do not "sell" personal information for money in the traditional sense; we use service providers as described above. You may designate an authorized agent to make requests where the law allows. For requests about data the creator alone controls on their Fan Hub, we may coordinate with the creator where appropriate.

This default policy is a starting template. Creators should review it with qualified legal counsel and adapt it to their jurisdiction, offerings, and data practices.`;

/**
 * Default Terms of Service for creator Fan Hub / storefront pages.
 * Creators may edit or replace this text. Not a substitute for legal advice.
 * Strong content-protection language retained; expanded for subscriptions, tips, store purchases, platform role, liability.
 */
export const DEFAULT_TERMS_OF_SERVICE = `Last updated: March 28, 2026

1. AGREEMENT
By accessing or using this creator page, Fan Hub, member area, checkout pages, or any related features (together, the "Service"), you agree to these Terms of Service ("Terms") and our Privacy Policy. If you do not agree, do not use the Service. The Service may be offered by the creator or brand identified on this page ("we," "us," or "our"). The Service may be powered by technology provided by EchoFlux, Fan Hub, EngageSuite, or related providers (the "Platform"). You acknowledge that the Platform is a technology and infrastructure provider and that your agreement to pay for and receive creator offerings is primarily with us; the Platform's own terms and policies may also apply to your use of the underlying software, including https://echoflux.ai/terms and https://echoflux.ai/privacy when you use shared authentication or checkout.

2. ELIGIBILITY AND ACCOUNTS
You must be at least 18 years old (or the age of majority where you live, if higher) to use the Service. You must provide accurate registration information and keep your login credentials secure. You are responsible for all activity under your account. Notify us promptly of any unauthorized use. We may refuse service, close accounts, or limit features for violations of these Terms or applicable law.

3. DESCRIPTION OF THE SERVICE
The Service may include: a public landing page; member subscriptions; paywalled or member-only feed posts, images, or videos; saved posts or bookmarks where available; tips; one-time purchases such as digital products, unlocks, or booked experiences from the creator's store; direct messaging between you and the creator; live or scheduled video sessions (which may use third-party video infrastructure); comments or engagement features; optional custom domains; and other tools we enable from time to time. Payments to the creator are typically processed through Stripe (including Stripe Connect); the Platform may charge the creator a separate platform fee on Fan Hub revenue, which does not change your checkout price unless we expressly state otherwise at purchase. We may add, change, or discontinue features with reasonable notice where practicable. The Service is provided "as is" without guarantee of uninterrupted or error-free operation.

3A. RELATIONSHIP BETWEEN YOU, THE CREATOR, AND THE PLATFORM
Your purchases, memberships, tips, and digital access are agreements with the creator (us on this page), not with EchoFlux. EchoFlux, Fan Hub, EngageSuite, and related Platform operators ("EchoFlux") furnish software, hosting, authentication, Stripe-based checkout integration, and safety tooling. EchoFlux is not your seller, employer, agent, or partner of the creator. EchoFlux does not review, approve, or guarantee creator content, pricing, refunds, tax treatment, identity beyond routine sign-in, or any statement the creator makes on this page or in messages.

3B. ECHOFLUX NOT RESPONSIBLE FOR CREATORS — RELEASE
To the fullest extent permitted by applicable law, you acknowledge and agree that: (i) EchoFlux is not liable for any loss, harm, or dispute arising from the creator's content, conduct, products, services, messages, refund decisions, failure to deliver, alleged misrepresentation, infringement, privacy practices specific to the creator's own use of your data, or any interaction between you and the creator; (ii) any such matter is solely between you and the creator, and you look only to the creator for remedies (subject to Stripe's role in payment processing and rights you cannot waive under mandatory consumer law); (iii) EchoFlux does not warrant that creators will comply with law or these Terms; (iv) you release and hold harmless EchoFlux and its affiliates, officers, directors, employees, and contractors from claims, demands, and damages (actual and consequential) of every kind arising out of or in any way connected with disputes involving the creator or the Service content, except for EchoFlux's own gross negligence, fraud, or willful misconduct where such exclusion is not enforceable.

3C. BLOCKING, REPORTS, AND ENFORCEMENT
We or the Platform may block or restrict access to messaging or new purchases if you are blocked by the creator or for violations of these Terms or law. You may use in-product reporting tools where available. We and the Platform may investigate reports, suspend access, and cooperate with law enforcement as required. EchoFlux may take action for platform safety or legal reasons; that does not make EchoFlux responsible for ongoing moderation of the creator's page.

4. MEMBERSHIPS AND RECURRING SUBSCRIPTIONS
If you purchase a recurring membership, you authorize us (through our payment processor, Stripe) to charge your payment method on each billing cycle until you cancel. Pricing, billing frequency, and what is included are shown at checkout or on this page. You may cancel before the next billing date as described in checkout receipts, account tools, or Stripe's customer billing portal where available. Cancellation typically stops future charges; it does not always refund the current period unless required by law or expressly stated at purchase.

5. TIPS, ONE-TIME PURCHASES, AND DIGITAL GOODS
Tips, unlocks, and other one-time charges are final once successfully processed unless otherwise required by law or expressly stated at checkout. Digital content and access are deemed delivered when made available in your account. You waive any statutory right of withdrawal for digital content where the law allows waiver once delivery has begun.

6. SCHEDULED SESSIONS, STORE PURCHASES, AND THIRD-PARTY TOOLS
If you book live chat, video, or similar sessions, additional rules (including scheduling, no-shows, and rescheduling) may apply as shown at purchase. Sessions may use third-party video or communication tools; your use of those tools may be subject to the third party's terms. We are not responsible for failures of third-party networks or equipment outside our reasonable control.

7. PAYMENTS, TAXES, AND STRIPE
Payments are processed by Stripe. You agree to Stripe's terms and privacy policy (https://stripe.com/legal and https://stripe.com/privacy). You are responsible for any taxes associated with your purchases except where we are legally required to collect them. If a payment fails, we may suspend access until payment succeeds.

8. REFUNDS AND CHARGEBACKS
Unless otherwise stated at checkout or required by law, fees are non-refundable. If you dispute a charge with your bank ("chargeback") without first contacting us in good faith, we may terminate your access and pursue available remedies. We may grant refunds or credits in our sole discretion where appropriate.

9. INTELLECTUAL PROPERTY
All content on the Service (including images, videos, text, graphics, logos, and software), except content you submit as a user, is owned by us or our licensors and is protected by copyright, trademark, and other laws. Except for the limited rights in Section 11, no rights are granted to you.

10. YOUR CONTENT AND LICENSE TO US
If you submit comments, messages, or other content ("User Content"), you represent that you have the rights to do so. You grant us a non-exclusive, worldwide, royalty-free license to host, store, display, reproduce, and distribute User Content solely to operate, promote, and improve the Service and enforce these Terms. You may not submit illegal, infringing, or harmful User Content.

11. LICENSE TO YOU — LIMITED ACCESS ONLY
Subject to these Terms and your payment where required, we grant you a personal, non-exclusive, non-transferable, revocable license to access and view Content through the Service during your active membership or entitlement. No other rights are granted.

12. USE OF CONTENT — PERSONAL VIEWING ONLY
Content is for your personal, non-commercial viewing only while you are in good standing. You may not publicly perform, broadcast, sublicense, or exploit Content except as expressly allowed in writing.

13. STRICT PROHIBITION — NO COPYING, DOWNLOADING, OR REDISTRIBUTION OF MEDIA
YOU ARE STRICTLY PROHIBITED from downloading, copying, saving, capturing, screen-recording, photographing, mirroring, scraping, distributing, selling, licensing, or using in any way—for any reason—any images, videos, audio, or other media ("Content") you access through the Service, except temporary caching strictly necessary for your browser to display the page. This includes use on social media, messaging apps, other websites, AI training datasets, or commercial products. Violation is a material breach and may result in immediate termination, forfeiture of fees, and legal action.

14. IN-APP MESSAGES — CONFIDENTIAL; NO USE OUTSIDE THE SERVICE
Direct messages and similar communications ("Messages") are confidential. YOU MAY NOT copy, download, save, screenshot, record, share, distribute, republish, or use Messages—or excerpts—outside the Service, except where the law prohibits such a restriction. You may not use Messages for harassment, extortion, or unlawful purposes. Violation may result in immediate termination, forfeiture of fees, and legal action.

15. LEGAL CONSEQUENCES AND ENFORCEMENT
Unauthorized use of Content or Messages may violate copyright, right of publicity, contract, privacy, and computer-fraud laws and may result in criminal penalties and civil liability, including statutory damages, injunctive relief, and attorneys' fees where allowed. We may cooperate with law enforcement and pursue all available remedies.

16. PROHIBITED CONDUCT
You agree not to: harass, threaten, or harm others; impersonate any person or entity; spam or scrape the Service; circumvent paywalls or access controls; introduce malware; attempt unauthorized access to systems or other users' data; use the Service for illegal activity; or violate any applicable third-party platform rules when linking from or to the Service.

17. MODERATION AND TERMINATION
We may remove Content or User Content, restrict features, or terminate or suspend your access at any time, with or without notice, for breach of these Terms, risk, non-payment, or operational reasons. Upon termination, Sections that by nature should survive (including intellectual property, limitations of liability, indemnity, and disputes) will survive.

18. DISCLAIMERS
TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE. ECHOFLUX AND THE PLATFORM MAKE NO WARRANTY REGARDING THE CREATOR, THE ACCURACY OF ANY CREATOR CONTENT, OR OUTCOMES OF YOUR DEALINGS WITH THE CREATOR.

19. LIMITATION OF LIABILITY
TO THE MAXIMUM EXTENT PERMITTED BY LAW: (A) IN NO EVENT SHALL WE (THE CREATOR), OUR AFFILIATES, OR ECHOFLUX / THE PLATFORM BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICE. (B) THE CREATOR'S AGGREGATE LIABILITY TO YOU FOR CLAIMS RELATING TO THE SERVICE (YOUR PURCHASES, CONTENT ACCESS, AND DEALINGS WITH US AS CREATOR) SHALL NOT EXCEED THE GREATER OF (I) THE AMOUNTS YOU PAID TO US FOR THE SERVICE IN THE THREE (3) MONTHS BEFORE THE CLAIM OR (II) ONE HUNDRED U.S. DOLLARS (US$100), EXCEPT WHERE LIABILITY CANNOT BE LIMITED BY LAW. (C) ECHOFLUX AND THE PLATFORM SHALL NOT BE LIABLE FOR ANY DAMAGES ARISING FROM THE CREATOR'S CONTENT, CONDUCT, OFFERINGS, OR DISPUTES BETWEEN YOU AND THE CREATOR (SEE SECTION 3B). ECHOFLUX'S TOTAL AGGREGATE LIABILITY TO YOU FOR ANY CLAIM NOT EXCLUDED BY SECTION 3B SHALL NOT EXCEED ONE HUNDRED U.S. DOLLARS (US$100). (D) THE LIMITATIONS IN THIS SECTION APPLY EVEN IF A REMEDY FAILS OF ITS ESSENTIAL PURPOSE, EXCEPT WHERE PROHIBITED BY LAW.

20. INDEMNITY
You agree to indemnify, defend, and hold harmless us (the creator), our affiliates, and our and their directors, employees, and agents, and EchoFlux / the Platform and their affiliates, directors, employees, and agents, from any claims, damages, losses, or expenses (including reasonable attorneys' fees) arising from: (i) your use of the Service; (ii) your User Content; (iii) your breach of these Terms; or (iv) your violation of law or third-party rights. EchoFlux is named here so it may rely on this indemnity where claims arise from your conduct (for example, misuse, harassment, or unlawful redistribution of content) and not from EchoFlux's own independent wrongdoing.

21. GOVERNING LAW AND DISPUTES
These Terms are governed by the laws of the United States and the state or country in which the creator primarily operates, without regard to conflict-of-law principles, except that some consumer protection laws in your place of residence may still apply. You agree that courts in that jurisdiction have personal jurisdiction over disputes arising from these Terms, unless mandatory law requires otherwise. If you are a consumer in the EU/UK, you may also have mandatory rights in your home country.

22. CHANGES TO THESE TERMS
We may modify these Terms from time to time. We will post the updated Terms on this page and update the "Last updated" date. If changes are material, we may provide additional notice. Continued use after the effective date constitutes acceptance unless applicable law requires a different process.

23. MISCELLANEOUS
If any provision is unenforceable, the remaining provisions remain in effect. These Terms and the Privacy Policy are the entire agreement between you and us regarding the Service (subject to Stripe and Platform terms where applicable). Failure to enforce a provision is not a waiver.

24. CREATOR OBLIGATIONS AND INDEMNITY OF ECHOFLUX (WHEN YOU ARE THE CREATOR OPERATING THIS PAGE)
If you are the creator publishing this default text, you agree that you—not EchoFlux—are solely and exclusively responsible to fans and third parties for: your Fan Hub content and listings; products, services, and sessions you offer; pricing and descriptions; messages and community moderation; refunds and chargebacks (except as Stripe's rules apply); tax filings and regulatory compliance; accuracy of your Stripe Connect and payout information; and your use of fan personal data you receive through the Service. EchoFlux does not supervise your page and does not take responsibility for your business decisions or legal compliance. You will not use the Service for illegal, infringing, or non-consensual material. To the fullest extent permitted by law, you will defend, indemnify, and hold harmless EchoFlux, Fan Hub, EngageSuite, the Platform, and their respective affiliates, directors, officers, employees, and contractors from and against any claims, damages, losses, liabilities, fines, and expenses (including reasonable attorneys' fees) brought by any fan or third party arising out of or related to your Fan Hub, your content, your offerings, your conduct, or your handling of user data—whether or not EchoFlux is also named in the claim. Section 20 addresses indemnities from fans for their own conduct.

25. NO PROFESSIONAL ADVICE
This default text is not legal, tax, or financial advice. Creators should have counsel review governing law, refund rules, and disclosures for their jurisdiction.

26. CONTACT
For questions about these Terms or the Service, use the contact method provided on this creator page. For questions specifically about EchoFlux or Fan Hub platform practices, see https://echoflux.ai/terms and the contact information published there.

This default agreement is a starting template. Creators should have it reviewed by qualified legal counsel and adjust governing law, business name, refund policy, and offerings to match their situation.`;

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
    const hasFanHubAccess = ['Pro', 'Elite', 'Agency', 'OnlyFansStudio'].includes(user.plan);
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
        steps.push({ elementId: 'tour-step-fanhub-mypage', page: 'fanHub', title: 'My Page', content: 'Set your handle (echoflux.ai/you), theme, and landing content. Preview how fans see your page.', position: 'bottom' });
    }

    steps.push({
        elementId: 'tour-step-5-ai-training-tab',
        page: 'settings',
        title: 'AI Training',
        content: 'Set your AI Personality and Creator Personality so captions and plans sound like you.',
        position: 'bottom',
    });

    steps.push({ elementId: 'tour-step-5-profile-avatar', title: 'Your Profile & Settings', content: 'Access your profile, manage billing, or sign out. You can also create your "Bio Link Page" from the sidebar!', position: 'bottom' });

    return steps;
};