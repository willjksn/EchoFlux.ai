import React, { useEffect, useState } from "react";
import type { AmazonLink, ContentIdea, ContentLane, FunnelGoal, PlatformTarget } from "../../types/creatorOS";
import { CONTENT_IDEA_STATUS_LABELS, CONTENT_LANE_LABELS, FUNNEL_GOAL_LABELS, PLATFORM_LABELS } from "../../lib/creatorOS";
import { auth } from "../../../firebaseConfig";

type Props = {
  open: boolean;
  idea?: ContentIdea | null;
  amazonLinks: AmazonLink[];
  onClose: () => void;
  onSave: (idea: Omit<ContentIdea, "id">, ideaId?: string) => Promise<void> | void;
};

type Template = {
  name: string;
  title: string;
  publicHook: string;
  caption: string;
  platforms: PlatformTarget[];
  innerCircleTieIn: string;
  amazonCategory?: string;
  lane: ContentLane;
  funnelGoal: FunnelGoal;
};

type AiIdeaResponse = Partial<Pick<ContentIdea, "title" | "publicHook" | "caption" | "platforms" | "innerCircleTieIn" | "amazonCategory" | "lane" | "funnelGoal" | "storyText" | "notes">>;

const TEMPLATE_RECENT_STORAGE_KEY = "creatorOSRecentQuickTemplates";
const QUICK_TEMPLATE_COUNT = 5;

const templates: Template[] = [
  { name: "Work version of me", title: "Work version of me", publicHook: "this is me most of the time", caption: "not as interesting as people think", platforms: ["instagram_reel", "tiktok"], innerCircleTieIn: "this is the calm version... obviously", amazonCategory: "Desk / Work", lane: "relatable_real_life", funnelGoal: "grow_attention" },
  { name: "Car version", title: "Car version", publicHook: "I spend too much time in here", caption: "it's fine", platforms: ["instagram_reel", "tiktok", "instagram_story"], innerCircleTieIn: "car talks are better on there anyway", amazonCategory: "Car / Driving", lane: "car_driving", funnelGoal: "drive_story_clicks" },
  { name: "Quiet but not silent", title: "Quiet but not silent", publicHook: "I'm quiet... not silent", caption: "there's a difference", platforms: ["instagram_reel", "tiktok"], innerCircleTieIn: "Inner Circle subscription CTA", lane: "smirk_curiosity", funnelGoal: "drive_inner_circle_subscribers" },
  { name: "Not everything is for everyone", title: "Not everything is for everyone", publicHook: "not everything is for everyone", caption: "you'll figure it out", platforms: ["instagram_reel", "tiktok", "instagram_story"], innerCircleTieIn: "Inner Circle CTA", lane: "inner_circle_tease", funnelGoal: "drive_inner_circle_subscribers" },
  { name: "Random but useful", title: "Random but useful", publicHook: "why is this actually useful...", caption: "ok I get it now", platforms: ["instagram_story", "tiktok"], innerCircleTieIn: "Share the more personal version inside Inner Circle", amazonCategory: "Random but Useful", lane: "amazon_soft_mention", funnelGoal: "test_product_interest" },
  { name: "Story click test", title: "Story click test", publicHook: "should I link this or keep it to myself?", caption: "be honest", platforms: ["instagram_reel", "instagram_story"], innerCircleTieIn: "Share the results and better details inside Inner Circle", amazonCategory: "Random but Useful", lane: "amazon_soft_mention", funnelGoal: "drive_story_clicks" },
  { name: "Subscriber tease", title: "Subscriber tease", publicHook: "I only posted half of this publicly", caption: "the rest is where it belongs", platforms: ["instagram_reel", "tiktok"], innerCircleTieIn: "Post the full version, voice note, or extra context inside Inner Circle", lane: "inner_circle_tease", funnelGoal: "drive_inner_circle_subscribers" },
  { name: "Weekend reset", title: "Weekend reset", publicHook: "resetting for the week", caption: "trying to be normal about it", platforms: ["instagram_reel", "instagram_story"], innerCircleTieIn: "Sunday member note: what is coming next week", lane: "lifestyle", funnelGoal: "retain_subscribers" },
  { name: "Treat moment", title: "Treat moment", publicHook: "this would make my day", caption: "no pressure, obviously", platforms: ["instagram_story", "tiktok"], innerCircleTieIn: "Thank supporters inside Inner Circle and mention what Treats help unlock", lane: "talking_personality", funnelGoal: "sell_treat" },
  { name: "Opinion bait", title: "Opinion bait", publicHook: "be honest, which one?", caption: "I need opinions", platforms: ["instagram_reel", "instagram_story", "tiktok"], innerCircleTieIn: "Post the final pick and more personal context inside Inner Circle", lane: "talking_personality", funnelGoal: "grow_attention" },
  { name: "Soft product mention", title: "Soft product mention", publicHook: "I did not think I needed this", caption: "ok I get it now", platforms: ["instagram_story", "tiktok"], innerCircleTieIn: "Share why it fits your routine inside Inner Circle", amazonCategory: "Random but Useful", lane: "amazon_soft_mention", funnelGoal: "test_product_interest" },
  { name: "Real life check-in", title: "Real life check-in", publicHook: "quick check-in", caption: "nothing dramatic today", platforms: ["instagram_reel", "instagram_story"], innerCircleTieIn: "Drop a private check-in or voice note for members", lane: "relatable_real_life", funnelGoal: "retain_subscribers" },
];

