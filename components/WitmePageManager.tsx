import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, firebaseStorageBucket, storage } from '../firebaseConfig';
import {
  firebaseStorageObjectPathFromDownloadUrl,
  isOwnedWitmeShowcaseObjectPath,
  showcaseStorageUrlsToMaybeDelete,
} from '../src/lib/witmeShowcaseStorage';
import { useAppContext } from './AppContext';
import { PlusIcon, TrashIcon, RefreshIcon, GlobeIcon, UploadIcon } from './icons/UIIcons';
import { WitmeHomepage, type WitmeLandingConfig } from './WitmeHomepage';
import { DEFAULT_SHOWCASE_CREATORS, type WitmeShowcaseCreator } from '../src/lib/witmeShowcase';
import {
  clampPan,
  formatObjectPositionPercentPair,
  parseObjectPositionPercentPair,
} from '../src/lib/objectPositionPan';

type WitmeFeatureCard = {
  title: string;
  description: string;
  icon: string;
};

type WitmeLegalLink = {
  label: string;
  url: string;
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
  showcaseCreators: DEFAULT_SHOWCASE_CREATORS.map((c) => ({ ...c })),
};

const mergeWitmeLandingFromApi = (raw: WitmeLandingConfig): WitmeLandingConfig => ({
  ...DEFAULT_CONFIG,
  ...raw,
  showcaseCreators: Array.isArray(raw.showcaseCreators)
    ? raw.showcaseCreators.map((c) => ({
        ...c,
        mediaKind: c.mediaKind === 'video' ? 'video' : 'image',
        mediaObjectPosition:
          typeof c.mediaObjectPosition === 'string' && c.mediaObjectPosition.trim() !== ''
            ? c.mediaObjectPosition.trim()
            : '50% 50%',
      }))
    : DEFAULT_CONFIG.showcaseCreators,
});

const showcaseFrameMediaStyle = (objectPosition?: string): React.CSSProperties => ({
  objectFit: 'cover',
  objectPosition:
    objectPosition != null && String(objectPosition).trim() !== '' ? String(objectPosition).trim() : '50% 50%',
});

const splitLines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const joinLines = (items: string[]): string => items.join('\n');
const pct = (value: number): string => `${(Number.isFinite(value) ? value : 0).toFixed(2)}%`;

const tagsToCsv = (tags: string[]): string => tags.join(', ');
const csvToTags = (csv: string): string[] =>
  csv
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);

const emptyShowcaseRow = (): WitmeShowcaseCreator => ({
  name: '',
  handle: '',
  pageSlug: '',
  imageUrl: '',
  mediaKind: 'image',
  mediaObjectPosition: '50% 50%',
  descriptor: '',
  tags: [],
  spotlight: '',
  linkLive: false,
});

