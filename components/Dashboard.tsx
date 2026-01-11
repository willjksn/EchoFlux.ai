import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MessageCard } from './MessageCard';
import { Platform, Message, DashboardFilters, MessageType, CalendarEvent, MessageCategory } from '../types';
import { InstagramIcon, TikTokIcon, XIcon, ThreadsIcon, YouTubeIcon, LinkedInIcon, FacebookIcon, PinterestIcon } from './icons/PlatformIcons';
import { DashboardIcon, FlagIcon, SearchIcon, StarIcon, CalendarIcon, SparklesIcon, TrendingIcon, CheckCircleIcon, UserIcon, ArrowUpCircleIcon, KanbanIcon, BriefcaseIcon, LinkIcon, RocketIcon, ArrowUpIcon, ChatIcon, DollarSignIcon, HeartIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { updateUserSocialStats } from '../src/services/socialStatsService';
import { auth, db } from '../firebaseConfig';
import { ContentGapAnalysis } from './ContentGapAnalysis';
import { FeedbackSurveyModal, type FeedbackMilestone } from './FeedbackSurveyModal';
import { CustomFeedbackFormModal } from './CustomFeedbackFormModal';
import { isInviteOnlyMode } from '../src/utils/inviteOnly';
import { OFFLINE_MODE } from '../constants';

const platformFilterIcons: { [key in Platform]: React.ReactNode } = {
  Instagram: <InstagramIcon />,
  TikTok: <TikTokIcon />,
  X: <XIcon />,
  Threads: <ThreadsIcon />,
  YouTube: <YouTubeIcon />,
  LinkedIn: <LinkedInIcon />,
  Facebook: <FacebookIcon />,
  Pinterest: <PinterestIcon />,
};

// ... (Keep helper components FilterButton, QuickAction, UpcomingEventCard unchanged) ...
const FilterButton: React.FC<{ isActive: boolean; onClick: () => void; children?: React.ReactNode; label: string; }> = ({ isActive, onClick, children, label }) => (
    <button onClick={onClick} aria-label={`Filter by ${label}`} className={`flex items-center space-x-2 px-3 py-1.5 rounded-full transition-colors text-sm font-semibold ${isActive ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>{children}<span>{label}</span></button>
);
const QuickAction: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; color: string }> = ({ icon, label, onClick, color }) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center p-4 rounded-xl bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all group w-full sm:w-auto sm:min-w-[140px]`}><div className={`p-3 rounded-full mb-3 text-white transition-transform group-hover:scale-110 flex items-center justify-center ${color}`}>{icon}</div><span className="text-sm font-medium text-gray-700 dark:text-gray-300 text-center">{label}</span></button>
);
const UpcomingEventCard: React.FC<{ event: CalendarEvent; onClick: () => void }> = ({ event, onClick }) => {
  // Safely get platform icon - handle OnlyFans and other non-standard platforms
  const platformIcon = event.platform && platformFilterIcons[event.platform as Platform] 
    ? platformFilterIcons[event.platform as Platform] 
    : <span className="text-xs">📅</span>; // Fallback icon
  
  return (
    <div onClick={onClick} className="flex items-center p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
      <div className="flex-shrink-0 w-12 h-12 bg-primary-50 dark:bg-primary-900/30 rounded-md flex flex-col items-center justify-center text-primary-600 dark:text-primary-400 mr-3">
        <span className="text-xs font-bold uppercase">{new Date(event.date).toLocaleDateString('en-US', { month: 'short' })}</span>
        <span className="text-lg font-bold">{new Date(event.date).getDate()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{event.title}</p>
        <div className="flex items-center mt-1">
          <span className="text-xs text-gray-500 dark:text-gray-400 mr-2 font-medium">{new Date(event.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          <span className="text-gray-400 mr-2 scale-75">{platformIcon}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${event.status === 'Scheduled' ? 'bg-blue-100 text-blue-700' : event.status === 'Published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{event.status}</span>
        </div>
      </div>
    </div>
  );
};

export const Dashboard: React.FC = () => {
  const { messages, selectedClient, user, dashboardNavState, clearDashboardNavState, settings, setSettings, setActivePage, calendarEvents, posts, setComposeContext, updateMessage, deleteMessage, categorizeAllMessages, openCRM, ensureCRMProfile, setUser, socialAccounts, showToast } = useAppContext();
  const [comparisonView, setComparisonView] = useState<'WoW' | 'MoM'>('WoW');
  const [isUpdatingStats, setIsUpdatingStats] = useState(false);
  const [isPlanningWeek, setIsPlanningWeek] = useState(false);
  const [weeklyPlanUsage, setWeeklyPlanUsage] = useState<{ count: number; limit: number; remaining: number } | null>(null);
  const [weeklySuggestions, setWeeklySuggestions] = useState<
    Array<{
      date: string;
      dayLabel: string;
      theme: string;
      postIdea: string;
      captionOutline: string;
      recommendedPlatforms: string[];
      suggestedTimeWindow?: string;
      notes?: string;
    }>
  >([]);

  // Load and filter weekly suggestions from localStorage on mount
  useEffect(() => {
    if (!user?.id) return;
    
    const saved = localStorage.getItem(`weeklySuggestions_${user.id}`);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        
        // Filter out suggestions with past dates
        const filtered = (data.suggestions || []).filter((s: any) => {
          if (!s.date) return false;
          try {
            const suggestionDate = new Date(s.date);
            suggestionDate.setHours(0, 0, 0, 0);
            return suggestionDate.getTime() >= now.getTime();
          } catch {
            return false;
          }
        });
        
        if (filtered.length > 0) {
          setWeeklySuggestions(filtered);
          // Update localStorage with filtered suggestions
          localStorage.setItem(`weeklySuggestions_${user.id}`, JSON.stringify({
            suggestions: filtered,
            generatedAt: data.generatedAt
          }));
        }
      } catch (err) {
        console.error('Failed to load weekly suggestions:', err);
      }
    }
  }, [user?.id]);
  // Content Ideas state - moved to top level
  const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);
  const [generatedIdeas, setGeneratedIdeas] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<'trending' | 'engagement' | 'niche' | null>(null);
  const [showIdeasModal, setShowIdeasModal] = useState(false);

  // Admin-only daily dashboard flag & lightweight metrics
  const isAdmin = user?.role === 'Admin';
  const enableAdminDashboardV2 = isAdmin && (settings?.enableAdminDashboardV2 ?? true);
  const [adminSignupCounts, setAdminSignupCounts] = useState<{ last24h: number; last7d: number }>({ last24h: 0, last7d: 0 });
  const [isLoadingAdminSignupCounts, setIsLoadingAdminSignupCounts] = useState(false);
  const [adminSignupError, setAdminSignupError] = useState<string | null>(null);

  // First-login Early Testing onboarding (in-app) - only show in invite-only mode
  const [showEarlyTestingOnboarding, setShowEarlyTestingOnboarding] = useState(false);
  useEffect(() => {
    if (!user?.id) return;
    // Only show early testing onboarding when invite-only mode is enabled
    if (!isInviteOnlyMode()) return;
    const key = `earlyTestingOnboardingSeen_${user.id}`;
    if (localStorage.getItem(key) === 'true') return;
    localStorage.setItem(key, 'true');
    setShowEarlyTestingOnboarding(true);
  }, [user?.id]);

  // In-app feedback survey (Day 7 / Day 14) with 24h snooze
  const [showFeedbackSurvey, setShowFeedbackSurvey] = useState(false);
  const [feedbackMilestone, setFeedbackMilestone] = useState<FeedbackMilestone>('day7');
  
  // Custom feedback forms
  const [pendingFeedbackForms, setPendingFeedbackForms] = useState<any[]>([]);
  const [showCustomFeedbackForm, setShowCustomFeedbackForm] = useState(false);
  const [selectedCustomForm, setSelectedCustomForm] = useState<any>(null);

  // Fetch pending custom feedback forms
  useEffect(() => {
    if (!user?.id) return;

    const fetchPendingForms = async () => {
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
        const res = await fetch('/api/getPendingFeedbackForms', {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.forms) {
            setPendingFeedbackForms(data.forms || []);
          }
        }
      } catch (e) {
        console.error('Failed to fetch pending feedback forms:', e);
      }
    };

    fetchPendingForms();
  }, [user?.id]);

  // Admin-only: lightweight signup counts for the daily dashboard
  useEffect(() => {
    if (!enableAdminDashboardV2) return;
    let isMounted = true;

    const loadSignupCounts = async () => {
      setIsLoadingAdminSignupCounts(true);
      setAdminSignupError(null);
      try {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Dynamic import to avoid module initialization/circular import edge-cases in production bundles
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('signupDate', '>=', sevenDaysAgo.toISOString()));
        const snapshot = await getDocs(q);

        let last24h = 0;
        let last7d = 0;

        snapshot.forEach(docSnap => {
          const data: any = docSnap.data();
          const rawDate = data?.signupDate;
          if (!rawDate) return;
          const d = new Date(rawDate);
          if (Number.isNaN(d.getTime())) return;
          if (d.getTime() >= sevenDaysAgo.getTime()) last7d++;
          if (d.getTime() >= twentyFourHoursAgo.getTime()) last24h++;
        });

        if (isMounted) {
          setAdminSignupCounts({ last24h, last7d });
        }
      } catch (err) {
        console.error('Failed to load signup counts for admin dashboard:', err);
        if (isMounted) {
          setAdminSignupError('Signup counts unavailable');
        }
      } finally {
        if (isMounted) {
          setIsLoadingAdminSignupCounts(false);
        }
      }
    };

    loadSignupCounts();

    return () => {
      isMounted = false;
    };
  }, [enableAdminDashboardV2]);

  // Check URL for custom feedback form parameter
  useEffect(() => {
    if (!user?.id) return;
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const formId = params.get('feedbackForm');
    if (!formId) return;

    // Find the form in pending forms
    const form = pendingFeedbackForms.find(f => f.id === formId);
    if (form) {
      setSelectedCustomForm(form);
      setShowCustomFeedbackForm(true);
      
      // Remove query param
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('feedbackForm');
        window.history.replaceState({}, '', url.toString());
      } catch {}
    }
  }, [user?.id, pendingFeedbackForms]);

  const handleCustomFeedbackSubmit = () => {
    // Remove submitted form from pending list
    if (selectedCustomForm) {
      setPendingFeedbackForms(prev => prev.filter(f => f.id !== selectedCustomForm.id));
    }
    setSelectedCustomForm(null);
    showToast?.('Thanks — feedback submitted!', 'success');
  };

  // Open feedback modal when arriving from an email link: ?feedback=day7|day14
  useEffect(() => {
    if (!user?.id) return;
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const m = params.get('feedback');
    if (m !== 'day7' && m !== 'day14') return;

    const milestone = m as FeedbackMilestone;
    const submittedKey = milestone === 'day7' ? 'feedbackDay7SubmittedAt' : 'feedbackDay14SubmittedAt';
    const alreadySubmitted = !!(user as any)?.[submittedKey];

    // Remove the query param so refreshes don't keep re-opening the modal.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('feedback');
      window.history.replaceState({}, '', url.toString());
    } catch {}

    if (alreadySubmitted) {
      showToast?.('Thanks — we already have your feedback for this check-in.', 'info');
      return;
    }

    setFeedbackMilestone(milestone);
    setShowFeedbackSurvey(true);
  }, [user?.id]);

  // Auto-prompt based on inviteGrantRedeemedAt, unless snoozed or already submitted.
  useEffect(() => {
    if (!user?.id) return;
    if (showFeedbackSurvey) return;

    const status = (user as any)?.subscriptionStatus as string | undefined;
    const redeemedAtIso = (user as any)?.inviteGrantRedeemedAt as string | undefined;
    if (!redeemedAtIso || status !== 'invite_grant') return;

    const redeemedMs = new Date(redeemedAtIso).getTime();
    if (!Number.isFinite(redeemedMs)) return;

    const nowMs = Date.now();
    const daysSince = (nowMs - redeemedMs) / (1000 * 60 * 60 * 24);

    const day7Submitted = !!(user as any)?.feedbackDay7SubmittedAt;
    const day14Submitted = !!(user as any)?.feedbackDay14SubmittedAt;

    const day7SnoozeUntil = (user as any)?.feedbackDay7SnoozeUntil as string | undefined | null;
    const day14SnoozeUntil = (user as any)?.feedbackDay14SnoozeUntil as string | undefined | null;
    const day7Snoozed = !!day7SnoozeUntil && new Date(day7SnoozeUntil).getTime() > nowMs;
    const day14Snoozed = !!day14SnoozeUntil && new Date(day14SnoozeUntil).getTime() > nowMs;

    const day14Due = daysSince >= 14;
    const day7Due = daysSince >= 7;

    if (day7Due && !day7Submitted && !day7Snoozed) {
      setFeedbackMilestone('day7');
      setShowFeedbackSurvey(true);
      return;
    }
    if (day14Due && !day14Submitted && !day14Snoozed) {
      setFeedbackMilestone('day14');
      setShowFeedbackSurvey(true);
    }
  }, [user, showFeedbackSurvey]);

  const snoozeFeedback24h = async (milestone: FeedbackMilestone) => {
    try {
      if (!user?.id) return;
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      if (!token) {
        showToast?.('Please sign in again to snooze.', 'error');
        return;
      }

      const snoozeUntilIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch('/api/snoozeFeedbackPrompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ milestone, snoozeUntil: snoozeUntilIso }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to snooze feedback prompt');
      }

      await setUser({
        id: user.id,
        ...(milestone === 'day7' ? { feedbackDay7SnoozeUntil: snoozeUntilIso } : { feedbackDay14SnoozeUntil: snoozeUntilIso }),
      } as any);
      setShowFeedbackSurvey(false);
      showToast?.('Okay — we’ll remind you in 24 hours.', 'info');
    } catch (e: any) {
      console.error('Failed to snooze feedback:', e);
      showToast?.(e?.message || 'Failed to snooze feedback prompt.', 'error');
    }
  };

  const submitInAppFeedback = async (payload: { milestone: FeedbackMilestone; answers: Record<string, string>; openEnded: Record<string, string> }) => {
    if (!user?.id) return;
    const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
    if (!token) {
      showToast?.('Please sign in again to submit feedback.', 'error');
      throw new Error('Not authenticated');
    }

    const res = await fetch('/api/submitInAppFeedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || 'Failed to submit feedback');
    }

    const nowIso = new Date().toISOString();
    await setUser({
      id: user.id,
      ...(payload.milestone === 'day7'
        ? { feedbackDay7SubmittedAt: nowIso, feedbackDay7SnoozeUntil: null }
        : { feedbackDay14SubmittedAt: nowIso, feedbackDay14SnoozeUntil: null }),
    } as any);
    showToast?.('Thanks — feedback submitted.', 'success');
  };
  
  if (!user) return <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full flex items-center justify-center"><p className="text-gray-500 dark:text-gray-400">Loading...</p></div>;

  // For Creator users: Show "Content Strategy", "Check Analytics", "Audience Stats", "Followers"
  // For Business users: Show "Marketing Plan", "Business Insights", "Business Metrics", "Potential Reach"
  // Admins default to Creator dashboard, but when switching to a client account, show Business dashboard
  const isBusiness = useMemo(() => {
    if (selectedClient) {
      return true;  // When viewing a client account, show Business dashboard
    }
    // Admins default to Creator unless viewing client
    if (user?.role === 'Admin') {
      return false;  // Admin's own dashboard is Creator view
    }
    return user?.userType === 'Business';
  }, [selectedClient, user?.role, user?.userType]);
  
  // Derive calendar events from posts - excludes premium content posts (they only show in Premium Content Studio calendar)
  // When posts are deleted, events automatically disappear from both Calendar and Dashboard
  const filteredCalendarEvents = useMemo(() => {
    // Get all posts that have scheduledDate - include Scheduled, Published, and Draft posts (for consistency with Calendar)
    // Exclude premium content posts - they should only appear in Premium Content Studio calendar
    const scheduledPosts = posts.filter(p => 
      p.scheduledDate && 
      (p.status === 'Scheduled' || p.status === 'Published' || p.status === 'Draft') && // Include Scheduled, Published, and Draft posts
      !(p.platforms && (p.platforms as any[]).includes('OnlyFans')) // Exclude OnlyFans posts
    );
    
    // Create calendar events from posts (same format as Calendar component)
    // This ensures Dashboard and Calendar are always in sync - both derive from the same posts array
    const eventsFromPosts: CalendarEvent[] = scheduledPosts.flatMap(post => {
      const platforms = post.platforms || [];
      return platforms.map((platform, idx) => {
        const eventDate = post.scheduledDate || new Date().toISOString();
        // Determine type: 'Post' | 'Story' | 'Reel' (match Calendar)
        let eventType: 'Post' | 'Story' | 'Reel' = 'Post';
        if ((post as any).instagramPostType === 'Story') {
          eventType = 'Story';
        } else if ((post as any).instagramPostType === 'Reel' || post.mediaType === 'video') {
          eventType = 'Reel';
        }
        return {
          id: `post-${post.id}-${platform}-${idx}`,
          title: post.content?.substring(0, 30) + '...' || 'Post',
          date: eventDate,
          type: eventType,
          platform: platform as Platform, // Cast to Platform (OnlyFans will need special handling)
          status: post.status as 'Scheduled' | 'Published' | 'Draft',
          thumbnail: post.mediaUrl || undefined,
        };
      });
    });
    
    // Also include events from calendarEvents context (exclude OnlyFans events)
    const eventsFromContext: CalendarEvent[] = (calendarEvents || []).filter(e => {
      // Exclude OnlyFans platform events
      if (e.platform === 'OnlyFans' || (e.platform as any) === 'OnlyFans') return false;
      // Always include reminders from the calendar_events collection (no platform/status)
      if ((e as any).reminderType && !(e as any).platform) return true;
      // Include scheduled, published, and draft events (do not future-filter here; consumers can decide)
      if (e.status === 'Scheduled' || e.status === 'Published' || e.status === 'Draft') return true;
      return false;
    });
    
    // Combine and deduplicate by ID
    const allEvents = [...eventsFromPosts, ...eventsFromContext];
    const uniqueEvents = allEvents.filter((event, index, self) => 
      index === self.findIndex(e => e.id === event.id)
    );
    
    return uniqueEvents;
  }, [posts, calendarEvents]);

  // Admin-only: scheduled emails fetched from /api/listScheduledEmails (used to augment calendar)
  const [adminScheduledEmails, setAdminScheduledEmails] = useState<Array<{ id: string; sendAt: string; subject: string; status: string }>>([]);

  // Admin-only: augment calendar events with scheduled emails (no DB writes, dashboard-only)
  const adminEmailEvents = useMemo<CalendarEvent[]>(() => {
    if (!enableAdminDashboardV2) return [];
    return adminScheduledEmails
      .filter(e => e.sendAt)
      .map((e, idx) => ({
        id: `scheduled-email-${e.id}-${idx}`,
        title: e.subject || 'Scheduled email',
        date: e.sendAt,
        type: 'Email',
        platform: 'Email' as any,
        status: (e.status as any) || 'Scheduled',
      }));
  }, [adminScheduledEmails, enableAdminDashboardV2]);

  const effectiveCalendarEvents = useMemo(() => {
    if (enableAdminDashboardV2) {
      return [...filteredCalendarEvents, ...adminEmailEvents];
    }
    return filteredCalendarEvents;
  }, [enableAdminDashboardV2, filteredCalendarEvents, adminEmailEvents]);
  
  // Calculate today's highlights
  const todaysHighlights = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaysPostsCreated = posts.filter(p => {
      const postDate = new Date(p.createdAt || 0);
      if (isNaN(postDate.getTime())) return false;
      postDate.setHours(0, 0, 0, 0);
      return postDate.getTime() === today.getTime();
    }).length;

    const draftsToReview = posts.filter(p => p.status === 'Draft').length;

    // Planned slots today (exclude reminders; include scheduled/published/draft items)
    const plannedToday = effectiveCalendarEvents.filter(e => {
      if (!e?.date) return false;
      if ((e as any).type === 'Reminder' || (e as any).reminderType) return false;
      if (e.status === 'Draft' || e.status === 'Scheduled' || e.status === 'Published') {
        const eventDate = new Date(e.date);
        if (isNaN(eventDate.getTime())) return false;
        eventDate.setHours(0, 0, 0, 0);
        return eventDate.getTime() === today.getTime();
      }
      return false;
    }).length;

    const now = new Date();
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const plannedNext7Days = effectiveCalendarEvents.filter(e => {
      if (!e?.date) return false;
      if ((e as any).type === 'Reminder' || (e as any).reminderType) return false;
      if (e.status !== 'Draft' && e.status !== 'Scheduled' && e.status !== 'Published') return false;
      const d = new Date(e.date);
      if (isNaN(d.getTime())) return false;
      return d.getTime() > now.getTime() && d.getTime() <= weekEnd.getTime();
    }).length;
    
    return {
      postsCreated: todaysPostsCreated,
      draftsToReview,
      plannedToday,
      plannedNext7Days
    };
  }, [posts, effectiveCalendarEvents]);
  
  // Admin-only growth suggestions (Gemini + Tavily prompts) - DEPRECATED, replaced by User Engagement widget
  const [adminGrowthIdeas, setAdminGrowthIdeas] = useState<{ queries: string[]; ideas: string[]; experiments: string[] }>({ queries: [], ideas: [], experiments: [] });
  const [isLoadingAdminGrowthIdeas, setIsLoadingAdminGrowthIdeas] = useState(false);
  const [adminGrowthError, setAdminGrowthError] = useState<string | null>(null);
  
  // Admin-only: User engagement & health metrics
  const [userEngagementData, setUserEngagementData] = useState<{
    conversionFunnel: { free: number; pro: number; elite: number; total: number };
    churnRisk: number; // Users who signed up >30 days ago but have low/no activity
    featureAdoption: { captions: number; images: number; videos: number; anyFeature: number };
    mostActiveUsers: Array<{ id: string; name: string; email: string; totalUsage: number; plan: string }>;
    totalUsers: number;
  } | null>(null);
  const [isLoadingUserEngagement, setIsLoadingUserEngagement] = useState(false);
  const [adminInviteStats, setAdminInviteStats] = useState<{ total?: number; used?: number; available?: number; expired?: number } | null>(null);
  const [adminFeedbackStats, setAdminFeedbackStats] = useState<{ total?: number; day7?: number; day14?: number } | null>(null);
  const [adminBilling, setAdminBilling] = useState<{ failed: any[]; renewals: any[] }>({ failed: [], renewals: [] });
  const [adminBillingError, setAdminBillingError] = useState<string | null>(null);
  const [isLoadingAdminBilling, setIsLoadingAdminBilling] = useState(false);
  const [adminOnlyFansUsage, setAdminOnlyFansUsage] = useState<any | null>(null);
  const [adminOnlyFansUsageError, setAdminOnlyFansUsageError] = useState<string | null>(null);
  const [isLoadingAdminOnlyFansUsage, setIsLoadingAdminOnlyFansUsage] = useState(false);
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [strategyModalTitle, setStrategyModalTitle] = useState('');
  const [strategyModalContent, setStrategyModalContent] = useState<any | null>(null);
  const [isLoadingStrategyDetail, setIsLoadingStrategyDetail] = useState(false);
  const [showGrowthDetails, setShowGrowthDetails] = useState(true);
  const [billingModal, setBillingModal] = useState<{ type: 'failed' | 'renewals' | null; items: any[] }>({ type: null, items: [] });

  // DEPRECATED: Weekly growth searches - replaced by User Engagement widget
  // Keeping this useEffect commented out but not removing to avoid breaking changes
  // useEffect(() => {
  //   if (!enableAdminDashboardV2) return;
  //   let isMounted = true;
  //   const run = async () => {
  //     setIsLoadingAdminGrowthIdeas(true);
  //     setAdminGrowthError(null);
  //     try {
  //       const { generateGrowthIdeas } = await import("../src/services/geminiService");
  //       const res = await generateGrowthIdeas({
  //         niche: "SaaS growth for a social scheduling app",
  //         growthGoal: "activation, WAU/MAU, invites, retention"
  //       });
  //       // ... rest of code
  //     } catch (err: any) {
  //       // ... error handling
  //     } finally {
  //       if (isMounted) setIsLoadingAdminGrowthIdeas(false);
  //     }
  //   };
  //   run();
  //   return () => {
  //     isMounted = false;
  //   };
  // }, [enableAdminDashboardV2]);

  // Admin-only: Load user engagement & health metrics
  useEffect(() => {
    if (!enableAdminDashboardV2 || user?.role !== 'Admin') return;
    let isMounted = true;

    const loadUserEngagement = async () => {
      setIsLoadingUserEngagement(true);
      try {
        const { collection, query, getDocs, where } = await import('firebase/firestore');
        const usersRef = collection(db, 'users');
        
        // Get all users (excluding admins for metrics)
        const usersQuery = query(usersRef);
        const snapshot = await getDocs(usersQuery);
        
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        let freeCount = 0;
        let proCount = 0;
        let eliteCount = 0;
        let churnRiskCount = 0;
        let captionsUsers = 0;
        let imagesUsers = 0;
        let videosUsers = 0;
        let anyFeatureUsers = 0;
        const userActivity: Array<{ id: string; name: string; email: string; totalUsage: number; plan: string }> = [];
        
        snapshot.forEach((docSnap) => {
          const userData = docSnap.data();
          const userId = docSnap.id;
          
          // Skip admins
          if (userData.role === 'Admin') return;
          
          // Count plans (only Free, Pro, Elite for funnel)
          const plan = userData.plan || 'Free';
          if (plan === 'Free') freeCount++;
          else if (plan === 'Pro') proCount++;
          else if (plan === 'Elite') eliteCount++;
          
          // Calculate usage
          const captions = Number(userData.monthlyCaptionGenerationsUsed || 0);
          const images = Number(userData.monthlyImageGenerationsUsed || 0);
          const videos = Number(userData.monthlyVideoGenerationsUsed || 0);
          const totalUsage = captions + images + videos;
          
          // Feature adoption
          if (captions > 0) captionsUsers++;
          if (images > 0) imagesUsers++;
          if (videos > 0) videosUsers++;
          if (captions > 0 || images > 0 || videos > 0) anyFeatureUsers++;
          
          // Churn risk: signed up >30 days ago but low/no activity
          const signupDate = userData.signupDate ? new Date(userData.signupDate) : null;
          if (signupDate && signupDate.getTime() < thirtyDaysAgo.getTime() && totalUsage < 5) {
            churnRiskCount++;
          }
          
          // Track for most active users
          if (totalUsage > 0) {
            userActivity.push({
              id: userId,
              name: userData.name || 'Unknown',
              email: userData.email || 'No email',
              totalUsage,
              plan
            });
          }
        });
        
        // Sort by usage and take top 5
        userActivity.sort((a, b) => b.totalUsage - a.totalUsage);
        const mostActive = userActivity.slice(0, 5);
        
        const totalUsers = freeCount + proCount + eliteCount;
        
        if (isMounted) {
          setUserEngagementData({
            conversionFunnel: {
              free: freeCount,
              pro: proCount,
              elite: eliteCount,
              total: totalUsers
            },
            churnRisk: churnRiskCount,
            featureAdoption: {
              captions: captionsUsers,
              images: imagesUsers,
              videos: videosUsers,
              anyFeature: anyFeatureUsers
            },
            mostActiveUsers: mostActive,
            totalUsers
          });
        }
      } catch (err) {
        console.error('Failed to load user engagement data:', err);
      } finally {
        if (isMounted) {
          setIsLoadingUserEngagement(false);
        }
      }
    };

    loadUserEngagement();
    return () => {
      isMounted = false;
    };
  }, [enableAdminDashboardV2, user?.role]);

  // Admin-only: load invites stats and feedback stats
  useEffect(() => {
    if (!enableAdminDashboardV2) return;
    let isMounted = true;
    const loadAux = async () => {
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
        // Invites
        try {
          const resp = await fetch('/api/listInviteCodes', {
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });
          if (resp.ok) {
            const data = await resp.json();
            if (isMounted) setAdminInviteStats(data.stats || null);
          }
        } catch (e) {
          console.warn('Admin dashboard: failed to load invite stats', e);
        }
        // Feedback
        try {
          const resp = await fetch('/api/adminGetFeedback', {
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });
          if (resp.ok) {
            const data = await resp.json();
            if (isMounted) setAdminFeedbackStats(data.stats || null);
          }
        } catch (e) {
          console.warn('Admin dashboard: failed to load feedback stats', e);
        }
        // Billing events (failed + renewals)
        try {
          setIsLoadingAdminBilling(true);
          const resp = await fetch('/api/adminGetBillingEvents', {
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data.success && isMounted) {
              setAdminBilling({ failed: data.failed || [], renewals: data.renewals || [] });
            } else if (isMounted) {
              setAdminBillingError(data.error || 'Billing data unavailable');
            }
          } else if (isMounted) {
            setAdminBillingError('Billing data unavailable');
          }
        } catch (e) {
          console.warn('Admin dashboard: failed to load billing events', e);
          if (isMounted) setAdminBillingError('Billing data unavailable');
        } finally {
          if (isMounted) setIsLoadingAdminBilling(false);
        }

        // OnlyFans usage metrics intentionally hidden from the admin daily dashboard (UI-only change).
        // Leave the underlying OnlyFans features untouched to minimize risk.

        // Scheduled emails (for admin calendar augmentation)
        try {
          const resp = await fetch('/api/listScheduledEmails', {
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });
          if (resp.ok) {
            const data = await resp.json();
            if (isMounted) {
              const items = Array.isArray(data.items) ? data.items : [];
              setAdminScheduledEmails(
                items.map((i: any) => ({
                  id: i.id || `scheduled-email-${Math.random()}`,
                  sendAt: i.sendAt,
                  subject: i.subject || i.name || 'Scheduled email',
                  status: i.status || 'scheduled',
                }))
              );
            }
          }
        } catch (e) {
          console.warn('Admin dashboard: failed to load scheduled emails', e);
        }
      } catch (err) {
        console.warn('Admin dashboard: aux stats load error', err);
      }
    };
    loadAux();
    return () => {
      isMounted = false;
    };
  }, [enableAdminDashboardV2]);
  
  // Content Ideas handler
  const handleGenerateIdeas = async (category: 'trending' | 'engagement' | 'niche') => {
    const niche = isBusiness ? user?.businessType : user?.niche;
    if (!niche) {
      showToast('Please set your niche in settings first.', 'error');
      return;
    }
    setIsGeneratingIdeas(true);
    setSelectedCategory(category);
    setShowIdeasModal(true); // Show modal immediately with loading state
    try {
      const { generateContentIdeas } = await import("../src/services/geminiService");
      // Map 'engagement' to 'high-engagement' for API
      const apiCategory = category === 'engagement' ? 'high-engagement' : category;
      const result = await generateContentIdeas(niche, apiCategory as 'high-engagement' | 'niche' | 'trending', user?.userType);
      if (result.success && result.ideas) {
        setGeneratedIdeas(result.ideas);
      } else {
        throw new Error(result.error || result.note || 'Failed to generate ideas');
      }
    } catch (err: any) {
      console.error('Error generating content ideas:', err);
      showToast(err?.note || err?.message || 'Failed to generate content ideas. Please try again.', 'error');
      setShowIdeasModal(false);
    } finally {
      setIsGeneratingIdeas(false);
    }
  };

  // Calculate trend data (mock - in real app, compare with historical data)
  // Using a stable seed based on value to avoid flickering
  const calculateTrend = useMemo(() => {
    const trendCache = new Map<string, { change: number; changePercent: number; isPositive: boolean }>();
    return (current: number, platform?: string) => {
      // Create a cache key that includes platform to ensure unique trends per platform
      const cacheKey = platform ? `${platform}-${current}` : `${current}`;
      if (trendCache.has(cacheKey)) {
        return trendCache.get(cacheKey)!;
      }
      // Mock trend: add variation between -5% and +10% based on value and platform as seed
      // Use platform name in seed calculation to ensure different trends per platform
      const platformSeed = platform ? platform.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
      const seed = (current % 100) + (platformSeed % 50);
      const variation = ((seed * 0.15) - 5) / 100;
      const previous = Math.round(current / (1 + variation));
      const change = current - previous;
      let changePercent = previous > 0 ? Math.round((change / previous) * 100) : 0;
      // Ensure change is not exactly 0 (add small variation if needed)
      // This ensures all platforms, including Facebook, always show a trend indicator
      if (changePercent === 0 && current > 0) {
        // Use platform-specific seed to ensure each platform gets a unique trend
        const fallbackSeed = (platformSeed + current) % 20;
        changePercent = fallbackSeed === 0 ? 3 : ((fallbackSeed % 11) - 4); // Range from -4% to +6%, default to +3%
      }
      const result = { change, changePercent, isPositive: changePercent >= 0 };
      trendCache.set(cacheKey, result);
      return result;
    };
  }, []);

  // Load weekly plan usage stats
  const loadWeeklyPlanUsage = async () => {
    if (!user?.id) return;
    try {
      const { auth } = await import('../firebaseConfig');
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const response = await fetch('/api/getUsageStats', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.weeklyPlan) {
          setWeeklyPlanUsage(data.weeklyPlan);
        }
      }
    } catch (error) {
      console.error('Failed to load weekly plan usage:', error);
    }
  };

  // Load usage stats on mount
  useEffect(() => {
    if (user?.id) {
      loadWeeklyPlanUsage();
    }
  }, [user?.id]);

  // Plan My Week - uses new /api/planMyWeek endpoint (requires auth)
  const handlePlanMyWeek = async () => {
    if (!user) {
      showToast('Please sign in again to plan your week.', 'error');
      return;
    }

    // Check if Free plan has reached limit
    if (user.plan === 'Free' && weeklyPlanUsage && weeklyPlanUsage.remaining <= 0) {
      showToast(`You've used your 1 free weekly plan this month. Upgrade to Pro or Elite for more weekly plans.`, 'info');
      setActivePage('pricing');
      return;
    }

    setIsPlanningWeek(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;

      const res = await fetch('/api/planMyWeek', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          posts,
          events: filteredCalendarEvents,
        }),
      });

      const data = await res.json();
      if (data.success && Array.isArray(data.suggestions)) {
        // Save to localStorage for persistence
        localStorage.setItem(`weeklySuggestions_${user.id}`, JSON.stringify({
          suggestions: data.suggestions,
          generatedAt: new Date().toISOString()
        }));
        setWeeklySuggestions(data.suggestions);
        // Update usage stats
        if (data.remaining !== undefined && weeklyPlanUsage) {
          setWeeklyPlanUsage({
            ...weeklyPlanUsage,
            count: weeklyPlanUsage.count + 1,
            remaining: data.remaining,
          });
        } else {
          loadWeeklyPlanUsage(); // Reload if not provided
        }
        showToast?.('Weekly plan generated. Review your suggested content pack below.', 'success');
      } else {
        if (data.note && data.note.includes('limit')) {
          // Limit reached - reload usage stats
          loadWeeklyPlanUsage();
        }
        showToast?.(data.note || data.error || 'Could not generate your weekly plan. Please try again.', 'error');
      }
    } catch (err: any) {
      console.error('Error generating weekly plan:', err);
      showToast?.(err?.message || 'Failed to generate weekly plan. Please try again.', 'error');
    } finally {
      setIsPlanningWeek(false);
    }
  };
  
  const [filters] = useState<DashboardFilters>({ platform: 'All', messageType: 'All', sentiment: 'All', status: 'All', category: 'All' });
  const [searchTerm] = useState('');
  
  // Track if we've updated social stats this session to avoid repeated calls
  const hasUpdatedStats = useRef(false);
  
  // Fetch and update social stats from backend (once per hour, cached in localStorage)
  useEffect(() => {
    if (!user || !user.id || hasUpdatedStats.current) return;
    
    const fetchAndUpdateStats = async () => {
      // Check if we've updated in the last hour (use localStorage to persist across refreshes)
      const lastUpdateKey = `socialStatsLastUpdate_${user.id}`;
      const lastUpdate = localStorage.getItem(lastUpdateKey);
      const now = Date.now();
      const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds
      
      if (lastUpdate && (now - parseInt(lastUpdate)) < oneHour) {
        // Updated recently, skip
        hasUpdatedStats.current = true;
        return;
      }
      
      setIsUpdatingStats(true);
      try {
        await updateUserSocialStats(user.id, setUser, user.socialStats, socialAccounts);
        localStorage.setItem(lastUpdateKey, now.toString());
        hasUpdatedStats.current = true;
      } catch (error) {
        // Silently fail - stats will use existing/cached values
        // Only log in development to reduce console noise
        if (process.env.NODE_ENV === 'development') {
          console.warn('Failed to update social stats (non-critical):', error);
        }
        // Don't show error to user - stats will just use existing/cached values
      } finally {
        setIsUpdatingStats(false);
      }
    };
    
    fetchAndUpdateStats();
  }, [user?.id, setUser, user?.socialStats]);
  
  // ... (useEffect, filteredMessages, upcomingEvents, handlers remain unchanged) ...
  // Include all the existing useEffects and handlers here...
   useEffect(() => {
    if (dashboardNavState) {
        if (dashboardNavState.highlightId) {
            // Inbox flow is not part of the current AI Content Studio workflow.
            // Keep the user on dashboard and clear the nav state instead.
            setActivePage('dashboard');
        }
        clearDashboardNavState();
    }
  }, [dashboardNavState, clearDashboardNavState, setActivePage]);

  const filteredMessages = useMemo(() => {
    return messages.filter(msg => {
        const clientMatch = selectedClient ? msg.clientId === selectedClient.id : !msg.clientId;
        const platformMatch = filters.platform === 'All' || msg.platform === filters.platform;
        const typeMatch = filters.messageType === 'All' || msg.type === filters.messageType;
        const sentimentMatch = filters.sentiment === 'All' || msg.sentiment === filters.sentiment;
        const categoryMatch = filters.category === 'All' || msg.category === filters.category;
        const statusMatch = filters.status === 'All' || 
            (filters.status === 'Flagged' && msg.isFlagged) || 
            (filters.status === 'Favorite' && msg.isFavorite);
        const searchMatch = searchTerm === '' || 
            msg.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            msg.content.toLowerCase().includes(searchTerm.toLowerCase());
            
        return clientMatch && platformMatch && typeMatch && sentimentMatch && categoryMatch && statusMatch && searchMatch && !msg.isArchived;
    });
  }, [filters, messages, searchTerm, selectedClient]);
  
  const upcomingEvents = useMemo(() => {
      const now = new Date();
      // Use filtered calendar events (only Scheduled and Published posts, exclude Draft)
      // Include reminders from main calendar
      // Filter events that are scheduled for future dates/times (exclude past events)
      // Show the next 3 events regardless of how far out they are
      const futureEvents = effectiveCalendarEvents
        .filter(e => {
          // Include reminders (they don't have status)
          if ((e as any).type === 'Reminder' || (e as any).reminderType) {
            if (!e.date) return false;
            try {
              const eventDate = new Date(e.date);
              return eventDate.getTime() > now.getTime();
            } catch (error) {
              return false;
            }
          }
          
          // Only show Scheduled and Published posts (exclude Draft posts from upcoming schedule)
          if (e.status === 'Draft') return false;
          
          if (!e.date) return false;
          try {
            const eventDate = new Date(e.date);
            // Only show events that are scheduled for the future (not past)
            // Use > (not >=) to exclude events that have already passed
            return eventDate.getTime() > now.getTime();
          } catch (error) {
            return false;
          }
        })
        .sort((a, b) => {
          try {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            return dateA - dateB; // Sort ascending (earliest first)
          } catch (error) {
            return 0;
          }
        });
      
      // Return the next 3 events (regardless of how far out)
      return futureEvents.slice(0, 3);
  }, [effectiveCalendarEvents]);

  const accountName = selectedClient ? selectedClient.name : 'Main Account';
  const currentStats = selectedClient ? selectedClient.socialStats : user?.socialStats;
  
  // Debug logging for Admin account switching
  useEffect(() => {
    if (user?.role === 'Admin') {
      console.log('Dashboard - selectedClient changed:', selectedClient?.name || 'Main Account');
      console.log('Dashboard - isBusiness:', isBusiness);
    }
  }, [selectedClient, user?.role, isBusiness]);

  const handleEventClick = (event: CalendarEvent) => {
    // Store event ID in localStorage so Calendar can auto-select it
    localStorage.setItem('calendarSelectedEventId', event.id);
    // Navigate to calendar page
    setActivePage('calendar');
  };


  const renderCommandCenter = () => (
      <div className="space-y-6 animate-fade-in">
          {/* Pending Feedback Forms Alert */}
          {pendingFeedbackForms.length > 0 && !showCustomFeedbackForm && (
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 dark:from-blue-600 dark:to-indigo-700 p-4 rounded-xl shadow-lg text-white">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-lg font-bold mb-1">
                    📋 You have {pendingFeedbackForms.length} feedback {pendingFeedbackForms.length === 1 ? 'form' : 'forms'} waiting
                  </h3>
                  <p className="text-sm text-blue-100/90 mb-3">
                    We'd love to hear your thoughts! Your feedback helps us improve EchoFlux.
                  </p>
                  <div className="space-y-2">
                    {pendingFeedbackForms.map((form) => (
                      <button
                        key={form.id}
                        onClick={() => {
                          setSelectedCustomForm(form);
                          setShowCustomFeedbackForm(true);
                        }}
                        className="block w-full text-left p-3 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                      >
                        <div className="font-semibold">{form.title}</div>
                        {form.description && (
                          <div className="text-xs text-blue-100/80 mt-1">{form.description}</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (pendingFeedbackForms.length > 0) {
                      setSelectedCustomForm(pendingFeedbackForms[0]);
                      setShowCustomFeedbackForm(true);
                    }
                  }}
                  className="px-4 py-2 bg-white text-blue-600 rounded-lg hover:bg-blue-50 font-semibold text-sm whitespace-nowrap"
                >
                  Take Survey
                </button>
              </div>
            </div>
          )}

          {/* Studio Mode Banner */}
          <div className="bg-gradient-to-r from-primary-600 to-purple-600 dark:from-primary-600 dark:to-purple-700 p-4 rounded-xl shadow-lg text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">AI Content Studio mode</h2>
              <p className="text-sm text-primary-100/90">
                Plan campaigns, generate content packs, and organize everything on your calendar. Post to social sites manually (account‑safe).
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-primary-100/80">
              <SparklesIcon className="w-4 h-4" />
              <span>Best flow: Strategy → Compose → Calendar</span>
            </div>
          </div>

          {/* Planning Highlights */}
          <div className="bg-gradient-to-r from-primary-500 to-primary-600 dark:from-primary-600 dark:to-primary-700 p-6 rounded-xl shadow-lg text-white">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Today’s Planning Snapshot</h2>
              <span className="text-sm opacity-90">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <p className="text-sm opacity-90 mb-1">Posts created today</p>
                <p className="text-3xl font-bold">{todaysHighlights.postsCreated}</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <p className="text-sm opacity-90 mb-1">Drafts to review</p>
                <p className="text-3xl font-bold">{todaysHighlights.draftsToReview}</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <p className="text-sm opacity-90 mb-1">Planned slots today</p>
                <p className="text-3xl font-bold">{todaysHighlights.plannedToday}</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <p className="text-sm opacity-90 mb-1">Next 7 days planned</p>
                <p className="text-3xl font-bold">{todaysHighlights.plannedNext7Days}</p>
              </div>
            </div>
          </div>

          {/* Quick Actions - Enhanced */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
             <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Plan your day</h3>
             <div className="flex flex-wrap justify-center gap-4">
                  <QuickAction
                    label="Create Post"
                    icon={<SparklesIcon className="w-6 h-6" />}
                    color="bg-gradient-to-br from-purple-500 to-indigo-600"
                    onClick={() => setActivePage('compose')}
                  />
                  {user?.plan !== 'Free' && (
                    <>
                      <QuickAction
                        label={isBusiness ? 'Marketing Plan' : 'Content Strategy'}
                        icon={<TrendingIcon className="w-6 h-6" />}
                        color="bg-gradient-to-br from-blue-500 to-cyan-500"
                        onClick={() => setActivePage('strategy')}
                      />
                      <QuickAction
                        label="View Calendar"
                        icon={<CalendarIcon className="w-6 h-6" />}
                        color="bg-gradient-to-br from-orange-400 to-red-500"
                        onClick={() => setActivePage('calendar')}
                      />
                      <QuickAction
                        label={isPlanningWeek ? 'Planning…' : 'Plan My Week'}
                        icon={<KanbanIcon className="w-6 h-6" />}
                        color="bg-gradient-to-br from-emerald-500 to-teal-500"
                        onClick={handlePlanMyWeek}
                      />
                      {(!isBusiness || user?.plan === 'Agency') && (
                        <QuickAction
                          label="Opportunities"
                          icon={<TrendingIcon className="w-6 h-6" />}
                          color="bg-gradient-to-br from-pink-500 to-rose-500"
                          onClick={() => setActivePage('opportunities')}
                        />
                      )}
                    </>
                  )}
             </div>
          </div>

          {/* Content Gap Analysis Widget */}
          {user?.plan !== 'Free' && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Content Intelligence</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Analyze your content mix and identify gaps
                  </p>
                </div>
              </div>
              <ContentGapAnalysis />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Upcoming Schedule */}
              <div className={`bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 ${user?.plan === 'Free' ? 'opacity-50' : ''}`}>
                   <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Upcoming Schedule</h3>
                        {user?.plan === 'Free' ? (
                          <span className="text-sm text-gray-400 dark:text-gray-500 cursor-not-allowed">View Calendar</span>
                        ) : (
                          <button onClick={() => setActivePage('calendar')} className="text-sm text-primary-600 hover:underline">View Calendar</button>
                        )}
                   </div>
                   <div className="space-y-3">
                        {upcomingEvents.length > 0 ? (
                            upcomingEvents.map(event => <UpcomingEventCard key={event.id} event={event} onClick={() => handleEventClick(event)} />)
                        ) : (
                            <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                                <p className="text-gray-500 text-sm">No upcoming planned content.</p>
                                {user?.plan === 'Free' ? (
                                    <span className="mt-2 text-gray-400 dark:text-gray-500 text-sm cursor-not-allowed">Start a content plan</span>
                                ) : (
                                    <button onClick={() => setActivePage('strategy')} className="mt-2 text-primary-600 text-sm font-medium">Start a content plan</button>
                                )}
                            </div>
                        )}
                   </div>
              </div>
              
              {/* Weekly Plan Suggestions */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                   <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">AI Weekly Plan</h3>
                        {user?.plan === 'Free' && weeklyPlanUsage && weeklyPlanUsage.remaining <= 0 ? (
                          <span className="text-sm text-gray-400 dark:text-gray-500 cursor-not-allowed">Limit Reached</span>
                        ) : (
                          <button
                            onClick={handlePlanMyWeek}
                            disabled={isPlanningWeek || (user?.plan === 'Free' && weeklyPlanUsage && weeklyPlanUsage.remaining <= 0)}
                            className="text-sm text-primary-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isPlanningWeek ? 'Planning…' : 'Regenerate'}
                          </button>
                        )}
                   </div>
                   {user?.plan === 'Free' && weeklyPlanUsage && (
                     <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                       {weeklyPlanUsage.remaining > 0 
                         ? `${weeklyPlanUsage.remaining} weekly plan${weeklyPlanUsage.remaining === 1 ? '' : 's'} remaining this month`
                         : 'Monthly limit reached. Upgrade to Pro or Elite for more weekly plans.'}
                     </div>
                   )}
                   <div className="space-y-3">
                        {isPlanningWeek && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">EchoFlux.ai is planning your week…</p>
                        )}
                        {!isPlanningWeek && weeklySuggestions.length === 0 && (
                          <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                              <p className="text-gray-500 text-sm">Let the assistant suggest a content pack for the next 7 days.</p>
                              {user?.plan === 'Free' && weeklyPlanUsage && weeklyPlanUsage.remaining <= 0 ? (
                                <button
                                  onClick={() => setActivePage('pricing')}
                                  className="mt-2 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
                                >
                                  Upgrade for More Weekly Plans
                                </button>
                              ) : (
                                <button
                                  onClick={handlePlanMyWeek}
                                  disabled={isPlanningWeek || (user?.plan === 'Free' && weeklyPlanUsage && weeklyPlanUsage.remaining <= 0)}
                                  className="mt-2 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Plan my week
                                </button>
                              )}
                          </div>
                        )}
                        {!isPlanningWeek && weeklySuggestions.length > 0 && (
                          <div className="space-y-3">
                            {weeklySuggestions.map((s, idx) => (
                              <div
                                key={`${s.date}-${idx}`}
                                className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                    {s.dayLabel} · {s.date}
                                  </span>
                                  {s.suggestedTimeWindow && (
                                    <span className="text-xs text-primary-600 dark:text-primary-400">
                                      {s.suggestedTimeWindow}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                  {s.theme}
                                </p>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                  {s.postIdea}
                                </p>
                                {s.captionOutline && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {s.captionOutline}
                                  </p>
                                )}
                                {Array.isArray(s.recommendedPlatforms) && s.recommendedPlatforms.length > 0 && (
                                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                                    Platforms: {s.recommendedPlatforms.join(', ')}
                                  </p>
                                )}
                                {s.notes && (
                                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 italic">
                                    {s.notes}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                   </div>
              </div>
          </div>

          {/* Enhanced Metrics Section - hidden in AI Content Studio mode */}
          {false && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{isBusiness ? 'Business Metrics' : 'Audience Stats'}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {currentStats && Object.entries(currentStats)
                      // For Free plan, only show the first connected social account
                      .filter(([platform, stats], index) => {
                        if (!stats || typeof stats.followers !== 'number') {
                          return false;
                        }
                        if (user?.plan === 'Free') {
                          // Only show the first connected account
                          return index === 0;
                        }
                        return true;
                      })
                      .map(([platform, stats]) => {
                      const trend = calculateTrend(stats?.followers || 0, platform);
                      return (
                       <div key={platform} className="relative overflow-hidden p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700/50 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-600 hover:shadow-md transition-all">
                          <div className="flex items-start justify-between mb-2">
                            <div className="text-gray-600 dark:text-gray-300">
                             {platformFilterIcons[platform as Platform]}
                            </div>
                            {trend.changePercent !== 0 ? (
                              <div className={`flex items-center text-xs font-semibold ${trend.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                <ArrowUpIcon className={`w-3 h-3 mr-0.5 ${!trend.isPositive ? 'rotate-180' : ''}`} />
                                {Math.abs(trend.changePercent)}%
                              </div>
                            ) : null}
                          </div>
                          <div>
                             <p className="text-2xl font-bold text-gray-900 dark:text-white">{new Intl.NumberFormat('en-US', { notation: "compact" }).format(stats?.followers || 0)}</p>
                             <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{isBusiness ? 'Potential Reach' : 'Followers'}</p>
                          </div>
                       </div>
                      );
                    })}
                     {isBusiness && (() => {
                       const websiteClicksTrend = calculateTrend(1204);
                       const leadsTrend = calculateTrend(88);
                       return (
                       <>
                          <div className="relative overflow-hidden p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 rounded-xl border border-blue-200 dark:border-blue-700 hover:shadow-md transition-all">
                              <div className="flex items-start justify-between mb-2">
                                <div className="text-blue-600 dark:text-blue-400"><LinkIcon className="w-5 h-5" /></div>
                                {websiteClicksTrend.changePercent !== 0 && (
                                  <div className={`flex items-center text-xs font-semibold ${websiteClicksTrend.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                    <ArrowUpIcon className={`w-3 h-3 mr-0.5 ${!websiteClicksTrend.isPositive ? 'rotate-180' : ''}`} />
                                    {Math.abs(websiteClicksTrend.changePercent)}%
                                  </div>
                                )}
                              </div>
                              <div>
                                 <p className="text-2xl font-bold text-gray-900 dark:text-white">1,204</p>
                                 <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Website Clicks</p>
                              </div>
                          </div>
                           <div className="relative overflow-hidden p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/30 rounded-xl border border-emerald-200 dark:border-emerald-700 hover:shadow-md transition-all">
                              <div className="flex items-start justify-between mb-2">
                                <div className="text-emerald-600 dark:text-emerald-400"><BriefcaseIcon className="w-5 h-5" /></div>
                                {leadsTrend.changePercent !== 0 && (
                                  <div className={`flex items-center text-xs font-semibold ${leadsTrend.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                    <ArrowUpIcon className={`w-3 h-3 mr-0.5 ${!leadsTrend.isPositive ? 'rotate-180' : ''}`} />
                                    {Math.abs(leadsTrend.changePercent)}%
                                  </div>
                                )}
                              </div>
                              <div>
                                 <p className="text-2xl font-bold text-gray-900 dark:text-white">88</p>
                                 <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Leads Generated</p>
                              </div>
                          </div>
                         </>
                       );
                     })()}
                </div>
            </div>
          )}
          
          
          {/* Fixed Layout Row: Top Content This Week and Recent Activity - Always Together */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Content Performance Widget - Creator & Agency Only */}
            {(() => {
              // Show for Creators OR Business Agency (since Agency manages creators)
              const shouldShowContentPerformance = !isBusiness || user?.plan === 'Agency';
              
              // Get posts from this week (last 7 days)
              const oneWeekAgo = new Date();
              oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
              
              const recentPosts = posts
                .filter(p => {
                  if (p.status !== 'Published') return false;
                  // Use timestamp, scheduledDate, or createdAt to determine post date
                  const postDate = p.timestamp 
                    ? new Date(p.timestamp)
                    : p.scheduledDate 
                    ? new Date(p.scheduledDate)
                    : p.createdAt 
                    ? new Date(p.createdAt)
                    : null;
                  if (!postDate || isNaN(postDate.getTime())) return false;
                  return postDate >= oneWeekAgo;
                })
                .sort((a, b) => {
                  // Sort by date (most recent first)
                  const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 
                               a.scheduledDate ? new Date(a.scheduledDate).getTime() :
                               a.createdAt ? new Date(a.createdAt).getTime() : 0;
                  const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 
                               b.scheduledDate ? new Date(b.scheduledDate).getTime() :
                               b.createdAt ? new Date(b.createdAt).getTime() : 0;
                  return dateB - dateA;
                })
                .slice(0, 3);
              
              // Calculate engagement - use consistent seed based on post ID for stable values
              const calculateMockEngagement = (postId: string, postContent: string) => {
                // Use both post ID and content hash for more stable but varied engagement
                const idSeed = postId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                const contentSeed = postContent.substring(0, 20).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                const combinedSeed = idSeed + contentSeed;
                
                return {
                  likes: Math.floor((combinedSeed % 500) + 100),
                  comments: Math.floor((combinedSeed % 50) + 10),
                  shares: Math.floor((combinedSeed % 30) + 5),
                  views: Math.floor((combinedSeed % 5000) + 1000)
                };
              };
              
              if (shouldShowContentPerformance) {
                const hasContent = recentPosts.length > 0;
                return (
                  <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col transition-all duration-300 ${
                    hasContent ? 'p-6 min-h-[400px]' : 'p-4 py-3'
                  }`}>
                    <div className={`flex items-center justify-between ${hasContent ? 'mb-4' : 'mb-0'}`}>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">Top Content This Week</h3>
                      {hasContent && (
                        <button onClick={() => setActivePage('analytics')} className="text-sm text-primary-600 hover:underline">View Analytics</button>
                      )}
                    </div>
                    {hasContent ? (
                      <div className="space-y-3 flex-1">
                        {recentPosts.map(post => {
                          const engagement = calculateMockEngagement(post.id, post.content || '');
                          const totalEngagement = engagement.likes + engagement.comments + engagement.shares;
                          return (
                            <div key={post.id} className="p-3 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                              <p className="text-sm font-medium text-gray-900 dark:text-white mb-2 truncate">{post.content?.substring(0, 60) || 'Post'}...</p>
                              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                                <div className="flex items-center gap-3">
                                  <span className="flex items-center gap-1">
                                    <HeartIcon className="w-4 h-4" /> {engagement.likes}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <ChatIcon className="w-4 h-4" /> {engagement.comments}
                                  </span>
                                  <span>{new Intl.NumberFormat('en-US', { notation: "compact" }).format(engagement.views)} views</span>
                                </div>
                                <span className="text-primary-600 dark:text-primary-400 font-semibold">{totalEngagement} total</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-1">
                        <p className="text-sm text-gray-500 dark:text-gray-400">No posts this week</p>
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })()}
            
            {/* Campaign Performance Widget - Business Starter/Growth Only (replaces Top Content for Business) */}
            {isBusiness && user?.plan !== 'Agency' && (() => {
              // Show top performing campaigns/posts for business
              const recentPosts = posts
                .filter(p => p.status === 'Published')
                .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                .slice(0, 3);
              
              const calculateMockMetrics = (postId: string) => {
                const seed = postId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                return {
                  reach: Math.floor((seed % 10000) + 2000),
                  clicks: Math.floor((seed % 500) + 50),
                  leads: Math.floor((seed % 20) + 2),
                  engagement: Math.floor((seed % 300) + 50)
                };
              };
              
              return (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 h-full flex flex-col min-h-[400px]">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Top Campaigns This Week</h3>
                    <button onClick={() => setActivePage('analytics')} className="text-sm text-primary-600 hover:underline">View Analytics</button>
                  </div>
                  {recentPosts.length > 0 ? (
                    <div className="space-y-3 flex-1">
                      {recentPosts.map(post => {
                        const metrics = calculateMockMetrics(post.id);
                        return (
                          <div key={post.id} className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                            <p className="text-sm font-medium text-gray-900 dark:text-white mb-2 truncate">{post.content.substring(0, 60)}...</p>
                            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                              <div className="flex items-center gap-3">
                                <span className="flex items-center gap-1">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> {new Intl.NumberFormat('en-US', { notation: "compact" }).format(metrics.reach)} reach
                                </span>
                                <span className="flex items-center gap-1">
                                  <LinkIcon className="w-4 h-4" /> {metrics.clicks} clicks
                                </span>
                                <span className="flex items-center gap-1">
                                  <BriefcaseIcon className="w-4 h-4" /> {metrics.leads} leads
                                </span>
                              </div>
                              <span className="text-primary-600 dark:text-primary-400 font-semibold">{metrics.engagement} engagement</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-sm text-gray-500 dark:text-gray-400">No campaigns this week</p>
                    </div>
                  )}
                </div>
              );
            })()}
            
            {/* Recent Activity - Always in Same Row as Top Content/Campaigns */}
            {(() => {
              // Generate activity timeline from posts, messages, and campaigns
              const activities: Array<{ id: string; type: string; message: string; timestamp: Date; icon: React.ReactNode }> = [];
              
              // Recent posts (include all Published posts, with or without media)
              const recentPublishedPosts = posts
                .filter(p => p.status === 'Published')
                .sort((a, b) => {
                  const dateA = new Date(a.timestamp || a.scheduledDate || a.createdAt || 0);
                  const dateB = new Date(b.timestamp || b.scheduledDate || b.createdAt || 0);
                  return dateB.getTime() - dateA.getTime();
                })
                .slice(0, 5);
              
              recentPublishedPosts.forEach(post => {
                const postDate = new Date(post.timestamp || post.scheduledDate || post.createdAt || Date.now());
                const platformNames = post.platforms && post.platforms.length > 0 
                  ? post.platforms.join(', ') 
                  : 'social media';
                const isTextOnly = !post.mediaUrl;
                activities.push({
                  id: `post-${post.id}`,
                  type: 'post',
                  message: `Published ${isTextOnly ? 'text post' : 'post'} on ${platformNames}`,
                  timestamp: postDate,
                  icon: <SparklesIcon className="w-4 h-4" />
                });
              });
              
              // Recent messages
              if (messages.length > 0) {
                messages.slice(0, 1).forEach(msg => {
                  activities.push({
                    id: `message-${msg.id}`,
                    type: 'message',
                    message: `New ${isBusiness ? 'lead' : 'fan'} message from ${msg.user.name}`,
                    timestamp: new Date(msg.timestamp),
                    icon: <ChatIcon className="w-4 h-4" />
                  });
                });
              }
              
              // Sort by timestamp (most recent first)
              activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
              
              const hasContent = activities.length > 0;
              
              return (
                <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col transition-all duration-300 ${
                  hasContent ? 'p-6 min-h-[400px]' : 'p-4 py-3'
                }`}>
                  <div className={`flex items-center justify-between ${hasContent ? 'mb-4' : 'mb-0'}`}>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Recent Activity</h3>
                  </div>
                  {hasContent ? (
                    <div className="space-y-3 flex-1">
                      {activities.slice(0, 5).map(activity => (
                        <div key={activity.id} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                          <div className="flex-shrink-0 mt-0.5 text-primary-600 dark:text-primary-400">
                            {activity.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{activity.message}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {activity.timestamp.toLocaleDateString()} at {activity.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-1">
                      <p className="text-sm text-gray-500 dark:text-gray-400">No recent activity</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          
          {/* Additional Business Widgets - Separate Row */}
          {isBusiness && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start mt-6">
              {/* Lead Pipeline Widget - Business Only */}
              {(() => {
                // Calculate lead pipeline stats from messages
                const leadMessages = messages.filter(m => m.category === 'Lead' && !m.isArchived);
                const totalLeads = leadMessages.length;
                const newLeads = leadMessages.filter(m => {
                  const msgDate = new Date(m.timestamp);
                  const weekAgo = new Date();
                  weekAgo.setDate(weekAgo.getDate() - 7);
                  return msgDate > weekAgo;
                }).length;
                const qualifiedLeads = Math.floor(totalLeads * 0.4); // Mock: 40% qualified
                const convertedLeads = Math.floor(totalLeads * 0.15); // Mock: 15% converted
                
                return (
                  <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">Lead Pipeline</h3>
                      <button onClick={() => setActivePage('analytics')} className="text-sm text-primary-600 hover:underline">View CRM</button>
                    </div>
                    <div className="space-y-4">
                      {/* Funnel Visualization */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">New Leads</span>
                          <span className="text-lg font-bold text-gray-900 dark:text-white">{newLeads}</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                          <div className="bg-gradient-to-r from-blue-500 to-blue-600 h-full" style={{ width: '100%' }}></div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Qualified</span>
                          <span className="text-lg font-bold text-gray-900 dark:text-white">{qualifiedLeads}</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                          <div className="bg-gradient-to-r from-yellow-500 to-orange-500 h-full" style={{ width: `${(qualifiedLeads / (newLeads || 1)) * 100}%` }}></div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Converted</span>
                          <span className="text-lg font-bold text-green-600 dark:text-green-400">{convertedLeads}</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                          <div className="bg-gradient-to-r from-green-500 to-emerald-600 h-full" style={{ width: `${(convertedLeads / (qualifiedLeads || 1)) * 100}%` }}></div>
                        </div>
                      </div>
                      
                      <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Conversion Rate</span>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          
          {/* First Row: Goals & Milestones, Best Posting Times, Quick Stats */}
          {user.plan !== 'Free' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Goals & Milestones Widget */}
              {(() => {
              // Calculate goals progress using user-defined goals or defaults
              const currentFollowers = currentStats ? Object.values(currentStats).reduce((sum, stats) => sum + (stats?.followers || 0), 0) : 0;
              const goalFollowers = user?.goals?.followerGoal || Math.ceil(currentFollowers * 1.5); // kept for future analytics-focused mode
              const followersProgress = goalFollowers > 0 ? Math.min((currentFollowers / goalFollowers) * 100, 100) : 0;
              
              // Count ALL posts created this month (use timestamp, scheduledDate, or createdAt)
              const postsThisMonth = posts.filter(p => {
                // Try multiple date fields to ensure we count all posts
                const postDate = p.timestamp 
                  ? new Date(p.timestamp)
                  : p.scheduledDate 
                  ? new Date(p.scheduledDate)
                  : p.createdAt 
                  ? new Date(p.createdAt)
                  : null;
                
                if (!postDate || isNaN(postDate.getTime())) {
                  return false; // Skip posts with invalid dates
                }
                
                const now = new Date();
                return postDate.getMonth() === now.getMonth() && 
                       postDate.getFullYear() === now.getFullYear();
              }).length;
              const goalPosts = user?.goals?.monthlyPostsGoal || 30; // Use user goal or default to 30 posts/month
              const postsProgress = goalPosts > 0 ? Math.min((postsThisMonth / goalPosts) * 100, 100) : 0;
              
              return (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Goals & Milestones</h3>
                    <button
                      onClick={() => setActivePage('settings')}
                      className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
                    >
                      Edit Goals
                    </button>
                  </div>
                  <div className="space-y-4">
                    {/* Posts Goal */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Posts This Month</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {postsThisMonth} / {goalPosts}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-emerald-500 to-green-600 h-full transition-all duration-500" 
                          style={{ width: `${postsProgress}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {Math.round(postsProgress)}% complete
                      </p>
                    </div>
                    
                    {/* Monthly Leads Goal - Business Only (hidden in AI Content Studio mode) */}
                    {false && isBusiness && (() => {
                      const leadMessages = messages.filter(m => m.category === 'Lead' && !m.isArchived);
                      const currentLeads = leadMessages.filter(m => {
                        const msgDate = new Date(m.timestamp);
                        const now = new Date();
                        return msgDate.getMonth() === now.getMonth() && msgDate.getFullYear() === now.getFullYear();
                      }).length;
                      const goalLeads = user?.goals?.monthlyLeadsGoal || 50; // Use user goal or default to 50 leads/month
                      const leadsProgress = goalLeads > 0 ? Math.min((currentLeads / goalLeads) * 100, 100) : 0;
                      
                      return (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Leads This Month</span>
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">
                              {currentLeads} / {goalLeads}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                            <div 
                              className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full transition-all duration-500" 
                              style={{ width: `${leadsProgress}%` }}
                            ></div>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {Math.round(leadsProgress)}% complete
                          </p>
                        </div>
                      );
                    })()}
                    
                    {/* Milestone badges - only based on content goal in studio mode */}
                    {(postsProgress >= 100) && (
                      <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                          <CheckCircleIcon className="w-5 h-5" />
                          <span className="font-semibold">🎉 Goal Achieved!</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                );
                })()}
                
                {/* Quick Stats Widget - Always shows next to Goals & Milestones for paid users */}
                {(() => {
              // Calculate quick stats (content-focused)
              const totalPosts = posts.length;
              const publishedPosts = posts.filter(p => p.status === 'Published').length;
              const scheduledPosts = posts.filter(p => p.status === 'Scheduled').length;
              const draftPosts = posts.filter(p => p.status === 'Draft').length;
              
              return (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Quick Stats</h3>
                    <button onClick={() => setActivePage('analytics')} className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium">
                      View Details
                    </button>
                  </div>
                  <div className="space-y-4">
                    {/* Post Status Breakdown */}
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Post Status</p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600 dark:text-gray-400">Published</span>
                          <span className="text-sm font-semibold text-green-600 dark:text-green-400">{publishedPosts}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600 dark:text-gray-400">Scheduled</span>
                          <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{scheduledPosts}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600 dark:text-gray-400">Drafts</span>
                          <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">{draftPosts}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Total Posts */}
                    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Posts</span>
                        <span className="text-lg font-bold text-gray-900 dark:text-white">{totalPosts}</span>
                      </div>
                    </div>
                  </div>
                </div>
                );
                })()}
              
              {/* Best Posting Times - Dynamic Based on User Data */}
              {(() => {
            // Analyze user's actual posting patterns and engagement
            // Prefer calendar-derived events so the widget matches what users see on the Calendar.
            const allCalendarItems = (effectiveCalendarEvents || []).filter(e => {
              if (!e?.date) return false;
              if ((e as any).type === 'Reminder' || (e as any).reminderType) return false;
              return e.status === 'Published' || e.status === 'Scheduled';
            });
            
            // Group posts by day of week and time
            const dayTimeMap: Record<string, { count: number }> = {};
            const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            
            allCalendarItems.forEach(item => {
              const date = new Date(item.date);
              if (isNaN(date.getTime())) return;
              const dayName = daysOfWeek[date.getDay()];
              const hour = date.getHours();
              
              // Round to nearest hour slot (6AM, 9AM, 12PM, 3PM, 6PM, 9PM)
              const timeSlots = [6, 9, 12, 15, 18, 21];
              const nearestSlot = timeSlots.reduce((prev, curr) => 
                Math.abs(curr - hour) < Math.abs(prev - hour) ? curr : prev
              );
              
              const timeKey = `${dayName}-${nearestSlot}`;
              if (!dayTimeMap[timeKey]) {
                dayTimeMap[timeKey] = { count: 0 };
              }
              
              dayTimeMap[timeKey].count++;
            });
            
            // Calculate best times per day
            const bestTimes = daysOfWeek.map(day => {
              const daySlots = Object.keys(dayTimeMap)
                .filter(key => key.startsWith(day))
                .map(key => ({
                  time: parseInt(key.split('-')[1]),
                  ...dayTimeMap[key],
                }))
                .sort((a, b) => {
                  return b.count - a.count;
                })
                .slice(0, 3); // Top 3 times per day
              
              // Format times
              const formattedTimes = daySlots.map(slot => {
                const hour = slot.time;
                const period = hour >= 12 ? 'PM' : 'AM';
                const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
                return `${displayHour}:00 ${period}`;
              });
              
              // Determine engagement level
              const totalPosts = daySlots.reduce((sum, slot) => sum + slot.count, 0);
              
              let engagement: 'High' | 'Medium' | 'Low' = 'Low';
              if (totalPosts >= 5) {
                engagement = 'High';
              } else if (totalPosts >= 2) {
                engagement = 'Medium';
              }
              
              // If no data, use generic recommendations
              if (formattedTimes.length === 0) {
                if (['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(day)) {
                  return { day, times: ['9:00 AM', '12:00 PM', '6:00 PM'], engagement: 'High' as const };
                } else {
                  return { day, times: ['10:00 AM', '2:00 PM'], engagement: 'Medium' as const };
                }
              }
              
              return { day, times: formattedTimes, engagement };
            });
            
            return (
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 p-3 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-600">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg">
                    <TrendingIcon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Best Posting Times</h3>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">Optimal times for maximum engagement</p>
                  </div>
                </div>
                
                {/* Best Times List */}
                <div className="space-y-1.5 max-h-[280px] overflow-y-auto custom-scrollbar">
                  {bestTimes.map((dayData, index) => (
                    <div key={index} className="bg-white dark:bg-gray-800 rounded-lg p-2 border border-gray-200 dark:border-gray-600">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-900 dark:text-white">{dayData.day}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          dayData.engagement === 'High' 
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        }`}>
                          {dayData.engagement}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {dayData.times.map((time, timeIndex) => (
                          <div
                            key={timeIndex}
                            className="px-2 py-1 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 rounded-md text-xs font-medium"
                          >
                            {time}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Summary */}
                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                  <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                    <TrendingIcon className="w-3 h-3 text-primary-600 dark:text-primary-400" />
                    <span className="font-medium">
                      {allCalendarItems.length > 0 
                        ? 'Based on your calendar plan' 
                        : 'Tip:'}
                    </span>
                    <span className="text-[10px]">
                      {allCalendarItems.length > 0
                        ? 'Calculated from scheduled & published items'
                        : 'Weekdays 9 AM - 6 PM'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
            </div>
          )}
          
          {/* Second Row: AI Insights and Content Ideas */}
          {user.plan !== 'Free' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* AI Insights & Recommendations Panel - Redesigned */}
            {(() => {
              // Generate actionable recommendations based on user data
              const recommendations: Array<{ type: 'success' | 'info' | 'warning' | 'tip'; title: string; description: string; action?: () => void; actionLabel?: string }> = [];
              
              // Check posting frequency based on the most relevant timestamp.
              // createdAt doesn't change when you publish, so prefer publishedAt.
              const getPostActivityDate = (p: any) => {
                const ts =
                  p?.publishedAt ||
                  p?.updatedAt ||
                  p?.scheduledDate ||
                  p?.createdAt;
                const d = ts ? new Date(ts) : new Date(0);
                return isNaN(d.getTime()) ? new Date(0) : d;
              };
              const weekAgo = new Date();
              weekAgo.setDate(weekAgo.getDate() - 7);
              const postsThisWeek = posts.filter((p: any) => {
                if (p?.status !== 'Published') return false;
                return getPostActivityDate(p) > weekAgo;
              }).length;
              
              if (postsThisWeek < 3) {
                recommendations.push({
                  type: 'tip',
                  title: 'Increase Posting Frequency',
                  description: `You've posted ${postsThisWeek} times this week. Consistent posting improves engagement.`,
                  action: () => setActivePage('compose'),
                  actionLabel: 'Create Post'
                });
              }
              
              // Check upcoming schedule
              const upcomingCount = effectiveCalendarEvents.filter(e => {
                if (!e?.date) return false;
                if ((e as any).type === 'Reminder' || (e as any).reminderType) return false;
                if (e.status !== 'Scheduled' && e.status !== 'Published' && e.status !== 'Draft') return false;
                const eventDate = new Date(e.date);
                return !isNaN(eventDate.getTime()) && eventDate > new Date();
              }).length;
              
              if (upcomingCount === 0) {
                recommendations.push({
                  type: 'warning',
                  title: 'No Upcoming Posts',
                  description: 'Schedule content ahead of time to maintain consistent presence.',
                  action: () => setActivePage('compose'),
                  actionLabel: 'Schedule Post'
                });
              }

              // In offline/studio mode we don't have an Inbox. Replace message nudges with draft/workflow nudges.
              const draftsCount = posts.filter(p => p.status === 'Draft').length;
              if (draftsCount > 0) {
                recommendations.push({
                  type: 'info',
                  title: 'Drafts Ready to Polish',
                  description: `You have ${draftsCount} draft${draftsCount === 1 ? '' : 's'} to review before scheduling.`,
                  action: () => setActivePage('approvals'),
                  actionLabel: 'Review drafts'
                });
              }
              
              // Automation page is not part of the current tester-ready workflow; route users to Compose instead.
              if (user?.plan !== 'Free') {
                recommendations.push({
                  type: 'tip',
                  title: 'Try AI Content Generation',
                  description: 'Upload images or videos and let AI generate captions tailored to your content and platforms.',
                  action: () => setActivePage('compose'),
                  actionLabel: 'Generate Captions'
                });
              }
              
              // Success recommendation if posting consistently
              if (postsThisWeek >= 5 && upcomingCount >= 3) {
                recommendations.push({
                  type: 'success',
                  title: 'Great Consistency! 🎉',
                  description: `You've posted ${postsThisWeek} times this week and have ${upcomingCount} posts scheduled. Keep it up!`
                });
              }
              
              // Default recommendation if no others
              if (recommendations.length === 0) {
                recommendations.push({
                  type: 'tip',
                  title: 'Explore Analytics',
                  description: 'Check your analytics to see what content performs best and optimize your strategy.',
                  action: () => setActivePage('analytics'),
                  actionLabel: 'View Analytics'
                });
              }
              
              // Limit to 5 recommendations for taller box
              const displayRecommendations = recommendations.slice(0, 5);
              
              const getIcon = (type: string) => {
                switch(type) {
                  case 'success': return <CheckCircleIcon className="w-5 h-5" />;
                  case 'warning': return <FlagIcon className="w-5 h-5" />;
                  case 'info': return <SparklesIcon className="w-5 h-5" />;
                  default: return <SparklesIcon className="w-5 h-5" />;
                }
              };
              
              const getGradientClasses = (type: string) => {
                switch(type) {
                  case 'success': return 'from-emerald-50 to-green-50 dark:from-emerald-900/30 dark:to-green-900/20 border-emerald-200 dark:border-emerald-700/50';
                  case 'warning': return 'from-amber-50 to-yellow-50 dark:from-amber-900/30 dark:to-yellow-900/20 border-amber-200 dark:border-amber-700/50';
                  case 'info': return 'from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/20 border-blue-200 dark:border-blue-700/50';
                  default: return 'from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/20 border-purple-200 dark:border-purple-700/50';
                }
              };
              
              const getTextColor = (type: string) => {
                switch(type) {
                  case 'success': return 'text-emerald-700 dark:text-emerald-300';
                  case 'warning': return 'text-amber-700 dark:text-amber-300';
                  case 'info': return 'text-blue-700 dark:text-blue-300';
                  default: return 'text-purple-700 dark:text-purple-300';
                }
              };
              
              return displayRecommendations.length > 0 ? (
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 p-5 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl">
                      <SparklesIcon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-gray-900 dark:text-white">AI Insights</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Smart Recommendations</p>
                    </div>
                  </div>
                  <div className="space-y-2.5 max-h-[500px] overflow-y-auto custom-scrollbar">
                    {displayRecommendations.map((rec, idx) => (
                      <div key={idx} className={`p-3.5 rounded-xl border bg-gradient-to-r ${getGradientClasses(rec.type)} backdrop-blur-sm hover:shadow-md transition-all`}>
                        <div className="flex items-start gap-2.5">
                          <div className={`flex-shrink-0 mt-0.5 ${getTextColor(rec.type)}`}>
                            {getIcon(rec.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`font-semibold text-xs mb-1 ${getTextColor(rec.type)}`}>{rec.title}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">{rec.description}</p>
                            {rec.action && rec.actionLabel && (
                              <button
                                onClick={rec.action}
                                className={`text-xs font-semibold ${getTextColor(rec.type)} hover:opacity-80 transition-opacity flex items-center gap-1`}
                              >
                                {rec.actionLabel} →
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
            
            {/* Content Suggestions Panel - Phase 3 Feature 4 */}
            {(() => {
              // Generate content suggestions based on user's niche, recent posts, and performance
              const niche = isBusiness ? user?.businessType : user?.niche;
              const recentPosts = posts.filter(p => p.status === 'Published').slice(0, 5);
              // Note: State hooks (isGeneratingIdeas, generatedIdeas, selectedCategory, showIdeasModal) 
              // and handleGenerateIdeas function are now at the top level of the Dashboard component
              
              // Generate mock suggestions based on user type and niche
              const generateSuggestions = (): Array<{ title: string; description: string; type: 'trending' | 'engagement' | 'niche' }> => {
                const suggestions: Array<{ title: string; description: string; type: 'trending' | 'engagement' | 'niche' }> = [];
                
                if (isBusiness) {
                  suggestions.push(
                    {
                      title: `Showcase ${niche || 'your business'} success story`,
                      description: `Share a customer testimonial or case study to build trust.`,
                      type: 'engagement'
                    },
                    {
                      title: `Behind-the-scenes of ${niche || 'your operations'}`,
                      description: `Give followers a peek into your business process.`,
                      type: 'niche'
                    },
                    {
                      title: `Industry tip or best practice`,
                      description: `Position yourself as an expert by sharing valuable insights.`,
                      type: 'trending'
                    }
                  );
                } else {
                  suggestions.push(
                    {
                      title: `Share a ${niche || 'personal'} milestone or achievement`,
                      description: `Celebrate your progress with your audience.`,
                      type: 'engagement'
                    },
                    {
                      title: `Create ${niche || 'engaging'} behind-the-scenes content`,
                      description: `Show your creative process or daily routine.`,
                      type: 'niche'
                    },
                    {
                      title: `Jump on trending ${niche || 'topic'} challenge`,
                      description: `Participate in a trending challenge in your niche.`,
                      type: 'trending'
                    }
                  );
                }
                
                // If they have recent posts, suggest building on what worked
                if (recentPosts.length > 0) {
                  suggestions.push({
                    title: 'Build on your best performing content',
                    description: `Create a follow-up or series based on your successful posts.`,
                    type: 'engagement'
                  });
                }
                
                return suggestions.slice(0, 5);
              };
              
              const suggestions = generateSuggestions();
              
              const getTypeBadge = (type: string) => {
                switch(type) {
                  case 'trending': return { 
                    label: 'Trending', 
                    gradient: 'from-rose-500 to-pink-500',
                    bg: 'bg-rose-50 dark:bg-rose-900/20',
                    text: 'text-rose-700 dark:text-rose-300',
                    border: 'border-rose-200 dark:border-rose-700/50',
                    category: 'trending' as const
                  };
                  case 'engagement': return { 
                    label: 'High Engagement', 
                    gradient: 'from-blue-500 to-cyan-500',
                    bg: 'bg-blue-50 dark:bg-blue-900/20',
                    text: 'text-blue-700 dark:text-blue-300',
                    border: 'border-blue-200 dark:border-blue-700/50',
                    category: 'engagement' as const
                  };
                  default: return { 
                    label: 'Niche', 
                    gradient: 'from-purple-500 to-indigo-500',
                    bg: 'bg-purple-50 dark:bg-purple-900/20',
                    text: 'text-purple-700 dark:text-purple-300',
                    border: 'border-purple-200 dark:border-purple-700/50',
                    category: 'niche' as const
                  };
                }
              };
              
              return suggestions.length > 0 ? (
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 p-5 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl">
                        <SparklesIcon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-gray-900 dark:text-white">Content Ideas</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">AI-Powered Suggestions</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2.5 max-h-[500px] overflow-y-auto custom-scrollbar">
                    {suggestions.map((suggestion, idx) => {
                      const badge = getTypeBadge(suggestion.type);
                      return (
                        <div 
                          key={idx}
                          className={`group p-3.5 rounded-xl border ${badge.bg} ${badge.border} hover:shadow-lg transition-all cursor-pointer backdrop-blur-sm`}
                          onClick={() => {
                            setComposeContext({
                              media: null,
                              results: [],
                              captionText: suggestion.title + ': ' + suggestion.description,
                              postGoal: 'engagement',
                              postTone: 'friendly'
                            });
                            setActivePage('compose');
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`flex-shrink-0 p-1.5 bg-gradient-to-br ${badge.gradient} rounded-lg`}>
                              <SparklesIcon className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleGenerateIdeas(badge.category);
                                  }}
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${badge.text} ${badge.bg} border ${badge.border} hover:opacity-80 transition-opacity cursor-pointer`}
                                  disabled={isGeneratingIdeas}
                                >
                                  {badge.label}
                                </button>
                              </div>
                              <p className={`font-semibold text-xs mb-1 ${badge.text}`}>
                                {suggestion.title}
                              </p>
                              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                {suggestion.description}
                              </p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setComposeContext({
                                  media: null,
                                  results: [],
                                  captionText: suggestion.title + ': ' + suggestion.description,
                                  postGoal: 'engagement',
                                  postTone: 'friendly'
                                });
                                setActivePage('compose');
                              }}
                              className={`flex-shrink-0 p-1.5 bg-gradient-to-br ${badge.gradient} text-white rounded-lg hover:opacity-90 transition-opacity opacity-0 group-hover:opacity-100`}
                              title="Create post from this suggestion"
                            >
                              <SparklesIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null;
            })()}
          </div>
          )}
          
          {/* Fan Engagement Hub - Creator & Agency Only */}
          {(() => {
            // Show for Creators OR Business Agency (since Agency manages creators)
            const shouldShowFanHub = !isBusiness || user?.plan === 'Agency';
            if (OFFLINE_MODE) return null;
            if (!shouldShowFanHub) return null;
            
            const fanMessages = messages.filter(m => !m.isArchived && (m.category === 'Fan Message' || !m.category));
            const collabRequests = messages.filter(m => !m.isArchived && m.category === 'Collab Request');
            const questions = messages.filter(m => !m.isArchived && m.category === 'Question');
            const feedback = messages.filter(m => !m.isArchived && m.category === 'Feedback');
            
            return (fanMessages.length > 0 || collabRequests.length > 0 || questions.length > 0) ? (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Fan Engagement Hub</h3>
                  {!OFFLINE_MODE && (
                    <button onClick={() => setActivePage('inbox')} className="text-sm text-primary-600 hover:underline">View Inbox</button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 rounded-lg border border-pink-200 dark:border-pink-700 text-center">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{fanMessages.length}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Fan Messages</p>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg border border-blue-200 dark:border-blue-700 text-center">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{collabRequests.length}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Collab Requests</p>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg border border-purple-200 dark:border-purple-700 text-center">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{questions.length}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Questions</p>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-700 text-center">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{feedback.length}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Feedback</p>
                  </div>
                </div>
              </div>
            ) : null;
          })()}
          
          {/* Customer Engagement Hub - Business Starter/Growth Only */}
          {isBusiness && user?.plan !== 'Agency' && (() => {
            if (OFFLINE_MODE) return null;
            const leadMessages = messages.filter(m => !m.isArchived && m.category === 'Lead');
            const supportMessages = messages.filter(m => !m.isArchived && m.category === 'Support');
            const opportunityMessages = messages.filter(m => !m.isArchived && m.category === 'Opportunity');
            const generalMessages = messages.filter(m => !m.isArchived && (!m.category || m.category === 'General'));
            
            return (leadMessages.length > 0 || supportMessages.length > 0 || opportunityMessages.length > 0 || generalMessages.length > 0) ? (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Customer Engagement Hub</h3>
                  {!OFFLINE_MODE && (
                    <button onClick={() => setActivePage('inbox')} className="text-sm text-primary-600 hover:underline">View Inbox</button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-lg border border-emerald-200 dark:border-emerald-700 text-center">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{leadMessages.length}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Lead Messages</p>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg border border-blue-200 dark:border-blue-700 text-center">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{supportMessages.length}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Support Requests</p>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg border border-purple-200 dark:border-purple-700 text-center">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{opportunityMessages.length}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Opportunities</p>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-900/20 dark:to-slate-900/20 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{generalMessages.length}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">General Messages</p>
                  </div>
                </div>
              </div>
            ) : null;
          })()}
          
          {/* Performance Comparison - Business Only (Separate Section) */}
          {isBusiness && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <TrendingIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Performance Comparison</h3>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setComparisonView('WoW')}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        comparisonView === 'WoW' 
                          ? 'bg-primary-600 text-white' 
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      Week-over-Week
                    </button>
                    <button 
                      onClick={() => setComparisonView('MoM')}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        comparisonView === 'MoM' 
                          ? 'bg-primary-600 text-white' 
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      Month-over-Month
                    </button>
                  </div>
                </div>
                  
                {/* Week-over-Week Comparison */}
                {comparisonView === 'WoW' && (() => {
                  // Calculate week-over-week metrics
                  const now = new Date();
                  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
                  
                  // Mock calculations - in real app, these would come from analytics data
                  const currentWeekPosts = posts.filter(p => {
                    const postDate = new Date(p.createdAt || 0);
                    return postDate >= oneWeekAgo;
                  }).length;
                  
                  const previousWeekPosts = Math.max(1, Math.round(currentWeekPosts * (0.85 + Math.random() * 0.3))); // Mock: 70-115% of current
                  
                  const currentWeekFollowers = (user?.socialStats?.totalFollowers || 0);
                  const previousWeekFollowers = Math.max(1, Math.round(currentWeekFollowers * (0.95 + Math.random() * 0.1))); // Mock: 95-105% of current
                  
                  const currentWeekEngagement = messages.filter(m => !m.isArchived).length;
                  const previousWeekEngagement = Math.max(1, Math.round(currentWeekEngagement * (0.8 + Math.random() * 0.4))); // Mock: 80-120% of current
                  
                  const currentWeekReach = isBusiness ? (user?.socialStats?.totalReach || 0) : currentWeekFollowers;
                  const previousWeekReach = Math.max(1, Math.round(currentWeekReach * (0.9 + Math.random() * 0.2))); // Mock: 90-110% of current
                  
                  const calculateChange = (current: number, previous: number) => {
                    const change = current - previous;
                    const changePercent = previous > 0 ? Math.round((change / previous) * 100) : 0;
                    return { change, changePercent, isPositive: changePercent >= 0 };
                  };
                  
                  const postsChange = calculateChange(currentWeekPosts, previousWeekPosts);
                  const followersChange = calculateChange(currentWeekFollowers, previousWeekFollowers);
                  const engagementChange = calculateChange(currentWeekEngagement, previousWeekEngagement);
                  const reachChange = calculateChange(currentWeekReach, previousWeekReach);
                  
                  const metrics = [
                    {
                      label: isBusiness ? 'Potential Reach' : 'Followers',
                      current: currentWeekFollowers,
                      previous: previousWeekFollowers,
                      change: followersChange.change,
                      changePercent: followersChange.changePercent,
                      isPositive: followersChange.isPositive,
                      icon: <UserIcon className="w-5 h-5" />,
                      format: (n: number) => n.toLocaleString()
                    },
                    {
                      label: isBusiness ? 'Reach' : 'Engagement',
                      current: isBusiness ? currentWeekReach : currentWeekEngagement,
                      previous: isBusiness ? previousWeekReach : previousWeekEngagement,
                      change: isBusiness ? reachChange.change : engagementChange.change,
                      changePercent: isBusiness ? reachChange.changePercent : engagementChange.changePercent,
                      isPositive: isBusiness ? reachChange.isPositive : engagementChange.isPositive,
                      icon: <HeartIcon className="w-5 h-5" />,
                      format: (n: number) => n.toLocaleString()
                    },
                    {
                      label: 'Posts Published',
                      current: currentWeekPosts,
                      previous: previousWeekPosts,
                      change: postsChange.change,
                      changePercent: postsChange.changePercent,
                      isPositive: postsChange.isPositive,
                      icon: <SparklesIcon className="w-5 h-5" />,
                      format: (n: number) => n.toString()
                    },
                    {
                      label: isBusiness ? 'Leads Generated' : 'Response Rate',
                      current: isBusiness ? Math.round((currentWeekEngagement * 0.3)) : Math.round((messages.filter(m => m.isArchived).length / Math.max(1, messages.length)) * 100),
                      previous: isBusiness ? Math.round((previousWeekEngagement * 0.25)) : Math.round((messages.filter(m => m.isArchived).length / Math.max(1, messages.length)) * 85),
                      change: isBusiness ? Math.round((currentWeekEngagement * 0.3) - (previousWeekEngagement * 0.25)) : 5,
                      changePercent: isBusiness ? 20 : 8,
                      isPositive: true,
                      icon: isBusiness ? <DollarSignIcon className="w-5 h-5" /> : <CheckCircleIcon className="w-5 h-5" />,
                      format: (n: number) => isBusiness ? n.toLocaleString() : `${n}%`
                    }
                  ];
                  
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      {metrics.map((metric, idx) => (
                        <div 
                          key={idx}
                          className="p-6 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-xl border border-gray-200 dark:border-gray-600"
                        >
                          <div className="flex items-center gap-2 mb-4">
                            <div className={`flex-shrink-0 p-2 rounded-lg ${
                              metric.isPositive 
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                            }`}>
                              {metric.icon}
                            </div>
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                              {metric.label}
                            </span>
                          </div>
                          <div className="space-y-2">
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                              {metric.format(metric.current)}
                            </p>
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className={`text-xs font-semibold flex items-center gap-1 ${
                                metric.isPositive 
                                  ? 'text-green-600 dark:text-green-400' 
                                  : 'text-red-600 dark:text-red-400'
                              }`}>
                                {metric.isPositive ? (
                                  <ArrowUpIcon className="w-3 h-3" />
                                ) : (
                                  <ArrowUpIcon className="w-3 h-3 rotate-180" />
                                )}
                                {Math.abs(metric.changePercent)}%
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">vs. last week</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                
                {/* Month-over-Month Comparison */}
                {comparisonView === 'MoM' && (() => {
                  // Calculate month-over-month metrics
                  const now = new Date();
                  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                  const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
                  
                  const currentMonthPosts = posts.filter(p => {
                    const postDate = new Date(p.createdAt || 0);
                    return postDate >= oneMonthAgo;
                  }).length;
                  
                  const previousMonthPosts = Math.max(1, Math.round(currentMonthPosts * (0.75 + Math.random() * 0.5))); // Mock: 75-125% of current
                  
                  const currentMonthFollowers = (user?.socialStats?.totalFollowers || 0);
                  const previousMonthFollowers = Math.max(1, Math.round(currentMonthFollowers * (0.9 + Math.random() * 0.2))); // Mock: 90-110% of current
                  
                  const currentMonthEngagement = messages.filter(m => !m.isArchived).length;
                  const previousMonthEngagement = Math.max(1, Math.round(currentMonthEngagement * (0.7 + Math.random() * 0.6))); // Mock: 70-130% of current
                  
                  const calculateChange = (current: number, previous: number) => {
                    const change = current - previous;
                    const changePercent = previous > 0 ? Math.round((change / previous) * 100) : 0;
                    return { change, changePercent, isPositive: changePercent >= 0 };
                  };
                  
                  const postsChange = calculateChange(currentMonthPosts, previousMonthPosts);
                  const followersChange = calculateChange(currentMonthFollowers, previousMonthFollowers);
                  const engagementChange = calculateChange(currentMonthEngagement, previousMonthEngagement);
                  
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="p-6 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-xl border border-gray-200 dark:border-gray-600">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Total Posts</span>
                          <span className={`text-xs font-semibold ${
                            postsChange.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          }`}>
                            {postsChange.isPositive ? '+' : ''}{postsChange.changePercent}%
                          </span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{currentMonthPosts}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">vs. {previousMonthPosts} last month</p>
                      </div>
                      <div className="p-6 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-xl border border-gray-200 dark:border-gray-600">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">{isBusiness ? 'Reach' : 'Followers'}</span>
                          <span className={`text-xs font-semibold ${
                            followersChange.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          }`}>
                            {followersChange.isPositive ? '+' : ''}{followersChange.changePercent}%
                          </span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{currentMonthFollowers.toLocaleString()}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">vs. {previousMonthFollowers.toLocaleString()} last month</p>
                      </div>
                      <div className="p-6 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-xl border border-gray-200 dark:border-gray-600">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">{isBusiness ? 'Leads' : 'Messages'}</span>
                          <span className={`text-xs font-semibold ${
                            engagementChange.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          }`}>
                            {engagementChange.isPositive ? '+' : ''}{engagementChange.changePercent}%
                          </span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{currentMonthEngagement}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">vs. {previousMonthEngagement} last month</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          
          {/* Lead Generation Dashboard - Business Only (Priority 1) */}
          {isBusiness && (() => {
            // Get all lead messages
            const leadMessages = messages.filter(m => m.category === 'Lead' && !m.isArchived);
            
            // Calculate leads this month
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const leadsThisMonth = leadMessages.filter(m => {
              const msgDate = new Date(m.timestamp);
              return msgDate >= startOfMonth;
            });
            
            // Calculate leads last month for growth comparison
            const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
            const leadsLastMonth = leadMessages.filter(m => {
              const msgDate = new Date(m.timestamp);
              return msgDate >= lastMonth && msgDate <= endOfLastMonth;
            });
            
            // Calculate growth
            const leadGrowth = leadsLastMonth.length > 0 
              ? Math.round(((leadsThisMonth.length - leadsLastMonth.length) / leadsLastMonth.length) * 100)
              : leadsThisMonth.length > 0 ? 100 : 0;
            
            // Leads by platform (source attribution)
            const leadsByPlatform: Record<Platform, number> = {
              Instagram: 0,
              TikTok: 0,
              X: 0,
              Threads: 0,
              YouTube: 0,
              LinkedIn: 0,
              Facebook: 0
            };
            
            leadsThisMonth.forEach(lead => {
              if (lead.platform && leadsByPlatform[lead.platform] !== undefined) {
                leadsByPlatform[lead.platform]++;
              }
            });
            
            // Get top 3 platforms
            const topPlatforms = Object.entries(leadsByPlatform)
              .filter(([_, count]) => count > 0)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3)
              .map(([platform]) => platform as Platform);
            
            // Recent leads (last 5)
            const recentLeads = leadsThisMonth
              .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
              .slice(0, 5);
            
            // Monthly goal
            const goalLeads = user?.goals?.monthlyLeadsGoal || 50;
            const goalProgress = goalLeads > 0 ? Math.min((leadsThisMonth.length / goalLeads) * 100, 100) : 0;
            
            return (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl">
                      <ArrowUpCircleIcon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">Lead Generation</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Track your lead sources and performance</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setFilters(prev => ({ ...prev, category: 'Lead' }));
                      if (!OFFLINE_MODE) setActivePage('inbox');
                    }}
                    className={`text-sm font-medium ${OFFLINE_MODE ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed' : 'text-primary-600 dark:text-primary-400 hover:underline'}`}
                    disabled={OFFLINE_MODE}
                  >
                    {OFFLINE_MODE ? 'Leads inbox (coming soon)' : 'View All Leads →'}
                  </button>
                </div>
                
                {/* Key Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {/* Total Leads This Month */}
                  <div className="p-4 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-lg border border-emerald-200 dark:border-emerald-700">
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300 mb-1">Leads This Month</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-3xl font-bold text-emerald-900 dark:text-emerald-100">{leadsThisMonth.length}</p>
                      {leadGrowth !== 0 && (
                        <span className={`text-sm font-semibold ${leadGrowth >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {leadGrowth >= 0 ? '+' : ''}{leadGrowth}%
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                      {leadGrowth >= 0 ? 'vs last month' : 'vs last month'}
                    </p>
                  </div>
                  
                  {/* Goal Progress */}
                  <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">Monthly Goal</p>
                    <div className="flex items-baseline gap-2 mb-2">
                      <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">{leadsThisMonth.length}</p>
                      <span className="text-sm text-blue-600 dark:text-blue-400">/ {goalLeads}</span>
                    </div>
                    <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${goalProgress}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      {Math.round(goalProgress)}% complete
                    </p>
                  </div>
                  
                  {/* Top Platform */}
                  {topPlatforms.length > 0 ? (
                    <div className="p-4 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                      <p className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-1">Top Source</p>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-gray-600 dark:text-gray-400 scale-125">
                          {platformFilterIcons[topPlatforms[0]]}
                        </span>
                        <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">{topPlatforms[0]}</p>
                      </div>
                      <p className="text-xs text-purple-600 dark:text-purple-400">
                        {leadsByPlatform[topPlatforms[0]]} leads ({Math.round((leadsByPlatform[topPlatforms[0]] / leadsThisMonth.length) * 100)}%)
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Top Source</p>
                      <p className="text-lg font-semibold text-gray-500 dark:text-gray-400">No leads yet</p>
                    </div>
                  )}
                </div>
                
                {/* Leads by Platform */}
                {topPlatforms.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Leads by Platform</h4>
                    <div className="space-y-2">
                      {topPlatforms.map(platform => {
                        const count = leadsByPlatform[platform];
                        const percentage = leadsThisMonth.length > 0 ? (count / leadsThisMonth.length) * 100 : 0;
                        return (
                          <div key={platform} className="flex items-center gap-3">
                            <div className="flex items-center gap-2 w-24">
                              <span className="text-gray-600 dark:text-gray-400">{platformFilterIcons[platform]}</span>
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{platform}</span>
                            </div>
                            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                              <div 
                                className="bg-gradient-to-r from-primary-500 to-primary-600 h-full rounded-full transition-all duration-500"
                                style={{ width: `${percentage}%` }}
                              ></div>
                            </div>
                            <div className="w-20 text-right">
                              <span className="text-sm font-semibold text-gray-900 dark:text-white">{count}</span>
                              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">({Math.round(percentage)}%)</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {/* Recent Leads */}
                {recentLeads.length > 0 ? (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Recent Leads</h4>
                    <div className="space-y-2">
                      {recentLeads.map(lead => (
                        <div
                          key={lead.id}
                          onClick={async () => {
                            await ensureCRMProfile(lead.user);
                            openCRM(lead.user);
                          }}
                          className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                        >
                          <div className="flex-shrink-0">
                            <img 
                              src={lead.user.avatar} 
                              alt={lead.user.name}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {lead.user.name}
                              </p>
                              <span className="text-gray-400">{platformFilterIcons[lead.platform]}</span>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                              {lead.content.substring(0, 60)}...
                            </p>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(lead.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <UserIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No leads yet this month</p>
                    <p className="text-xs mt-1">Start engaging with potential customers to generate leads</p>
                  </div>
                )}
              </div>
            );
          })()}
          
          {/* Conversion & ROI Dashboard - Business Only (Priority 2) */}
          {isBusiness && (() => {
            // Get lead messages and calculate conversions
            const leadMessages = messages.filter(m => m.category === 'Lead' && !m.isArchived);
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const leadsThisMonth = leadMessages.filter(m => {
              const msgDate = new Date(m.timestamp);
              return msgDate >= startOfMonth;
            });
            
            // Estimate converted customers (leads that have been archived or responded to)
            // In a real app, this would come from actual conversion tracking
            const convertedLeads = Math.floor(leadsThisMonth.length * 0.15); // 15% conversion rate estimate
            const conversionRate = leadsThisMonth.length > 0 
              ? ((convertedLeads / leadsThisMonth.length) * 100).toFixed(1)
              : '0';
            
            // Calculate estimated revenue (mock - would come from actual sales data)
            // Average deal value estimated at $98 (placeholder)
            const averageDealValue = 98;
            const estimatedRevenue = convertedLeads * averageDealValue;
            
            // Calculate investment (subscription cost + estimated ad spend)
            const planPrices: Record<string, number> = {
              Starter: 99,
              Growth: 249,
              Agency: 599
            };
            const subscriptionCost = planPrices[user?.plan || 'Starter'] || 0;
            const estimatedAdSpend = Math.floor(subscriptionCost * 0.5); // Estimate 50% of subscription as ad spend
            const totalInvestment = subscriptionCost + estimatedAdSpend;
            
            // Calculate ROI
            const roi = totalInvestment > 0 
              ? (((estimatedRevenue - totalInvestment) / totalInvestment) * 100).toFixed(1)
              : '0';
            
            // Customer Acquisition Cost (CAC)
            const cac = convertedLeads > 0 
              ? (totalInvestment / convertedLeads).toFixed(2)
              : totalInvestment.toFixed(2);
            
            // Revenue per follower
            const currentStats = user?.socialStats || {};
            const totalFollowers = currentStats ? Object.values(currentStats).reduce((sum, stats) => sum + (stats?.followers || 0), 0) : 0;
            const revenuePerFollower = totalFollowers > 0 
              ? (estimatedRevenue / totalFollowers).toFixed(2)
              : '0';
            
            // Calculate week-over-week revenue growth (mock)
            const revenueGrowth = 23; // Mock 23% growth
            
            return (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl">
                      <DollarSignIcon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">Conversion & ROI</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Revenue tracking and return on investment</p>
                    </div>
                  </div>
                </div>
                
                {/* Key Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                  {/* Revenue */}
                  <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border border-green-200 dark:border-green-700 min-h-[140px]">
                    <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-3 uppercase tracking-wide">Revenue This Month</p>
                    <div className="mb-3">
                      <p className="text-xl font-bold text-green-900 dark:text-green-100">
                        ${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(estimatedRevenue)}
                      </p>
                      <p className="text-xs font-semibold text-green-600 dark:text-green-400 mt-1">
                        +{revenueGrowth}% growth
                      </p>
                    </div>
                    <p className="text-xs text-green-600/80 dark:text-green-400/80">
                      From {convertedLeads} customers
                    </p>
                  </div>
                  
                  {/* ROI */}
                  <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200 dark:border-blue-700 min-h-[140px]">
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-3 uppercase tracking-wide">ROI</p>
                    <p className="text-xl font-bold text-blue-900 dark:text-blue-100 mb-3">
                      {roi}%
                    </p>
                    <p className="text-xs text-blue-600/80 dark:text-blue-400/80">
                      Return on investment
                    </p>
                  </div>
                  
                  {/* CAC */}
                  <div className="p-6 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 rounded-xl border border-purple-200 dark:border-purple-700 min-h-[140px]">
                    <p className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-3 uppercase tracking-wide">CAC</p>
                    <p className="text-xl font-bold text-purple-900 dark:text-purple-100 mb-3">
                      ${cac}
                    </p>
                    <p className="text-xs text-purple-600/80 dark:text-purple-400/80">
                      Cost per customer
                    </p>
                  </div>
                  
                  {/* Conversion Rate */}
                  <div className="p-6 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-xl border border-orange-200 dark:border-orange-700 min-h-[140px]">
                    <p className="text-xs font-medium text-orange-700 dark:text-orange-300 mb-3 uppercase tracking-wide">Conversion Rate</p>
                    <p className="text-xl font-bold text-orange-900 dark:text-orange-100 mb-3">
                      {conversionRate}%
                    </p>
                    <p className="text-xs text-orange-600/80 dark:text-orange-400/80">
                      Leads to customers
                    </p>
                  </div>
                </div>
                
                {/* Detailed Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Investment Breakdown */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Investment Breakdown</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Subscription Cost</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">${subscriptionCost}/mo</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Estimated Ad Spend</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">${estimatedAdSpend}/mo</span>
                      </div>
                      <div className="pt-2 border-t border-gray-200 dark:border-gray-600 flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Total Investment</span>
                        <span className="text-base font-bold text-gray-900 dark:text-white">${totalInvestment}/mo</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Revenue Metrics */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Revenue Metrics</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Average Deal Value</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">${averageDealValue}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Revenue per Follower</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">${revenuePerFollower}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Customers Converted</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{convertedLeads}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* ROI Visual Indicator */}
                <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-green-700 dark:text-green-300">Return on Investment</p>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        For every $1 invested, you're generating ${((parseFloat(roi) / 100) + 1).toFixed(2)} in revenue
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-green-900 dark:text-green-100 break-words">{roi}%</p>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        {parseFloat(roi) > 100 ? 'Excellent' : parseFloat(roi) > 50 ? 'Good' : parseFloat(roi) > 0 ? 'Positive' : 'Negative'} ROI
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
          
          {/* Customer Acquisition Funnel - Business Only (Phase 3 Feature 3) */}
          {isBusiness && user?.plan !== 'Agency' && (() => {
            // Calculate funnel metrics from available data
            const currentStats = user?.socialStats || {};
            const totalReach = currentStats ? Object.values(currentStats).reduce((sum, stats) => sum + (stats?.followers || 0), 0) : 0;
            
            // Estimate traffic based on reach (mock calculation)
            const traffic = Math.floor(totalReach * 1.2); // Assume 20% more traffic than reach
            
            // Calculate engagement from posts
            const publishedPosts = posts.filter(p => p.status === 'Published').length;
            const estimatedEngagement = Math.floor(traffic * 0.05); // 5% engagement rate
            
            // Leads from messages
            const leadMessages = messages.filter(m => m.category === 'Lead' && !m.isArchived);
            const leads = leadMessages.length;
            
            // Converted customers (leads that have been marked as converted or archived)
            const convertedLeads = Math.floor(leads * 0.15); // 15% conversion rate
            
            // Calculate conversion rates
            const trafficToEngagement = traffic > 0 ? ((estimatedEngagement / traffic) * 100).toFixed(1) : '0';
            const engagementToLeads = estimatedEngagement > 0 ? ((leads / estimatedEngagement) * 100).toFixed(1) : '0';
            const leadsToCustomers = leads > 0 ? ((convertedLeads / leads) * 100).toFixed(1) : '0';
            const overallConversion = traffic > 0 ? ((convertedLeads / traffic) * 100).toFixed(2) : '0';
            
            // Calculate funnel widths (percentage of traffic)
            const trafficWidth = 100;
            const engagementWidth = traffic > 0 ? (estimatedEngagement / traffic) * 100 : 0;
            const leadsWidth = traffic > 0 ? (leads / traffic) * 100 : 0;
            const customersWidth = traffic > 0 ? (convertedLeads / traffic) * 100 : 0;
            
            return (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <BriefcaseIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Customer Acquisition Funnel</h3>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Overall: {overallConversion}%</span>
                </div>
                
                <div className="space-y-4">
                  {/* Traffic Stage */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Traffic</span>
                      <span className="text-lg font-bold text-gray-900 dark:text-white">{new Intl.NumberFormat('en-US', { notation: "compact" }).format(traffic)}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-lg h-12 overflow-hidden">
                      <div className="bg-gradient-to-r from-blue-500 to-blue-600 h-full flex items-center justify-center text-white font-semibold text-sm" style={{ width: '100%' }}>
                        {new Intl.NumberFormat('en-US', { notation: "compact" }).format(traffic)}
                      </div>
                    </div>
                  </div>
                  
                  {/* Engagement Stage */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Engagement
                        <span className="ml-2 text-xs text-gray-500">({trafficToEngagement}% conversion)</span>
                      </span>
                      <span className="text-lg font-bold text-gray-900 dark:text-white">{new Intl.NumberFormat('en-US', { notation: "compact" }).format(estimatedEngagement)}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-lg h-12 overflow-hidden">
                      <div className="bg-gradient-to-r from-purple-500 to-purple-600 h-full flex items-center justify-center text-white font-semibold text-sm" style={{ width: `${engagementWidth}%` }}>
                        {new Intl.NumberFormat('en-US', { notation: "compact" }).format(estimatedEngagement)}
                      </div>
                    </div>
                  </div>
                  
                  {/* Leads Stage */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Leads
                        <span className="ml-2 text-xs text-gray-500">({engagementToLeads}% conversion)</span>
                      </span>
                      <span className="text-lg font-bold text-gray-900 dark:text-white">{new Intl.NumberFormat('en-US', { notation: "compact" }).format(leads)}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-lg h-12 overflow-hidden">
                      <div className="bg-gradient-to-r from-orange-500 to-orange-600 h-full flex items-center justify-center text-white font-semibold text-sm" style={{ width: `${leadsWidth}%` }}>
                        {new Intl.NumberFormat('en-US', { notation: "compact" }).format(leads)}
                      </div>
                    </div>
                  </div>
                  
                  {/* Customers Stage */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Customers
                        <span className="ml-2 text-xs text-gray-500">({leadsToCustomers}% conversion)</span>
                      </span>
                      <span className="text-lg font-bold text-green-600 dark:text-green-400">{new Intl.NumberFormat('en-US', { notation: "compact" }).format(convertedLeads)}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-lg h-12 overflow-hidden">
                      <div className="bg-gradient-to-r from-green-500 to-green-600 h-full flex items-center justify-center text-white font-semibold text-sm" style={{ width: `${customersWidth}%` }}>
                        {new Intl.NumberFormat('en-US', { notation: "compact" }).format(convertedLeads)}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>Total Conversion Rate</span>
                    <span className="font-semibold text-gray-700 dark:text-gray-300">{overallConversion}%</span>
                  </div>
                </div>
              </div>
            );
          })()}
          
          {/* In-app feedback survey (Day 7 / Day 14) */}
          <FeedbackSurveyModal
            isOpen={showFeedbackSurvey}
            milestone={feedbackMilestone}
            onClose={() => setShowFeedbackSurvey(false)}
            onSnooze24h={snoozeFeedback24h}
            onSubmit={submitInAppFeedback}
          />

          {/* Custom feedback forms */}
          <CustomFeedbackFormModal
            isOpen={showCustomFeedbackForm}
            form={selectedCustomForm}
            onClose={() => {
              setShowCustomFeedbackForm(false);
              setSelectedCustomForm(null);
            }}
            onSubmit={handleCustomFeedbackSubmit}
          />

          {/* First-login Early Testing onboarding */}
          {showEarlyTestingOnboarding && (
            <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" aria-modal="true">
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-2xl w-full p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Welcome to EchoFlux.ai — Early Testing Access</h3>
                    <p className="mt-2 text-gray-600 dark:text-gray-300">
                      This version is focused on planning workflows only. Auto-posting and live analytics are intentionally disabled so creators stay fully in control of publishing.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowEarlyTestingOnboarding(false)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    aria-label="Close"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="mt-4 text-gray-700 dark:text-gray-200">
                  <div className="font-semibold mb-2">Recommended first steps:</div>
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>Generate a content strategy</li>
                    <li>Move items onto your calendar</li>
                    <li>Use Compose to generate captions</li>
                    <li>Attach media from your library</li>
                    <li>Copy + post manually to your platforms</li>
                  </ol>
                  <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
                    Your feedback directly shapes upcoming releases — thanks for being part of this stage.
                  </p>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setShowEarlyTestingOnboarding(false)}
                    className="px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700"
                  >
                    Got it
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Content Ideas Modal */}
          {showIdeasModal && (
            <div 
              className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" 
              onClick={() => {
                if (!isGeneratingIdeas && generatedIdeas.length === 0) {
                  setShowIdeasModal(false);
                }
              }}
              style={{ zIndex: 9999 }}
            >
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {selectedCategory === 'trending' ? 'Trending' : selectedCategory === 'engagement' ? 'High Engagement' : 'Niche'} Content Ideas
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        AI-generated ideas for {isBusiness ? user?.businessType : user?.niche || 'your niche'}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (!isGeneratingIdeas) {
                          setShowIdeasModal(false);
                          setGeneratedIdeas([]);
                          setSelectedCategory(null);
                        }
                      }}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      disabled={isGeneratingIdeas}
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  {isGeneratingIdeas ? (
                    <div className="text-center py-12">
                      <svg className="animate-spin h-8 w-8 text-primary-600 dark:text-primary-400 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <p className="text-gray-600 dark:text-gray-400">Generating content ideas...</p>
                    </div>
                  ) : generatedIdeas.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {generatedIdeas.map((idea, idx) => (
                        <div key={idea.id || idx} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full">
                                {idea.format || 'Post'}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">{idea.platform || 'Instagram'}</span>
                            </div>
                            {idea.engagementPotential && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-500 dark:text-gray-400">Potential:</span>
                                <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">{idea.engagementPotential}/10</span>
                              </div>
                            )}
                          </div>
                          <h4 className="font-semibold text-gray-900 dark:text-white mb-1">{idea.title}</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{idea.description}</p>
                          {idea.hashtags && idea.hashtags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-3">
                              {idea.hashtags.map((tag: string, tagIdx: number) => (
                                <span key={tagIdx} className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-full">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          <button
                            onClick={() => {
                              setComposeContext({
                                topic: `${idea.title}: ${idea.description}${idea.hashtags && idea.hashtags.length > 0 ? ' ' + idea.hashtags.join(' ') : ''}`,
                                platform: idea.platform || 'Instagram',
                                type: idea.format === 'Reel' ? 'video' : idea.format === 'Story' ? 'image' : 'Post'
                              });
                              setShowIdeasModal(false);
                              setActivePage('compose');
                            }}
                            className="w-full px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-lg hover:from-primary-700 hover:to-primary-600 text-sm font-semibold transition-all"
                          >
                            Use This Idea
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-gray-500 dark:text-gray-400">No ideas generated yet. Click a badge above to generate ideas.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
            
      </div>
  );

  const renderAdminDashboardView = () => (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Daily Dashboard</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Growth-focused view without user posts or scheduled content.</p>
        </div>
        <span className="text-xs px-3 py-1 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-200">
          Admin view
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-600 dark:text-gray-400">Signups (24h)</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {isLoadingAdminSignupCounts ? '—' : adminSignupCounts.last24h.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-600 dark:text-gray-400">Signups (7d)</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {isLoadingAdminSignupCounts ? '—' : adminSignupCounts.last7d.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-600 dark:text-gray-400">Failed payments (24h)</span>
          <button
            onClick={() => setBillingModal({ type: 'failed', items: adminBilling.failed })}
            className="text-sm font-semibold text-primary-600 dark:text-primary-300 hover:underline"
          >
            {isLoadingAdminBilling ? '…' : adminBilling.failed.length}
          </button>
        </div>
      </div>

      {/* OnlyFans admin metrics intentionally hidden to keep the admin daily dashboard focused. */}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Signups (24h)</p>
            <UserIcon className="w-5 h-5 text-primary-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {isLoadingAdminSignupCounts ? '—' : adminSignupCounts.last24h.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {adminSignupError ? adminSignupError : `Last 7d: ${adminSignupCounts.last7d.toLocaleString()}`}
          </p>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Feature Adoption</p>
            <TrendingIcon className="w-5 h-5 text-primary-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {isLoadingUserEngagement ? '—' : userEngagementData ? `${userEngagementData.featureAdoption.anyFeature}` : '—'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {isLoadingUserEngagement ? 'Loading...' : userEngagementData 
              ? `${userEngagementData.conversionFunnel.total > 0 ? (userEngagementData.featureAdoption.anyFeature / userEngagementData.conversionFunnel.total * 100).toFixed(1) : 0}% of users activated`
              : 'No data'}
          </p>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Feedback & inbox</p>
            <ChatIcon className="w-5 h-5 text-primary-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{pendingFeedbackForms.length}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Open messages: {messages.filter(m => !m.isArchived).length}
          </p>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">System signals</p>
            <DashboardIcon className="w-5 h-5 text-primary-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {messages.filter(m => m.isFlagged && !m.isArchived).length}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Flagged/priority messages</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">User Engagement & Health</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Track user behavior, conversion, and feature adoption.</p>
            </div>
            <button
              onClick={() => setActivePage('admin')}
              className="text-sm text-primary-600 dark:text-primary-300 font-semibold hover:underline"
            >
              View Details →
            </button>
          </div>
          <div className="space-y-4">
            {isLoadingUserEngagement ? (
              <div className="text-center py-8">
                <svg className="animate-spin h-6 w-6 text-primary-600 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading engagement metrics…</p>
              </div>
            ) : userEngagementData ? (
              <>
                {/* Conversion Funnel */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Conversion Funnel</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Free</span>
                      <div className="flex items-center gap-3">
                        <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-gray-400 dark:bg-gray-600 h-2 rounded-full" 
                            style={{ width: `${userEngagementData.conversionFunnel.total > 0 ? (userEngagementData.conversionFunnel.free / userEngagementData.conversionFunnel.total * 100) : 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white w-12 text-right">
                          {userEngagementData.conversionFunnel.free}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Pro</span>
                      <div className="flex items-center gap-3">
                        <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-primary-500 h-2 rounded-full" 
                            style={{ width: `${userEngagementData.conversionFunnel.total > 0 ? (userEngagementData.conversionFunnel.pro / userEngagementData.conversionFunnel.total * 100) : 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white w-12 text-right">
                          {userEngagementData.conversionFunnel.pro}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Elite</span>
                      <div className="flex items-center gap-3">
                        <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-purple-500 h-2 rounded-full" 
                            style={{ width: `${userEngagementData.conversionFunnel.total > 0 ? (userEngagementData.conversionFunnel.elite / userEngagementData.conversionFunnel.total * 100) : 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white w-12 text-right">
                          {userEngagementData.conversionFunnel.elite}
                        </span>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Users</span>
                        <span className="text-sm font-bold text-gray-900 dark:text-white">
                          {userEngagementData.conversionFunnel.total}
                        </span>
                      </div>
                      {userEngagementData.conversionFunnel.total > 0 && (
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Conversion Rate</span>
                          <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">
                            {((userEngagementData.conversionFunnel.pro + userEngagementData.conversionFunnel.elite) / userEngagementData.conversionFunnel.total * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Feature Adoption */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Feature Adoption</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">AI Captions</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {userEngagementData.featureAdoption.captions}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {userEngagementData.conversionFunnel.total > 0 
                          ? `${(userEngagementData.featureAdoption.captions / userEngagementData.conversionFunnel.total * 100).toFixed(1)}% of users`
                          : '—'}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Image Gen</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {userEngagementData.featureAdoption.images}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {userEngagementData.conversionFunnel.total > 0 
                          ? `${(userEngagementData.featureAdoption.images / userEngagementData.conversionFunnel.total * 100).toFixed(1)}% of users`
                          : '—'}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Video Gen</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {userEngagementData.featureAdoption.videos}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {userEngagementData.conversionFunnel.total > 0 
                          ? `${(userEngagementData.featureAdoption.videos / userEngagementData.conversionFunnel.total * 100).toFixed(1)}% of users`
                          : '—'}
                      </p>
                    </div>
                    <div className="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-700">
                      <p className="text-xs text-primary-700 dark:text-primary-300 mb-1">Any Feature</p>
                      <p className="text-lg font-bold text-primary-900 dark:text-primary-100">
                        {userEngagementData.featureAdoption.anyFeature}
                      </p>
                      <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
                        {userEngagementData.conversionFunnel.total > 0 
                          ? `${(userEngagementData.featureAdoption.anyFeature / userEngagementData.conversionFunnel.total * 100).toFixed(1)}% activated`
                          : '—'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Churn Risk & Most Active */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-700">
                    <p className="text-xs text-red-700 dark:text-red-300 mb-1">Churn Risk</p>
                    <p className="text-2xl font-bold text-red-900 dark:text-red-100">
                      {userEngagementData.churnRisk}
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      Inactive users (30d+)
                    </p>
                  </div>
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700">
                    <p className="text-xs text-green-700 dark:text-green-300 mb-1">Most Active</p>
                    <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                      {userEngagementData.mostActiveUsers.length}
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      Top users by usage
                    </p>
                  </div>
                </div>

                {/* Most Active Users List */}
                {userEngagementData.mostActiveUsers.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Top Active Users</h4>
                    <div className="space-y-2">
                      {userEngagementData.mostActiveUsers.map((activeUser, idx) => (
                        <div key={activeUser.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-4">#{idx + 1}</span>
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{activeUser.name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{activeUser.plan} Plan</p>
                            </div>
                          </div>
                          <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">
                            {activeUser.totalUsage.toLocaleString()} uses
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <p className="text-sm">No engagement data available</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Ops signals (today)</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Daily snapshot</p>
              </div>
              <CheckCircleIcon className="w-5 h-5 text-primary-500" />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm text-gray-800 dark:text-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">New signups</span>
                <span className="font-semibold">{isLoadingAdminSignupCounts ? '—' : adminSignupCounts.last24h}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">Open messages</span>
                <span className="font-semibold">{messages.filter(m => !m.isArchived).length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">Pending feedback</span>
                <span className="font-semibold">{pendingFeedbackForms.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">Flagged messages</span>
                <span className="font-semibold">{messages.filter(m => m.isFlagged && !m.isArchived).length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">Invites (available)</span>
                <span className="font-semibold">
                  {adminInviteStats?.available ?? (adminInviteStats ? 0 : '—')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">Feedback total</span>
                <span className="font-semibold">
                  {adminFeedbackStats?.total ?? (adminFeedbackStats ? 0 : '—')}
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Billing guardrails</h3>
              {adminBillingError && <span className="text-xs text-red-500 dark:text-red-400">{adminBillingError}</span>}
            </div>
            <div className="space-y-2 text-sm text-gray-800 dark:text-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">Failed payments (24h)</span>
                <button
                  onClick={() => setBillingModal({ type: 'failed', items: adminBilling.failed })}
                  className="font-semibold text-primary-600 dark:text-primary-300 hover:underline"
                >
                  {isLoadingAdminBilling ? '…' : adminBilling.failed.length}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">Renewals (next 7d)</span>
                <button
                  onClick={() => setBillingModal({ type: 'renewals', items: adminBilling.renewals })}
                  className="font-semibold text-primary-600 dark:text-primary-300 hover:underline"
                >
                  {isLoadingAdminBilling ? '…' : adminBilling.renewals.length}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showStrategyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowStrategyModal(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-2xl w-full p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Strategy</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{strategyModalTitle}</p>
              </div>
              <button
                onClick={() => setShowStrategyModal(false)}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white"
              >
                Close
              </button>
            </div>
            {isLoadingStrategyDetail ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading strategy…</p>
            ) : strategyModalContent ? (
              <div className="space-y-3 text-sm text-gray-800 dark:text-gray-200">
                {strategyModalContent.title && (
                  <p className="font-semibold text-gray-900 dark:text-white">{strategyModalContent.title}</p>
                )}
                {strategyModalContent.objective && (
                  <p className="text-gray-700 dark:text-gray-300">Objective: {strategyModalContent.objective}</p>
                )}
                {Array.isArray(strategyModalContent.steps) && strategyModalContent.steps.length > 0 && (
                  <div>
                    <p className="text-xs uppercase text-gray-500 dark:text-gray-400 mb-1">Steps</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {strategyModalContent.steps.map((s: string, idx: number) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(strategyModalContent.metrics) && strategyModalContent.metrics.length > 0 && (
                  <div>
                    <p className="text-xs uppercase text-gray-500 dark:text-gray-400 mb-1">Metrics</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {strategyModalContent.metrics.map((m: string, idx: number) => (
                        <li key={`m-${idx}`}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No strategy available.</p>
            )}
          </div>
        </div>
      )}

      {billingModal.type && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setBillingModal({ type: null, items: [] })} />
          <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-3xl w-full p-6 border border-gray-200 dark:border-gray-700 max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  {billingModal.type === 'failed' ? 'Failed payments (24h)' : 'Renewals (next 7d)'}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{billingModal.items.length} items</p>
              </div>
              <button
                onClick={() => setBillingModal({ type: null, items: [] })}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white"
              >
                Close
              </button>
            </div>
            {billingModal.items.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No entries.</p>
            ) : (
              <div className="space-y-2 text-sm text-gray-800 dark:text-gray-200">
                {billingModal.items.map((item: any, idx: number) => (
                  <div
                    key={item.id || idx}
                    className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {item.type || billingModal.type}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {item.createdAt || item.dueAt || ''}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-gray-700 dark:text-gray-300">
                      <span>User: {item.userId || '—'}</span>
                      <span>Customer: {item.customerId || '—'}</span>
                      <span>Subscription: {item.subscriptionId || '—'}</span>
                      <span>Status: {item.status || '—'}</span>
                      <span>Amount: {item.amount ? `$${(item.amount / 100).toFixed(2)}` : '—'}</span>
                      <span>Currency: {(item.currency || '').toUpperCase() || '—'}</span>
                      {item.dueAt && <span>Due: {item.dueAt}</span>}
                      {item.note && <span className="col-span-2 text-gray-600 dark:text-gray-400">Note: {item.note}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );


  if (enableAdminDashboardV2) {
    return renderAdminDashboardView();
  }

  return (
    <div id="tour-step-1-dashboard" className="space-y-6 max-w-7xl mx-auto w-full">
      {renderCommandCenter()}
    </div>
  );
};

