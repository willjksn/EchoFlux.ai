import React, { useState, useMemo, useEffect } from 'react';
import { MessageCard } from './MessageCard';
import { Platform, Message, DashboardFilters, MessageType, CalendarEvent, MessageCategory } from '../types';
import { InstagramIcon, TikTokIcon, XIcon, ThreadsIcon, YouTubeIcon, LinkedInIcon, FacebookIcon } from './icons/PlatformIcons';
import { DashboardIcon, FlagIcon, SearchIcon, StarIcon, CalendarIcon, SparklesIcon, TrendingIcon, CheckCircleIcon, UserIcon, ArrowUpCircleIcon, KanbanIcon, BriefcaseIcon, LinkIcon } from './icons/UIIcons';
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
    <button onClick={onClick} aria-label={`Filter by ${label}`} className={`flex items-center space-x-2 px-3 py-1.5 rounded-full transition-colors text-sm font-semibold ${isActive ? 'bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 shadow' : 'text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-800/60'}`}>{children}<span>{label}</span></button>
);
const QuickAction: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; color: string }> = ({ icon, label, onClick, color }) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center p-4 rounded-xl bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all group`}><div className={`p-3 rounded-full mb-3 text-white transition-transform group-hover:scale-110 ${color}`}>{icon}</div><span className="text-sm font-medium text-gray-700 dark:text-gray-300 text-center">{label}</span></button>
);
const UpcomingEventCard: React.FC<{ event: CalendarEvent; onClick: () => void }> = ({ event, onClick }) => (
    <div onClick={onClick} className="flex items-center p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"><div className="flex-shrink-0 w-12 h-12 bg-primary-50 dark:bg-primary-900/30 rounded-md flex flex-col items-center justify-center text-primary-600 dark:text-primary-400 mr-3"><span className="text-xs font-bold uppercase">{new Date(event.date).toLocaleDateString('en-US', { month: 'short' })}</span><span className="text-lg font-bold">{new Date(event.date).getDate()}</span></div><div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-900 dark:text-white truncate">{event.title}</p><div className="flex items-center mt-1"><span className="text-xs text-gray-500 dark:text-gray-400 mr-2 font-medium">{new Date(event.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><span className="text-gray-400 mr-2 scale-75">{platformFilterIcons[event.platform]}</span><span className={`text-xs px-2 py-0.5 rounded-full ${event.status === 'Scheduled' ? 'bg-blue-100 text-blue-700' : event.status === 'Published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{event.status}</span></div></div></div>
);

export const Dashboard: React.FC = () => {
  const { messages, selectedClient, user, dashboardNavState, clearDashboardNavState, settings, setSettings, setActivePage, calendarEvents, posts, setComposeContext, updateMessage, deleteMessage, categorizeAllMessages } = useAppContext();
  
  if (!user) return null;

  const isBusiness = user.userType === 'Business';
  
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
      <div className="space-y-8 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
             <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
             <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <QuickAction label="Create Post" icon={<SparklesIcon className="w-6 h-6" />} color="bg-gradient-to-br from-purple-500 to-indigo-600" onClick={() => setActivePage('compose')} />
                  <QuickAction label={isBusiness ? 'Marketing Plan' : 'Generate Strategy'} icon={<TrendingIcon className="w-6 h-6" />} color="bg-gradient-to-br from-blue-500 to-cyan-500" onClick={() => setActivePage('strategy')} />
                  <QuickAction label="View Calendar" icon={<CalendarIcon className="w-6 h-6" />} color="bg-gradient-to-br from-orange-400 to-red-500" onClick={() => setActivePage('calendar')} />
                  <QuickAction label={isBusiness ? 'Business Insights' : 'Check Analytics'} icon={<CheckCircleIcon className="w-6 h-6" />} color="bg-gradient-to-br from-emerald-400 to-green-600" onClick={() => setActivePage('analytics')} />
              </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{isBusiness ? 'Business Metrics' : 'Audience Stats'}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {currentStats && Object.entries(currentStats).map(([platform, stats]) => (
                     <div key={platform} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div className="text-gray-500 dark:text-gray-400">
                           {platformFilterIcons[platform as Platform]}
                        </div>
                        <div>
                           <p className="font-bold text-gray-900 dark:text-white">{new Intl.NumberFormat('en-US', { notation: "compact" }).format(stats.followers)}</p>
                           <p className="text-xs text-gray-500 dark:text-gray-400">{isBusiness ? 'Potential Reach' : 'Followers'}</p>
                        </div>
                     </div>
                  ))}
                   {isBusiness && (
                     <>
                        <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                            <div className="text-gray-500 dark:text-gray-400"><LinkIcon /></div>
                            <div>
                               <p className="font-bold text-gray-900 dark:text-white">1,204</p>
                               <p className="text-xs text-gray-500 dark:text-gray-400">Website Clicks</p>
                            </div>
                        </div>
                         <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                            <div className="text-gray-500 dark:text-gray-400"><BriefcaseIcon /></div>
                            <div>
                               <p className="font-bold text-gray-900 dark:text-white">88</p>
                               <p className="text-xs text-gray-500 dark:text-gray-400">Leads Generated</p>
                            </div>
                        </div>
                     </>
                  )}
              </div>
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
                                <div key={msg.id} className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm flex gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700" onClick={() => setViewMode('Inbox')}>
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
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 pl-3 pr-1 truncate max-w-[200px]">Auto-Respond ({accountName})</span>
                    <button onClick={handleAutoRespondToggle} className={`${ settings.autoRespond ? 'bg-primary-600' : 'bg-gray-400 dark:bg-gray-600'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}><span className={`${ settings.autoRespond ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} /></button>
                </div>
            </div>
        </div>
        
        {/* ... Filters ... */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">{(['All', 'Lead', 'Support', 'Opportunity', 'General'] as const).map(cat => (<button key={cat} onClick={() => handleFilterChange('category', cat)} className={`px-4 py-2 text-sm font-medium ${filters.category === cat ? 'border-b-2 border-primary-500 text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}>{cat}</button>))}</div>

        <div className="flex flex-wrap items-center gap-2">
             {/* ... (Platform, Type, Status Filters - Keep existing code) ... */}
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
