import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { auth } from '../firebaseConfig';
import { CREATOR_IDENTITY_PROMISE, CREATOR_IDENTITY_QUESTIONS } from '../src/lib/creatorIdentity/questionBank';
import type { CreatorIdentityDraftAnswers, CreatorIdentityProfile, StructuredAnswer } from '../src/lib/creatorIdentity/types';
import { CopyIcon, SparklesIcon } from './icons/UIIcons';
import { EchoFluxHowItWorksModal } from './EchoFluxHowItWorksModal';

function emptyAnswers(): CreatorIdentityDraftAnswers {
  return { structured: {}, openText: {} };
}

async function authHeader(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Parse JSON; avoids `Unexpected token` when the server returns HTML or plain text. */
async function readJsonBody(r: Response): Promise<Record<string, unknown>> {
  const text = await r.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 220);
    if (r.status >= 500) {
      const invocationFailed = /FUNCTION_INVOCATION_FAILED/i.test(text);
      const onLocalhost =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const proxyHint = onLocalhost
        ? ' On localhost, `/api` is proxied via DEV_API_PROXY in `.env.local` — that target deployment must be healthy (see docs/LOCAL_DEV.md).'
        : '';
      const vercelHint = invocationFailed
        ? ` Vercel could not run the function (crash or platform error). Open Vercel → this project → Logs, find the request id if shown, and fix the underlying error — often missing FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 (or FIREBASE_ADMIN_KEY) for the environment you deployed (Production vs Preview), or an exception during cold start.${proxyHint}`
        : ` Check the deployment logs on Vercel.${proxyHint} If you only see this on localhost, set DEV_API_PROXY to a working app URL.`;
      throw new Error(`Server error (${r.status}).${vercelHint} Response: ${snippet}`);
    }
    throw new Error(`Unexpected response (${r.status}): ${snippet}`);
  }
}

type FollowupQ = { id: string; question: string; reason: string; targetDimension?: string };

function formatNicheLabel(id: string | null | undefined): string {
  if (!id) return '—';
  return id
    .replace(/_/g, ' ')
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

function IdentityChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-gray-200/90 bg-white/90 px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm dark:border-slate-600/80 dark:bg-slate-800/90 dark:text-slate-200">
      {children}
    </span>
  );
}

