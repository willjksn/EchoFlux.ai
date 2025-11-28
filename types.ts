import React from 'react';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    webkitAudioContext: typeof AudioContext;
    aistudio?: AIStudio;
  }
}

export type Platform = 'Instagram' | 'TikTok' | 'X' | 'Threads' | 'YouTube' | 'LinkedIn' | 'Facebook';

export type MessageType = 'DM' | 'Comment';
// Business categories: Lead, Support, Opportunity, General
// Creator categories: Fan Message, Question, Collab Request, Feedback, General
export type MessageCategory = 'Lead' | 'Support' | 'Opportunity' | 'General' | 'Fan Message' | 'Question' | 'Collab Request' | 'Feedback';

export interface Message {
  id: string; 
  platform: Platform;
  type: MessageType;
  user: {
    name: string;
    avatar: string;
  };
  content: string;
  timestamp: string; 
  assigneeId?: string; 
  sentiment?: 'Positive' | 'Neutral' | 'Negative';
  isArchived?: boolean;
  isFlagged?: boolean;
  isFavorite?: boolean;
  clientId?: string; 
  category?: MessageCategory;
}

export interface AnalyticsData {
  responseRate: { name: string; value: number }[];
  followerGrowth: { name: string; value: number }[];
  totalReplies: number;
  newFollowers: number;
  engagementIncrease: number;
  sentiment: { name: string; value: number }[];
  topTopics: string[];
  suggestedFaqs: string[];
  engagementInsights: {
    icon: 'idea' | 'topic' | 'question';
    title: string;
    description: string;
  }[];
}

export type Page = 'dashboard' | 'analytics' | 'settings' | 'compose' | 'calendar' | 'team' | 'opportunities' | 'profile' | 'about' | 'contact' | 'pricing' | 'clients' | 'faq' | 'terms' | 'privacy' | 'admin' | 'automation' | 'approvals' | 'bio' | 'strategy' | 'autopilot';

export interface Settings {
    autoReply: boolean;
    autoRespond: boolean;
    safeMode: boolean;
    highQuality: boolean; 
    tone: {
      formality: number;
      humor: number;
      empathy: number;
      spiciness?: number;
    };
    voiceMode: boolean;
    prioritizedKeywords: string;
    ignoredKeywords: string;
    connectedAccounts: Record<Platform, boolean>;
}

export interface CaptionResult {
    caption: string;
    hashtags: string[];
}

export type Role = 'Admin' | 'Member';

export interface TeamMember {
    id: string; 
    name: string;
    email: string;
    avatar: string;
    role: Role;
    assignedClientIds?: string[];
}

export interface Opportunity {
    id:string;
    type: 'Trending Hashtag' | 'Viral Audio' | 'Popular Topic';
    title: string;
    description: string;
    platform: Platform;
}

export interface ChatMessage {
  role: 'user' | 'bot';
  content: string;
}

export interface SocialStats {
    followers: number;
    following: number;
}

export interface BioLink {
    id: string;
    title: string;
    url: string;
    isActive: boolean;
    clicks: number;
    thumbnail?: string;
}

export interface EmailCaptureConfig {
    enabled: boolean;
    title: string;
    placeholder: string;
    buttonText: string;
    successMessage: string;
}

export interface BioPageConfig {
    username: string;
    displayName: string;
    bio: string;
    avatar: string;
    theme: {
        backgroundColor: string;
        buttonColor: string;
        textColor: string;
        buttonStyle: 'rounded' | 'square' | 'pill';
    };
    links: BioLink[];
    emailCapture?: EmailCaptureConfig;
}

export type Plan = 'Free' | 'Pro' | 'Elite' | 'Agency' | 'Growth' | 'Starter';

export interface Client {
  id: string;
  name: string;
  avatar: string;
  plan: Plan;
  notifications: {
    newMessages: boolean;
    weeklySummary: boolean;
    trendAlerts: boolean;
  };
  monthlyCaptionGenerationsUsed: number;
  monthlyImageGenerationsUsed: number;
  monthlyVideoGenerationsUsed: number;
  mediaLibrary: MediaItem[];
  storageUsed: number; 
  storageLimit: number; 
  settings: Settings;
  approvalLink?: string; 
  socialStats?: Record<Platform, SocialStats>;
  bioPage?: BioPageConfig;
}

export interface MediaItem {
  id: string;
  url: string; 
  name: string;
  size: number; 
  type: 'image' | 'video';
  uploadedAt: string;
}

