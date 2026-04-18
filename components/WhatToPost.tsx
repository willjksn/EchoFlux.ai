import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppContext } from './AppContext';
import { DailyPostIdea, WhatToPostSettings, CalendarEvent, Platform } from '../types';
import { auth, db } from '../firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';
import { SparklesIcon, RefreshIcon, SettingsIcon, XMarkIcon, CalendarIcon, TrashIcon } from './icons/UIIcons';
import {
  stripStrategyFormatPrefix,
  instagramPostTypeFromContentFormat,
} from '../src/lib/strategyComposeHandoff';

type PlatformOption = 'instagram' | 'facebook' | 'x' | 'mypage';

// Visual placeholder card component for post ideas
const PostIdeaCard: React.FC<{
  idea: DailyPostIdea;
  platform: PlatformOption;
  onUse: () => void;
  onSwap: () => void;
  swapping: boolean;
}> = ({ idea, platform, onUse, onSwap, swapping }) => {
  const [expanded, setExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  // Format-specific styling for different platforms
  const formatStyles: Record<string, { icon: string; label: string; gradient: string }> = {
    // Instagram formats
    reel: { icon: '▶️', label: 'REEL', gradient: 'from-purple-500 via-pink-500 to-orange-400' },
    carousel: { icon: '◀ ▶', label: 'CAROUSEL', gradient: 'from-blue-500 to-purple-500' },
    story: { icon: '○', label: 'STORY', gradient: 'from-orange-400 via-pink-500 to-purple-500' },
    // My Page / Fan Hub formats
    photo: { icon: '📷', label: 'PHOTO', gradient: 'from-pink-500 via-purple-500 to-indigo-500' },
    video: { icon: '🎬', label: 'VIDEO', gradient: 'from-purple-600 via-pink-500 to-red-500' },
    text: { icon: '✍️', label: 'TEXT', gradient: 'from-indigo-500 via-purple-500 to-pink-500' },
    poll: { icon: '📊', label: 'POLL', gradient: 'from-teal-500 via-cyan-500 to-blue-500' },
    // X/Twitter formats
    tweet: { icon: '💬', label: 'TWEET', gradient: 'from-gray-800 via-gray-700 to-gray-600' },
    thread: { icon: '🧵', label: 'THREAD', gradient: 'from-blue-600 via-blue-500 to-cyan-500' },
    // Facebook formats
    post: { icon: '📝', label: 'POST', gradient: 'from-blue-600 to-blue-400' },
    live: { icon: '🔴', label: 'LIVE', gradient: 'from-red-500 via-pink-500 to-orange-500' },
    // Fallback
    mixed: { icon: '🎨', label: 'POST', gradient: 'from-blue-600 to-blue-400' },
  };

  const format = idea.format?.toLowerCase() || 'post';
  const style = formatStyles[format] || formatStyles.post;
  const isTrending = idea.trendBased || idea.trendContext;
  
  // Only show AI-generated realistic images on PHOTO format cards
  // Other formats (reel, carousel, story, video, etc.) should show stylized gradient + emoji
  const isPhotoFormat = format === 'photo';
  const hasValidImage = isPhotoFormat && idea.placeholderImage && !imageError;

  // Get emoji based on content keywords
  const getVisualEmoji = () => {
    const keywords = idea.title?.toLowerCase() || '';
    if (keywords.includes('gaming') || keywords.includes('game') || keywords.includes('setup') || keywords.includes('stream')) return '🎮';
    if (keywords.includes('food') || keywords.includes('cook') || keywords.includes('recipe')) return '🍳';
    if (keywords.includes('fitness') || keywords.includes('workout') || keywords.includes('gym')) return '💪';
    if (keywords.includes('travel') || keywords.includes('adventure')) return '✈️';
    if (keywords.includes('music') || keywords.includes('song')) return '🎵';
    if (keywords.includes('beauty') || keywords.includes('makeup') || keywords.includes('skin')) return '💄';
    if (keywords.includes('fashion') || keywords.includes('outfit') || keywords.includes('style')) return '👗';
    if (keywords.includes('pet') || keywords.includes('dog') || keywords.includes('cat')) return '🐾';
    if (keywords.includes('morning') || keywords.includes('routine') || keywords.includes('day')) return '☀️';
    if (keywords.includes('night') || keywords.includes('evening')) return '🌙';
    if (keywords.includes('fail') || keywords.includes('funny') || keywords.includes('hilarious')) return '😂';
    if (keywords.includes('poll') || keywords.includes('vote') || keywords.includes('decide')) return '🗳️';
    if (keywords.includes('rate') || keywords.includes('review')) return '⭐';
    if (keywords.includes('upgrade') || keywords.includes('new')) return '🆕';
    return '✨';
  };

  const shotList = idea.shotList || [];
  const visibleShots = expanded ? shotList : shotList.slice(0, 2);
  const hasMoreShots = shotList.length > 2;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
      {/* Visual Header - Gradient with emoji, badges on top */}
      <div className={`relative h-32 bg-gradient-to-br ${style.gradient} flex items-center justify-center`}>
        {/* Large emoji in center */}
        <span className="text-5xl opacity-30 select-none">{getVisualEmoji()}</span>
        
        {/* If we have a valid AI image, show it */}
        {hasValidImage && (
          <img 
            src={idea.placeholderImage} 
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        )}
        
        {/* Top badges row */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 bg-white/90 dark:bg-gray-900/90 rounded text-xs font-bold text-gray-800 dark:text-white shadow-sm">
              {style.label}
            </span>
            {isTrending && (
              <span className="px-2 py-0.5 bg-orange-500 rounded text-xs font-bold text-white shadow-sm">
                🔥
              </span>
            )}
          </div>
          <span className="px-2 py-0.5 bg-white/90 dark:bg-gray-900/90 rounded text-xs font-medium text-gray-700 dark:text-gray-300 shadow-sm">
            {platform === 'instagram' ? '📸' : platform === 'facebook' ? '📘' : platform === 'x' ? '𝕏' : '💖'}
          </span>
        </div>
      </div>

      {/* Content Section - Clear white background */}
      <div className="p-4 flex-1 flex flex-col bg-white dark:bg-gray-800">
        {/* Title */}
        <h3 className="font-bold text-gray-900 dark:text-white text-base leading-tight mb-2">
          {idea.title}
        </h3>
        
        {/* Hook quote - expandable */}
        <div className="mb-3">
          <p className={`text-sm text-gray-600 dark:text-gray-300 italic ${!expanded ? 'line-clamp-2' : ''}`}>
            "{idea.hook}"
          </p>
          {idea.hook && idea.hook.length > 100 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium mt-1"
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
        
        {/* What to show section */}
        {shotList.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              What to show
            </p>
            <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              {visibleShots.map((shot, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary-500 flex-shrink-0">•</span>
                  <span>{shot}</span>
                </li>
              ))}
            </ul>
            {hasMoreShots && !expanded && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="mt-1 text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
              >
                + {shotList.length - 2} more shots
              </button>
            )}
          </div>
        )}

        {/* Trend context if available */}
        {idea.trendContext && (
          <p className="text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-2 py-1.5 rounded mb-3">
            📈 {idea.trendContext}
          </p>
        )}

        {/* Action buttons - pushed to bottom */}
        <div className="mt-auto flex gap-2 pt-2">
          <button
            type="button"
            onClick={onUse}
            className="flex-1 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-colors"
          >
            Use this
          </button>
          <button
            type="button"
            onClick={onSwap}
            disabled={swapping}
            className="py-2.5 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {swapping ? <RefreshIcon className="w-4 h-4 animate-spin inline" /> : '↻'}
          </button>
        </div>
      </div>
    </div>
  );
};

