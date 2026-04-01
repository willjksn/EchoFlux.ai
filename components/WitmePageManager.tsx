import React, { useEffect, useMemo, useState } from 'react';
import { auth } from '../firebaseConfig';
import { useAppContext } from './AppContext';
import { PlusIcon, TrashIcon, RefreshIcon, GlobeIcon } from './icons/UIIcons';
import { WitmeHomepage } from './WitmeHomepage';

type WitmeFeatureCard = {
  title: string;
  description: string;
  icon: string;
};

type WitmeLegalLink = {
  label: string;
  url: string;
};

type WitmeLandingConfig = {
  heroBadge: string;
  heroTitle: string;
  heroDescription: string;
  heroTrustText: string;
  featureCards: WitmeFeatureCard[];
  trustItems: string[];
  liveMoments: string[];
  legalLinks: WitmeLegalLink[];
};

type WitmeAnalyticsResponse = {
  totals: {
    events: number;
    pageViews: number;
    uniqueVisitors: number;
    homePageViews: number;
    discoverPageViews: number;
    creatorPageViews: number;
    exploreClicks: number;
    creatorCardClicks: number;
    legalLinkClicks: number;
  };
  byEvent: Record<string, number>;
  topPaths: Array<{ path: string; count: number }>;
  topReferrers: Array<{ host: string; count: number }>;
  dailySeries: Array<{ date: string; totalEvents: number; pageViews: number; creatorCardClicks: number }>;
  topCreatorClicks: Array<{ handle: string; clicks: number }>;
  funnel: {
    homePageViews: number;
    exploreClicks: number;
    creatorCardClicks: number;
    exploreRateFromHomePct: number;
    creatorClickRateFromExplorePct: number;
    creatorClickRateFromHomePct: number;
  };
  ctaCtr: {
    exploreFromAllViewsPct: number;
    creatorCardFromAllViewsPct: number;
    legalLinksFromAllViewsPct: number;
  };
};

const DEFAULT_CONFIG: WitmeLandingConfig = {
  heroBadge: 'witme.io',
  heroTitle: 'Find the real creator page first.',
  heroDescription:
    'Verify creator pages, then support, unlock, message, and book directly in one trusted fan flow.',
  heroTrustText: 'Verified fan-safe pages powered by EchoFlux.ai',
  featureCards: [
    { title: 'Start memberships', description: 'Join ongoing access when a creator opens member tiers.', icon: '👥' },
    { title: 'Unlock store drops', description: 'Get access to paid posts, drops, and off-feed content from Store.', icon: '🔓' },
    { title: 'Send direct support', description: 'Tip creators directly when support is enabled on their page.', icon: '💸' },
  ],
  trustItems: ['Verified creator page identity', 'Secure checkout', 'Creator-controlled access', 'Built for fan safety'],
  liveMoments: ['stormijxo posted a new private drop', 'New session slots opened', 'Fans unlocked verified content'],
  legalLinks: [
    { label: 'Terms', url: '/fan-terms-of-use.html' },
    { label: 'Privacy', url: '/fan-privacy-policy.html' },
    { label: 'Creator Terms', url: '/creator-terms-of-use.html' },
    { label: 'Payments', url: '/payment-terms.html' },
    { label: 'Guidelines', url: '/content-guidelines.html' },
    { label: 'Support', url: 'mailto:contact@echoflux.ai' },
  ],
};

const splitLines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const joinLines = (items: string[]): string => items.join('\n');
const pct = (value: number): string => `${(Number.isFinite(value) ? value : 0).toFixed(2)}%`;