function readRecentTemplateNames(): string[] {
  try {
    const raw = localStorage.getItem(TEMPLATE_RECENT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeRecentTemplateName(name: string): string[] {
  const next = [name, ...readRecentTemplateNames().filter((item) => item !== name)].slice(0, templates.length - QUICK_TEMPLATE_COUNT);
  try {
    localStorage.setItem(TEMPLATE_RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Local storage can be unavailable in privacy-restricted contexts.
  }
  return next;
}

function pickQuickTemplates(recentNames = readRecentTemplateNames()): Template[] {
  const recent = new Set(recentNames);
  const fresh = templates.filter((template) => !recent.has(template.name));
  const fallback = templates.filter((template) => recent.has(template.name));
  return [...fresh, ...fallback].slice(0, QUICK_TEMPLATE_COUNT);
}

function parseAiIdea(text: string): AiIdeaResponse {
  const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(clean) as AiIdeaResponse;
}

const validLanes = new Set(Object.keys(CONTENT_LANE_LABELS));
const validGoals = new Set(Object.keys(FUNNEL_GOAL_LABELS));
const validPlatforms = new Set(Object.keys(PLATFORM_LABELS));
const FUNNEL_PLATFORMS: PlatformTarget[] = ["instagram_reel", "instagram_story", "tiktok", "inner_circle"];

const emptyIdea = (): Omit<ContentIdea, "id"> => ({
  title: "",
  lane: "smirk_curiosity",
  publicHook: "",
  caption: "",
  platforms: ["instagram_reel", "tiktok"],
  funnelGoal: "grow_attention",
  amazonLinkId: "",
  amazonCategory: "",
  storyText: [],
  innerCircleTieIn: "",
  notes: "",
  dueDate: "",
  status: "ideas",
});

export const ContentIdeaModal: React.FC<Props> = ({ open, idea, amazonLinks, onClose, onSave }) => {
  const [draft, setDraft] = useState<Omit<ContentIdea, "id">>(emptyIdea());
  const [saving, setSaving] = useState(false);
  const [quickTemplates, setQuickTemplates] = useState<Template[]>(() => pickQuickTemplates());
  const [aiHelpOpen, setAiHelpOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (idea) {
      const { id: _id, ...rest } = idea;
      setDraft(rest);
    } else {
      setDraft(emptyIdea());
    }
    setQuickTemplates(pickQuickTemplates());
    setAiHelpOpen(false);
    setAiPrompt("");
    setAiError("");
  }, [open, idea]);

  if (!open) return null;

  const togglePlatform = (platform: PlatformTarget) => {
    setDraft((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter((item) => item !== platform)
        : [...prev.platforms, platform],
    }));
  };

  const applyTemplate = (template: Template) => {
    setDraft((prev) => ({ ...prev, ...template, status: "ideas" }));
    setQuickTemplates(pickQuickTemplates(writeRecentTemplateName(template.name)));
  };

  const generateWithAi = async () => {
    if (!aiPrompt.trim()) {
      setAiError("Tell AI what kind of content idea you want first.");
      return;
    }

    setAiGenerating(true);
    setAiError("");
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const savedLinks = amazonLinks
        .slice(0, 8)
        .map((link) => `${link.productName} (${link.category}) - ${link.bestContentSituation || link.audienceFit || link.amazonUrl}`)
        .join("\n");

      const response = await fetch(new URL("/api/generateText", window.location.origin).toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          prompt: `You are helping create a Creator OS content idea for EchoFlux.

Optimize this idea as one connected funnel for:
- Instagram Reel: public attention and curiosity
- Instagram Story: click behavior, poll/reply/link action, and product interest
- TikTok: reach, retention, and repeatable hook
- Inner Circle: paid subscriber conversion or retention

The goal is not one generic post. The goal is a connected money flow:
attention -> story clicks -> Amazon/product interest -> Inner Circle subscribers -> Treats/retention -> review.

User rough idea:
${aiPrompt}

Saved Amazon links available:
${savedLinks || "No saved links yet."}

Return ONLY valid JSON with these fields:
{
  "title": "short funnel-ready content idea title",
  "lane": one of ${Object.keys(CONTENT_LANE_LABELS).join(", ")},
  "publicHook": "short on-screen hook that works for Instagram Reels and TikTok in the first 1-2 seconds",
  "caption": "caption optimized for Instagram and TikTok, with a soft CTA to reply, check Story, or join Inner Circle",
  "platforms": ["instagram_reel", "instagram_story", "tiktok", "inner_circle"],
  "funnelGoal": one of ${Object.keys(FUNNEL_GOAL_LABELS).join(", ")},
  "amazonCategory": "category or product angle if relevant",
  "storyText": [
    "Instagram Story slide 1: curiosity or question",
    "Instagram Story slide 2: poll/reply/link action",
    "Instagram Story slide 3: soft Inner Circle or Amazon CTA"
  ],
  "innerCircleTieIn": "exact paid member drop or subscriber reason connected to the public post",
  "notes": "Platform plan with labels: Instagram Reel, TikTok, Instagram Story, Inner Circle, Funnel goal, What to review after posting"
}

Rules:
- Make it practical, specific, and ready to use today.
- Avoid sounding salesy or corporate.
- Use the creator's rough idea as the anchor.
- Make TikTok slightly more curiosity/retention focused.
- Make Instagram more aesthetic, relatable, and Story-click focused.
- Make Inner Circle feel closer and worth paying for.
- If an Amazon product fits, make it a soft mention, not a hard ad.
- The output must be valid JSON only.`,
          context: {
            goal: "content idea",
            tone: "friendly",
            platforms: ["Instagram", "TikTok"],
          },
          emojiEnabled: true,
          emojiIntensity: 30,
        }),
      });

      const data = await response.json() as { text?: string; caption?: string; error?: string; note?: string };
      if (!response.ok || data.error) {
        throw new Error(data.note || data.error || "AI could not generate an idea.");
      }

      const generated = parseAiIdea(data.text || data.caption || "");
      const nextLane = typeof generated.lane === "string" && validLanes.has(generated.lane) ? generated.lane as ContentLane : draft.lane;
      const nextGoal = typeof generated.funnelGoal === "string" && validGoals.has(generated.funnelGoal) ? generated.funnelGoal as FunnelGoal : draft.funnelGoal;
      const nextPlatforms = Array.isArray(generated.platforms)
        ? generated.platforms.filter((platform): platform is PlatformTarget => typeof platform === "string" && validPlatforms.has(platform))
        : [];
      const optimizedPlatforms = Array.from(new Set([...FUNNEL_PLATFORMS, ...nextPlatforms]));

      setDraft((prev) => ({
        ...prev,
        title: generated.title?.trim() || prev.title,
        lane: nextLane,
        publicHook: generated.publicHook?.trim() || prev.publicHook,
        caption: generated.caption?.trim() || prev.caption,
        platforms: optimizedPlatforms,
        funnelGoal: nextGoal,
        amazonCategory: generated.amazonCategory?.trim() || prev.amazonCategory,
        storyText: Array.isArray(generated.storyText) ? generated.storyText.filter(Boolean).map(String) : prev.storyText,
        innerCircleTieIn: generated.innerCircleTieIn?.trim() || prev.innerCircleTieIn,
        notes: generated.notes?.trim() || prev.notes,
        status: "ideas",
      }));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI could not generate an idea.");
    } finally {
      setAiGenerating(false);
    }
  };

  const submit = async () => {
    if (!draft.title.trim()) return;
    setSaving(true);
    try {
      await onSave(draft, idea?.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-950 dark:text-white">{idea ? "Edit Content Idea" : "Add Content Idea"}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Keep it simple: what to post, why, and where it goes next.</p>
          </div>
          <button onClick={onClose} className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Close</button>
        </div>

        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Quick templates</p>
            <button
              type="button"
              onClick={() => setAiHelpOpen((value) => !value)}
              className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-bold text-primary-700 transition hover:bg-primary-100 dark:border-primary-900/50 dark:bg-primary-950/30 dark:text-primary-200"
            >
              <span className="rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-black text-white">AI</span>
              AI funnel help
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {quickTemplates.map((template) => (
              <button key={template.name} onClick={() => applyTemplate(template)} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                {template.name}
              </button>
            ))}
          </div>
          {aiHelpOpen && (
            <div className="mt-3 rounded-2xl border border-primary-100 bg-primary-50/60 p-3 dark:border-primary-900/40 dark:bg-primary-950/20">
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                Tell AI your rough idea
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  rows={3}
                  placeholder="Example: I want a car post that gets attention, sends people to my Story, softly mentions my Amazon car organizer, and gives Inner Circle members the closer version."
                  className="mt-2 w-full rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:ring-2 focus:ring-primary-300 dark:border-primary-900/50 dark:bg-slate-950 dark:text-white"
                />
              </label>
              {aiError && <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-300">{aiError}</p>}
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={generateWithAi}
                  disabled={aiGenerating}
                  className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-primary-700 disabled:opacity-60"
                >
                  {aiGenerating ? "Optimizing..." : "Generate funnel idea"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">
            Idea title
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950" />
          </label>
          <label className="text-sm font-semibold">
            Content lane
            <select value={draft.lane} onChange={(e) => setDraft({ ...draft, lane: e.target.value as ContentLane })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950">
              {Object.entries(CONTENT_LANE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Public hook / on-screen text
            <input value={draft.publicHook} onChange={(e) => setDraft({ ...draft, publicHook: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950" />
          </label>
          <label className="text-sm font-semibold">
            Caption
            <input value={draft.caption} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950" />
          </label>
          <label className="text-sm font-semibold">
            Funnel goal
            <select value={draft.funnelGoal} onChange={(e) => setDraft({ ...draft, funnelGoal: e.target.value as FunnelGoal })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950">
              {Object.entries(FUNNEL_GOAL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Amazon product/link
            <select value={draft.amazonLinkId || ""} onChange={(e) => setDraft({ ...draft, amazonLinkId: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950">
              <option value="">No saved link yet</option>
              {amazonLinks.map((link) => <option key={link.id} value={link.id}>{link.productName}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Amazon category
            <input value={draft.amazonCategory || ""} onChange={(e) => setDraft({ ...draft, amazonCategory: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950" />
          </label>
          <label className="text-sm font-semibold">
            Due date
            <input type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950" />
          </label>
          <label className="text-sm font-semibold">
            Status
            <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ContentIdea["status"] })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950">
              {Object.entries(CONTENT_IDEA_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold md:col-span-2">
            Inner Circle tie-in
            <input value={draft.innerCircleTieIn} onChange={(e) => setDraft({ ...draft, innerCircleTieIn: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950" />
          </label>
          <div className="md:col-span-2">
            <p className="text-sm font-semibold">Platforms</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
                <button key={value} onClick={() => togglePlatform(value as PlatformTarget)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${draft.platforms.includes(value as PlatformTarget) ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-200" : "border-slate-300 dark:border-slate-700"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="text-sm font-semibold md:col-span-2">
            Notes
            <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={3} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950" />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700">Cancel</button>
          <button onClick={submit} disabled={saving || !draft.title.trim()} className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? "Saving..." : "Save Idea"}
          </button>
        </div>
      </div>
    </div>
  );
};

