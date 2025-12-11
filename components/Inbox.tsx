import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MessageCard } from './MessageCard';
import { Platform, Message, DashboardFilters, MessageType, MessageCategory } from '../types';
import { InstagramIcon, TikTokIcon, XIcon, ThreadsIcon, YouTubeIcon, LinkedInIcon, FacebookIcon, PinterestIcon, DiscordIcon, TelegramIcon, RedditIcon } from './icons/PlatformIcons';
import { SearchIcon, FlagIcon, StarIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { hasCapability, getPlatformsWithCapability } from '../src/services/platformCapabilities';

const platformFilterIcons: { [key in Platform]: React.ReactNode } = {
  Instagram: <InstagramIcon />,
  TikTok: <TikTokIcon />,
  X: <XIcon />,
  Threads: <ThreadsIcon />,
  YouTube: <YouTubeIcon />,
  LinkedIn: <LinkedInIcon />,
  Facebook: <FacebookIcon />,
  Pinterest: <PinterestIcon />,
  Discord: <DiscordIcon />,
  Telegram: <TelegramIcon />,
  Reddit: <RedditIcon />,
};

// Get only platforms that support inbox/messaging
const inboxSupportedPlatforms = getPlatformsWithCapability('inbox');

export const Inbox: React.FC = () => {
  const { 
    messages, 
    selectedClient, 
    user, 
    dashboardNavState, 
    clearDashboardNavState, 
    settings, 
    setSettings, 
    updateMessage, 
    deleteMessage, 
    categorizeAllMessages, 
    openCRM, 
    ensureCRMProfile, 
    showToast 
  } = useAppContext();

  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<DashboardFilters>({
    platform: 'All',
    messageType: 'All',
    sentiment: 'All',
    status: 'All',
    category: 'All',
  });
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const isBusiness = useMemo(() => {
    if (selectedClient) {
      return true;
    }
    if (user?.role === 'Admin') {
      return false;
    }
    return user?.userType === 'Business';
  }, [selectedClient, user?.role, user?.userType]);

  // Get account name for display
  const accountName = selectedClient?.name || user?.name || 'Account';

  // Handle navigation state (for deep linking to specific messages)
  useEffect(() => {
    if (dashboardNavState?.highlightId) {
      setHighlightedMessageId(dashboardNavState.highlightId);
      if (dashboardNavState.filters) {
        setFilters(prev => ({ ...prev, ...dashboardNavState.filters }));
      }
      clearDashboardNavState();
    }
  }, [dashboardNavState, clearDashboardNavState]);

  // Highlight message when navigating to it
  useEffect(() => {
    if (!highlightedMessageId) return;
    const timerId = setTimeout(() => {
      const element = document.getElementById(`message-card-${highlightedMessageId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('highlight-animation');
        setTimeout(() => { 
          element.classList.remove('highlight-animation'); 
          setHighlightedMessageId(null); 
        }, 2000);
      } else { 
        setHighlightedMessageId(null); 
      }
    }, 100);
    return () => clearTimeout(timerId);
  }, [highlightedMessageId]);

  const handleFilterChange = (key: keyof DashboardFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleAutoRespondToggle = () => {
    setSettings({ ...settings, autoRespond: !settings.autoRespond });
    showToast(settings.autoRespond ? 'Auto-respond disabled' : 'Auto-respond enabled', 'success');
  };

  const filteredMessages = useMemo(() => {
    let filtered = messages.filter(m => {
      // Filter by client if selected
      if (selectedClient && m.clientId !== selectedClient.id) {
        return false;
      }
      if (!selectedClient && m.clientId) {
        return false;
      }

      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
          m.content.toLowerCase().includes(searchLower) ||
          m.user.name.toLowerCase().includes(searchLower) ||
          m.platform.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Platform filter
      if (filters.platform !== 'All' && m.platform !== filters.platform) {
        return false;
      }

      // Message type filter
      if (filters.messageType !== 'All' && m.type !== filters.messageType) {
        return false;
      }

      // Sentiment filter
      if (filters.sentiment !== 'All' && m.sentiment !== filters.sentiment) {
        return false;
      }

      // Status filters
      if (filters.status === 'Flagged' && !m.isFlagged) return false;
      if (filters.status === 'Favorite' && !m.isFavorite) return false;

      // Category filter
      if (filters.category !== 'All' && m.category !== filters.category) {
        return false;
      }

      return true;
    });

    // Sort by timestamp (newest first)
    return filtered.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [messages, filters, searchTerm, selectedClient]);

  const handleSelectMessage = (messageId: string) => {
    setSelectedMessageIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const handleToggleFlag = async (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message) {
      await updateMessage(messageId, { isFlagged: !message.isFlagged });
    }
  };

  const handleToggleFavorite = async (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message) {
      await updateMessage(messageId, { isFavorite: !message.isFavorite });
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (window.confirm('Are you sure you want to delete this message?')) {
      await deleteMessage(messageId);
      setSelectedMessageIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
    }
  };

  const handleBulkArchive = async () => {
    if (selectedMessageIds.size === 0) return;
    for (const id of selectedMessageIds) {
      await updateMessage(id, { isArchived: true });
    }
    setSelectedMessageIds(new Set());
    showToast(`Archived ${selectedMessageIds.size} message(s)`, 'success');
  };

  const handleBulkDelete = async () => {
    if (selectedMessageIds.size === 0) return;
    if (window.confirm(`Delete ${selectedMessageIds.size} message(s)?`)) {
      for (const id of selectedMessageIds) {
        await deleteMessage(id);
      }
      setSelectedMessageIds(new Set());
      showToast(`Deleted ${selectedMessageIds.size} message(s)`, 'success');
    }
  };

  if (!user) {
    return <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full flex items-center justify-center">
      <p className="text-gray-500 dark:text-gray-400">Loading...</p>
    </div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Inbox</h2>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
              <SearchIcon className="w-5 h-5 text-gray-400" />
            </span>
            <input 
              type="text" 
              placeholder="Search user or content..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="pl-10 pr-4 py-2 w-full sm:w-64 border rounded-full bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-primary-500 focus:border-primary-500 dark:text-white dark:placeholder-gray-400" 
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={categorizeAllMessages} 
            className="text-sm font-medium text-primary-600 hover:underline"
          >
            Categorize Inbox
          </button>
          <div className="flex items-center gap-2 p-1.5 bg-gray-200 dark:bg-gray-700 rounded-full">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 pl-3 pr-1 truncate max-w-[200px]">
              Auto-Respond{user?.role === 'Admin' || user?.plan === 'Agency' ? ` (${accountName})` : ''}
            </span>
            <button 
              onClick={handleAutoRespondToggle} 
              className={`${settings.autoRespond ? 'bg-primary-600' : 'bg-gray-400 dark:bg-gray-600'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}
            >
              <span className={`${settings.autoRespond ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
            </button>
          </div>
        </div>
      </div>
      
      {/* Category Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {(isBusiness 
          ? (['All', 'Lead', 'Support', 'Opportunity', 'General'] as const)
          : (['All', 'Fan Message', 'Question', 'Collab Request', 'Feedback', 'General'] as const)
        ).map(cat => (
          <button 
            key={cat} 
            onClick={() => handleFilterChange('category', cat as any)} 
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
              filters.category === cat 
                ? 'border-b-2 border-primary-500 text-primary-600 dark:text-primary-400' 
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
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
              {(Object.keys(platformFilterIcons) as Platform[])
                .filter(platform => inboxSupportedPlatforms.includes(platform))
                .map(platform => (
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
        <div className="text-center py-16">
          <p>Loading messages...</p>
        </div>
      ) : filteredMessages.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
          {filteredMessages.map(message => (
            <MessageCard 
              key={message.id} 
              id={`message-card-${message.id}`} 
              message={message} 
              isSelected={selectedMessageIds.has(message.id)} 
              onSelect={handleSelectMessage} 
              onToggleFlag={handleToggleFlag} 
              onToggleFavorite={handleToggleFavorite} 
              onDelete={handleDeleteMessage} 
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl shadow-md">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Inbox Zero!</h3>
          <p className="mt-2 text-gray-500 dark:text-gray-400">There are no messages for this account or filter.</p>
        </div>
      )}

      {selectedMessageIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-auto bg-white dark:bg-gray-800 shadow-2xl rounded-full p-3 flex items-center gap-4 border-2 border-primary-500">
          <span className="font-semibold px-2 text-gray-900 dark:text-white">{selectedMessageIds.size} selected</span>
          <button 
            onClick={handleBulkArchive} 
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-600 rounded-full hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
          >
            Archive Selected
          </button>
          <button 
            onClick={handleBulkDelete} 
            className="px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/50 rounded-full hover:bg-red-200 dark:hover:bg-red-900 transition-colors"
          >
            Delete Selected
          </button>
        </div>
      )}
    </div>
  );
};