function ListTileGrid({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((item, i) => (
        <li
          key={`${i}-${item.slice(0, 24)}`}
          className="rounded-xl border border-gray-200/90 bg-white/90 px-3 py-2.5 text-sm leading-snug text-gray-800 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

export const CreatorIdentityBuilder: React.FC = () => {
  const [answers, setAnswers] = useState<CreatorIdentityDraftAnswers>(emptyAnswers);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<'quiz' | 'followup' | 'results'>('quiz');
  const [profile, setProfile] = useState<CreatorIdentityProfile | null>(null);
  const [followupQs, setFollowupQs] = useState<FollowupQ[]>([]);
  const [followupAns, setFollowupAns] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [showIdentityHowItWorks, setShowIdentityHowItWorks] = useState(false);
  const builderScrollAnchorRef = useRef<HTMLDivElement>(null);

  const total = CREATOR_IDENTITY_QUESTIONS.length;
  const q = CREATOR_IDENTITY_QUESTIONS[step];

  const loadProfile = useCallback(async () => {
    try {
      const h = await authHeader();
      const r = await fetch('/api/getCreatorIdentity', { headers: { ...h } });
      if (!r.ok) return;
      const data = await readJsonBody(r);
      const p = data.profile as Record<string, unknown> | null;
      if (!p) return;
      const raw = p.rawAnswers as CreatorIdentityDraftAnswers | undefined;
      if (p.status === 'draft' && raw && typeof raw === 'object') {
        setAnswers(raw);
        setPhase('quiz');
        return;
      }
      const full = p as unknown as CreatorIdentityProfile;
      if (full.rawAnswers && typeof full.rawAnswers === 'object') {
        setAnswers(full.rawAnswers);
      }
      if ((full.status === 'completed' || full.status === 'needs_followup') && full.generatedProfile) {
        setProfile(full);
        setPhase('results');
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  /** After Next/Back or phase change, scroll the scrollable main column to the top of this builder. */
  useLayoutEffect(() => {
    builderScrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [phase, step]);

  const progress = useMemo(() => Math.round(((step + 1) / total) * 100), [step, total]);

  const setStructured = (id: string, patch: StructuredAnswer) => {
    setAnswers((prev) => ({
      ...prev,
      structured: { ...prev.structured, [id]: { ...prev.structured[id], ...patch } },
    }));
  };

  const setOpen = (id: string, text: string) => {
    setAnswers((prev) => ({
      ...prev,
      openText: { ...prev.openText, [id]: text },
    }));
  };

  const canAdvance = useMemo(() => {
    if (!q) return false;
    const a = answers.structured[q.id];
    if (q.type === 'single_select') {
      const sel = a?.selected;
      if (!sel) return false;
      if (sel === 'other' && !(a?.customText || '').trim()) return false;
      return true;
    }
    if (q.type === 'multi_select') {
      const arr = Array.isArray(a?.selected) ? a.selected : [];
      if (q.exactSelections && arr.length !== q.exactSelections) return false;
      if (q.maxSelections && arr.length > q.maxSelections) return false;
      if (arr.length < 1) return false;
      if (arr.includes('other') && !(a?.customText || '').trim()) return false;
      return true;
    }
    if (q.type === 'ranked_select') {
      const r = a?.ranked || [];
      return r.length >= Math.min(q.rankTop || 3, 3);
    }
    if (q.type === 'scale') return typeof a?.scale === 'number';
    if (q.type === 'long_text') {
      const t = answers.openText[q.id]?.trim() || '';
      if (q.required && t.length < 4) return false;
      return !q.required || t.length >= 4;
    }
    return true;
  }, [q, answers]);

  const finishQuiz = async () => {
    setLoading(true);
    setError(null);
    try {
      const h = await authHeader();
      const r = await fetch('/api/saveCreatorIdentity', {
        method: 'POST',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', answers }),
      });
      const data = await readJsonBody(r);
      if (!r.ok) throw new Error(String(data.error || 'Save failed'));
      const p = data.profile as CreatorIdentityProfile;
      setProfile(p);
      if (p.status === 'needs_followup') {
        const fr = await fetch('/api/creatorIdentityFollowup', {
          method: 'POST',
          headers: { ...h, 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers }),
        });
        const fd = await readJsonBody(fr);
        if (!fr.ok) throw new Error(String(fd.error || 'Follow-up request failed'));
        const qs = Array.isArray(fd.questions) ? (fd.questions as FollowupQ[]) : [];
        setFollowupQs(qs.length ? qs : []);
        setPhase(qs.length ? 'followup' : 'results');
      } else {
        setPhase('results');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const submitFollowup = async () => {
    setLoading(true);
    setError(null);
    try {
      const h = await authHeader();
      const r = await fetch('/api/saveCreatorIdentity', {
        method: 'POST',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'followup_submit',
          followupAnswers: followupAns,
          followupQuestionsAsked: followupQs,
        }),
      });
      const data = await readJsonBody(r);
      if (!r.ok) throw new Error(String(data.error || 'Save failed'));
      setProfile(data.profile as CreatorIdentityProfile);
      setPhase('results');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const applyTargets = async (targets: string[]) => {
    setApplying(targets.join(','));
    setError(null);
    try {
      const h = await authHeader();
      const r = await fetch('/api/applyCreatorIdentityEcosystem', {
        method: 'POST',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets }),
      });
      const data = await readJsonBody(r);
      if (!r.ok) throw new Error(String(data.error || 'Apply failed'));
      await loadProfile();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setApplying(null);
    }
  };

  const copy = (t: string) => {
    void navigator.clipboard.writeText(t);
  };

  if (phase === 'results' && profile?.generatedProfile) {
    const g = profile.generatedProfile;
    const conf =
      profile.confidenceScore >= 80 ? 'high' : profile.confidenceScore >= 55 ? 'medium' : 'low';
    const ps = g.premiumStudioProfile;
    return (
      <div ref={builderScrollAnchorRef} className="max-w-5xl mx-auto space-y-8 text-gray-900 dark:text-gray-100 pb-20">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl border border-gray-200/90 bg-gradient-to-br from-primary-50 via-white to-indigo-50/80 px-6 py-8 shadow-sm dark:border-slate-700/80 dark:from-slate-900 dark:via-slate-950 dark:to-indigo-950/40 sm:px-10 sm:py-10">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary-400/10 blur-3xl dark:bg-primary-500/10" aria-hidden />
          <div className="relative space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="text-xs font-semibold uppercase tracking-widest text-primary-600 dark:text-primary-400">
                  Elite · Creator identity
                </span>
                <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-medium text-gray-600 shadow-sm dark:bg-slate-800/90 dark:text-slate-300">
                  Clarity {conf} · {profile.confidenceScore}/100
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowIdentityHowItWorks(true)}
                className="shrink-0 text-xs font-medium text-primary-600 underline-offset-2 hover:text-primary-700 hover:underline dark:text-primary-400 dark:hover:text-primary-300"
              >
                How it works
              </button>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-3xl md:text-4xl md:leading-tight max-w-3xl">
              {g.pageHeadline}
            </h1>
            <p className="text-base text-gray-600 dark:text-slate-300 max-w-2xl leading-relaxed">{g.pageSubheadline}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
              <div className="max-w-xs space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-slate-500">Signal strength</p>
                <div className="h-2 rounded-full bg-gray-200/90 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 via-primary-500 to-indigo-500 transition-all"
                    style={{ width: `${Math.min(100, profile.confidenceScore)}%` }}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-500 max-w-md">
                Saved here only. Your live Fan Hub / witme.io page does not change until you use an apply button below.
              </p>
            </div>
          </div>
        </div>

        {/* Snapshot + studio */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-gray-200/90 bg-white/90 p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/50">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-4">
              Identity snapshot
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-500 mb-1.5">Niche</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatNicheLabel(profile.primaryNiche)}
                  {profile.secondaryNiche ? (
                    <span className="font-normal text-gray-600 dark:text-slate-400">
                      {' '}
                      · {formatNicheLabel(profile.secondaryNiche)}
                    </span>
                  ) : null}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-500 mb-1.5">Monetization fit</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.monetizationFits.length ? (
                    profile.monetizationFits.map((m) => (
                      <IdentityChip key={m}>{m.replace(/_/g, ' ')}</IdentityChip>
                    ))
                  ) : (
                    <span className="text-sm text-gray-500">—</span>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-500 mb-1.5">Brand energy</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.brandVibes.length ? (
                    profile.brandVibes.map((v) => <IdentityChip key={v}>{v.replace(/_/g, ' ')}</IdentityChip>)
                  ) : (
                    <span className="text-sm text-gray-500">—</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-500 mb-1.5">Audience drivers</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.audienceDrivers.length ? (
                    profile.audienceDrivers.map((d) => (
                      <IdentityChip key={d}>{d.replace(/_/g, ' ')}</IdentityChip>
                    ))
                  ) : (
                    <span className="text-sm text-gray-500">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/50 p-6 dark:border-indigo-900/50 dark:bg-indigo-950/30">
            <h2 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200 mb-2">Premium Content Studio</h2>
            <p className="text-sm text-indigo-900/80 dark:text-indigo-200/80 leading-relaxed">
              This identity powers pillars, tone hints, and witme copy when you apply it below — so generated premium content
              stays on-brand.
            </p>
          </div>
        </div>

        {/* Story */}
        <div className="rounded-2xl border border-gray-200/90 bg-gray-50/80 p-6 sm:p-8 dark:border-slate-700/80 dark:bg-slate-900/40">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Why fans connect with you</h2>
          <p className="text-gray-700 dark:text-slate-300 leading-relaxed text-base max-w-3xl">{g.brandSummary}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/50">
            <div className="flex items-start justify-between gap-2 mb-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Brand statement</h2>
              <button
                type="button"
                onClick={() => copy(g.brandStatement)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <CopyIcon className="w-3.5 h-3.5" /> Copy
              </button>
            </div>
            <p className="text-gray-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{g.brandStatement}</p>
          </div>
          <div className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/50">
            <div className="flex items-start justify-between gap-2 mb-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Bio</h2>
              <button
                type="button"
                onClick={() => copy([g.shortBio, g.longBio].filter(Boolean).join('\n\n'))}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <CopyIcon className="w-3.5 h-3.5" /> Copy
              </button>
            </div>
            <p className="text-gray-800 dark:text-slate-200 leading-relaxed">{g.shortBio}</p>
            {g.longBio ? (
              <p className="mt-4 text-sm text-gray-600 dark:text-slate-400 leading-relaxed border-t border-gray-100 dark:border-slate-700 pt-4">
                {g.longBio}
              </p>
            ) : null}
          </div>
        </div>

        {g.welcomeMessage ? (
          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-6 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h2 className="text-lg font-semibold text-emerald-900 dark:text-emerald-100">Welcome message</h2>
              <button
                type="button"
                onClick={() => copy(g.welcomeMessage!)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-emerald-900 hover:bg-white dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100"
              >
                <CopyIcon className="w-3.5 h-3.5" /> Copy
              </button>
            </div>
            <p className="text-emerald-900/90 dark:text-emerald-100/90 leading-relaxed whitespace-pre-wrap">{g.welcomeMessage}</p>
          </div>
        ) : null}

        {/* Page preview mock */}
        <div className="rounded-2xl border border-gray-200/90 bg-gray-50/90 overflow-hidden dark:border-slate-700/80 dark:bg-slate-900/30">
          <div className="border-b border-gray-200/80 bg-white/90 px-6 py-4 dark:border-slate-700 dark:bg-slate-900/80">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Fan Hub / My Page preview</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 max-w-2xl">
              Hero and offer ideas. Applying updates bio, hero, landing blurbs, and pricing card bullets — not your handle,
              media, theme, legal text, or subscription prices.
            </p>
          </div>
          <div className="p-6 sm:p-8">
            <div className="mx-auto max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-md dark:border-slate-600 dark:bg-slate-950">
              <p className="text-xs font-medium uppercase tracking-wide text-primary-600 dark:text-primary-400 mb-2">Hero</p>
              <p className="text-xl font-semibold text-gray-900 dark:text-white leading-snug">{g.pageHeadline}</p>
              <p className="mt-2 text-sm text-gray-600 dark:text-slate-400 leading-relaxed">{g.pageSubheadline}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {g.suggestedCTAs.slice(0, 3).map((cta, i) => (
                  <span
                    key={`${i}-${cta.slice(0, 24)}`}
                    className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm"
                  >
                    {cta}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-3">Suggested offers</h3>
              <ListTileGrid items={g.suggestedOffers} />
            </div>
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-3">Content pillars</h3>
              <ListTileGrid items={g.suggestedContentPillars} />
            </div>
            {(g.suggestedMembershipName || g.suggestedMembershipDescription) && (
              <div className="mt-8 rounded-xl border border-gray-200 bg-white/90 p-4 dark:border-slate-600 dark:bg-slate-900/60">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-2">Membership idea</h3>
                {g.suggestedMembershipName ? (
                  <p className="font-medium text-gray-900 dark:text-white">{g.suggestedMembershipName}</p>
                ) : null}
                {g.suggestedMembershipDescription ? (
                  <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">{g.suggestedMembershipDescription}</p>
                ) : null}
              </div>
            )}
            <div className="mt-8 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={Boolean(applying)}
                onClick={() => void applyTargets(['fanHubMyPage'])}
                className="px-5 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 shadow-sm"
              >
                {applying === 'fanHubMyPage' ? 'Applying…' : 'Apply to Fan Hub / My Page'}
              </button>
            </div>
          </div>
        </div>

        {ps &&
        (ps.contentStyle.length ||
          ps.messageTone.length ||
          ps.audienceIntent.length ||
          ps.monetizationFocus.length) ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-6 dark:border-slate-600 dark:bg-slate-900/50">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Premium studio tags</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ['Content style', ps.contentStyle],
                ['Message tone', ps.messageTone],
                ['Audience intent', ps.audienceIntent],
                ['Monetization focus', ps.monetizationFocus],
              ].map(([label, tags]) =>
                (tags as string[]).length ? (
                  <div key={String(label)}>
                    <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-2">{label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(tags as string[]).map((t, idx) => (
                        <IdentityChip key={`${String(label)}-${idx}-${t.slice(0, 20)}`}>{t}</IdentityChip>
                      ))}
                    </div>
                  </div>
                ) : null
              )}
            </div>
          </div>
        ) : null}

        {/* Apply EchoFlux */}
        <div className="rounded-2xl border border-gray-200/90 bg-white p-6 dark:border-slate-700/80 dark:bg-slate-900/50">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">EchoFlux & studio defaults</h2>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-4 leading-relaxed">
            Apply to EchoFlux updates Settings → Profile & AI → Personality Override with your brand statement and summary (turn
            on Personality Override in Compose or Strategy to use it). It also saves niche, content-pillar, and voice-baseline
            fields for EchoFlux. Apply to Premium Content Studio writes identity defaults used by Premium Studio flows.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(applying)}
              onClick={() => void applyTargets(['echoProfile', 'strategyDefaults', 'captionDefaults'])}
              className="px-4 py-2.5 rounded-xl border border-gray-300 bg-gray-50 text-sm font-medium text-gray-900 hover:bg-gray-100 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700 disabled:opacity-50"
            >
              Apply to EchoFlux
            </button>
            <button
              type="button"
              disabled={Boolean(applying)}
              onClick={() => void applyTargets(['premiumStudio'])}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
            >
              Apply to Premium Content Studio
            </button>
          </div>
        </div>

        {(conf !== 'high' || profile.status === 'needs_followup') && (
          <div className="rounded-xl border border-amber-200/90 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            Your signals can tighten over time — re-run the builder when your lane or offers shift.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-gray-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => {
              setPhase('quiz');
              setStep(0);
              setProfile(null);
              setFollowupQs([]);
              setFollowupAns({});
            }}
            className="text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
          >
            Start over
          </button>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <EchoFluxHowItWorksModal
          open={showIdentityHowItWorks}
          onClose={() => setShowIdentityHowItWorks(false)}
          ariaTitleId="creator-identity-how-title"
          title="How Creator Identity works"
          subtitle="Turn your answers into a saved brand kit—without changing your live page until you apply."
        >
          <section>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
              What you&apos;re seeing
            </h4>
            <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
              EchoFlux summarizes your quiz (and follow-ups if you had them) into headlines, bios, pillars, monetization hints, and
              Premium Studio tags. The clarity score reflects how actionable and consistent those signals looked—not your worth as a creator.
            </p>
          </section>
          <section>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
              Saved vs live
            </h4>
            <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
              This profile stays in EchoFlux until you tap an apply action. Fan Hub / witme.io does not automatically update—you choose
              when to push copy like hero blurbs or bios via the Fan Hub apply button below.
            </p>
          </section>
          <section>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
              Apply buttons
            </h4>
            <ul className="list-inside list-disc space-y-1 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
              <li>
                <strong className="text-gray-800 dark:text-gray-200">Apply to Fan Hub / My Page</strong> updates marketing copy previews
                (hero, bullets, bios)—not your handle, pricing, theme, legal, or media assets.
              </li>
              <li>
                <strong className="text-gray-800 dark:text-gray-200">Apply to EchoFlux</strong> syncs Personality Override and related
                defaults so Create Post &amp; strategy flows can mirror this identity when Personality is enabled.
              </li>
              <li>
                <strong className="text-gray-800 dark:text-gray-200">Apply to Premium Content Studio</strong> pushes tags and defaults
                used by Premium Studio generators (ideas, drops, sessions, teasers).
              </li>
            </ul>
          </section>
          <section>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
              Relationship to Settings → Personality Override
            </h4>
            <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
              Personality Override remains your quick knob for slang, boundaries, and micro tone. Creator Identity carries the fuller story
              (niche stack, pillars, monetization emphasis). Sync them when you apply to EchoFlux, then refine details in Settings anytime.
            </p>
          </section>
        </EchoFluxHowItWorksModal>
      </div>
    );
  }

  if (phase === 'followup') {
    return (
      <div ref={builderScrollAnchorRef} className="max-w-2xl mx-auto space-y-8 text-gray-900 dark:text-gray-100 pb-20">
        <div className="rounded-2xl border border-primary-200/60 bg-gradient-to-br from-primary-50/80 to-white px-6 py-6 dark:border-primary-900/40 dark:from-primary-950/30 dark:to-slate-950">
          <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <SparklesIcon className="w-4 h-4" /> Fine-tune
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">A few sharper questions</h2>
          <p className="text-sm text-gray-600 dark:text-slate-400 mt-2 leading-relaxed">{CREATOR_IDENTITY_PROMISE}</p>
        </div>
        <div className="space-y-6">
          {followupQs.map((fq, idx) => (
            <div key={fq.id} className="rounded-2xl border border-gray-200/90 bg-white/90 p-5 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/50">
              <p className="text-xs font-medium text-gray-400 dark:text-slate-500 mb-2">Question {idx + 1}</p>
              <label className="block text-sm font-medium text-gray-900 dark:text-slate-100 mb-2">{fq.question}</label>
              <textarea
                className="w-full rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-600 px-3 py-3 text-sm text-gray-900 dark:text-white min-h-[100px] focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/50"
                rows={3}
                value={followupAns[fq.id] || ''}
                onChange={(e) => setFollowupAns((prev) => ({ ...prev, [fq.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="button"
          disabled={loading}
          onClick={() => void submitFollowup()}
          className="px-6 py-3 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 shadow-sm"
        >
          {loading ? 'Generating profile…' : 'Finalize profile'}
        </button>
      </div>
    );
  }

  const a = answers.structured[q.id] || {};

  return (
    <div ref={builderScrollAnchorRef} className="max-w-2xl mx-auto space-y-6 pb-20 text-gray-900 dark:text-gray-100">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400 text-xs font-semibold uppercase tracking-wider">
          <SparklesIcon className="w-4 h-4 text-primary-600 dark:text-primary-400" /> Creator Identity Builder
        </div>
        <p className="text-gray-600 dark:text-slate-400 text-sm leading-relaxed">{CREATOR_IDENTITY_PROMISE}</p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs text-gray-500 dark:text-slate-500">
          <span className="font-medium text-gray-700 dark:text-slate-300">{q.sectionTitle}</span>
          <span>
            Step {step + 1} / {total}
          </span>
        </div>
        <div className="h-2 rounded-full bg-gray-200 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-indigo-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200/90 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/50 shadow-sm p-6 sm:p-8 space-y-5">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white leading-snug">{q.prompt}</h2>

        {q.type === 'single_select' &&
          q.options?.map((opt) => (
            <label
              key={opt.id}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                a.selected === opt.id
                  ? 'border-primary-500/70 bg-primary-50 dark:border-primary-500/50 dark:bg-primary-950/40'
                  : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
              }`}
            >
              <input
                type="radio"
                name={q.id}
                checked={a.selected === opt.id}
                onChange={() => setStructured(q.id, { selected: opt.id })}
                className="text-primary-600 focus:ring-primary-500"
              />
              <span className="text-gray-800 dark:text-slate-200 text-sm">{opt.label}</span>
            </label>
          ))}

        {q.type === 'multi_select' &&
          q.options?.map((opt) => {
            const arr = Array.isArray(a.selected) ? a.selected : [];
            const checked = arr.includes(opt.id);
            const max = q.maxSelections ?? q.exactSelections ?? 99;
            return (
              <label
                key={opt.id}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  checked
                    ? 'border-primary-500/70 bg-primary-50 dark:border-primary-500/50 dark:bg-primary-950/40'
                    : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && arr.length >= max}
                  onChange={() => {
                    let next = [...arr];
                    if (checked) next = next.filter((x) => x !== opt.id);
                    else if (next.length < max) next.push(opt.id);
                    setStructured(q.id, { selected: next });
                  }}
                  className="text-primary-600 rounded focus:ring-primary-500"
                />
                <span className="text-gray-800 dark:text-slate-200 text-sm">{opt.label}</span>
              </label>
            );
          })}

        {q.type === 'ranked_select' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-slate-500">Tap in order (top {q.rankTop || 3}). Current: {(a.ranked || []).join(' → ')}</p>
            <div className="flex flex-wrap gap-2">
              {q.options?.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    const r = [...(a.ranked || [])];
                    const i = r.indexOf(opt.id);
                    if (i >= 0) r.splice(i, 1);
                    else if (r.length < (q.rankTop || 3)) r.push(opt.id);
                    setStructured(q.id, { ranked: r });
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs border ${
                    (a.ranked || []).includes(opt.id)
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/50 dark:border-primary-400/60 text-primary-900 dark:text-primary-100'
                      : 'border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {q.type === 'scale' && (
          <div className="flex gap-2 flex-wrap">
            {Array.from({ length: (q.scaleMax || 5) - (q.scaleMin || 1) + 1 }, (_, i) => (q.scaleMin || 1) + i).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setStructured(q.id, { scale: n })}
                className={`w-11 h-11 rounded-lg text-sm font-medium ${
                  a.scale === n ? 'bg-primary-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        {q.type === 'long_text' && (
          <textarea
            className="w-full rounded-xl bg-white dark:bg-slate-950 border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm text-gray-900 dark:text-white min-h-[120px]"
            value={answers.openText[q.id] || ''}
            onChange={(e) => setOpen(q.id, e.target.value)}
            placeholder="Your answer…"
          />
        )}

        {(a.selected === 'other' ||
          (Array.isArray(a.selected) && a.selected.includes('other')) ||
          q.options?.some((o) => o.id === 'other' && (a.selected === 'other' || (Array.isArray(a.selected) && a.selected.includes('other'))))) && (
          <input
            type="text"
            className="w-full rounded-lg bg-white dark:bg-slate-950 border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm text-gray-900 dark:text-white"
            placeholder="Other (please specify)"
            value={a.customText || ''}
            onChange={(e) => setStructured(q.id, { customText: e.target.value })}
          />
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex justify-between gap-3 pt-2">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800/80 disabled:opacity-30"
        >
          Back
        </button>
        {step < total - 1 ? (
          <button
            type="button"
            disabled={!canAdvance}
            onClick={() => setStep((s) => s + 1)}
            className="px-6 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-40 shadow-sm"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            disabled={!canAdvance || loading}
            onClick={() => void finishQuiz()}
            className="px-6 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-40 shadow-sm"
          >
            {loading ? 'Generating profile…' : 'See my identity'}
          </button>
        )}
      </div>
    </div>
  );
};
