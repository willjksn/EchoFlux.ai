import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { auth } from '../firebaseConfig';
import { CREATOR_IDENTITY_PROMISE, CREATOR_IDENTITY_QUESTIONS } from '../src/lib/creatorIdentity/questionBank';
import type { CreatorIdentityDraftAnswers, CreatorIdentityProfile, StructuredAnswer } from '../src/lib/creatorIdentity/types';
import { CopyIcon, SparklesIcon } from './icons/UIIcons';

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
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 180);
    throw new Error(
      r.status >= 500
        ? `Server error (${r.status}). If you are on local dev, set DEV_API_PROXY in .env.local to your deployed API URL (see docs/LOCAL_DEV.md). ${snippet}`
        : `Unexpected response (${r.status}): ${snippet}`
    );
  }
}

type FollowupQ = { id: string; question: string; reason: string; targetDimension?: string };

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
    return (
      <div ref={builderScrollAnchorRef} className="max-w-4xl mx-auto space-y-6 text-gray-900 dark:text-gray-100 pb-16">
        <header className="space-y-2 border-b border-gray-200 dark:border-slate-700/80 pb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-600 dark:text-primary-400">Elite</p>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">Your Creator Identity</h1>
          <p className="text-gray-600 dark:text-slate-400 text-sm max-w-2xl">
            Here&apos;s what people are most drawn to you for — and how to turn that into clearer content, stronger
            positioning, and better monetization.
          </p>
          <p className="text-sm text-gray-700 dark:text-slate-300 max-w-2xl rounded-lg border border-gray-200 dark:border-slate-600/80 bg-white/80 dark:bg-slate-900/60 px-3 py-2">
            Finishing the builder only saves your identity here. Nothing on your public Fan Hub / witme.io page changes unless
            you use the optional button below.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-gradient-to-br from-gray-50 to-white dark:from-slate-900 dark:to-slate-950 border border-gray-200 dark:border-slate-700/80 p-5 shadow-sm dark:shadow-xl">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-3">Identity snapshot</h2>
            <ul className="text-sm text-gray-600 dark:text-slate-400 space-y-1.5">
              <li>
                <span className="text-gray-500 dark:text-slate-500">Primary niche:</span>{' '}
                {profile.primaryNiche?.replace(/_/g, ' ') || '—'}
              </li>
              <li>
                <span className="text-gray-500 dark:text-slate-500">Secondary:</span>{' '}
                {profile.secondaryNiche?.replace(/_/g, ' ') || '—'}
              </li>
              <li>
                <span className="text-gray-500 dark:text-slate-500">Vibes:</span> {profile.brandVibes.join(', ') || '—'}
              </li>
              <li>
                <span className="text-gray-500 dark:text-slate-500">Audience drivers:</span>{' '}
                {profile.audienceDrivers.map((d) => d.replace(/_/g, ' ')).join(', ') || '—'}
              </li>
              <li>
                <span className="text-gray-500 dark:text-slate-500">Confidence:</span>{' '}
                <span className="text-primary-700 dark:text-primary-300">
                  {profile.confidenceScore}/100 ({conf})
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl bg-gray-50 dark:bg-slate-900/90 border border-gray-200 dark:border-slate-700/80 p-5">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-2">Premium Content Studio</h2>
            <p className="text-sm text-gray-600 dark:text-slate-400">
              Use your Creator Identity to generate premium content pillars, stronger monetization strategy, and a witme.io
              page setup tailored to your audience.
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-gray-50 dark:bg-slate-900/80 border border-gray-200 dark:border-slate-700/80 p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Why fans are drawn to you</h2>
          <p className="text-gray-700 dark:text-slate-300 text-sm leading-relaxed">{g.brandSummary}</p>
        </div>

        <div className="rounded-2xl bg-gray-50 dark:bg-slate-900/80 border border-gray-200 dark:border-slate-700/80 p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Brand statement</h2>
          <p className="text-gray-800 dark:text-slate-200 text-base leading-relaxed whitespace-pre-wrap">{g.brandStatement}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copy(g.brandStatement)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-200 dark:bg-slate-800 text-sm text-gray-800 dark:text-slate-200 hover:bg-gray-300 dark:hover:bg-slate-700"
            >
              <CopyIcon className="w-4 h-4" /> Copy
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-gray-50 dark:bg-slate-900/80 border border-gray-200 dark:border-slate-700/80 p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Fan Hub / My Page (optional)</h2>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-3 max-w-2xl">
            Preview of hero copy and offers. Use the button only when you want this identity applied to your live page —
            bio, hero text, landing content, pricing card copy (title and bullets from your offers), and store blurbs. Log-in /
            sign-up modal branding is left as-is, as is tip block copy. Your handle, images, theme, legal text, and subscription
            prices are not changed here.
          </p>
          <dl className="text-sm space-y-2 text-gray-600 dark:text-slate-400">
            <div>
              <dt className="text-gray-500 dark:text-slate-500">Headline</dt>
              <dd className="text-gray-800 dark:text-slate-200">{g.pageHeadline}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-slate-500">Subheadline</dt>
              <dd className="text-gray-800 dark:text-slate-200">{g.pageSubheadline}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-slate-500">Offers</dt>
              <dd className="text-gray-800 dark:text-slate-200">{g.suggestedOffers.join(' · ')}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(applying)}
              onClick={() => void applyTargets(['fanHubMyPage'])}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
            >
              {applying === 'fanHubMyPage' ? 'Applying…' : 'Fill Fan Hub / My Page from this identity'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-gray-50 dark:bg-slate-900/80 border border-gray-200 dark:border-slate-700/80 p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-3">EchoFlux defaults</h2>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">Push pillars and voice hints into your account settings.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(applying)}
              onClick={() => void applyTargets(['echoProfile', 'strategyDefaults', 'captionDefaults'])}
              className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-slate-700 text-sm text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-slate-600 disabled:opacity-50"
            >
              Apply to EchoFlux
            </button>
            <button
              type="button"
              disabled={Boolean(applying)}
              onClick={() => void applyTargets(['premiumStudio'])}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Apply to Premium Content Studio
            </button>
          </div>
        </div>

        {(conf !== 'high' || profile.status === 'needs_followup') && (
          <div className="rounded-xl border border-primary-200 dark:border-primary-800/60 bg-primary-50 dark:bg-primary-950/50 p-4 text-sm text-primary-900 dark:text-primary-100">
            Refine your identity anytime — re-run the builder after you evolve your brand.
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setPhase('quiz');
            setStep(0);
            setProfile(null);
            setFollowupQs([]);
            setFollowupAns({});
          }}
          className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white underline"
        >
          Start over
        </button>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  if (phase === 'followup') {
    return (
      <div ref={builderScrollAnchorRef} className="max-w-xl mx-auto space-y-6 text-gray-900 dark:text-gray-100 pb-16">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">A few sharper questions</h2>
        <p className="text-sm text-gray-600 dark:text-slate-400">{CREATOR_IDENTITY_PROMISE}</p>
        {followupQs.map((fq) => (
          <div key={fq.id} className="space-y-2">
            <label className="block text-sm text-gray-800 dark:text-slate-200">{fq.question}</label>
            <textarea
              className="w-full rounded-lg bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm text-gray-900 dark:text-white"
              rows={3}
              value={followupAns[fq.id] || ''}
              onChange={(e) => setFollowupAns((prev) => ({ ...prev, [fq.id]: e.target.value }))}
            />
          </div>
        ))}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="button"
          disabled={loading}
          onClick={() => void submitFollowup()}
          className="px-5 py-2.5 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Finalize profile'}
        </button>
      </div>
    );
  }

  const a = answers.structured[q.id] || {};

  return (
    <div ref={builderScrollAnchorRef} className="max-w-xl mx-auto space-y-6 pb-16 text-gray-900 dark:text-gray-100">
      <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400 text-xs font-semibold uppercase tracking-wider">
        <SparklesIcon className="w-4 h-4 text-primary-600 dark:text-primary-400" /> Creator Identity Builder
      </div>
      <p className="text-gray-600 dark:text-slate-400 text-sm">{CREATOR_IDENTITY_PROMISE}</p>

      <div className="h-2 rounded-full bg-gray-200 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary-500 to-indigo-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-gray-500 dark:text-slate-500">
        {q.sectionTitle} · Step {step + 1} / {total}
      </p>

      <div className="rounded-2xl border border-gray-200 dark:border-slate-700/80 bg-gray-50/80 dark:bg-slate-900/60 p-6 space-y-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">{q.prompt}</h2>

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

      <div className="flex justify-between gap-3">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="px-4 py-2 rounded-lg text-sm text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-30"
        >
          Back
        </button>
        {step < total - 1 ? (
          <button
            type="button"
            disabled={!canAdvance}
            onClick={() => setStep((s) => s + 1)}
            className="px-5 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-40"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            disabled={!canAdvance || loading}
            onClick={() => void finishQuiz()}
            className="px-5 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-40"
          >
            {loading ? 'Saving…' : 'See my identity'}
          </button>
        )}
      </div>
    </div>
  );
};
