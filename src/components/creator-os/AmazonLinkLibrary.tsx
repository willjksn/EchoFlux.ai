import React from "react";
import type { AmazonLink } from "../../types/creatorOS";

type Props = {
  links: AmazonLink[];
  onAdd: () => void;
  onEdit: (link: AmazonLink) => void;
  onDelete: (linkId: string) => void;
  onTurnIntoIdea: (link: AmazonLink) => void;
  onUpdate: (linkId: string, updates: Partial<AmazonLink>) => void;
};

export const AmazonLinkLibrary: React.FC<Props> = ({ links, onAdd, onEdit, onDelete, onTurnIntoIdea, onUpdate }) => (
  <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-md dark:border-gray-700 dark:bg-gray-800">
    <div className="border-b border-primary-100 bg-gradient-to-r from-primary-50 via-white to-pink-50 px-4 py-3 text-gray-900 dark:border-gray-700 dark:from-gray-900 dark:via-gray-900 dark:to-primary-950/20 dark:text-white">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-600 dark:text-primary-300">Creator OS product library</p>
          <h2 className="text-lg font-bold">Amazon Link Library</h2>
          <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-gray-600 dark:text-gray-300">Store products and categories that fit your content situation.</p>
        </div>
        <button onClick={onAdd} className="rounded-xl bg-primary-600 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700">Add Amazon Link</button>
      </div>
    </div>

    <div className="grid gap-4 p-4 lg:grid-cols-2">
      {links.length === 0 ? (
        <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/60 p-3 text-sm text-primary-900 dark:border-primary-900/40 dark:bg-primary-950/20 dark:text-primary-100 lg:col-span-2">
          Add your first link. Start with a car item, desk item, or random useful product.
        </div>
      ) : (
        links.map((link) => (
          <div key={link.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/50">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">{link.productName}</h3>
                <p className="mt-1 text-xs text-gray-500">{link.category} · {link.ownershipStatus.replace(/_/g, " ")}</p>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{link.performanceStatus}</span>
            </div>
            {link.bestContentSituation && <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{link.bestContentSituation}</p>}
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
              <button onClick={() => onEdit(link)} className="rounded-lg bg-white px-2.5 py-1.5 text-primary-600 ring-1 ring-gray-200 hover:bg-primary-50 dark:bg-gray-800 dark:ring-gray-700">Edit</button>
              <button onClick={() => onTurnIntoIdea(link)} className="rounded-lg bg-white px-2.5 py-1.5 text-primary-600 ring-1 ring-gray-200 hover:bg-primary-50 dark:bg-gray-800 dark:ring-gray-700">Turn into Idea</button>
              <button onClick={() => onUpdate(link.id, { performanceStatus: "proven" })} className="rounded-lg bg-white px-2.5 py-1.5 text-emerald-600 ring-1 ring-gray-200 hover:bg-emerald-50 dark:bg-gray-800 dark:ring-gray-700">Mark Proven</button>
              <button onClick={() => onUpdate(link.id, { performanceStatus: "retired" })} className="rounded-lg bg-white px-2.5 py-1.5 text-gray-500 ring-1 ring-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:ring-gray-700">Retire</button>
              <button onClick={() => onDelete(link.id)} className="rounded-lg bg-white px-2.5 py-1.5 text-red-500 ring-1 ring-gray-200 hover:bg-red-50 dark:bg-gray-800 dark:ring-gray-700">Delete</button>
            </div>
          </div>
        ))
      )}
    </div>
  </section>
);

