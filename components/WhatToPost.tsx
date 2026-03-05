import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from './AppContext';
import { DailyPostIdea, WhatToPostSettings, CalendarEvent, Platform } from '../types';
import { auth, db } from '../firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';
import { SparklesIcon, RefreshIcon, SettingsIcon, XMarkIcon, CalendarIcon } from './icons/UIIcons';

const GOAL_OPTIONS = [
  { id: 'reach', label: 'Reach' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'balanced_followers_engagement', label: 'Followers' },
  { id: 'sales_subs', label: 'Sales/Subs' },
];
const EFFORT_OPTIONS = [
  { id: 5, label: '5 min' },
  { id: 15, label: '15 min' },
  { id: 30, label: '30+' },
];
const FORMAT_OPTIONS = [
  { id: 'auto', label: 'Auto' },
  { id: 'reel', label: 'Reel' },
  { id: 'carousel', label: 'Carousel' },
  { id: 'photo', label: 'Photo' },
  { id: 'story', label: 'Story' },
];

const DEFAULT_SETTINGS: WhatToPostSettings = {
  platform: 'instagram',
  goal: 'balanced_followers_engagement',
  effort: 15,
  format: 'auto',
  tone: 'relatable',
  useTrends: false,
  spicyMode: false,
};

interface WhatToPostProps {
  onOpenAdvanced: () => void;
}

export const WhatToPost: React.FC<WhatToPostProps> = ({ onOpenAdvanced }) => {
  const { user, showToast, setActivePage, addCalendarEvent } = useAppContext();
  const [ideas, setIdeas] = useState<DailyPostIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [regeneratingAll, setRegeneratingAll] = useState(false);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [settings, setSettings] = useState<WhatToPostSettings>(DEFAULT_SETTINGS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState<WhatToPostSettings>(DEFAULT_SETTINGS);
  const [useThisIdea, setUseThisIdea] = useState<DailyPostIdea | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

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
    if (drawerOpen) setDraftSettings(settings);
  }, [drawerOpen]);

  const fetchIdeas = useCallback(
    async (opts: {
      swapId?: string;
      existingIdeas?: DailyPostIdea[];
      overrides?: Partial<WhatToPostSettings>;
    } = {}) => {
      if (!user?.id) return;
      const s = { ...settings, ...opts.overrides };
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      try {
        const res = await fetch('/api/generateDailyPostIdeas', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            platform: s.platform,
            goal: s.goal,
            effort: s.effort,
            format: s.format,
            tone: s.tone,
            useTrends: s.useTrends ?? false,
            spicyMode: s.spicyMode ?? false,
            swapId: opts.swapId,
            existingIdeas: opts.existingIdeas,
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
        setIdeas(newIdeas.length >= 3 ? newIdeas : newIdeas);
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
    [user?.id, settings, showToast]
  );

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    fetchIdeas();
  }, [user?.id]);

  const handleNewIdeas = () => {
    setRegeneratingAll(true);
    fetchIdeas();
  };

  const handleApplyQuickSettings = () => {
    setSettings(draftSettings);
    setDrawerOpen(false);
    setRegeneratingAll(true);
    fetchIdeas({ overrides: draftSettings });
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
    const draft = {
      id: `draft_${idea.id}_${Date.now()}`,
      content,
      platforms: [settings.platform === 'instagram' ? 'Instagram' : (settings.platform as Platform)],
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
    const event: CalendarEvent = {
      id: `cal_${idea.id}_${Date.now()}`,
      title: idea.title,
      date: dateStr,
      type: idea.format === 'reel' ? 'Reel' : idea.format === 'carousel' ? 'Post' : 'Post',
      platform: (settings.platform === 'instagram' ? 'Instagram' : settings.platform) as Platform,
      status: 'Draft',
    };
    addCalendarEvent(event).then(() => {
      showToast('Added to calendar.', 'success');
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
            onClick={handleNewIdeas}
            disabled={loading || regeneratingAll}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            {regeneratingAll ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
            New ideas
          </button>
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
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Effort</label>
                <div className="flex flex-wrap gap-2">
                  {EFFORT_OPTIONS.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setDraftSettings((p) => ({ ...p, effort: e.id }))}
                      className={`px-3 py-1.5 rounded-md text-sm ${draftSettings.effort === e.id ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preferred format</label>
                <div className="flex flex-wrap gap-2">
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
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="useTrends"
                  checked={draftSettings.useTrends ?? false}
                  onChange={(e) => setDraftSettings((p) => ({ ...p, useTrends: e.target.checked }))}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                <label htmlFor="useTrends" className="text-sm text-gray-700 dark:text-gray-300">Use trends</label>
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

      {useThisIdea && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setUseThisIdea(null)}>
          <div
            className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-xl p-6 border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Use this idea</h3>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleWriteCaption(useThisIdea)}
                className="w-full py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
              >
                Write caption
              </button>
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
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <CalendarIcon className="w-4 h-4" />
                  Schedule
                </button>
              </div>
              <button
                type="button"
                onClick={() => handleSaveToIdeaBank(useThisIdea)}
                className="w-full py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Save to Idea Bank
              </button>
            </div>
            <button type="button" onClick={() => setUseThisIdea(null)} className="mt-4 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading && ideas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
          <RefreshIcon className="w-10 h-10 animate-spin mb-4" />
          <p>Generating ideas…</p>
        </div>
      ) : ideas.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <p>No ideas yet. Click &quot;New ideas&quot; to generate.</p>
          <button type="button" onClick={handleNewIdeas} className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
            New ideas
          </button>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-3">
          {ideas.map((idea, index) => (
            <div
              key={idea.id}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm"
            >
              <div className="p-4">
                <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 capitalize">
                  {idea.format}
                </span>
                <h3 className="mt-2 font-semibold text-gray-900 dark:text-white line-clamp-2">{idea.title}</h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">{idea.hook}</p>
                {idea.shotList?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">What to show</p>
                    <ul className="mt-1 space-y-0.5 text-sm text-gray-700 dark:text-gray-300">
                      {idea.shotList.slice(0, 5).map((shot, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-primary-500">•</span>
                          <span>{shot}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setUseThisIdea(idea)}
                    className="flex-1 min-w-[100px] py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
                  >
                    Use this
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwap(idea, index)}
                    disabled={swapIndex === index}
                    className="py-2 px-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    {swapIndex === index ? <RefreshIcon className="w-4 h-4 animate-spin inline" /> : 'Swap'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
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
