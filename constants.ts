


import { Message, AnalyticsData, TeamMember, Client, Notification, TourStep, User, Activity, Settings, Post } from './types';

export const defaultSettings: Settings = {
  autoReply: true,
  autoRespond: false,
  safeMode: true,
  highQuality: false,
  tone: {
    formality: 50,
    humor: 30,
    empathy: 70,
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
  {
    id: '1',
    platform: 'Instagram',
    type: 'DM',
    user: { name: 'Sarah Jenkins', avatar: 'https://i.pravatar.cc/150?u=1' },
    content: 'Hey! I love your latest post about sustainable packaging. Do you offer wholesale rates for small businesses?',
    timestamp: '10m ago',
    sentiment: 'Positive',
    isFavorite: true,
  },
  {
    id: '2',
    platform: 'X',
    type: 'Comment',
    user: { name: 'TechDaily', avatar: 'https://i.pravatar.cc/150?u=2' },
    content: 'This is exactly what the industry needed. Great insights on the new AI regulations.',
    timestamp: '45m ago',
    sentiment: 'Positive',
  },
  {
    id: '3',
    platform: 'TikTok',
    type: 'Comment',
    user: { name: 'Mike_Creator', avatar: 'https://i.pravatar.cc/150?u=3' },
    content: 'Where did you get that microphone setup? The audio is crisp! 🎤',
    timestamp: '2h ago',
    sentiment: 'Neutral',
  },
  {
    id: '4',
    platform: 'LinkedIn',
    type: 'DM',
    user: { name: 'Enterprise Solutions Inc.', avatar: 'https://i.pravatar.cc/150?u=4' },
    content: 'We would like to discuss a potential partnership for our upcoming Q4 campaign. Please let us know the best email to reach you.',
    timestamp: '5h ago',
    sentiment: 'Positive',
    isFlagged: true,
  },
  {
    id: '5',
    platform: 'Instagram',
    type: 'Comment',
    user: { name: 'AnonUser99', avatar: 'https://i.pravatar.cc/150?u=5' },
    content: 'Shipping took way too long. Not happy.',
    timestamp: '1d ago',
    sentiment: 'Negative',
    isFlagged: true,
  },
  {
    id: '6',
    platform: 'Threads',
    type: 'Comment',
    user: { name: 'CreativeMind', avatar: 'https://i.pravatar.cc/150?u=6' },
    content: 'Totally agree with this take. 🔥',
    timestamp: '1d ago',
    sentiment: 'Positive',
  },
  {
    id: '7',
    platform: 'Facebook',
    type: 'Comment',
    user: { name: 'Local Community Group', avatar: 'https://i.pravatar.cc/150?u=7' },
    content: 'We are sharing this with our members. Very helpful information!',
    timestamp: '2d ago',
    sentiment: 'Positive',
  }
];

export const MOCK_ANALYTICS: AnalyticsData = {
  responseRate: [
      { name: 'Mon', value: 85 },
      { name: 'Tue', value: 92 },
      { name: 'Wed', value: 88 },
      { name: 'Thu', value: 95 },
      { name: 'Fri', value: 89 },
      { name: 'Sat', value: 75 },
      { name: 'Sun', value: 80 }
  ],
  followerGrowth: [
      { name: 'Week 1', value: 120 },
      { name: 'Week 2', value: 150 },
      { name: 'Week 3', value: 180 },
      { name: 'Week 4', value: 250 }
  ],
  sentiment: [
      { name: 'Positive', value: 65 },
      { name: 'Neutral', value: 25 },
      { name: 'Negative', value: 10 }
  ],
  totalReplies: 1248,
  newFollowers: 452,
  engagementIncrease: 12.5,
  topTopics: ['AI Tools', 'Productivity', 'Remote Work'],
  suggestedFaqs: ['What is your pricing?', 'Do you offer API access?', 'How do I cancel?'],
  engagementInsights: [
      { icon: 'idea', title: 'Post at 10 AM', description: 'Your audience is most active on Tuesdays at 10 AM EST.' },
      { icon: 'topic', title: 'Video Content', description: 'Reels are getting 2.5x more engagement than static posts this week.' },
      { icon: 'question', title: 'Pricing Questions', description: 'You received 15 questions about enterprise pricing. Consider a dedicated post.' }
  ],
};

export const MOCK_TEAM_MEMBERS: TeamMember[] = [
    { id: 'tm1', name: 'Alex Rivera', email: 'alex@company.com', avatar: 'https://i.pravatar.cc/150?u=20', role: 'Admin', assignedClientIds: [] },
    { id: 'tm2', name: 'Jordan Lee', email: 'jordan@company.com', avatar: 'https://i.pravatar.cc/150?u=21', role: 'Member', assignedClientIds: [] },
    { id: 'tm3', name: 'Casey Smith', email: 'casey@company.com', avatar: 'https://i.pravatar.cc/150?u=22', role: 'Member', assignedClientIds: [] },
];

export const MOCK_CLIENTS: Client[] = [
    { 
        id: 'c1', 
        name: 'Apex Fitness', 
        avatar: 'https://i.pravatar.cc/150?u=30', 
        plan: 'Pro', 
        notifications: { newMessages: true, weeklySummary: true, trendAlerts: false },
        monthlyCaptionGenerationsUsed: 12,
        monthlyImageGenerationsUsed: 5,
        monthlyVideoGenerationsUsed: 0,
        mediaLibrary: [],
        storageUsed: 120,
        storageLimit: 1024,
        settings: defaultSettings
    },
    { 
        id: 'c2', 
        name: 'Luxe Interiors', 
        avatar: 'https://i.pravatar.cc/150?u=31', 
        plan: 'Elite', 
        notifications: { newMessages: true, weeklySummary: true, trendAlerts: true },
        monthlyCaptionGenerationsUsed: 450,
        monthlyImageGenerationsUsed: 120,
        monthlyVideoGenerationsUsed: 5,
        mediaLibrary: [],
        storageUsed: 4500,
        storageLimit: 10240,
        settings: defaultSettings
    }
];

export const MOCK_NOTIFICATIONS: Notification[] = [
    { id: 'n1', text: 'New DM from Sarah Jenkins', timestamp: '10m ago', read: false, messageId: '1' },
    { id: 'n2', text: 'Trend Alert: #SummerVibes is spiking', timestamp: '2h ago', read: false, messageId: '0' },
    { id: 'n3', text: 'Weekly Analytics Summary Available', timestamp: '1d ago', read: true, messageId: '0' },
    { id: 'n4', text: 'Luxe Interiors subscription renewed', timestamp: '2d ago', read: true, messageId: '0' },
    { id: 'n5', text: 'New comment on your latest Reel', timestamp: '3d ago', read: true, messageId: '3' },
];

export const MOCK_ACTIVITY_FEED: Activity[] = [
    { id: 'a1', type: 'New User', user: { name: 'Alice Marketing', avatar: 'https://i.pravatar.cc/150?u=50' }, details: 'joined EngageSuite.ai', timestamp: '2 mins ago' },
    { id: 'a2', type: 'Plan Upgrade', user: { name: 'TechStart Inc.', avatar: 'https://i.pravatar.cc/150?u=51' }, details: 'upgraded to Agency Plan', timestamp: '15 mins ago' },
    { id: 'a3', type: 'New User', user: { name: 'John Doe', avatar: 'https://i.pravatar.cc/150?u=52' }, details: 'joined EngageSuite.ai', timestamp: '1 hour ago' },
    { id: 'a4', type: 'Plan Upgrade', user: { name: 'Sarah Smith', avatar: 'https://i.pravatar.cc/150?u=53' }, details: 'upgraded to Pro Plan', timestamp: '3 hours ago' },
    { id: 'a5', type: 'New User', user: { name: 'Creative Studio', avatar: 'https://i.pravatar.cc/150?u=54' }, details: 'joined EngageSuite.ai', timestamp: '5 hours ago' },
];

export const MOCK_POSTS: Post[] = [
      {
          id: 'p1',
          content: 'Check out our new summer collection! 🌞 #SummerVibes #Fashion',
          platforms: ['Instagram', 'X'],
          status: 'Draft',
          author: { name: 'Alice Manager', avatar: 'https://i.pravatar.cc/150?u=60' },
          comments: [],
      },
      {
          id: 'p2',
          content: 'Why AI is changing the game for marketers. Read more on our blog.',
          platforms: ['LinkedIn'],
          status: 'In Review',
          author: { name: 'Bob Creator', avatar: 'https://i.pravatar.cc/150?u=61' },
          comments: [
              { id: 'c1', user: 'Alice Manager', text: 'Can we make the tone a bit more professional?', timestamp: new Date().toISOString() }
          ],
      },
      {
          id: 'p3',
          content: 'Big announcement coming tomorrow! Stay tuned.',
          platforms: ['X', 'Threads'],
          status: 'Approved',
          author: { name: 'Alice Manager', avatar: 'https://i.pravatar.cc/150?u=60' },
          comments: [],
      },
      {
          id: 'p4',
          content: 'Happy Friday everyone! What are your plans for the weekend?',
          mediaType: 'image',
          mediaUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
          platforms: ['Instagram', 'LinkedIn'], 
          status: 'Scheduled',
          author: { name: 'Bob Creator', avatar: 'https://i.pravatar.cc/150?u=61' },
          scheduledDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
          comments: [],
      }
];

export const MOCK_USERS: User[] = [];

// --- Modular Tour Steps ---

const CORE_TOUR_STEPS: TourStep[] = [
  {
    elementId: 'tour-step-1-dashboard',
    title: 'Your Command Center',
    content: 'This is your new home base. Check your account health, see upcoming scheduled posts, and handle urgent messages all in one place.',
    position: 'bottom',
  },
  {
    elementId: 'tour-step-2-analytics-nav',
    page: 'analytics',
    title: 'Track Your Performance',
    content: 'See detailed analytics on your response rates, follower growth, audience sentiment, and now track Competitors and Social Listening mentions.',
    position: 'right',
  },
  {
    elementId: 'tour-step-3-compose-nav',
    page: 'compose',
    title: 'AI Content Suite',
    content: 'Generate captions, images, and even short videos. Use the new "Remix" feature to repurpose content for different platforms instantly.',
    position: 'right',
  },
];

const OPPORTUNITIES_STEP: TourStep = {
  elementId: 'tour-step-opportunities-nav',
  page: 'opportunities',
  title: 'Find Opportunities',
  content: 'Let our AI proactively find trending topics, sounds, and hashtags for you to jump on before they get crowded.',
  position: 'right',
};

const AUTOPILOT_STEP: TourStep = {
  elementId: 'tour-step-autopilot-nav',
  page: 'autopilot',
  title: 'AI Autopilot',
  content: 'Define a goal, and Autopilot will generate a full content strategy and create all the posts for your approval.',
  position: 'right',
};

const CLIENT_SWITCHER_STEP: TourStep = {
  elementId: 'tour-step-4-client-switcher',
  page: 'dashboard',
  title: 'Manage Clients',
  content: 'Add and switch between different client accounts right from this menu.',
  position: 'bottom',
};

const VOICE_TRAINING_STEP: TourStep = {
    elementId: 'tour-step-voice-training',
    page: 'settings',
    title: 'Train Your AI Voice',
    content: 'This is where the magic happens. Upload a document of your past posts, and the AI will learn to write exactly like you.',
    position: 'top',
};

const TEAM_STEP: TourStep = {
    elementId: 'tour-step-team-nav',
    page: 'team',
    title: 'Collaborate with Your Team',
    content: 'Invite your colleagues, assign roles, and manage access for your whole team right here.',
    position: 'right',
};

const CLIENTS_STEP: TourStep = {
    elementId: 'tour-step-clients-nav',
    page: 'clients',
    title: 'Client Management Hub',
    content: 'This is your central hub for adding new clients, generating approval links, and managing team assignments.',
    position: 'right',
};

const FINAL_STEP: TourStep = {
  elementId: 'tour-step-5-profile-avatar',
  title: 'Your Profile & Settings',
  content: 'Access your profile, manage billing, or sign out. You can also create your "Link in Bio" page from the sidebar!',
  position: 'bottom',
};

// --- Dynamic Tour Builder ---

export const getTourStepsForPlan = (user: User): TourStep[] => {
    let steps = [...CORE_TOUR_STEPS];
    
    if (user.hasAutopilot) {
        steps.push(AUTOPILOT_STEP);
    }

    switch (user.plan) {
        case 'Agency':
            steps.push(OPPORTUNITIES_STEP);
            steps.push(CLIENT_SWITCHER_STEP);
            steps.push(VOICE_TRAINING_STEP);
            steps.push(TEAM_STEP);
            steps.push(CLIENTS_STEP);
            break;
        case 'Elite':
            steps.push(OPPORTUNITIES_STEP);
            steps.push(CLIENT_SWITCHER_STEP);
            steps.push(VOICE_TRAINING_STEP);
            break;
        case 'Pro':
            steps.push(OPPORTUNITIES_STEP);
            break;
        case 'Free':
        default:
            // Only core steps for Free plan
            break;
    }
    
    steps.push(FINAL_STEP);
    return steps;
};