async function deleteOwnedWitmeShowcaseMedia(imageUrl: string | undefined, ownerUid: string | undefined): Promise<void> {
  const uid = ownerUid?.trim();
  const bucket = firebaseStorageBucket?.trim();
  if (!imageUrl?.trim() || !uid || !bucket) return;
  const objectPath = firebaseStorageObjectPathFromDownloadUrl(imageUrl, bucket);
  if (!objectPath || !isOwnedWitmeShowcaseObjectPath(objectPath, uid)) return;
  try {
    await deleteObject(ref(storage, objectPath));
  } catch (e) {
    console.warn('Witme showcase: could not delete storage object', e);
  }
}

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

  const showcaseFileInputRef = useRef<HTMLInputElement>(null);
  const showcasePickIdxRef = useRef<number | null>(null);
  const showcasePanRef = useRef<{
    idx: number;
    startClientX: number;
    startClientY: number;
    startOx: number;
    startOy: number;
  } | null>(null);
  const [showcaseUploadingIdx, setShowcaseUploadingIdx] = useState<number | null>(null);
  /** Showcase `imageUrl` list from last successful load/save (for safe Storage cleanup after save). */
  const lastSavedShowcaseImageUrlsRef = useRef<string[]>([]);

  const onShowcaseFramePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const pan = showcasePanRef.current;
    if (!pan) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const w = Math.max(rect.width, 1);
    const h = Math.max(rect.height, 1);
    const dx = e.clientX - pan.startClientX;
    const dy = e.clientY - pan.startClientY;
    const sens = 0.85;
    const nx = clampPan(pan.startOx - (dx / w) * 100 * sens, 0, 100);
    const ny = clampPan(pan.startOy - (dy / h) * 100 * sens, 0, 100);
    setDraft((prev) => {
      const next = [...prev.showcaseCreators];
      const cur = next[pan.idx];
      if (!cur) return prev;
      next[pan.idx] = { ...cur, mediaObjectPosition: formatObjectPositionPercentPair(nx, ny) };
      return { ...prev, showcaseCreators: next };
    });
    showcasePanRef.current = {
      ...pan,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOx: nx,
      startOy: ny,
    };
  }, []);

  const onShowcaseFramePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    showcasePanRef.current = null;
  }, []);

  const uploadShowcaseMedia = useCallback(
    async (idx: number, file: File) => {
      if (!auth.currentUser) {
        showToast('You must be signed in', 'error');
        return;
      }
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      if (!isVideo && !isImage) {
        showToast('Choose an image or video file', 'error');
        return;
      }
      const maxBytes = isVideo ? 45 * 1024 * 1024 : 12 * 1024 * 1024;
      if (file.size > maxBytes) {
        showToast(isVideo ? 'Video must be under 45MB' : 'Image must be under 12MB', 'error');
        return;
      }
      const safeExt =
        file.name
          .split('.')
          .pop()
          ?.replace(/[^a-zA-Z0-9]/g, '')
          .toLowerCase() || (isVideo ? 'mp4' : 'jpg');
      const uid = auth.currentUser.uid;
      const storagePath = `witme_showcase/${uid}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${safeExt}`;
      setShowcaseUploadingIdx(idx);
      try {
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, file, {
          contentType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
        });
        const downloadUrl = await getDownloadURL(storageRef);
        setDraft((prev) => {
          const next = [...prev.showcaseCreators];
          next[idx] = {
            ...next[idx],
            imageUrl: downloadUrl,
            mediaKind: isVideo ? 'video' : 'image',
            mediaObjectPosition: '50% 50%',
          };
          return { ...prev, showcaseCreators: next };
        });
        showToast(
          isVideo ? 'Video uploaded — click Save draft to persist.' : 'Image uploaded — click Save draft to persist.',
          'success'
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : '';
        if (code === 'storage/unauthorized' || /permission|unauthorized/i.test(msg)) {
          showToast(
            'Upload blocked by Storage rules. Deploy the latest storage.rules (witme_showcase/{yourUid}/...) and sign in with the same account that owns the folder.',
            'error'
          );
        } else {
          showToast(msg || 'Upload failed', 'error');
        }
      } finally {
        setShowcaseUploadingIdx(null);
      }
    },
    [showToast]
  );

  const onShowcaseFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = showcasePickIdxRef.current;
    showcasePickIdxRef.current = null;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (idx === null || !file) return;
    void uploadShowcaseMedia(idx, file);
  };

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
      const draftRaw = (data.draft || DEFAULT_CONFIG) as WitmeLandingConfig;
      const publishedRaw = (data.published || DEFAULT_CONFIG) as WitmeLandingConfig;

      const mergedDraft = mergeWitmeLandingFromApi(draftRaw);
      setDraft(mergedDraft);
      lastSavedShowcaseImageUrlsRef.current = mergedDraft.showcaseCreators
        .map((c) => c.imageUrl.trim())
        .filter(Boolean);
      setPublished(mergeWitmeLandingFromApi(publishedRaw));
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Failed to save draft');
      if ((data as { draft?: WitmeLandingConfig }).draft) {
        const merged = mergeWitmeLandingFromApi((data as { draft: WitmeLandingConfig }).draft);
        const nextUrls = merged.showcaseCreators.map((c) => c.imageUrl.trim()).filter(Boolean);
        const prevUrls = lastSavedShowcaseImageUrlsRef.current;
        const uid = auth.currentUser?.uid;
        for (const url of showcaseStorageUrlsToMaybeDelete(prevUrls, nextUrls)) {
          void deleteOwnedWitmeShowcaseMedia(url, uid);
        }
        lastSavedShowcaseImageUrlsRef.current = nextUrls;
        setDraft(merged);
      }
      if ((data as { published?: WitmeLandingConfig }).published) {
        setPublished(mergeWitmeLandingFromApi((data as { published: WitmeLandingConfig }).published));
      }
      if ((data as { updatedAt?: string }).updatedAt) {
        setUpdatedAt((data as { updatedAt: string }).updatedAt);
      }
      showToast('Witme draft saved', 'success');
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Failed to publish');
      if ((data as { draft?: WitmeLandingConfig }).draft) {
        const merged = mergeWitmeLandingFromApi((data as { draft: WitmeLandingConfig }).draft);
        const nextUrls = merged.showcaseCreators.map((c) => c.imageUrl.trim()).filter(Boolean);
        const prevUrls = lastSavedShowcaseImageUrlsRef.current;
        const uid = auth.currentUser?.uid;
        for (const url of showcaseStorageUrlsToMaybeDelete(prevUrls, nextUrls)) {
          void deleteOwnedWitmeShowcaseMedia(url, uid);
        }
        lastSavedShowcaseImageUrlsRef.current = nextUrls;
        setDraft(merged);
      }
      if ((data as { published?: WitmeLandingConfig }).published) {
        setPublished(mergeWitmeLandingFromApi((data as { published: WitmeLandingConfig }).published));
      }
      if ((data as { updatedAt?: string }).updatedAt) setUpdatedAt((data as { updatedAt: string }).updatedAt);
      if ((data as { publishedAt?: string }).publishedAt) {
        setPublishedAt((data as { publishedAt: string }).publishedAt);
      }
      showToast('Witme page published', 'success');
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
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Draft preview (same renderer as witme). Shows your current Control Panel draft, including new uploads, before you publish.
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Fans on witme.io and the &quot;Open Live Preview&quot; links below use the last <span className="font-medium text-gray-700 dark:text-gray-300">Publish Live</span> only—publish after edits so those match this preview.
              </p>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {publishedAt ? `Last published: ${new Date(publishedAt).toLocaleString()}` : 'Not published yet'}
            </div>
          </div>
          <div className="max-h-[78vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <WitmeHomepage
              previewConfig={draft}
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
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Showcase creators</h2>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Home hero tiles, featured carousel, grid, and Discover use this list. Turn on{' '}
                      <span className="font-medium text-gray-700 dark:text-gray-300">Live page link</span> only when{' '}
                      <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">witme.io/…</code> should open that storefront.
                      Leave it off for decorative filler. Upload images or short looping videos (Firebase path{' '}
                      <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">witme_showcase/</code>
                      , public read after you deploy updated storage rules).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        showcaseCreators: [...prev.showcaseCreators, emptyShowcaseRow()],
                      }))
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Add row
                  </button>
                </div>
                <input
                  ref={showcaseFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  onChange={onShowcaseFilePicked}
                />
                <div className="space-y-4">
                  {draft.showcaseCreators.map((row, idx) => (
                    <div
                      key={`showcase-${idx}`}
                      className="grid gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={row.linkLive}
                            onChange={(e) =>
                              setDraft((prev) => {
                                const next = [...prev.showcaseCreators];
                                next[idx] = { ...next[idx], linkLive: e.target.checked };
                                return { ...prev, showcaseCreators: next };
                              })
                            }
                            className="rounded border-gray-300 dark:border-gray-600"
                          />
                          Live page link (View page → /your-slug)
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              showcaseCreators: prev.showcaseCreators.filter((_, i) => i !== idx),
                            }))
                          }
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20"
                        >
                          <TrashIcon className="w-4 h-4" />
                          Remove
                        </button>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <input
                          value={row.name}
                          onChange={(e) =>
                            setDraft((prev) => {
                              const next = [...prev.showcaseCreators];
                              next[idx] = { ...next[idx], name: e.target.value };
                              return { ...prev, showcaseCreators: next };
                            })
                          }
                          placeholder="Display name"
                          className="rounded-md border border-gray-300 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                        />
                        <input
                          value={row.handle}
                          onChange={(e) =>
                            setDraft((prev) => {
                              const next = [...prev.showcaseCreators];
                              next[idx] = { ...next[idx], handle: e.target.value };
                              return { ...prev, showcaseCreators: next };
                            })
                          }
                          placeholder="Handle (e.g. @stormijxo)"
                          className="rounded-md border border-gray-300 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                        />
                        <input
                          value={row.pageSlug}
                          onChange={(e) =>
                            setDraft((prev) => {
                              const next = [...prev.showcaseCreators];
                              next[idx] = { ...next[idx], pageSlug: e.target.value };
                              return { ...prev, showcaseCreators: next };
                            })
                          }
                          placeholder="URL slug (e.g. stormijxo) — optional; derived from handle if empty"
                          className="rounded-md border border-gray-300 px-2 py-2 text-sm md:col-span-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                        />
                        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                          <button
                            type="button"
                            disabled={showcaseUploadingIdx === idx}
                            onClick={() => {
                              showcasePickIdxRef.current = idx;
                              showcaseFileInputRef.current?.click();
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-gray-700 dark:text-gray-200"
                          >
                            <UploadIcon className="h-4 w-4" />
                            {showcaseUploadingIdx === idx ? 'Uploading…' : 'Upload image / video'}
                          </button>
                          <select
                            value={row.mediaKind}
                            onChange={(e) =>
                              setDraft((prev) => {
                                const next = [...prev.showcaseCreators];
                                next[idx] = {
                                  ...next[idx],
                                  mediaKind: e.target.value === 'video' ? 'video' : 'image',
                                };
                                return { ...prev, showcaseCreators: next };
                              })
                            }
                            className="rounded-md border border-gray-300 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                          >
                            <option value="image">Still image</option>
                            <option value="video">Looping video</option>
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <label className="mb-0.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                            Media URL (optional)
                          </label>
                          <p className="mb-1.5 text-xs text-gray-500 dark:text-gray-400">
                            Paste a direct link if the file is hosted elsewhere (Unsplash, your CDN, etc.). If you used Upload
                            above, this is already filled—you can edit it or clear it to remove media.
                          </p>
                          <input
                            value={row.imageUrl}
                            onChange={(e) =>
                              setDraft((prev) => {
                                const next = [...prev.showcaseCreators];
                                next[idx] = { ...next[idx], imageUrl: e.target.value };
                                return { ...prev, showcaseCreators: next };
                              })
                            }
                            placeholder="https://…"
                            className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                          />
                        </div>
                        {row.imageUrl.trim() ? (
                          <div className="md:col-span-2">
                            <p className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                              Frame preview — drag to reposition (matches witme cards: cover crop)
                            </p>
                            <div
                              role="presentation"
                              className="relative max-h-52 w-full max-w-lg cursor-grab overflow-hidden rounded-lg border border-gray-200 bg-gray-100 active:cursor-grabbing dark:border-gray-600 dark:bg-gray-800/50 select-none touch-none"
                              style={{ aspectRatio: '16 / 10' }}
                              onPointerDown={(e) => {
                                e.preventDefault();
                                (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                                const [ox, oy] = parseObjectPositionPercentPair(row.mediaObjectPosition);
                                showcasePanRef.current = {
                                  idx,
                                  startClientX: e.clientX,
                                  startClientY: e.clientY,
                                  startOx: ox,
                                  startOy: oy,
                                };
                              }}
                              onPointerMove={onShowcaseFramePointerMove}
                              onPointerUp={onShowcaseFramePointerUp}
                              onPointerCancel={onShowcaseFramePointerUp}
                            >
                              {row.mediaKind === 'video' ? (
                                <video
                                  src={row.imageUrl}
                                  className="h-full w-full pointer-events-none"
                                  style={showcaseFrameMediaStyle(row.mediaObjectPosition)}
                                  muted
                                  loop
                                  playsInline
                                  autoPlay
                                  preload="metadata"
                                />
                              ) : (
                                <img
                                  src={row.imageUrl}
                                  alt=""
                                  className="h-full w-full pointer-events-none"
                                  style={showcaseFrameMediaStyle(row.mediaObjectPosition)}
                                />
                              )}
                            </div>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              Same pan behavior as Fan Hub → My Page → reposition avatar: drag until the crop looks right, then Save draft.
                            </p>
                          </div>
                        ) : null}
                        <textarea
                          value={row.descriptor}
                          onChange={(e) =>
                            setDraft((prev) => {
                              const next = [...prev.showcaseCreators];
                              next[idx] = { ...next[idx], descriptor: e.target.value };
                              return { ...prev, showcaseCreators: next };
                            })
                          }
                          rows={2}
                          placeholder="Short description"
                          className="rounded-md border border-gray-300 px-2 py-2 text-sm md:col-span-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                        />
                        <input
                          value={tagsToCsv(row.tags)}
                          onChange={(e) =>
                            setDraft((prev) => {
                              const next = [...prev.showcaseCreators];
                              next[idx] = { ...next[idx], tags: csvToTags(e.target.value) };
                              return { ...prev, showcaseCreators: next };
                            })
                          }
                          placeholder="Tags (comma-separated)"
                          className="rounded-md border border-gray-300 px-2 py-2 text-sm md:col-span-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                        />
                        <input
                          value={row.spotlight}
                          onChange={(e) =>
                            setDraft((prev) => {
                              const next = [...prev.showcaseCreators];
                              next[idx] = { ...next[idx], spotlight: e.target.value };
                              return { ...prev, showcaseCreators: next };
                            })
                          }
                          placeholder="Carousel spotlight line"
                          className="rounded-md border border-gray-300 px-2 py-2 text-sm md:col-span-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                    </div>
                  ))}
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
