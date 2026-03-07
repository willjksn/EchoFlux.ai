import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from './AppContext';
import { DailyPostIdea, WhatToPostSettings, CalendarEvent, Platform } from '../types';
import { auth, db } from '../firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';
import { SparklesIcon, RefreshIcon, SettingsIcon, XMarkIcon, CalendarIcon } from './icons/UIIcons';

type PlatformOption = 'instagram' | 'facebook' | 'x' | 'mypage';

// Visual placeholder card component for post ideas
const PostIdeaCard: React.FC<{
  idea: DailyPostIdea;
  platform: PlatformOption;
  onUse: () => void;
  onSwap: () => void;
  swapping: boolean;
}> = ({ idea, platform, onUse, onSwap, swapping }) => {
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
  const hasAIImage = !!idea.placeholderImage;

  // Fallback emoji visual when no AI image is available
  const getVisualContent = () => {
    const keywords = idea.title?.toLowerCase() || '';
    if (keywords.includes('gaming') || keywords.includes('game') || keywords.includes('setup')) return '🎮';
    if (keywords.includes('food') || keywords.includes('cook') || keywords.includes('recipe')) return '🍳';
    if (keywords.includes('fitness') || keywords.includes('workout') || keywords.includes('gym')) return '💪';
    if (keywords.includes('travel') || keywords.includes('adventure')) return '✈️';
    if (keywords.includes('music') || keywords.includes('song')) return '🎵';
    if (keywords.includes('beauty') || keywords.includes('makeup') || keywords.includes('skin')) return '💄';
    if (keywords.includes('fashion') || keywords.includes('outfit') || keywords.includes('style')) return '👗';
    if (keywords.includes('pet') || keywords.includes('dog') || keywords.includes('cat')) return '🐾';
    if (keywords.includes('morning') || keywords.includes('routine') || keywords.includes('day')) return '☀️';
    if (keywords.includes('night') || keywords.includes('evening')) return '🌙';
    return '✨';
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
      {/* Visual Preview - AI generated image or fallback gradient */}
      <div className="relative h-44 overflow-hidden">
        {hasAIImage ? (
          /* AI-generated placeholder image */
          <img 
            src={idea.placeholderImage} 
            alt={idea.title}
            className="w-full h-full object-cover"
          />
        ) : (
          /* Fallback gradient with emoji */
          <div className={`w-full h-full bg-gradient-to-br ${style.gradient} flex items-center justify-center`}>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-20 text-6xl pointer-events-none select-none">
              {getVisualContent()}
            </div>
          </div>
        )}
        
        {/* Overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        
        {/* Format indicator */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
          <span className="px-2 py-1 bg-black/40 backdrop-blur-sm rounded-md text-white text-xs font-bold">
            {style.label}
          </span>
          {isTrending && (
            <span className="px-2 py-1 bg-orange-500/90 backdrop-blur-sm rounded-md text-white text-xs font-bold flex items-center gap-1">
              🔥 Trend
            </span>
          )}
        </div>
        
        {/* Platform badge */}
        <div className="absolute top-2 right-2">
          <span className="px-2 py-1 bg-black/40 backdrop-blur-sm rounded-md text-white text-xs font-medium">
            {platform === 'instagram' ? '📸' : platform === 'facebook' ? '📘' : platform === 'x' ? '𝕏' : '💖'}
          </span>
        </div>

        {/* Hook preview on the card */}
        <div className="absolute bottom-2 left-2 right-2">
          <p className="text-white font-bold text-sm leading-snug drop-shadow-lg line-clamp-2">
            "{idea.hook?.slice(0, 55)}{idea.hook && idea.hook.length > 55 ? '...' : ''}"
          </p>
        </div>

        {/* Format icon */}
        <div className="absolute bottom-2 right-2 text-white/70 text-base">
          {style.icon}
        </div>
      </div>

      {/* Content */}
      <div className="p-3 flex-1 flex flex-col">
        <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-2 text-sm leading-tight">{idea.title}</h3>
        
        {idea.shotList?.length > 0 && (
          <div className="mt-2 flex-1">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">What to show</p>
            <ul className="mt-1 space-y-0.5 text-xs text-gray-600 dark:text-gray-300">
              {idea.shotList.slice(0, 2).map((shot, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-primary-500 flex-shrink-0">•</span>
                  <span className="line-clamp-1">{shot}</span>
                </li>
              ))}
              {idea.shotList.length > 2 && (
                <li className="text-gray-400 dark:text-gray-500 text-xs">+{idea.shotList.length - 2} more</li>
              )}
            </ul>
          </div>
        )}

        {/* Trend context if available */}
        {idea.trendContext && (
          <p className="mt-2 text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-2 py-1 rounded line-clamp-1">
            📈 {idea.trendContext}
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onUse}
            className="flex-1 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
          >
            Use this
          </button>
          <button
            type="button"
            onClick={onSwap}
            disabled={swapping}
            className="py-2 px-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
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
};

interface WhatToPostProps {
  onOpenAdvanced: () => void;
}

export const WhatToPost: React.FC<WhatToPostProps> = ({ onOpenAdvanced }) => {
  const { user, showToast, setActivePage, addCalendarEvent } = useAppContext();
  const [ideas, setIdeas] = useState<DailyPostIdea[]>([]);
  const [loading, setLoading] = useState(false);
  const [regeneratingAll, setRegeneratingAll] = useState(false);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [settings, setSettings] = useState<WhatToPostSettings>(DEFAULT_SETTINGS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState<WhatToPostSettings>(DEFAULT_SETTINGS);
  const [useThisIdea, setUseThisIdea] = useState<DailyPostIdea | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformOption>('instagram');
  const [hasGenerated, setHasGenerated] = useState(false);

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

  const fetchIdeas = useCallback(
    async (opts: {
      swapId?: string;
      existingIdeas?: DailyPostIdea[];
      overrides?: Partial<WhatToPostSettings>;
      platform?: PlatformOption;
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
    [user?.id, settings, selectedPlatform, showToast]
  );

  // Don't auto-generate on page load - wait for user to click Generate Ideas
  // useEffect removed

  const handleGenerateIdeas = () => {
    setLoading(true);
    setRegeneratingAll(true);
    fetchIdeas({ platform: selectedPlatform });
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
    const content = buildCaptionFromIdea(idea);
    const platformMap: Record<PlatformOption, Platform> = {
      instagram: 'Instagram',
      facebook: 'Facebook',
      x: 'X',
      mypage: 'Instagram', // Default for Fan Hub posts
    };
    const draft = {
      id: `draft_${idea.id}_${Date.now()}`,
      content,
      platforms: [platformMap[selectedPlatform]],
      postGoal: settings.goal === 'engagement' ? 'engagement' : settings.goal === 'reach' ? 'brand_awareness' : 'engagement',
      postTone: settings.tone || 'friendly',
      mediaUrl: undefined,
      mediaType: 'image',
    };
    try {
      localStorage.setItem('draftPostToEdit', JSON.stringify(draft));
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
          <div className="flex justify-center gap-3 mb-4">
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
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                ← Back
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
