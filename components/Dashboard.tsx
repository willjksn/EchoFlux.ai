import React, { useState, useMemo, useEffect } from 'react';
import { MessageCard } from './MessageCard';
import { Platform, Message, DashboardFilters, MessageType, CalendarEvent, MessageCategory } from '../types';
import { InstagramIcon, TikTokIcon, XIcon, ThreadsIcon, YouTubeIcon, LinkedInIcon, FacebookIcon } from './icons/PlatformIcons';
import { DashboardIcon, FlagIcon, SearchIcon, StarIcon, CalendarIcon, SparklesIcon, TrendingIcon, CheckCircleIcon, UserIcon, ArrowUpCircleIcon, KanbanIcon, BriefcaseIcon, LinkIcon, RocketIcon, ArrowUpIcon, ChatIcon, DollarSignIcon, HeartIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';

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
  const { messages, selectedClient, user, dashboardNavState, clearDashboardNavState, settings, setSettings, setActivePage, calendarEvents, posts, setComposeContext, updateMessage, deleteMessage, categorizeAllMessages, autopilotCampaigns, openCRM, ensureCRMProfile } = useAppContext();
  
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