export interface HashtagSet {
    id: string;
    name: string;
    tags: string[];
}

export type UserType = 'Creator' | 'Business';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  bio: string;
  plan: Plan;
  role: 'Admin' | 'User';
  signupDate: string;
  userType?: UserType;
  businessName?: string;
  businessType?: string;
  businessGoal?: string;
  niche?: string;
  audience?: string;
  hasCompletedOnboarding?: boolean;
  hasAutopilot?: boolean; 
  notifications: {
    newMessages: boolean;
    weeklySummary: boolean;
    trendAlerts: boolean;
  };
  monthlyCaptionGenerationsUsed: number;
  monthlyImageGenerationsUsed: number;
  monthlyVideoGenerationsUsed: number;
  storageUsed: number; 
  storageLimit: number; 
  mediaLibrary: MediaItem[];
  settings: Settings;
  hashtagSets?: HashtagSet[];
  socialStats?: Record<Platform, SocialStats>;
  bioPage?: BioPageConfig;
}

export interface Notification {
  id: string;
  text: string;
  timestamp: string;
  read: boolean;
  messageId: string; 
}

export type DashboardFilters = {
  platform: Platform | 'All';
  messageType: MessageType | 'All';
  sentiment: 'Positive' | 'Neutral' | 'Negative' | 'All';
  status: 'All' | 'Flagged' | 'Favorite';
  category: MessageCategory | 'All';
};

export interface DashboardNavState {
  filters: Partial<DashboardFilters>;
  highlightId?: string;
}