export const WitmePageManager: React.FC = () => {
  const { user, showToast } = useAppContext();
  const [tab, setTab] = useState<'live' | 'control' | 'analytics'>('live');
  const [draft, setDraft] = useState<WitmeLandingConfig>(DEFAULT_CONFIG);
  const [published, setPublished] = useState<WitmeLandingConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState<number>(30);
  const [analytics, setAnalytics] = useState<WitmeAnalyticsResponse | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const trustItemsText = useMemo(() => joinLines(draft.trustItems), [draft.trustItems]);
  const liveMomentsText = useMemo(() => joinLines(draft.liveMoments), [draft.liveMoments]);

  const getToken = async (): Promise<string | null> => {
    try {
      return (await auth.currentUser?.getIdToken(true)) || null;
    } catch {
      return null;
    }
  };

  const loadConfig = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('You must be signed in');
      const res = await fetch('/api/adminWitmeLandingConfig', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load Witme config');
      const data = await res.json();
      setDraft(data.draft || DEFAULT_CONFIG);
      setPublished(data.published || DEFAULT_CONFIG);
      setUpdatedAt(data.updatedAt || null);
      setPublishedAt(data.publishedAt || null);
    } catch (error: any) {
      showToast(error?.message || 'Failed to load Witme page config', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async (days = analyticsDays) => {
    setAnalyticsLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('You must be signed in');
      const res = await fetch(`/api/adminWitmeAnalytics?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load Witme analytics');
      const data = await res.json();
      setAnalytics(data as WitmeAnalyticsResponse);
    } catch (error: any) {
      showToast(error?.message || 'Failed to load Witme analytics', 'error');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'Admin') {
      loadConfig();
    }
  }, [user?.role]);

  useEffect(() => {
    if (tab === 'analytics' && user?.role === 'Admin') {
      loadAnalytics(analyticsDays);
    }
  }, [tab, analyticsDays, user?.role]);

  const saveDraft = async () => {
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('You must be signed in');
      const res = await fetch('/api/adminWitmeLandingConfig', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'saveDraft', config: draft }),
      });
      if (!res.ok) throw new Error('Failed to save draft');
      showToast('Witme draft saved', 'success');
      await loadConfig();
    } catch (error: any) {
      showToast(error?.message || 'Failed to save draft', 'error');
    } finally {
      setSaving(false);
    }
  };

  const publishDraft = async () => {
    setPublishing(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('You must be signed in');
      const res = await fetch('/api/adminWitmeLandingConfig', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'publish', config: draft }),
      });
      if (!res.ok) throw new Error('Failed to publish');
      showToast('Witme page published', 'success');
      await loadConfig();
    } catch (error: any) {
      showToast(error?.message || 'Failed to publish', 'error');
    } finally {
      setPublishing(false);
    }
  };

  if (user?.role !== 'Admin') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
        Admin access required.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Witme Page</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage witme.io landing content, legal links, and traffic analytics.
          </p>
        </div>
        <button
          onClick={loadConfig}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <RefreshIcon className="w-4 h-4" />
          Reload
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['live', 'control', 'analytics'] as const).map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === item
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {item === 'live' ? 'Live View' : item === 'control' ? 'Control Panel' : 'Analytics'}
          </button>
        ))}
      </div>

      {tab === 'live' && (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Published page preview (actual Witme renderer, safe in-app).
            </p>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {publishedAt ? `Last published: ${new Date(publishedAt).toLocaleString()}` : 'Not published yet'}
            </div>
          </div>
          <div className="max-h-[78vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <WitmeHomepage
              previewConfig={published}
              disableSeo
              disableTracking
              disableRemoteConfig
              onExploreCreators={() => {
                window.open('/discover?witmePreview=1', '_blank', 'noopener,noreferrer');
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/?witmePreview=1"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              <GlobeIcon className="w-4 h-4" />
              Open Live Preview
            </a>
            <a
              href="/discover?witmePreview=1"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Open Discover Preview
            </a>
          </div>
        </div>
      )}

      {tab === 'control' && (
        <div className="space-y-4">
          {loading ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
              Loading Witme settings...
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Hero</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    value={draft.heroBadge}
                    onChange={(e) => setDraft((prev) => ({ ...prev, heroBadge: e.target.value }))}
                    placeholder="Hero badge"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                  <input
                    value={draft.heroTrustText}
                    onChange={(e) => setDraft((prev) => ({ ...prev, heroTrustText: e.target.value }))}
                    placeholder="Hero trust text"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                  <input
                    value={draft.heroTitle}
                    onChange={(e) => setDraft((prev) => ({ ...prev, heroTitle: e.target.value }))}
                    placeholder="Hero title"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                  <textarea
                    value={draft.heroDescription}
                    onChange={(e) => setDraft((prev) => ({ ...prev, heroDescription: e.target.value }))}
                    rows={3}
                    placeholder="Hero description"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Feature Cards</h2>
                  <button
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        featureCards: [...prev.featureCards, { title: 'New card', description: 'Describe this card', icon: '✨' }],
                      }))
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Add card
                  </button>
                </div>
                <div className="space-y-3">
                  {draft.featureCards.map((card, idx) => (
                    <div key={`${idx}-${card.title}`} className="grid gap-2 rounded-lg border border-gray-200 p-3 md:grid-cols-12 dark:border-gray-700">
                      <input
                        value={card.icon}
                        onChange={(e) =>
                          setDraft((prev) => {
                            const next = [...prev.featureCards];
                            next[idx] = { ...next[idx], icon: e.target.value };
                            return { ...prev, featureCards: next };
                          })
                        }
                        className="rounded-md border border-gray-300 px-2 py-2 text-sm md:col-span-1 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                      <input
                        value={card.title}
                        onChange={(e) =>
                          setDraft((prev) => {
                            const next = [...prev.featureCards];
                            next[idx] = { ...next[idx], title: e.target.value };
                            return { ...prev, featureCards: next };
                          })
                        }
                        className="rounded-md border border-gray-300 px-2 py-2 text-sm md:col-span-4 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                      <input
                        value={card.description}
                        onChange={(e) =>
                          setDraft((prev) => {
                            const next = [...prev.featureCards];
                            next[idx] = { ...next[idx], description: e.target.value };
                            return { ...prev, featureCards: next };
                          })
                        }
                        className="rounded-md border border-gray-300 px-2 py-2 text-sm md:col-span-6 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                      <button
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            featureCards: prev.featureCards.filter((_, index) => index !== idx),
                          }))
                        }
                        className="inline-flex items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 md:col-span-1 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                  <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Trust Strip Items</h2>
                  <textarea
                    rows={7}
                    value={trustItemsText}
                    onChange={(e) => setDraft((prev) => ({ ...prev, trustItems: splitLines(e.target.value) }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                  <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Live Moments</h2>
                  <textarea
                    rows={7}
                    value={liveMomentsText}
                    onChange={(e) => setDraft((prev) => ({ ...prev, liveMoments: splitLines(e.target.value) }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Footer Legal Links</h2>
                  <button
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        legalLinks: [...prev.legalLinks, { label: 'New Link', url: '/new-link' }],
                      }))
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Add link
                  </button>
                </div>
                <div className="space-y-2">
                  {draft.legalLinks.map((link, idx) => (
                    <div key={`${idx}-${link.label}`} className="grid gap-2 md:grid-cols-12">
                      <input
                        value={link.label}
                        onChange={(e) =>
                          setDraft((prev) => {
                            const next = [...prev.legalLinks];
                            next[idx] = { ...next[idx], label: e.target.value };
                            return { ...prev, legalLinks: next };
                          })
                        }
                        className="rounded-md border border-gray-300 px-2 py-2 text-sm md:col-span-3 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                      <input
                        value={link.url}
                        onChange={(e) =>
                          setDraft((prev) => {
                            const next = [...prev.legalLinks];
                            next[idx] = { ...next[idx], url: e.target.value };
                            return { ...prev, legalLinks: next };
                          })
                        }
                        className="rounded-md border border-gray-300 px-2 py-2 text-sm md:col-span-8 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                      <button
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            legalLinks: prev.legalLinks.filter((_, index) => index !== idx),
                          }))
                        }
                        className="inline-flex items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 md:col-span-1 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={saveDraft}
                  disabled={saving || publishing}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200"
                >
                  {saving ? 'Saving...' : 'Save Draft'}
                </button>
                <button
                  onClick={publishDraft}
                  disabled={saving || publishing}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-primary-700"
                >
                  {publishing ? 'Publishing...' : 'Publish Live'}
                </button>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {updatedAt ? `Draft updated: ${new Date(updatedAt).toLocaleString()}` : 'No edits yet'}
                </div>
              </div>

            </>
          )}
        </div>
      )}

      {tab === 'analytics' && (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Witme Traffic Analytics</h2>
            <select
              value={analyticsDays}
              onChange={(e) => setAnalyticsDays(Number(e.target.value))}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>

          {analyticsLoading ? (
            <p className="text-sm text-gray-500 dark:text-gray-300">Loading analytics...</p>
          ) : analytics ? (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Events</p>
                  <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{analytics.totals.events}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Page Views</p>
                  <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{analytics.totals.pageViews}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Unique Visitors</p>
                  <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{analytics.totals.uniqueVisitors}</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Home Views</p>
                  <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{analytics.totals.homePageViews}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Discover Views</p>
                  <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{analytics.totals.discoverPageViews}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Creator Page Views</p>
                  <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{analytics.totals.creatorPageViews}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Funnel</p>
                  <div className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-200">
                    <div className="flex justify-between"><span>Home views</span><span className="font-semibold">{analytics.funnel.homePageViews}</span></div>
                    <div className="flex justify-between"><span>Explore clicks</span><span className="font-semibold">{analytics.funnel.exploreClicks}</span></div>
                    <div className="flex justify-between"><span>Creator clicks</span><span className="font-semibold">{analytics.funnel.creatorCardClicks}</span></div>
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Funnel CTR</p>
                  <div className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-200">
                    <div className="flex justify-between"><span>Home → Explore</span><span className="font-semibold">{pct(analytics.funnel.exploreRateFromHomePct)}</span></div>
                    <div className="flex justify-between"><span>Explore → Creator</span><span className="font-semibold">{pct(analytics.funnel.creatorClickRateFromExplorePct)}</span></div>
                    <div className="flex justify-between"><span>Home → Creator</span><span className="font-semibold">{pct(analytics.funnel.creatorClickRateFromHomePct)}</span></div>
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">CTA CTR</p>
                  <div className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-200">
                    <div className="flex justify-between"><span>Explore clicks / views</span><span className="font-semibold">{pct(analytics.ctaCtr.exploreFromAllViewsPct)}</span></div>
                    <div className="flex justify-between"><span>Creator clicks / views</span><span className="font-semibold">{pct(analytics.ctaCtr.creatorCardFromAllViewsPct)}</span></div>
                    <div className="flex justify-between"><span>Legal clicks / views</span><span className="font-semibold">{pct(analytics.ctaCtr.legalLinksFromAllViewsPct)}</span></div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Top Paths</h3>
                  <div className="space-y-1">
                    {analytics.topPaths.map((row) => (
                      <div key={row.path} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                        <span className="text-gray-700 dark:text-gray-200">{row.path}</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{row.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Top Referrers</h3>
                  <div className="space-y-1">
                    {analytics.topReferrers.map((row) => (
                      <div key={row.host} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                        <span className="text-gray-700 dark:text-gray-200">{row.host}</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{row.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Top Creator Clicks</h3>
                  <div className="space-y-1">
                    {(analytics.topCreatorClicks || []).map((row) => (
                      <div key={row.handle} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                        <span className="text-gray-700 dark:text-gray-200">{row.handle}</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{row.clicks}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Event Mix</h3>
                  <div className="space-y-1">
                    {Object.entries(analytics.byEvent || {})
                      .sort((a, b) => b[1] - a[1])
                      .map(([name, count]) => (
                        <div key={name} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                          <span className="text-gray-700 dark:text-gray-200">{name}</span>
                          <span className="font-semibold text-gray-900 dark:text-white">{count}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Per-Day Page Views</h3>
                <div className="space-y-2">
                  {(() => {
                    const max = Math.max(1, ...(analytics.dailySeries || []).map((d) => d.pageViews));
                    return (analytics.dailySeries || []).map((row) => (
                      <div key={row.date} className="grid grid-cols-[110px_1fr_70px] items-center gap-2 text-xs">
                        <span className="text-gray-500 dark:text-gray-400">{row.date}</span>
                        <div className="h-2 rounded bg-gray-200 dark:bg-gray-700">
                          <div
                            className="h-2 rounded bg-primary-500"
                            style={{ width: `${Math.max(4, (row.pageViews / max) * 100)}%` }}
                          />
                        </div>
                        <span className="text-right font-semibold text-gray-700 dark:text-gray-200">{row.pageViews}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-300">No analytics data yet.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default WitmePageManager;
