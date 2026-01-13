import { Message, AnalyticsData, TeamMember, Client, Notification, TourStep, User, Activity, Settings, Post } from './types';

// Global feature flag: run EchoFlux as an AI Content Studio
// with planning and generation only, no live social posting.
export const OFFLINE_MODE = true;

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
      { elementId: 'tour-step-3-compose-nav', page: 'compose', title: 'AI Content Suite', content: 'Generate captions quickly. Image/video generation is disabled in this build.', position: 'right' },
    ];
    
    if (user.hasAutopilot) {
        steps.push({ elementId: 'tour-step-autopilot-nav', page: 'autopilot', title: 'AI Autopilot', content: 'Define a goal, and Autopilot will generate a full content strategy and create posts for your approval.', position: 'right' });
    }
    
    steps.push({ elementId: 'tour-step-5-profile-avatar', title: 'Your Profile & Settings', content: 'Access your profile, manage billing, or sign out. You can also create your "Link in Bio" page from the sidebar!', position: 'bottom' });
    
    return steps;
};