export interface TourStep {
  elementId: string;
  title: string;
  content: string;
  page?: Page;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export interface PaymentPlan {
  name: string;
  price: number;
  cycle: 'monthly' | 'annually';
}

export interface Toast {
  message: string;
  type: 'success' | 'error';
}

export interface Activity {
    id: string;
    type: 'New User' | 'Plan Upgrade';
    user: { name: string; avatar: string; };
    details: string;
    timestamp: string;
}

export interface AutomationWorkflow {
  id: string;
  type: 'Caption' | 'Image' | 'Video';
  prompt: string;
  frequency: {
    type: 'Daily' | 'Weekly';
    count: number;
  };
  approvalType: 'Automatic' | 'Manual';
  isActive: boolean;
  lastRun: string;
  nextRun: string;
  generateCaptions?: boolean;
  useBaseImage?: boolean;
  goal?: string;
  tone?: string;
  generateVoiceOver?: boolean;
  voiceOverScript?: string;
  voice?: string;
  targetPlatforms?: Platform[];
  aspectRatio?: '16:9' | '9:16';
}

export type AutopilotStatus = 'Idle' | 'Strategizing' | 'Generating Content' | 'Complete' | 'Failed';

export interface AutopilotCampaign {
    id: string;
    goal: string;
    niche: string;
    audience: string;
    status: AutopilotStatus;
    progress: number; 
    totalPosts: number;
    generatedPosts: number;
    createdAt: string;
    plan?: StrategyPlan; 
    hasAutopilot?: boolean; 
}


export interface ApprovalItem {
  id: string;
  workflowId: string;
  generatedAt: string;
  type: 'Caption' | 'Image' | 'Video';
  content: {
    text?: string;
    hashtags?: string[];
    imageUrl?: string;
    videoUrl?: string;
  };
}

export interface CustomVoice {
  id: string;
  name: string;
  data: string; 
  mimeType: string;
  url?: string;
}

export interface ComposeContextData {
    topic: string;
    platform?: Platform;
    type?: 'Post' | 'Story' | 'Reel' | 'image' | 'video';
    date?: string;
}

export interface ComposeState {
    media: {
        previewUrl: string;
        data: string;
        mimeType: string;
        type: 'image' | 'video';
    } | null;
    results: CaptionResult[];
    captionText: string;
    postGoal: string;
    postTone: string;
}

export interface CalendarEvent {
    id: string;
    title: string;
    date: string; 
    type: 'Post' | 'Story' | 'Reel';
    platform: Platform;
    status: 'Scheduled' | 'Draft' | 'Published';
    thumbnail?: string;
}

export interface CRMNote {
    id: string;
    content: string;
    timestamp: string;
    author: string;
}

export interface CRMProfile {
    id: string; 
    name: string;
    avatar: string;
    tags: string[];
    notes: CRMNote[];
    email?: string;
    phone?: string;
    lifecycleStage?: 'Lead' | 'Customer' | 'Influencer' | 'Churned';
    aiSummary?: string;
}

export type ApprovalStatus = 'Draft' | 'In Review' | 'Approved' | 'Rejected' | 'Scheduled';

export interface PostComment {
    id: string;
    user: string; 
    text: string;
    timestamp: string;
}

export interface Post {
    id: string;
    content: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video';
    platforms: Platform[];
    status: ApprovalStatus;
    author: { name: string; avatar: string };
    scheduledDate?: string;
    comments: PostComment[];
    clientId?: string; 
}

export interface DayPlan {
    dayOffset: number; 
    topic: string;
    format: 'Post' | 'Story' | 'Reel';
    platform: Platform;
}

export interface WeekPlan {
    weekNumber: number;
    theme: string;
    content: DayPlan[];
}

export interface StrategyPlan {
    weeks: WeekPlan[];
}

export interface VideoScene {
    id: string;
    prompt: string;
    status: 'pending' | 'generating' | 'completed' | 'failed';
    videoUrl?: string;
    duration: number; 
}

export interface AppContextType {
  isAuthLoading: boolean;
  isDarkMode: boolean;
  isAuthenticated: boolean;
  user: User | null;
  settings: Settings;
  clients: Client[];
  teamMembers: TeamMember[];
  selectedClient: Client | null;
  notifications: Notification[];
  activePage: Page;
  isSidebarOpen: boolean;
  dashboardNavState: DashboardNavState | null;
  composeContext: ComposeContextData | null;
  composeState: ComposeState;
  isTourActive: boolean;
  tourStep: number;
  tourSteps: TourStep[];
  isPaymentModalOpen: boolean;
  paymentPlan: PaymentPlan | null;
  toast: Toast | null;
  userBaseImage: { data: string; mimeType: string } | null;
  userCustomVoices: CustomVoice[];
  messages: Message[];
  hashtagSets: HashtagSet[];
  posts: Post[];
  bioPage: BioPageConfig;
  calendarEvents: CalendarEvent[];
  autopilotCampaigns: AutopilotCampaign[];
  isCRMOpen: boolean;
  activeCRMProfileId: string | null;
  crmStore: Record<string, CRMProfile>; 
  toggleTheme: () => void;
  handleLogout: () => void;
  setUser: (user: Partial<User> | null) => Promise<void>;
  setSettings: (newSettings: Settings | React.SetStateAction<Settings>) => void;
  setClients: React.Dispatch<React.SetStateAction<Client[]>>;
  setTeamMembers: React.Dispatch<React.SetStateAction<TeamMember[]>>;
  setSelectedClient: React.Dispatch<React.SetStateAction<Client | null>>;
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  setActivePage: React.Dispatch<React.SetStateAction<Page>>;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  navigateToDashboardWithFilter: (filters: Partial<DashboardFilters>, highlightId?: string) => void;
  clearDashboardNavState: () => void;
  setComposeContext: (data: ComposeContextData) => void;
  clearComposeContext: () => void;
  setComposeState: React.Dispatch<React.SetStateAction<ComposeState>>;
  startTour: () => void;
  nextTourStep: () => void;
  endTour: () => void;
  openPaymentModal: (plan: PaymentPlan) => void;
  closePaymentModal: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
  setUserBaseImage: React.Dispatch<React.SetStateAction<{ data: string; mimeType: string } | null>>;
  setUserCustomVoices: React.Dispatch<React.SetStateAction<CustomVoice[]>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setHashtagSets: React.Dispatch<React.SetStateAction<HashtagSet[]>>;
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  setBioPage: React.Dispatch<React.SetStateAction<BioPageConfig>>;
  saveBioPage: (config: BioPageConfig) => Promise<void>;
  setCalendarEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  addCalendarEvent: (event: CalendarEvent) => void;
  addAutopilotCampaign: (campaign: Omit<AutopilotCampaign, 'id' | 'createdAt' | 'progress' | 'totalPosts' | 'generatedPosts'>) => Promise<void>;
  updateAutopilotCampaign: (campaignId: string, data: Partial<AutopilotCampaign>) => Promise<void>;
  updateMessage: (id: string, data: Partial<Message>) => void;
  deleteMessage: (id: string) => void;
  categorizeAllMessages: () => void;
  openCRM: (user: { name: string; avatar: string }) => void;
  closeCRM: () => void;
  addCRMNote: (profileId: string, note: string) => void;
  addCRMTag: (profileId: string, tag: string) => void;
  removeCRMTag: (profileId: string, tag: string) => void;
  updateCRMProfile: (profileId: string, data: Partial<CRMProfile>) => void;
}
