import React, { useEffect, useState } from "react";
import type { AmazonLink, ContentIdea, ContentLane, FunnelGoal, PlatformTarget } from "../../types/creatorOS";
import { CONTENT_IDEA_STATUS_LABELS, CONTENT_LANE_LABELS, FUNNEL_GOAL_LABELS, PLATFORM_LABELS } from "../../lib/creatorOS";

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

const templates: Template[] = [
  { name: "Work version of me", title: "Work version of me", publicHook: "this is me most of the time", caption: "not as interesting as people think", platforms: ["instagram_reel", "tiktok"], innerCircleTieIn: "this is the calm version... obviously", amazonCategory: "Desk / Work", lane: "relatable_real_life", funnelGoal: "grow_attention" },
  { name: "Car version", title: "Car version", publicHook: "I spend too much time in here", caption: "it's fine", platforms: ["instagram_reel", "tiktok", "instagram_story"], innerCircleTieIn: "car talks are better on there anyway", amazonCategory: "Car / Driving", lane: "car_driving", funnelGoal: "drive_story_clicks" },
  { name: "Quiet but not silent", title: "Quiet but not silent", publicHook: "I'm quiet... not silent", caption: "there's a difference", platforms: ["instagram_reel", "tiktok"], innerCircleTieIn: "Inner Circle subscription CTA", lane: "smirk_curiosity", funnelGoal: "drive_inner_circle_subscribers" },
  { name: "Not everything is for everyone", title: "Not everything is for everyone", publicHook: "not everything is for everyone", caption: "you'll figure it out", platforms: ["instagram_reel", "tiktok", "instagram_story"], innerCircleTieIn: "Inner Circle CTA", lane: "inner_circle_tease", funnelGoal: "drive_inner_circle_subscribers" },
  { name: "Random but useful", title: "Random but useful", publicHook: "why is this actually useful...", caption: "ok I get it now", platforms: ["instagram_story", "tiktok"], innerCircleTieIn: "Share the more personal version inside Inner Circle", amazonCategory: "Random but Useful", lane: "amazon_soft_mention", funnelGoal: "test_product_interest" },
];

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

  useEffect(() => {
    if (!open) return;
    if (idea) {
      const { id: _id, ...rest } = idea;
      setDraft(rest);
    } else {
      setDraft(emptyIdea());
    }
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
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Quick templates</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {templates.map((template) => (
              <button key={template.name} onClick={() => applyTemplate(template)} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                {template.name}
              </button>
            ))}
          </div>
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