const GOAL_OPTIONS = [
  { id: 'reach', label: 'Reach' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'balanced_followers_engagement', label: 'Followers' },
  { id: 'sales_subs', label: 'Sales/Subs' },
];

const FORMAT_OPTIONS = [
  { id: 'reel', label: 'Reel' },
  { id: 'carousel', label: 'Carousel' },
  { id: 'photo', label: 'Photo' },
  { id: 'story', label: 'Story' },
];

const PLATFORM_OPTIONS: { id: PlatformOption; label: string; icon: string }[] = [
  { id: 'instagram', label: 'Instagram', icon: '📸' },
  { id: 'facebook', label: 'Facebook', icon: '📘' },
  { id: 'x', label: 'X', icon: '𝕏' },
  { id: 'mypage', label: 'My Page', icon: '💖' },
];

const DEFAULT_SETTINGS: WhatToPostSettings = {
  platform: 'instagram',
  goal: 'balanced_followers_engagement',
  effort: 15,
  format: 'auto',
  tone: 'relatable',
  useTrends: true, // Always use trends now - integrated into idea generation
  spicyMode: false,
  prioritizeCreatorPersonality: false,
};

interface WhatToPostProps {
  onOpenAdvanced: () => void;
}

const MAX_IDEA_HISTORY = 5;

