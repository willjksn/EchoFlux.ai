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
export const STUDIO_TAB_IDS = ['ideas', 'drops', 'shootIdeas', 'dmSession', 'persona', 'teasers'] as const;
export type StudioTabId = (typeof STUDIO_TAB_IDS)[number];

/** Fan Hub tab IDs only (for /fan?tab=...) */
export const FAN_HUB_TAB_IDS = ['myPage', 'posts', 'treats', 'messages', 'sessions', 'videoChats', 'fans', 'analytics', 'purchases', 'payouts', 'users'] as const;
export type FanHubTabId = (typeof FAN_HUB_TAB_IDS)[number];

/** Labels for Premium Studio tabs */
export const STUDIO_TAB_LABELS: Record<StudioTabId, string> = {
  ideas: 'New Ideas',
  drops: 'Drops & PPV',
  shootIdeas: 'Shoot Ideas',
  dmSession: 'DM Session',
  persona: 'Persona Builder',
  teasers: 'Teasers',
};

/** Labels for Fan Hub tabs */
export const FAN_HUB_TAB_LABELS: Record<FanHubTabId, string> = {
  myPage: 'My Page',
  posts: 'Posts',
  treats: 'Treats Store',
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

/** Treat product types for Fan Hub Treats store (creator add/edit) */
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
 * Default Privacy Policy for creator storefronts.
 * Based on standard privacy practices for membership/subscription sites.
 */
export const DEFAULT_PRIVACY_POLICY = `This page describes how we use your information when you use this site and any related services.

PAYMENT
Payments are processed by Stripe. Your payment details are handled by Stripe and are not stored by this site. Stripe's privacy policy applies to payment data: stripe.com/privacy

INFORMATION WE COLLECT AND USE
When you subscribe or sign up, we may receive your email address and other details you provide so we can manage your account and contact you about your membership or the service. We use this information only to provide and improve the service.

SHARING
We do not sell or share your personal information with third parties for marketing. Data is used only to provide and manage the service and as required by law.

SECURITY
We take reasonable steps to protect your data. No method of transmission over the internet is 100% secure; we encourage you to use strong passwords and keep your account details private.

CONTENT AND MEMBER CONDUCT
Members are prohibited from downloading, copying, selling, or using images, videos, or other content from the service for any reason. Unauthorized use may violate law and result in criminal or civil action. We may report violations to law enforcement and pursue legal remedies. See our Terms of Service for full prohibitions and consequences.

IN-APP MESSAGES
Direct messages and other in-app communications are confidential. You must not copy, download, save, share, or use message content outside this service. Doing so violates our Terms of Service and may result in account termination and legal action. We process and store messages only to provide the messaging feature and as described in this policy.

CHANGES
This policy may be updated from time to time. Continued use of the site after changes constitutes acceptance of the updated policy.`;

/**
 * Default Terms of Service for creator storefronts.
 * Includes strong content protection language for creator-owned media.
 */
export const DEFAULT_TERMS_OF_SERVICE = `By using this site and any subscription or paid features, you agree to the following terms.

SUBSCRIPTION
If you subscribe, membership may be recurring (e.g. monthly). You will be charged each billing period until you cancel. You can cancel anytime via the link in your receipt email or the payment provider's customer portal.

ACCESS
After payment, access is granted in accordance with the plan you chose. We will provide access within a reasonable time (e.g. within 24 hours) where applicable. Access is at our discretion and may be limited or revoked for abuse or violation of these terms.

REMOVAL AND CANCELLATION
We may remove you or cancel your access at any time, for any reason. If you are removed, you keep access until the end of the period you have already paid for. You will not be charged again after that period.

BEHAVIOR
You are expected to be respectful when using the service. Abusive, harassing, or otherwise inappropriate behavior may result in immediate removal and cancellation of your membership without refund for the current period.

IN-APP MESSAGES — NO SHARING, COPYING, OR USE OUTSIDE THE APP
Direct messages and other in-app communications ("Messages") between you and the service or its operators are confidential and intended for use only within this service. YOU MAY NOT copy, download, save, screenshot, record, share, distribute, republish, or use Messages—or any part of them—outside the app or for any purpose other than reading and replying within the service. This includes, but is not limited to: sharing on social media, messaging apps, or other platforms; saving to a device or cloud; using in another website, app, or product; using for commercial purposes; or training AI or other systems. Violation of this provision is a material breach of these terms and may result in immediate termination of access, forfeiture of fees, and legal action. We may report violations and pursue all available remedies, including injunctions and damages.

USE OF CONTENT — PERSONAL VIEWING ONLY
Content provided through the service (including all images, videos, text, and other media) is for your personal viewing only while you are a member in good standing. You may not screenshot, capture, record, share, redistribute, or use it commercially without express written permission.

STRICT PROHIBITION: NO DOWNLOADING, COPYING, SAVING, OR USE OF IMAGES AND VIDEOS
YOU ARE STRICTLY PROHIBITED from downloading, copying, saving, capturing, screen-recording, photographing, distributing, selling, licensing, or using in any way—for any reason—any images, videos, or other media ("Content") you access through this service. This includes, but is not limited to: saving to a device; sharing via messaging, social media, or file-sharing; using in another website or app; using for commercial purposes; using for training AI or other systems; or any other use outside of viewing within the service during your active membership. Violation of this provision is a material breach of these terms and may result in immediate termination of your access, forfeiture of any fees paid, and referral to law enforcement and/or civil action.

LEGAL CONSEQUENCES AND ENFORCEMENT
Unauthorized use, copying, distribution, or exploitation of Content or Messages may violate federal and state laws (including copyright, right of publicity, confidentiality, and computer-fraud statutes) and may result in CRIMINAL PROSECUTION, IMPRISONMENT, FINES, AND/OR CIVIL LIABILITY. We reserve the right to pursue all available legal remedies, including but not limited to: reporting to law enforcement; seeking injunctions; and suing for damages (including statutory damages, attorneys' fees, and profits derived from misuse). You may be held liable for monetary damages, including in amounts that significantly exceed any amount you paid for membership. By using the service, you acknowledge that violation of these content-use terms can lead to serious legal consequences, including the possibility of jail time, substantial fines, and being sued in civil court.

NO PERMISSION GRANTED
No license or right to use, copy, download, or exploit any Content or Messages is granted to you except the limited right to view Content in the service during your active membership and to read and send Messages within the service. Any other use is unauthorized and prohibited.

CHANGES TO TERMS
These terms may be updated. Continued use of the service after changes constitutes acceptance of the updated terms.`;

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
    let steps: TourStep[] = [
      { elementId: 'tour-step-1-dashboard', page: 'dashboard', title: 'Your Command Center', content: 'This is your home base. Check stats, upcoming posts, and urgent items.', position: 'top' },
      { elementId: 'tour-step-theme-toggle', page: 'dashboard', title: 'Light / Dark Mode', content: 'Use the sun/moon button (top right) to toggle themes anytime.', position: 'left' },
      { elementId: 'tour-step-3-compose-nav', page: 'compose', title: 'Write Captions', content: 'Generate caption ideas quickly and keep your posting flow moving.', position: 'right' },
    ];
    
    if (user.hasAutopilot) {
        steps.push({ elementId: 'tour-step-autopilot-nav', page: 'autopilot', title: 'AI Autopilot', content: 'Define a goal, and Autopilot will generate a full content strategy and create posts for your approval.', position: 'right' });
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