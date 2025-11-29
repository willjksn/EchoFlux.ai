import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MessageCard } from './MessageCard';
import { Platform, Message, DashboardFilters, MessageType, CalendarEvent, MessageCategory } from '../types';
import { InstagramIcon, TikTokIcon, XIcon, ThreadsIcon, YouTubeIcon, LinkedInIcon, FacebookIcon } from './icons/PlatformIcons';
import { DashboardIcon, FlagIcon, SearchIcon, StarIcon, CalendarIcon, SparklesIcon, TrendingIcon, CheckCircleIcon, UserIcon, ArrowUpCircleIcon, KanbanIcon, BriefcaseIcon, LinkIcon, RocketIcon, ArrowUpIcon, ChatIcon, DollarSignIcon, HeartIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { updateUserSocialStats } from '../src/services/socialStatsService';

const platformFilterIcons: { [key in Platform]: React.ReactNode } = {
  Instagram: <InstagramIcon />,
  TikTok: <TikTokIcon />,
  X: <XIcon />,
  Threads: <ThreadsIcon />,
  YouTube: <YouTubeIcon />,
  LinkedIn: <LinkedInIcon />,
  Facebook: <FacebookIcon />,
};

// ... (Keep helper components FilterButton, QuickAction, UpcomingEventCard unchanged) ...
const FilterButton: React.FC<{ isActive: boolean; onClick: () => void; children?: React.ReactNode; label: string; }> = ({ isActive, onClick, children, label }) => (
    <button onClick={onClick} aria-label={`Filter by ${label}`} className={`flex items-center space-x-2 px-3 py-1.5 rounded-full transition-colors text-sm font-semibold ${isActive ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>{children}<span>{label}</span></button>
);
const QuickAction: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; color: string }> = ({ icon, label, onClick, color }) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center p-4 rounded-xl bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all group`}><div className={`p-3 rounded-full mb-3 text-white transition-transform group-hover:scale-110 ${color}`}>{icon}</div><span className="text-sm font-medium text-gray-700 dark:text-gray-300 text-center">{label}</span></button>
);
const UpcomingEventCard: React.FC<{ event: CalendarEvent; onClick: () => void }> = ({ event, onClick }) => (
    <div onClick={onClick} className="flex items-center p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"><div className="flex-shrink-0 w-12 h-12 bg-primary-50 dark:bg-primary-900/30 rounded-md flex flex-col items-center justify-center text-primary-600 dark:text-primary-400 mr-3"><span className="text-xs font-bold uppercase">{new Date(event.date).toLocaleDateString('en-US', { month: 'short' })}</span><span className="text-lg font-bold">{new Date(event.date).getDate()}</span></div><div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-900 dark:text-white truncate">{event.title}</p><div className="flex items-center mt-1"><span className="text-xs text-gray-500 dark:text-gray-400 mr-2 font-medium">{new Date(event.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><span className="text-gray-400 mr-2 scale-75">{platformFilterIcons[event.platform]}</span><span className={`text-xs px-2 py-0.5 rounded-full ${event.status === 'Scheduled' ? 'bg-blue-100 text-blue-700' : event.status === 'Published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{event.status}</span></div></div></div>
);

export const Dashboard: React.FC = () => {
  const { messages, selectedClient, user, dashboardNavState, clearDashboardNavState, settings, setSettings, setActivePage, calendarEvents, posts, setComposeContext, updateMessage, deleteMessage, categorizeAllMessages, autopilotCampaigns, openCRM, ensureCRMProfile, setUser, socialAccounts } = useAppContext();
  const [comparisonView, setComparisonView] = useState<'WoW' | 'MoM'>('WoW');
  const [isUpdatingStats, setIsUpdatingStats] = useState(false);
  
  if (!user) return null;

  // For Creator users: Show "Content Strategy", "Check Analytics", "Audience Stats", "Followers"
  // For Business users: Show "Marketing Plan", "Business Insights", "Business Metrics", "Potential Reach"
  const isBusiness = user?.userType === 'Business';
  
  // Calculate today's highlights
  const todaysHighlights = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaysPosts = posts.filter(p => {
      const postDate = new Date(p.createdAt || 0);
      postDate.setHours(0, 0, 0, 0);
      return postDate.getTime() === today.getTime();
    });
    
    const unreadMessages = messages.filter(m => !m.isArchived).length;
    const todaysEvents = calendarEvents.filter(e => {
      const eventDate = new Date(e.date);
      eventDate.setHours(0, 0, 0, 0);
      return eventDate.getTime() === today.getTime();
    }).length;
    
    // Calculate response rate (mock - in real app, calculate from message timestamps)
    const respondedMessages = messages.filter(m => m.isArchived).length;
    const totalMessages = messages.length;
    const responseRate = totalMessages > 0 ? Math.round((respondedMessages / totalMessages) * 100) : 0;
    
    return {
      postsPublished: todaysPosts.length,
      unreadMessages,
      scheduledPosts: todaysEvents,
      responseRate
    };
  }, [posts, messages, calendarEvents]);
  
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
  
  // Filter active campaigns
  const activeCampaigns = useMemo(() => {
    return autopilotCampaigns.filter(c => 
      c.status === 'Generating Content' || 
      c.status === 'Strategizing' ||
      c.status === 'Plan Generated'
    ).slice(0, 3);
  }, [autopilotCampaigns]);
  
  const [viewMode, setViewMode] = useState<'Overview' | 'Inbox'>('Overview');
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  
  const [filters, setFilters] = useState<DashboardFilters>({ platform: 'All', messageType: 'All', sentiment: 'All', status: 'All', category: 'All' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  
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
        setFilters(prev => ({ ...prev, ...dashboardNavState.filters }));
        if (dashboardNavState.highlightId) {
            setHighlightedMessageId(dashboardNavState.highlightId);
            setViewMode('Inbox');
        }
        clearDashboardNavState();
    }
  }, [dashboardNavState, clearDashboardNavState]);

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
      return calendarEvents
        .filter(e => new Date(e.date) >= now)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 3);
  }, [calendarEvents]);

  const accountName = selectedClient ? selectedClient.name : 'Main Account';
  const currentStats = selectedClient ? selectedClient.socialStats : user?.socialStats;

  const handleSelectMessage = (id: string, isSelected: boolean) => { setSelectedMessageIds(prev => { const newSet = new Set(prev); if (isSelected) newSet.add(id); else newSet.delete(id); return newSet; }); };
  const handleBulkArchive = () => { selectedMessageIds.forEach(id => updateMessage(id, { isArchived: true })); setSelectedMessageIds(new Set()); };
  const handleBulkDelete = () => { if (window.confirm(`Are you sure you want to delete ${selectedMessageIds.size} selected messages?`)) { selectedMessageIds.forEach(id => deleteMessage(id)); setSelectedMessageIds(new Set()); } };
  const handleFilterChange = <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => { setFilters(prev => ({ ...prev, [key]: value })); };
  const handleAutoRespondToggle = () => { setSettings(prev => ({ ...prev, autoRespond: !prev.autoRespond })); };
  const handleToggleFlag = (id: string) => { const msg = messages.find(m => m.id === id); if (msg) updateMessage(id, { isFlagged: !msg.isFlagged }); };
  const handleToggleFavorite = (id: string) => { const msg = messages.find(m => m.id === id); if (msg) updateMessage(id, { isFavorite: !msg.isFavorite }); };
  const handleDeleteMessage = (id: string) => { if (window.confirm('Delete message?')) deleteMessage(id); };
  const handleEventClick = (event: CalendarEvent) => { setComposeContext({ topic: event.title, platform: event.platform, type: event.type, date: event.date }); };

  useEffect(() => {
    if (!highlightedMessageId || viewMode !== 'Inbox') return;
    const timerId = setTimeout(() => {
        const element = document.getElementById(`message-card-${highlightedMessageId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('highlight-animation');
            setTimeout(() => { element.classList.remove('highlight-animation'); setHighlightedMessageId(null); }, 2000);
        } else { setHighlightedMessageId(null); }
    }, 100);
    return () => clearTimeout(timerId);
  }, [highlightedMessageId, filteredMessages, viewMode]);

  const renderCommandCenter = () => (
      <div className="space-y-6 animate-fade-in">
          {/* Today's Highlights Banner */}
          <div className="bg-gradient-to-r from-primary-500 to-primary-600 dark:from-primary-600 dark:to-primary-700 p-6 rounded-xl shadow-lg text-white">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Today's Highlights</h2>
              <span className="text-sm opacity-90">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <p className="text-sm opacity-90 mb-1">{isBusiness ? 'Posts Published' : 'Posts Published'}</p>
                <p className="text-3xl font-bold">{todaysHighlights.postsPublished}</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <p className="text-sm opacity-90 mb-1">{isBusiness ? 'Unread Messages' : 'Fan Messages'}</p>
                <p className="text-3xl font-bold">{todaysHighlights.unreadMessages}</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <p className="text-sm opacity-90 mb-1">Scheduled Posts</p>
                <p className="text-3xl font-bold">{todaysHighlights.scheduledPosts}</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <p className="text-sm opacity-90 mb-1">Response Rate</p>
                <p className="text-3xl font-bold">{todaysHighlights.responseRate}%</p>
              </div>
            </div>
          </div>

          {/* Quick Actions - Enhanced */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
             <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
             <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                  <QuickAction label="Create Post" icon={<SparklesIcon className="w-6 h-6" />} color="bg-gradient-to-br from-purple-500 to-indigo-600" onClick={() => setActivePage('compose')} />
                  <QuickAction label={isBusiness ? 'Marketing Plan' : 'Content Strategy'} icon={<TrendingIcon className="w-6 h-6" />} color="bg-gradient-to-br from-blue-500 to-cyan-500" onClick={() => setActivePage('strategy')} />
                  <QuickAction label="View Calendar" icon={<CalendarIcon className="w-6 h-6" />} color="bg-gradient-to-br from-orange-400 to-red-500" onClick={() => setActivePage('calendar')} />
                  <QuickAction label={isBusiness ? 'Business Insights' : 'Check Analytics'} icon={<CheckCircleIcon className="w-6 h-6" />} color="bg-gradient-to-br from-emerald-400 to-green-600" onClick={() => setActivePage('analytics')} />
                  {(!isBusiness || user?.plan === 'Agency') && (
                    <QuickAction label="Opportunities" icon={<TrendingIcon className="w-6 h-6" />} color="bg-gradient-to-br from-pink-500 to-rose-500" onClick={() => setActivePage('opportunities')} />
                  )}
                  <QuickAction label={isBusiness ? 'AI Marketing Manager' : 'AI Autopilot'} icon={<RocketIcon />} color="bg-gradient-to-br from-amber-500 to-orange-500" onClick={() => setActivePage('autopilot')} />
              </div>
          </div>

          {/* Enhanced Metrics Section */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{isBusiness ? 'Business Metrics' : 'Audience Stats'}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {currentStats && Object.entries(currentStats).map(([platform, stats]) => {
                    const trend = calculateTrend(stats.followers, platform);
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
                           <p className="text-2xl font-bold text-gray-900 dark:text-white">{new Intl.NumberFormat('en-US', { notation: "compact" }).format(stats.followers)}</p>
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
          
          {/* Active Campaigns Widget */}
          {activeCampaigns.length > 0 && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Active Campaigns</h3>
                <button onClick={() => setActivePage('autopilot')} className="text-sm text-primary-600 hover:underline">View All</button>
              </div>
              <div className="space-y-3">
                {activeCampaigns.map(campaign => (
                  <div key={campaign.id} className="p-4 bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-900/30 dark:to-primary-800/30 rounded-lg border border-primary-200 dark:border-primary-700">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-1">{campaign.goal}</h4>
                        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                          <span>Status: <span className="font-medium capitalize">{campaign.status.replace(/([A-Z])/g, ' $1').trim()}</span></span>
                          <span>•</span>
                          <span>Progress: {campaign.progress || 0}%</span>
                          {campaign.totalPosts && (
                            <>
                              <span>•</span>
                              <span>{campaign.generatedPosts || 0}/{campaign.totalPosts} posts</span>
                     </>
                  )}
              </div>
                      </div>
                      <button 
                        onClick={() => setActivePage('autopilot')}
                        className="px-3 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
                      >
                        View
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Phase 2 Widgets Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Content Performance Widget - Creator & Agency Only */}
            {(() => {
              // Show for Creators OR Business Agency (since Agency manages creators)
              const shouldShowContentPerformance = !isBusiness || user?.plan === 'Agency';
              if (!shouldShowContentPerformance) return null;
              
              return (() => {
              const recentPosts = posts
                .filter(p => p.status === 'Published')
                .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                .slice(0, 3);
              
              const calculateMockEngagement = (postId: string) => {
                const seed = postId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                return {
                  likes: Math.floor((seed % 500) + 100),
                  comments: Math.floor((seed % 50) + 10),
                  shares: Math.floor((seed % 30) + 5),
                  views: Math.floor((seed % 5000) + 1000)
                };
              };
              
              return recentPosts.length > 0 ? (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Top Content This Week</h3>
                    <button onClick={() => setActivePage('analytics')} className="text-sm text-primary-600 hover:underline">View Analytics</button>
                  </div>
                  <div className="space-y-3">
                    {recentPosts.map(post => {
                      const engagement = calculateMockEngagement(post.id);
                      const totalEngagement = engagement.likes + engagement.comments + engagement.shares;
                      return (
                        <div key={post.id} className="p-3 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                          <p className="text-sm font-medium text-gray-900 dark:text-white mb-2 truncate">{post.content.substring(0, 60)}...</p>
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
                </div>
              ) : null;
              })();
            })()}
            
            {/* Campaign Performance Widget - Business Starter/Growth Only */}
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
              
              return recentPosts.length > 0 ? (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Top Campaigns This Week</h3>
                    <button onClick={() => setActivePage('analytics')} className="text-sm text-primary-600 hover:underline">View Analytics</button>
                  </div>
                  <div className="space-y-3">
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
                </div>
              ) : null;
            })()}
            
            {/* Lead Pipeline Widget - Business Only */}
            {isBusiness && (() => {
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
            
            {/* Activity Timeline Widget */}
            {(() => {
              // Generate activity timeline from posts, messages, and campaigns
              const activities: Array<{ id: string; type: string; message: string; timestamp: Date; icon: React.ReactNode }> = [];
              
              // Recent posts
              posts.slice(0, 2).forEach(post => {
                activities.push({
                  id: `post-${post.id}`,
                  type: 'post',
                  message: `Published post on ${post.platforms[0] || 'social media'}`,
                  timestamp: new Date(post.createdAt || Date.now()),
                  icon: <SparklesIcon className="w-4 h-4" />
                });
              });
              
              // Campaign activities
              activeCampaigns.slice(0, 2).forEach(campaign => {
                activities.push({
                  id: `campaign-${campaign.id}`,
                  type: 'campaign',
                  message: `Campaign "${campaign.goal}" is ${campaign.status.toLowerCase()}`,
                  timestamp: new Date(campaign.createdAt || Date.now()),
                  icon: <RocketIcon />
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
              
              return activities.length > 0 ? (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Recent Activity</h3>
                  </div>
                  <div className="space-y-3">
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
                </div>
              ) : null;
            })()}
            
            {/* Goals & Milestones Widget */}
            {(() => {
              // Calculate goals progress using user-defined goals or defaults
              const currentFollowers = currentStats ? Object.values(currentStats).reduce((sum, stats) => sum + stats.followers, 0) : 0;
              const goalFollowers = user?.goals?.followerGoal || Math.ceil(currentFollowers * 1.5); // Use user goal or default to 50% more
              const followersProgress = goalFollowers > 0 ? Math.min((currentFollowers / goalFollowers) * 100, 100) : 0;
              
              const postsThisMonth = posts.filter(p => {
                const postDate = new Date(p.createdAt || 0);
                const now = new Date();
                return postDate.getMonth() === now.getMonth() && postDate.getFullYear() === now.getFullYear();
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
                    {/* Followers Goal */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {isBusiness ? 'Total Reach' : 'Total Followers'}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {new Intl.NumberFormat('en-US').format(currentFollowers)} / {new Intl.NumberFormat('en-US').format(goalFollowers)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-primary-500 to-primary-600 h-full transition-all duration-500" 
                          style={{ width: `${followersProgress}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {Math.round(followersProgress)}% complete
                      </p>
                    </div>
                    
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
                    
                    {/* Monthly Leads Goal - Business Only */}
                    {isBusiness && (() => {
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
                    
                    {/* Milestone badges */}
                    {(followersProgress >= 100 || postsProgress >= 100 || (isBusiness && (() => {
                      const leadMessages = messages.filter(m => m.category === 'Lead' && !m.isArchived);
                      const currentLeads = leadMessages.filter(m => {
                        const msgDate = new Date(m.timestamp);
                        const now = new Date();
                        return msgDate.getMonth() === now.getMonth() && msgDate.getFullYear() === now.getFullYear();
                      }).length;
                      const goalLeads = user?.goals?.monthlyLeadsGoal || 50;
                      return goalLeads > 0 && (currentLeads / goalLeads) * 100 >= 100;
                    })())) && (
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
          </div>
          
          {/* Fan Engagement Hub - Creator & Agency Only */}
          {(() => {
            // Show for Creators OR Business Agency (since Agency manages creators)
            const shouldShowFanHub = !isBusiness || user?.plan === 'Agency';
            if (!shouldShowFanHub) return null;
            
            const fanMessages = messages.filter(m => !m.isArchived && (m.category === 'Fan Message' || !m.category));
            const collabRequests = messages.filter(m => !m.isArchived && m.category === 'Collab Request');
            const questions = messages.filter(m => !m.isArchived && m.category === 'Question');
            const feedback = messages.filter(m => !m.isArchived && m.category === 'Feedback');
            
            return (fanMessages.length > 0 || collabRequests.length > 0 || questions.length > 0) ? (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Fan Engagement Hub</h3>
                  <button onClick={() => setViewMode('Inbox')} className="text-sm text-primary-600 hover:underline">View Inbox</button>
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
            const leadMessages = messages.filter(m => !m.isArchived && m.category === 'Lead');
            const supportMessages = messages.filter(m => !m.isArchived && m.category === 'Support');
            const opportunityMessages = messages.filter(m => !m.isArchived && m.category === 'Opportunity');
            const generalMessages = messages.filter(m => !m.isArchived && (!m.category || m.category === 'General'));
            
            return (leadMessages.length > 0 || supportMessages.length > 0 || opportunityMessages.length > 0 || generalMessages.length > 0) ? (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Customer Engagement Hub</h3>
                  <button onClick={() => setViewMode('Inbox')} className="text-sm text-primary-600 hover:underline">View Inbox</button>
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
          
          {/* AI Insights, Content Suggestions & Engagement Heatmap - Modern Grid Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            
            {/* AI Insights & Recommendations Panel - Redesigned */}
            {(() => {
              // Generate actionable recommendations based on user data
              const recommendations: Array<{ type: 'success' | 'info' | 'warning' | 'tip'; title: string; description: string; action?: () => void; actionLabel?: string }> = [];
              
              // Check posting frequency
              const postsThisWeek = posts.filter(p => {
                const postDate = new Date(p.createdAt || 0);
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return postDate > weekAgo;
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
              const upcomingCount = calendarEvents.filter(e => {
                const eventDate = new Date(e.date);
                return eventDate > new Date();
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
              
              // Check unread messages
              const unreadCount = messages.filter(m => !m.isArchived).length;
              if (unreadCount > 5) {
                recommendations.push({
                  type: 'info',
                  title: 'Messages Need Attention',
                  description: `You have ${unreadCount} unread messages. Quick responses improve engagement.`,
                  action: () => setViewMode('Inbox'),
                  actionLabel: 'View Inbox'
                });
              }
              
              // Check active campaigns
              const activeCampaigns = autopilotCampaigns.filter(c => c.status === 'Running' || c.status === 'Plan Generated').length;
              if (activeCampaigns === 0 && (user?.plan !== 'Free')) {
                recommendations.push({
                  type: 'tip',
                  title: isBusiness ? 'Launch Marketing Campaign' : 'Start Autopilot Campaign',
                  description: isBusiness 
                    ? 'Create a marketing campaign to automate your content and reach more customers.'
                    : 'Use AI Autopilot to generate content automatically based on your goals.',
                  action: () => setActivePage('autopilot'),
                  actionLabel: 'Launch Campaign'
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
              
              // Limit to 3 recommendations
              const displayRecommendations = recommendations.slice(0, 3);
              
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
                  <div className="space-y-2.5">
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
            
            {/* Engagement Heatmap - Redesigned */}
            {(() => {
            // Generate mock engagement data for heatmap (7 days x 8 time slots)
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const timeSlots = ['6AM', '9AM', '12PM', '3PM', '6PM', '9PM', '12AM', '3AM'];
            
            // Generate mock engagement levels (0-100) for each day/time combination
            const generateHeatmapData = () => {
              const data: number[][] = [];
              for (let day = 0; day < 7; day++) {
                const dayData: number[] = [];
                for (let slot = 0; slot < 8; slot++) {
                  // Higher engagement on weekdays during peak hours (9AM, 12PM, 3PM, 6PM)
                  let baseEngagement = 20;
                  
                  // Weekdays (Mon-Fri, days 1-5) have higher engagement
                  if (day >= 1 && day <= 5) {
                    baseEngagement += 30;
                  }
                  
                  // Peak hours have higher engagement
                  if ([1, 2, 3, 4].includes(slot)) { // 9AM, 12PM, 3PM, 6PM
                    baseEngagement += 40;
                  }
                  
                  // Add some randomization for realistic look
                  const engagement = Math.min(100, baseEngagement + Math.floor(Math.random() * 20) - 10);
                  dayData.push(Math.max(0, engagement));
                }
                data.push(dayData);
              }
              return data;
            };
            
            const heatmapData = generateHeatmapData();
            
            // Find optimal posting windows (highest engagement)
            const optimalSlots: Array<{ day: number; slot: number; value: number }> = [];
            heatmapData.forEach((dayData, dayIndex) => {
              dayData.forEach((value, slotIndex) => {
                if (value >= 70) {
                  optimalSlots.push({ day: dayIndex, slot: slotIndex, value });
                }
              });
            });
            
            // Get color intensity based on engagement level - New gradient color scheme
            const getColorIntensity = (value: number) => {
              // Cool to warm gradient: blue (low) -> cyan -> green -> yellow -> orange -> red (high)
              if (value >= 70) return 'bg-gradient-to-br from-emerald-500 to-green-600 dark:from-emerald-600 dark:to-green-700';
              if (value >= 50) return 'bg-gradient-to-br from-cyan-400 to-emerald-500 dark:from-cyan-500 dark:to-emerald-600';
              if (value >= 30) return 'bg-gradient-to-br from-blue-400 to-cyan-400 dark:from-blue-500 dark:to-cyan-500';
              if (value >= 15) return 'bg-gradient-to-br from-indigo-300 to-blue-400 dark:from-indigo-400 dark:to-blue-500';
              return 'bg-gray-200 dark:bg-gray-700';
            };
            
            return (
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 p-5 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-600">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl">
                    <TrendingIcon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">Engagement Heatmap</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Optimal posting times</p>
                  </div>
                </div>
                
                {/* Compact Heatmap */}
                <div className="overflow-x-auto -mx-1 px-1">
                  <div className="inline-block min-w-full">
                    {/* Time slots header */}
                    <div className="flex gap-1 mb-1.5">
                      <div className="w-10 flex-shrink-0"></div>
                      {timeSlots.map((slot, idx) => (
                        <div key={idx} className="flex-1 text-center">
                          <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">{slot.replace('AM', '').replace('PM', '')}</span>
                        </div>
                      ))}
                    </div>
                    
                    {/* Heatmap grid */}
                    <div className="space-y-1">
                      {days.map((day, dayIdx) => (
                        <div key={dayIdx} className="flex items-center gap-1">
                          <div className="w-10 flex-shrink-0">
                            <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">{day}</span>
                          </div>
                          {timeSlots.map((_, slotIdx) => {
                            const value = heatmapData[dayIdx][slotIdx];
                            const isOptimal = value >= 70;
                            return (
                              <div
                                key={slotIdx}
                                className={`flex-1 h-7 rounded-md ${getColorIntensity(value)} transition-all hover:scale-110 cursor-pointer relative group ${
                                  isOptimal ? 'ring-2 ring-yellow-400 ring-offset-1 shadow-lg' : ''
                                }`}
                                title={`${day} ${timeSlots[slotIdx]}: ${value}% engagement`}
                              >
                                {isOptimal && (
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-white text-[9px] font-bold drop-shadow-md">★</span>
                                  </div>
                                )}
                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-black/10 rounded-md transition-opacity"></div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                    
                    {/* Compact Legend */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded bg-gray-300 dark:bg-gray-600"></div>
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">Low</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded bg-gradient-to-br from-emerald-500 to-green-600"></div>
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">High</span>
                        </div>
                      </div>
                      {optimalSlots.length > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-yellow-500">★</span>
                          <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">{optimalSlots.length} optimal</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
          
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
                      setViewMode('Inbox');
                    }}
                    className="text-sm text-primary-600 dark:text-primary-400 hover:underline font-medium"
                  >
                    View All Leads →
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
            const totalFollowers = currentStats ? Object.values(currentStats).reduce((sum, stats) => sum + stats.followers, 0) : 0;
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {/* Revenue */}
                  <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-700">
                    <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1">Revenue This Month</p>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-lg font-bold text-green-900 dark:text-green-100 break-words min-w-0">
                        ${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(estimatedRevenue)}
                      </p>
                      <span className="text-xs font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">
                        +{revenueGrowth}%
                      </span>
                    </div>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      from {convertedLeads} customers
                    </p>
                  </div>
                  
                  {/* ROI */}
                  <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">ROI</p>
                    <p className="text-lg font-bold text-blue-900 dark:text-blue-100 break-words min-w-0">
                      {roi}%
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      Return on investment
                    </p>
                  </div>
                  
                  {/* CAC */}
                  <div className="p-4 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                    <p className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-1">Customer Acquisition Cost</p>
                    <p className="text-lg font-bold text-purple-900 dark:text-purple-100 break-words min-w-0">
                      ${cac}
                    </p>
                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                      Cost per customer
                    </p>
                  </div>
                  
                  {/* Conversion Rate */}
                  <div className="p-4 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-lg border border-orange-200 dark:border-orange-700">
                    <p className="text-sm font-medium text-orange-700 dark:text-orange-300 mb-1">Conversion Rate</p>
                    <p className="text-lg font-bold text-orange-900 dark:text-orange-100 break-words min-w-0">
                      {conversionRate}%
                    </p>
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
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
            const totalReach = currentStats ? Object.values(currentStats).reduce((sum, stats) => sum + stats.followers, 0) : 0;
            
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
          
          {/* Content Suggestions Panel - Phase 3 Feature 4 */}
          {(() => {
            // Generate content suggestions based on user's niche, recent posts, and performance
            const niche = isBusiness ? user?.businessType : user?.niche;
            const recentPosts = posts.filter(p => p.status === 'Published').slice(0, 5);
            
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
              
              return suggestions.slice(0, 3);
            };
            
            const suggestions = generateSuggestions();
            
            const getTypeBadge = (type: string) => {
              switch(type) {
                case 'trending': return { 
                  label: 'Trending', 
                  gradient: 'from-rose-500 to-pink-500',
                  bg: 'bg-rose-50 dark:bg-rose-900/20',
                  text: 'text-rose-700 dark:text-rose-300',
                  border: 'border-rose-200 dark:border-rose-700/50'
                };
                case 'engagement': return { 
                  label: 'High Engagement', 
                  gradient: 'from-blue-500 to-cyan-500',
                  bg: 'bg-blue-50 dark:bg-blue-900/20',
                  text: 'text-blue-700 dark:text-blue-300',
                  border: 'border-blue-200 dark:border-blue-700/50'
                };
                default: return { 
                  label: 'Niche', 
                  gradient: 'from-purple-500 to-indigo-500',
                  bg: 'bg-purple-50 dark:bg-purple-900/20',
                  text: 'text-purple-700 dark:text-purple-300',
                  border: 'border-purple-200 dark:border-purple-700/50'
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
                <div className="space-y-2.5">
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
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${badge.text} ${badge.bg} border ${badge.border}`}>
                                {badge.label}
                              </span>
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
            
            {/* Performance Comparison - Business Only, Beside Content Ideas */}
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {metrics.map((metric, idx) => (
                        <div 
                          key={idx}
                          className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                        >
                          <div className="mb-3">
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`flex-shrink-0 p-2 rounded-lg ${
                                metric.isPositive 
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                              }`}>
                                {metric.icon}
                              </div>
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                {metric.label}
                              </span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-lg font-bold text-gray-900 dark:text-white break-words min-w-0">
                                {metric.format(metric.current)}
                              </span>
                              <span className={`text-xs font-semibold flex items-center gap-1 whitespace-nowrap flex-shrink-0 ${
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
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 break-words">
                              vs. {metric.format(metric.previous)} last week
                            </div>
                            {metric.change !== 0 && (
                              <div className={`text-xs font-medium break-words ${
                                metric.isPositive 
                                  ? 'text-green-600 dark:text-green-400' 
                                  : 'text-red-600 dark:text-red-400'
                              }`}>
                                {metric.isPositive ? '+' : ''}{metric.change > 0 ? metric.format(metric.change) : metric.format(Math.abs(metric.change))} change
                              </div>
                            )}
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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Total Posts</span>
                          <span className={`text-xs font-semibold ${
                            postsChange.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          }`}>
                            {postsChange.isPositive ? '+' : ''}{postsChange.changePercent}%
                          </span>
                        </div>
                        <div className="text-lg font-bold text-gray-900 dark:text-white break-words min-w-0">{currentMonthPosts}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 break-words">vs. {previousMonthPosts} last month</div>
                      </div>
                      <div className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{isBusiness ? 'Reach' : 'Followers'}</span>
                          <span className={`text-xs font-semibold ${
                            followersChange.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          }`}>
                            {followersChange.isPositive ? '+' : ''}{followersChange.changePercent}%
                          </span>
                        </div>
                        <div className="text-lg font-bold text-gray-900 dark:text-white break-words min-w-0">{currentMonthFollowers.toLocaleString()}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 break-words">vs. {previousMonthFollowers.toLocaleString()} last month</div>
                      </div>
                      <div className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{isBusiness ? 'Leads' : 'Messages'}</span>
                          <span className={`text-xs font-semibold ${
                            engagementChange.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          }`}>
                            {engagementChange.isPositive ? '+' : ''}{engagementChange.changePercent}%
                          </span>
                        </div>
                        <div className="text-lg font-bold text-gray-900 dark:text-white break-words min-w-0">{currentMonthEngagement}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 break-words">vs. {previousMonthEngagement} last month</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Upcoming Schedule */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                   <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Upcoming Schedule</h3>
                        <button onClick={() => setActivePage('calendar')} className="text-sm text-primary-600 hover:underline">View Calendar</button>
                   </div>
                   <div className="space-y-3">
                        {upcomingEvents.length > 0 ? (
                            upcomingEvents.map(event => <UpcomingEventCard key={event.id} event={event} onClick={() => handleEventClick(event)} />)
                        ) : (
                            <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                                <p className="text-gray-500 text-sm">No upcoming posts.</p>
                                <button onClick={() => setActivePage('compose')} className="mt-2 text-primary-600 text-sm font-medium">Schedule one now</button>
                            </div>
                        )}
                   </div>
              </div>
                
              {/* Urgent Messages */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Urgent Messages</h3>
                        <button onClick={() => setViewMode('Inbox')} className="text-sm text-primary-600 hover:underline">Go to Inbox</button>
                   </div>
                   <div className="space-y-3">
                        {filteredMessages.slice(0, 3).length > 0 ? (
                            filteredMessages.slice(0, 3).map(msg => (
                                <div key={msg.id} className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm flex gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700" onClick={async (e) => {
                                    e.stopPropagation();
                                    await ensureCRMProfile(msg.user);
                                    openCRM(msg.user);
                                }}>
                                    <div className="flex-shrink-0 pt-1">
                                        <img src={msg.user.avatar} className="w-8 h-8 rounded-full" alt={msg.user.name} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between">
                                            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{msg.user.name}</p>
                                            <span className="text-xs text-gray-400">{platformFilterIcons[msg.platform]}</span>
                                        </div>
                                        <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{msg.content}</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                                <p className="text-green-600 font-medium text-sm">Inbox Zero! 🎉</p>
                                <p className="text-gray-400 text-xs mt-1">You're all caught up.</p>
                            </div>
                        )}
                   </div>
              </div>
          </div>
      </div>
  );

  const renderInbox = () => (
    // ... (Keep the Inbox render code mostly the same) ...
    <div className="space-y-6 animate-fade-in">
         <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* ... Search & Auto-Respond UI ... */}
            <div className="flex items-center gap-4">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Inbox</h2>
                <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3"><SearchIcon className="w-5 h-5 text-gray-400" /></span>
                    <input type="text" placeholder="Search user or content..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 w-full sm:w-64 border rounded-full bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-primary-500 focus:border-primary-500 dark:text-white dark:placeholder-gray-400" />
                </div>
            </div>
             <div className="flex items-center gap-4">
                <button onClick={categorizeAllMessages} className="text-sm font-medium text-primary-600 hover:underline">Categorize Inbox</button>
                 <div className="flex items-center gap-2 p-1.5 bg-gray-200 dark:bg-gray-700 rounded-full">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 pl-3 pr-1 truncate max-w-[200px]">
                        Auto-Respond{user?.role === 'Admin' || user?.plan === 'Agency' ? ` (${accountName})` : ''}
                    </span>
                    <button onClick={handleAutoRespondToggle} className={`${ settings.autoRespond ? 'bg-primary-600' : 'bg-gray-400 dark:bg-gray-600'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}><span className={`${ settings.autoRespond ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} /></button>
                </div>
            </div>
        </div>
        
        {/* ... Filters ... */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
          {(isBusiness 
            ? (['All', 'Lead', 'Support', 'Opportunity', 'General'] as const)
            : (['All', 'Fan Message', 'Question', 'Collab Request', 'Feedback', 'General'] as const)
          ).map(cat => (
            <button 
              key={cat} 
              onClick={() => handleFilterChange('category', cat as any)} 
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${filters.category === cat ? 'border-b-2 border-primary-500 text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Compact Filter Bar */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-3 mb-6">
          <div className="flex flex-wrap items-center gap-4 lg:gap-6">
            {/* Platform Filters */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden sm:inline">Platform</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => handleFilterChange('platform', 'All')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                    filters.platform === 'All'
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  All
                </button>
                {(Object.keys(platformFilterIcons) as Platform[]).map(platform => (
                  <button
                    key={platform}
                    onClick={() => handleFilterChange('platform', platform)}
                    className={`p-1.5 rounded-lg transition-all ${
                      filters.platform === platform
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                    title={platform}
                  >
                    <span className="scale-90">{platformFilterIcons[platform]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Separator */}
            <div className="hidden lg:block w-px h-6 bg-gray-200 dark:bg-gray-700" />

            {/* Type Filters */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden sm:inline">Type</span>
              <div className="flex items-center gap-1.5">
                {(['All', 'DM', 'Comment'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => handleFilterChange('messageType', type === 'All' ? 'All' : type)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                      filters.messageType === (type === 'All' ? 'All' : type)
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Separator */}
            <div className="hidden lg:block w-px h-6 bg-gray-200 dark:bg-gray-700" />

            {/* Status Filters */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden sm:inline">Status</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleFilterChange('status', 'All')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                    filters.status === 'All'
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => handleFilterChange('status', 'Flagged')}
                  className={`p-1.5 rounded-lg transition-all ${
                    filters.status === 'Flagged'
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                  title="Flagged"
                >
                  <FlagIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleFilterChange('status', 'Favorite')}
                  className={`p-1.5 rounded-lg transition-all ${
                    filters.status === 'Favorite'
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                  title="Favorites"
                >
                  <StarIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Separator */}
            <div className="hidden lg:block w-px h-6 bg-gray-200 dark:bg-gray-700" />

            {/* Sentiment Filters */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden sm:inline">Sentiment</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(['All', 'Positive', 'Neutral', 'Negative'] as const).map(sentiment => (
                  <button
                    key={sentiment}
                    onClick={() => handleFilterChange('sentiment', sentiment === 'All' ? 'All' : sentiment)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                      filters.sentiment === (sentiment === 'All' ? 'All' : sentiment)
                        ? sentiment === 'All'
                          ? 'bg-primary-600 text-white shadow-sm'
                          : sentiment === 'Positive'
                          ? 'bg-green-500 text-white shadow-sm'
                          : sentiment === 'Neutral'
                          ? 'bg-blue-500 text-white shadow-sm'
                          : 'bg-red-500 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {sentiment}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

      {isLoading ? (
        <div className="text-center py-16"><p>Loading messages...</p></div>
      ) : filteredMessages.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
            {filteredMessages.map(message => (<MessageCard key={message.id} id={`message-card-${message.id}`} message={message} isSelected={selectedMessageIds.has(message.id)} onSelect={handleSelectMessage} onToggleFlag={handleToggleFlag} onToggleFavorite={handleToggleFavorite} onDelete={handleDeleteMessage} />))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl shadow-md"><h3 className="text-xl font-semibold text-gray-900 dark:text-white">Inbox Zero!</h3><p className="mt-2 text-gray-500 dark:text-gray-400">There are no messages for this account or filter.</p></div>
      )}

      {selectedMessageIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-auto bg-white dark:bg-gray-800 shadow-2xl rounded-full p-3 flex items-center gap-4"><span className="font-semibold px-2">{selectedMessageIds.size} selected</span><button className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-full hover:bg-primary-700">Approve All</button><button onClick={handleBulkArchive} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-600 rounded-full hover:bg-gray-300 dark:hover:bg-gray-500">Archive All</button><button onClick={handleBulkDelete} className="px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/50 rounded-full hover:bg-red-200 dark:hover:bg-red-900">Delete All</button></div>
      )}
    </div>
  );

  return (
    <div id="tour-step-1-dashboard" className="space-y-6">
         <div className="flex justify-end mb-2">
            <div className="bg-gray-100 dark:bg-gray-700 p-1 rounded-lg inline-flex">
                <button onClick={() => setViewMode('Overview')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'Overview' ? 'bg-white dark:bg-gray-600 text-primary-600 dark:text-white shadow' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900'}`}>{isBusiness ? 'Command Center' : 'Overview'}</button>
                <button onClick={() => setViewMode('Inbox')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'Inbox' ? 'bg-white dark:bg-gray-600 text-primary-600 dark:text-white shadow' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900'}`}>Full Inbox</button>
            </div>
         </div>
         {viewMode === 'Overview' ? renderCommandCenter() : renderInbox()}
    </div>
  );
};

