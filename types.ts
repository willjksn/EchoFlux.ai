import React from 'react';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    webkitAudioContext: typeof AudioContext;
    // FIX: Made aistudio optional to resolve "All declarations of 'aistudio' must have identical modifiers" error.
    aistudio?: AIStudio;
  }
}

export type Platform =
  | 'Instagram'
  | 'TikTok'
  | 'X'
  | 'Threads'
  | 'YouTube'
  | 'LinkedIn'
  | 'Facebook';

export type MessageType = 'DM' | 'Comment';
export type MessageCategory = 'Lead' | 'Support' | 'Opportunity' | 'General';

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

export type Page =
  | 'dashboard'
  | 'analytics'
  | 'settings'
  | 'compose'
  | 'calendar'
  | 'team'
  | 'opportunities'
  | 'profile'
  | 'about'
  | 'contact'
  | 'pricing'
  | 'clients'
  | 'faq'
  | 'terms'
  | 'privacy'
  | 'admin'
  | 'automation'
  | 'approvals'
  | 'bio'
  | 'strategy'
  | 'autopilot';

export interface Settings {
  autoReply: boolean;
  autoRespond: boolean;
  safeMode: boolean;
  highQuality: boolean; // For dynamic model selection
  tone: {
    formality: number; // 0-100
    humor: number; // 0-100
    empathy: number; // 0-100
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
  id: string;
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
  username: string; // e.g. engagesuite.ai/bio/username
  displayName: string;
  avatar: string;
  bio: string;
  theme: {
    backgroundColor: string;
    buttonColor: string;
    textColor: string;
    buttonStyle: 'rounded' | 'square' | 'pill';
  };
  links: BioLink[];
  emailCapture?: EmailCaptureConfig;
}

export interface Client {
  id: string;
  name: string;
  avatar: string;
  plan: 'Free' | 'Pro' | 'Elite' | 'Agency';
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

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  bio: string;
  plan: 'Free' | 'Pro' | 'Elite' | 'Agency';
  role: 'Admin' | 'User';
  signupDate: string;
  hasCompletedOnboarding?: boolean;
  hasAutopilot?: boolean; // Autopilot add-on flag
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
  user: { name: string; avatar: string };
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

// --- Autopilot Types ---
export type AutopilotStatus =
  | 'Idle'
  | 'Strategizing'
  | 'Generating Content'
  | 'Complete'
  | 'Failed';

export interface AutopilotCampaign {
  id: string;
  goal: string;
  niche: string;
  audience: string;
  status: AutopilotStatus;
  progress: number; // 0-100
  totalPosts: number;
  generatedPosts: number;
  createdAt: string;
  plan?: StrategyPlan; // The generated strategy
  hasAutopilot?: boolean; // Redundant but good for queries
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
  date: string; // ISO string
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
  id: string; // Using username as ID for this demo
  name: string;
  avatar: string;
  tags: string[];
  notes: CRMNote[];
  email?: string;
  phone?: string;
  lifecycleStage?: 'Lead' | 'Customer' | 'Influencer' | 'Churned';
  aiSummary?: string;
}

// --- Approval Workflow Types ---

export type ApprovalStatus =
  | 'Draft'
  | 'In Review'
  | 'Approved'
  | 'Rejected'
  | 'Scheduled';

export interface PostComment {
  id: string;
  user: string; // Name of user
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
  clientId?: string; // If null, main account
}

// --- Strategy Types ---

export interface DayPlan {
  dayOffset: number; // 0 = Monday, 6 = Sunday
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
  duration: number; // estimated duration in seconds
}

// --- App Context ---
export interface AppContextType {
  // State
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

  // CRM State
  isCRMOpen: boolean;
  activeCRMProfileId: string | null;
  crmStore: Record<string, CRMProfile>; // Keyed by user name/id

  // Setters & Handlers
  toggleTheme: () => void;
  handleLogout: () => void;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  setSettings: (newSettings: Settings | React.SetStateAction<Settings>) => void;
  setClients: React.Dispatch<React.SetStateAction<Client[]>>;
  setTeamMembers: React.Dispatch<React.SetStateAction<TeamMember[]>>;
  setSelectedClient: React.Dispatch<React.SetStateAction<Client | null>>;
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  setActivePage: React.Dispatch<React.SetStateAction<Page>>;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  navigateToDashboardWithFilter: (
    filters: Partial<DashboardFilters>,
    highlightId?: string
  ) => void;
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
  setUserBaseImage: React.Dispatch<
    React.SetStateAction<{ data: string; mimeType: string } | null>
  >;
  setUserCustomVoices: React.Dispatch<
    React.SetStateAction<CustomVoice[]>
  >;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setHashtagSets: React.Dispatch<React.SetStateAction<HashtagSet[]>>;
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  setBioPage: React.Dispatch<React.SetStateAction<BioPageConfig>>;
  saveBioPage: (config: BioPageConfig) => Promise<void>;
  setCalendarEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  addCalendarEvent: (event: CalendarEvent) => void;
  addAutopilotCampaign: (
    campaign: Omit<
      AutopilotCampaign,
      'id' | 'createdAt' | 'progress' | 'totalPosts' | 'generatedPosts'
    >
  ) => Promise<void>;
  updateAutopilotCampaign: (
    campaignId: string,
    data: Partial<AutopilotCampaign>
  ) => Promise<void>;

  // Message Management
  updateMessage: (id: string, data: Partial<Message>) => void;
  deleteMessage: (id: string) => void;
  categorizeAllMessages: () => void;

  // CRM Handlers
  openCRM: (user: { name: string; avatar: string }) => void;
  closeCRM: () => void;
  addCRMNote: (profileId: string, note: string) => void;
  addCRMTag: (profileId: string, tag: string) => void;
  removeCRMTag: (profileId: string, tag: string) => void;
  updateCRMProfile: (profileId: string, data: Partial<CRMProfile>) => void;
}
