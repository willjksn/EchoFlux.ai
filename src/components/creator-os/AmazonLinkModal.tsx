import React, { useEffect, useState } from "react";
import type { AmazonLink } from "../../types/creatorOS";
import { AMAZON_CATEGORIES, isFlexibleAmazonUrl } from "../../lib/creatorOS";

type Props = {
  open: boolean;
  link?: AmazonLink | null;
  onClose: () => void;
  onSave: (link: Omit<AmazonLink, "id">, linkId?: string) => Promise<void> | void;
};

const emptyLink = (): Omit<AmazonLink, "id"> => ({
  productName: "",
  category: "Random but Useful",
  amazonUrl: "",
  audienceFit: "",
  bestContentSituation: "",
  ownershipStatus: "testing_interest",
  performanceStatus: "testing",
  notes: "",
});

export const AmazonLinkModal: React.FC<Props> = ({ open, link, onClose, onSave }) => {
  const [draft, setDraft] = useState<Omit<AmazonLink, "id">>(emptyLink());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (link) {
      const { id: _id, ...rest } = link;
      setDraft(rest);
    } else {
      setDraft(emptyLink());
    }
  }, [open, link]);

  if (!open) return null;

  const validUrl = isFlexibleAmazonUrl(draft.amazonUrl);
  const submit = async () => {
    if (!draft.productName.trim() || !validUrl) return;
    setSaving(true);
    try {
      await onSave(draft, link?.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-950 dark:text-white">{link ? "Edit Amazon Link" : "Add Amazon Link"}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">You do not need to own every product. Link things that fit your life, audience, or content situation.</p>
          </div>
          <button onClick={onClose} className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Close</button>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">
            Product name
            <input value={draft.productName} onChange={(e) => setDraft({ ...draft, productName: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950" />
          </label>
          <label className="text-sm font-semibold">
            Category
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950">
              {AMAZON_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold md:col-span-2">
            URL
            <input value={draft.amazonUrl} onChange={(e) => setDraft({ ...draft, amazonUrl: e.target.value })} placeholder="Amazon, storefront, affiliate, or tracking URL" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950" />
            {!validUrl && <span className="mt-1 block text-xs text-red-500">Use a valid http or https URL.</span>}
          </label>
          <label className="text-sm font-semibold">
            Ownership status
            <select value={draft.ownershipStatus} onChange={(e) => setDraft({ ...draft, ownershipStatus: e.target.value as AmazonLink["ownershipStatus"] })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950">
              <option value="own_use">I own/use this</option>
              <option value="similar_curated">Similar item / curated link</option>
              <option value="testing_interest">Want to test interest first</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            Performance status
            <select value={draft.performanceStatus} onChange={(e) => setDraft({ ...draft, performanceStatus: e.target.value as AmazonLink["performanceStatus"] })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950">
              <option value="testing">Testing</option>
              <option value="proven">Proven</option>
              <option value="retired">Retired</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            Why it fits my audience
            <textarea value={draft.audienceFit} onChange={(e) => setDraft({ ...draft, audienceFit: e.target.value })} rows={3} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950" />
          </label>
          <label className="text-sm font-semibold">
            Best content situation
            <textarea value={draft.bestContentSituation} onChange={(e) => setDraft({ ...draft, bestContentSituation: e.target.value })} rows={3} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950" />
          </label>
          <label className="text-sm font-semibold md:col-span-2">
            Notes
            <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={3} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950" />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700">Cancel</button>
          <button onClick={submit} disabled={saving || !draft.productName.trim() || !validUrl} className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? "Saving..." : "Save Link"}
          </button>
        </div>
      </div>
    </div>
  );
};