type WhatToPostHistoryEntry = {
  id: string;
  createdAt: string;
  platform: PlatformOption;
  ideas: DailyPostIdea[];
};

function historyStorageKey(userId: string) {
  return `whatToPostHistory_${userId}`;
}

function loadHistoryFromStorage(userId: string): WhatToPostHistoryEntry[] {
  try {
    const raw = localStorage.getItem(historyStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (row): row is WhatToPostHistoryEntry =>
          row != null &&
          typeof row === "object" &&
          typeof (row as WhatToPostHistoryEntry).id === "string" &&
          Array.isArray((row as WhatToPostHistoryEntry).ideas)
      )
      .slice(0, MAX_IDEA_HISTORY);
  } catch {
    return [];
  }
}

function saveHistoryToStorage(userId: string, entries: WhatToPostHistoryEntry[]) {
  try {
    localStorage.setItem(historyStorageKey(userId), JSON.stringify(entries.slice(0, MAX_IDEA_HISTORY)));
  } catch {
    /* ignore */
  }
}

export const WhatToPost: React.FC<WhatToPostProps> = ({ onOpenAdvanced }) => {
  const { user, showToast, setActivePage, addCalendarEvent } = useAppContext();

  const [ideaHistory, setIdeaHistory] = useState<WhatToPostHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const ideasRef = useRef<DailyPostIdea[]>([]);
  
  // Load persisted ideas from localStorage on mount
  const [ideas, setIdeas] = useState<DailyPostIdea[]>(() => {
    try {
      const saved = localStorage.getItem('whatToPostIdeas');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  const [regeneratingAll, setRegeneratingAll] = useState(false);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [settings, setSettings] = useState<WhatToPostSettings>(DEFAULT_SETTINGS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState<WhatToPostSettings>(DEFAULT_SETTINGS);
  const [useThisIdea, setUseThisIdea] = useState<DailyPostIdea | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformOption>(() => {
    try {
      const saved = localStorage.getItem('whatToPostPlatform');
      return (saved as PlatformOption) || 'instagram';
    } catch { return 'instagram'; }
  });
  const [hasGenerated, setHasGenerated] = useState(() => {
    try {
      const saved = localStorage.getItem('whatToPostIdeas');
      return saved ? JSON.parse(saved).length > 0 : false;
    } catch { return false; }
  });
  const [creatorHint, setCreatorHint] = useState('');

  ideasRef.current = ideas;

  useEffect(() => {
    if (!user?.id) {
      setIdeaHistory([]);
      return;
    }
    setIdeaHistory(loadHistoryFromStorage(user.id));
  }, [user?.id]);

  const pushCurrentIdeasToHistory = useCallback(
    (platformUsed: PlatformOption) => {
      if (!user?.id) return;
      const prev = ideasRef.current;
      if (prev.length === 0) return;
      const entry: WhatToPostHistoryEntry = {
        id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        platform: platformUsed,
        ideas: prev.map((i) => ({ ...i })),
      };
      setIdeaHistory((h) => {
        const next = [entry, ...h].slice(0, MAX_IDEA_HISTORY);
        saveHistoryToStorage(user.id, next);
        return next;
      });
    },
    [user?.id]
  );

  const restoreHistoryEntry = useCallback(
    (entry: WhatToPostHistoryEntry) => {
      if (!user?.id) return;
      if (ideasRef.current.length > 0) {
        pushCurrentIdeasToHistory(selectedPlatform);
      }
      const platformOk = PLATFORM_OPTIONS.some((p) => p.id === entry.platform) ? entry.platform : "instagram";
      setIdeas(entry.ideas.map((i) => ({ ...i })));
      setSelectedPlatform(platformOk);
      setHasGenerated(true);
      setHistoryOpen(false);
      showToast?.("Loaded this generation.", "success");
    },
    [user?.id, selectedPlatform, pushCurrentIdeasToHistory, showToast]
  );

  const deleteHistoryEntry = useCallback(
    (entryId: string) => {
      if (!user?.id) return;
      setIdeaHistory((h) => {
        const next = h.filter((e) => e.id !== entryId);
        saveHistoryToStorage(user.id, next);
        return next;
      });
      showToast?.("Removed from history.", "success");
    },
    [user?.id, showToast]
  );

  // Check if user has access to advanced planner (Elite, Agency, or Admin)
  const hasAdvancedAccess = user?.plan === 'Elite' || user?.plan === 'Agency' || user?.role === 'Admin';

  const handleAdvancedClick = () => {
    if (hasAdvancedAccess) {
      onOpenAdvanced();
    } else {
      setShowUpgradeModal(true);
    }
  };
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('12:00');

  useEffect(() => {
    if (drawerOpen) {
      setDraftSettings(settings);
    }
  }, [drawerOpen, settings]);

  // Persist ideas to localStorage whenever they change
  useEffect(() => {
    if (ideas.length > 0) {
      try {
        localStorage.setItem('whatToPostIdeas', JSON.stringify(ideas));
        localStorage.setItem('whatToPostPlatform', selectedPlatform);
      } catch { /* ignore storage errors */ }
    }
  }, [ideas, selectedPlatform]);

  const fetchIdeas = useCallback(
    async (opts: {
      swapId?: string;
      existingIdeas?: DailyPostIdea[];
      overrides?: Partial<WhatToPostSettings>;
      platform?: PlatformOption;
      hint?: string;
    } = {}) => {
      if (!user?.id) return;
      const platformToUse = opts.platform || selectedPlatform;
      const s = { ...settings, ...opts.overrides };
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      
      try {
        // For My Page, we would analyze fan hub analytics
        // For Instagram/Facebook, use Gemini
        const res = await fetch('/api/generateDailyPostIdeas', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            platform: platformToUse === 'mypage' ? 'fan_hub' : platformToUse === 'x' ? 'twitter' : platformToUse,
            goal: s.goal,
            effort: s.effort,
            format: platformToUse === 'instagram' ? s.format : 'auto',
            tone: s.tone,
            useTrends: true, // Always use trends - integrated into idea generation
            includeTrendContext: true, // Include trend context in response for display
            spicyMode: s.spicyMode ?? false,
            swapId: opts.swapId,
            existingIdeas: opts.existingIdeas,
            // For Instagram, generate one idea per format when format is 'auto'
            generateAllFormats: platformToUse === 'instagram' && s.format === 'auto',
            // For My Page, include analytics context
            analyzeMyPageEngagement: platformToUse === 'mypage',
            // Optional creator hint for guiding idea generation
            creatorHint: opts.hint || '',
            prioritizeCreatorPersonality: s.prioritizeCreatorPersonality === true,
          }),
        });
        const data = await res.json();
        if (data.error && !data.ideas) {
          showToast(data.error || 'Failed to generate ideas', 'error');
          return;
        }
        const newIdeas = Array.isArray(data.ideas) ? data.ideas : [];
        if (opts.swapId && newIdeas.length > 0 && opts.existingIdeas) {
          const idx = opts.existingIdeas.findIndex((i) => i.id === opts.swapId);
          if (idx >= 0) {
            const merged = [...opts.existingIdeas];
            merged[idx] = newIdeas[0];
            setIdeas(merged);
            setSwapIndex(null);
            showToast('Idea swapped.', 'success');
            return;
          }
        }
        if (newIdeas.length > 0 && !opts.swapId && ideasRef.current.length > 0 && user?.id) {
          pushCurrentIdeasToHistory(platformToUse);
        }
        setIdeas(newIdeas);
        setHasGenerated(true);
        if (data.settings && typeof data.settings === 'object') {
          setSettings((prev) => ({ ...prev, ...data.settings }));
          setDraftSettings((prev) => ({ ...prev, ...data.settings }));
        }
        if (opts.overrides) setSettings((prev) => ({ ...prev, ...opts.overrides }));
        if (opts.swapId) setSwapIndex(null);
      } catch (e: any) {
        showToast(e?.message || 'Failed to load ideas', 'error');
      } finally {
        setLoading(false);
        setRegeneratingAll(false);
      }
    },
    [user?.id, settings, selectedPlatform, showToast, pushCurrentIdeasToHistory]
  );

  // Don't auto-generate on page load - wait for user to click Generate Ideas
  // useEffect removed

  const handleGenerateIdeas = () => {
    setLoading(true);
    setRegeneratingAll(true);
    fetchIdeas({ platform: selectedPlatform, hint: creatorHint });
  };

  const handleApplyQuickSettings = () => {
    setSettings(draftSettings);
    setDrawerOpen(false);
  };

  const handleSwap = (idea: DailyPostIdea, index: number) => {
    setSwapIndex(index);
    fetchIdeas({ swapId: idea.id, existingIdeas: ideas });
  };

  const buildCaptionFromIdea = (idea: DailyPostIdea): string => {
    const parts: string[] = [idea.hook];
    if (idea.captionStarter) parts.push(idea.captionStarter);
    if (idea.shotList?.length) parts.push('\nWhat to show:\n' + idea.shotList.map((s) => `• ${s}`).join('\n'));
    if (idea.cta) parts.push(idea.cta);
    if (idea.hashtags?.length) parts.push(idea.hashtags.join(' '));
    return parts.join('\n\n');
  };

  const handleWriteCaption = (idea: DailyPostIdea) => {
    const content = stripStrategyFormatPrefix(buildCaptionFromIdea(idea));
    const platformMap: Record<PlatformOption, Platform> = {
      instagram: 'Instagram',
      facebook: 'Facebook',
      x: 'X',
      mypage: 'Instagram', // Default for Fan Hub posts
    };
    const targetPlatform = platformMap[selectedPlatform];
    const igType =
      targetPlatform === 'Instagram'
        ? instagramPostTypeFromContentFormat(idea.format)
        : undefined;
    const draft = {
      id: `draft_${idea.id}_${Date.now()}`,
      content,
      platforms: [targetPlatform],
      postGoal: settings.goal === 'engagement' ? 'engagement' : settings.goal === 'reach' ? 'brand_awareness' : 'engagement',
      postTone: settings.tone || 'friendly',
      mediaUrl: undefined,
      mediaType: 'image',
      ...(igType ? { instagramPostType: igType } : {}),
    };
    try {
      const draftJson = JSON.stringify(draft);
      localStorage.setItem('draftPostToEdit', draftJson);
      try {
        sessionStorage.setItem('draftPostToEdit', draftJson);
      } catch {
        /* ignore */
      }
      setActivePage('compose');
      if (window.history?.pushState) window.history.pushState({}, '', '/compose');
      showToast('Draft opened in Compose.', 'success');
    } catch (e) {
      showToast('Failed to open draft.', 'error');
    }
    setUseThisIdea(null);
  };

  const handleSchedule = (idea: DailyPostIdea) => {
    if (!scheduleDate.trim()) {
      showToast('Pick a date first.', 'error');
      return;
    }
    const dateStr = `${scheduleDate}T${scheduleTime}:00.000Z`;
    
    // Map format to calendar type
    const formatToType: Record<string, string> = {
      reel: 'Reel',
      carousel: 'Post',
      photo: 'Post',
      story: 'Story',
      video: 'Post',
      text: 'Post',
      poll: 'Post',
      tweet: 'Post',
      thread: 'Post',
    };
    
    // Map platform to Platform type
    const platformToName: Record<PlatformOption, Platform> = {
      instagram: 'Instagram',
      facebook: 'Facebook',
      x: 'X',
      mypage: 'Instagram', // Calendar doesn't have My Page yet, default to Instagram
    };
    
    const event: CalendarEvent = {
      id: `cal_${idea.id}_${Date.now()}`,
      title: `📌 ${idea.title}`,
      date: dateStr,
      type: formatToType[idea.format?.toLowerCase() || 'post'] || 'Post',
      platform: platformToName[selectedPlatform],
      status: 'Draft',
      description: `POST IDEA:\n${idea.hook}\n\nWHAT TO SHOW:\n${idea.shotList?.join('\n• ') || ''}\n\n${idea.captionStarter || ''}`,
    };
    addCalendarEvent(event).then(() => {
      showToast('Added to calendar as a draft reminder.', 'success');
      setUseThisIdea(null);
      setScheduleDate('');
      setScheduleTime('12:00');
    }).catch(() => showToast('Failed to add to calendar.', 'error'));
  };

  const handleSaveToIdeaBank = async (idea: DailyPostIdea) => {
    if (!user?.id) return;
    const id = `saved_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    try {
      await setDoc(doc(db, 'users', user.id, 'savedIdeas', id), {
        id,
        creatorId: user.id,
        createdAt: new Date().toISOString(),
        settings,
        idea,
      });
      showToast('Saved to Idea Bank.', 'success');
    } catch (e) {
      showToast('Failed to save.', 'error');
    }
    setUseThisIdea(null);
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">What to post today</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Instant ideas—no form to fill.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            <SettingsIcon className="w-4 h-4" />
            Quick settings
          </button>
          <button
            type="button"
            onClick={handleAdvancedClick}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Advanced planner
            {!hasAdvancedAccess && <span className="text-xs bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 rounded">Elite</span>}
          </button>
        </div>
      </div>

      {ideaHistory.length > 0 && (
        <div className="mb-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-100/80 dark:hover:bg-gray-700/50 transition-colors"
          >
            <span className="flex flex-col sm:flex-row sm:items-center sm:gap-2 min-w-0">
              <span className="flex items-center gap-2">
                <span aria-hidden>🕐</span>
                <span>Idea history</span>
                <span className="font-normal text-gray-500 dark:text-gray-400">
                  ({ideaHistory.length} saved)
                </span>
              </span>
              {!historyOpen && (
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400 sm:ml-1">
                  — tap &quot;Show list&quot; to load a past generation
                </span>
              )}
            </span>
            <span className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1 text-xs font-semibold text-primary-600 dark:text-primary-400">
              {historyOpen ? "Hide list" : "Show list"}
            </span>
          </button>
          {historyOpen && (
            <ul className="border-t border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
              {ideaHistory.map((entry) => {
                const plat = PLATFORM_OPTIONS.find((p) => p.id === entry.platform);
                return (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white/60 dark:bg-gray-900/20"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {new Date(entry.createdAt).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {plat?.icon} {plat?.label ?? entry.platform} · {entry.ideas.length} idea
                        {entry.ideas.length === 1 ? "" : "s"}
                        {entry.ideas[0]?.title ? ` · ${entry.ideas[0].title.slice(0, 48)}${entry.ideas[0].title.length > 48 ? "…" : ""}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => restoreHistoryEntry(entry)}
                        className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteHistoryEntry(entry.id)}
                        className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800"
                        title="Remove from history"
                        aria-label="Remove from history"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Quick Settings Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40" onClick={() => setDrawerOpen(false)}>
          <div
            className="mt-16 mx-4 w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-xl p-6 border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Quick settings</h2>
              <button type="button" onClick={() => setDrawerOpen(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              {/* Platform Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Platform</label>
                <div className="flex gap-2">
                  {PLATFORM_OPTIONS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPlatform(p.id)}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        selectedPlatform === p.id
                          ? 'bg-primary-600 text-white shadow-md'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      <span>{p.icon}</span>
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Goal */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Goal</label>
                <div className="flex flex-wrap gap-2">
                  {GOAL_OPTIONS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setDraftSettings((p) => ({ ...p, goal: g.id }))}
                      className={`px-3 py-1.5 rounded-md text-sm ${draftSettings.goal === g.id ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preferred Format - Only show for Instagram/X */}
              {(selectedPlatform === 'instagram' || selectedPlatform === 'x') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preferred format</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setDraftSettings((p) => ({ ...p, format: 'auto' }))}
                      className={`px-3 py-1.5 rounded-md text-sm ${draftSettings.format === 'auto' ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                    >
                      All formats
                    </button>
                    {FORMAT_OPTIONS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setDraftSettings((p) => ({ ...p, format: f.id }))}
                        className={`px-3 py-1.5 rounded-md text-sm ${draftSettings.format === f.id ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    "All formats" generates one idea for each: Reel, Carousel, Photo, Story
                  </p>
                </div>
              )}

              {/* My Page Analytics Info */}
              {selectedPlatform === 'mypage' && (
                <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
                  <p className="text-sm text-indigo-700 dark:text-indigo-300">
                    <strong>My Page ideas</strong> are generated by analyzing your Fan Hub analytics—likes, comments, tips, and engagement patterns—to suggest content that resonates with your fans.
                  </p>
                </div>
              )}

              {/* Trends info - now always included */}
              <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                <p className="text-sm text-orange-700 dark:text-orange-300 flex items-center gap-2">
                  <span>🔥</span>
                  <span><strong>Trends included</strong> — Ideas are automatically based on what's trending in your niche.</span>
                </p>
              </div>

              {/* Personality Override overrides tone/sliders (same as Compose when override is on) */}
              <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1" id="what-to-post-personality-label">
                    <span className="block text-sm font-medium text-gray-900 dark:text-white">
                      Personality Override first
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Use your{" "}
                      <strong className="font-medium text-gray-700 dark:text-gray-300">Personality Override</strong> text from
                      Settings as the main voice. Tone and style sliders are ignored when they conflict.
                      {!user.settings?.creatorPersonality?.trim() ? (
                        <span className="block mt-1 text-amber-600 dark:text-amber-400">
                          Add Personality Override text in Settings → Profile & AI to enable this.
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={draftSettings.prioritizeCreatorPersonality === true}
                    aria-labelledby="what-to-post-personality-label"
                    disabled={!user.settings?.creatorPersonality?.trim()}
                    onClick={() =>
                      setDraftSettings((p) => ({
                        ...p,
                        prioritizeCreatorPersonality: !p.prioritizeCreatorPersonality,
                      }))
                    }
                    className={`relative inline-block h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 ${
                      draftSettings.prioritizeCreatorPersonality
                        ? "bg-primary-600"
                        : "bg-gray-200 dark:bg-gray-600"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-in-out ${
                        draftSettings.prioritizeCreatorPersonality ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleApplyQuickSettings}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Use This Idea Modal */}
      {useThisIdea && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setUseThisIdea(null)}>
          <div
            className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-xl p-6 border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Use this idea</h3>
              <button type="button" onClick={() => setUseThisIdea(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            {/* Idea preview */}
            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <p className="font-medium text-gray-900 dark:text-white text-sm">{useThisIdea.title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{useThisIdea.hook}</p>
            </div>
            
            <div className="space-y-3">
              {/* Primary action: Write caption */}
              <button
                type="button"
                onClick={() => handleWriteCaption(useThisIdea)}
                className="w-full py-3 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 flex items-center justify-center gap-2"
              >
                <span>✏️</span>
                Write Caption & Create Post
              </button>
              
              {/* Schedule to calendar */}
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Schedule to Calendar (as a reminder to create this post)</p>
                <div className="flex gap-2 items-end">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm px-3 py-2"
                    />
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm px-3 py-2"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSchedule(useThisIdea)}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                  >
                    <CalendarIcon className="w-4 h-4" />
                    Add
                  </button>
                </div>
              </div>
              
              {/* Save to Idea Bank - Only show for Elite/Agency users */}
              {hasAdvancedAccess && (
                <>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSaveToIdeaBank(useThisIdea)}
                      className="flex-1 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-center gap-2"
                    >
                      <span>💾</span>
                      Save to Idea Bank
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActivePage('strategy');
                        if (window.history?.pushState) window.history.pushState({}, '', '/plan-my-week?tab=savedIdeas');
                        setUseThisIdea(null);
                      }}
                      className="py-2.5 px-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
                      title="View Idea Bank"
                    >
                      📚
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                    Idea Bank saves ideas for later. Access it from Advanced Planner → Saved Ideas.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Initial State - Before generating */}
      {!hasGenerated && !loading && (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-gradient-to-br from-orange-400 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">🔥</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Trend-powered post ideas</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
            {selectedPlatform === 'instagram' && 'Get trend-based Instagram ideas with visual previews for Reels, Carousels, Photos, and Stories.'}
            {selectedPlatform === 'facebook' && 'Get trending Facebook post ideas tailored for maximum engagement.'}
            {selectedPlatform === 'x' && 'Get trending X post ideas optimized for reach and engagement.'}
            {selectedPlatform === 'mypage' && 'Get ideas based on trends + what your fans love—analyzed from your engagement data.'}
          </p>
          <div className="flex justify-center gap-3 mb-6">
            {PLATFORM_OPTIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlatform(p.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedPlatform === p.id
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <span>{p.icon}</span>
                <span>{p.label}</span>
              </button>
            ))}
          </div>
          
          {/* Optional hint input */}
          <div className="max-w-md mx-auto mb-4">
            <input
              type="text"
              value={creatorHint}
              onChange={(e) => setCreatorHint(e.target.value)}
              placeholder="Have an idea in mind? (optional)"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
              E.g., "beach photos", "workout motivation", "cooking video" — or leave blank for AI to surprise you
            </p>
          </div>
          
          <button
            type="button"
            onClick={handleGenerateIdeas}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700"
          >
            <SparklesIcon className="w-5 h-5" />
            Generate Ideas
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && ideas.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
          <RefreshIcon className="w-10 h-10 animate-spin mb-4" />
          <p>Generating ideas for {PLATFORM_OPTIONS.find(p => p.id === selectedPlatform)?.label}…</p>
        </div>
      )}

      {/* Ideas Grid */}
      {hasGenerated && !loading && ideas.length === 0 && (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <p>No ideas generated. Try again.</p>
          <button type="button" onClick={handleGenerateIdeas} className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
            Generate Ideas
          </button>
        </div>
      )}

      {ideas.length > 0 && (
        <>
          {/* Header with back button, platform indicator, and regenerate */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Back/Start Over button */}
              <button
                type="button"
                onClick={() => {
                  setIdeas([]);
                  setHasGenerated(false);
                  try {
                    localStorage.removeItem('whatToPostIdeas');
                  } catch { /* ignore */ }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                ✕ Clear
              </button>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:inline">Showing ideas for:</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-sm font-medium">
                  {PLATFORM_OPTIONS.find(p => p.id === selectedPlatform)?.icon}
                  {PLATFORM_OPTIONS.find(p => p.id === selectedPlatform)?.label}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-xs font-medium">
                🔥 Trend-powered
              </span>
              <button
                type="button"
                onClick={handleGenerateIdeas}
                disabled={regeneratingAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
              >
                {regeneratingAll ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <RefreshIcon className="w-4 h-4" />}
                <span className="hidden sm:inline">Regenerate</span>
              </button>
            </div>
          </div>
          
          {/* Ideas Grid - fixed layout */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {ideas.map((idea, index) => (
              <PostIdeaCard
                key={idea.id}
                idea={idea}
                platform={selectedPlatform}
                onUse={() => setUseThisIdea(idea)}
                onSwap={() => handleSwap(idea, index)}
                swapping={swapIndex === index}
              />
            ))}
          </div>
        </>
      )}

      {/* Upgrade Modal for Advanced Planner */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <SparklesIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                Upgrade to Elite
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                The Advanced Planner with full content strategy tools is available on the Elite plan. 
                Get multi-week roadmaps, trend analysis, and premium planning features.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowUpgradeModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Maybe later
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowUpgradeModal(false);
                    setActivePage('pricing');
                  }}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700"
                >
                  View plans
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
