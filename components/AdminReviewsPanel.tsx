import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../firebaseConfig";
import { useAppContext } from "./AppContext";
import { RefreshIcon, TrashIcon, UploadIcon } from "./icons/UIIcons";

type Review = {
  id: string;
  username: string;
  userId?: string | null;
  country?: string | null;
  plan?: string | null;
  rating: number;
  text: string;
  showAvatar: boolean;
  avatarUrl?: string | null;
  isFeatured: boolean;
  createdAt?: string | null;
};

const emptyForm = {
  id: "",
  username: "",
  country: "",
  plan: "",
  rating: 5,
  text: "",
  showAvatar: false,
  avatarUrl: "",
  isFeatured: true,
};

export const AdminReviewsPanel: React.FC = () => {
  const { showToast } = useAppContext();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const featuredCount = useMemo(() => reviews.filter((r) => r.isFeatured).length, [reviews]);

  const loadReviews = async () => {
    setLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch("/api/adminGetReviews", {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load reviews");
      setReviews(data.items || []);
    } catch (e: any) {
      console.error("loadReviews error:", e);
      showToast(e?.message || "Failed to load reviews", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upsertReview = async () => {
    if (!form.text.trim() || !form.username.trim()) {
      showToast("Username and text are required", "error");
      return;
    }
    setSaving(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch("/api/adminUpdateReview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          id: form.id || undefined,
          action: "upsert",
          username: form.username.trim(),
          country: form.country.trim() || null,
          plan: form.plan.trim() || null,
          rating: form.rating,
          text: form.text.trim(),
          showAvatar: form.showAvatar,
          avatarUrl: form.avatarUrl?.trim() || null,
          isFeatured: form.isFeatured,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to save review");
      showToast("Review saved", "success");
      setForm({ ...emptyForm });
      await loadReviews();
    } catch (e: any) {
      console.error("upsertReview error:", e);
      showToast(e?.message || "Failed to save review", "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteReview = async (id: string) => {
    if (!window.confirm("Delete this review?")) return;
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch("/api/adminUpdateReview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id, action: "delete" }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to delete review");
      showToast("Review deleted", "success");
      setReviews((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      console.error("deleteReview error:", e);
      showToast(e?.message || "Failed to delete review", "error");
    }
  };

  const toggleFeatured = async (id: string, current: boolean) => {
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch("/api/adminUpdateReview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id, isFeatured: !current }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to update");
      setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, isFeatured: !current } : r)));
    } catch (e: any) {
      console.error("toggleFeatured error:", e);
      showToast(e?.message || "Failed to update review", "error");
    }
  };

  const editing = form.id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Reviews</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Add, feature, or remove reviews for the landing page.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <button
            onClick={loadReviews}
            className="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            disabled={loading}
          >
            <RefreshIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400">Featured: {featuredCount}</span>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Username</label>
            <input
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="Creator handle"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Plan</label>
            <input
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
              value={form.plan}
              onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
              placeholder="e.g., Elite"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Country</label>
            <input
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
              value={form.country}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              placeholder="e.g., US"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Rating (1-5)</label>
            <input
              type="number"
              min={1}
              max={5}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
              value={form.rating}
              onChange={(e) => setForm((f) => ({ ...f, rating: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Review Text</label>
            <textarea
              rows={3}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
              value={form.text}
              onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={form.showAvatar}
                onChange={(e) => setForm((f) => ({ ...f, showAvatar: e.target.checked }))}
              />
              Show avatar image (else initials)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={form.isFeatured}
                onChange={(e) => setForm((f) => ({ ...f, isFeatured: e.target.checked }))}
              />
              Visible on landing page
            </label>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Avatar URL (optional)</label>
            <input
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
              value={form.avatarUrl}
              onChange={(e) => setForm((f) => ({ ...f, avatarUrl: e.target.value }))}
              placeholder="https://..."
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={upsertReview}
            disabled={saving}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
          >
            <UploadIcon className={`w-4 h-4 ${saving ? "animate-spin" : ""}`} />
            {editing ? "Update review" : "Add review"}
          </button>
          {editing && (
            <button
              onClick={() => setForm({ ...emptyForm })}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancel edit
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white">All Reviews</h4>
          <span className="text-xs text-gray-500 dark:text-gray-400">{reviews.length} total</span>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <div className="h-4 w-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            Loading reviews...
          </div>
        ) : reviews.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No reviews yet.</p>
        ) : (
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 dark:text-white truncate">{review.username}</p>
                      {review.plan && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200">
                          {review.plan}
                        </span>
                      )}
                      {review.country && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">{review.country}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      {new Date(review.createdAt || "").toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-200">{review.text}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={review.isFeatured}
                        onChange={() => toggleFeatured(review.id, review.isFeatured)}
                      />
                      Featured
                    </label>
                    <button
                      onClick={() => {
                        setForm({
                          id: review.id,
                          username: review.username || "",
                          plan: review.plan || "",
                          country: review.country || "",
                          rating: review.rating || 5,
                          text: review.text || "",
                          showAvatar: review.showAvatar || false,
                          avatarUrl: review.avatarUrl || "",
                          isFeatured: review.isFeatured || false,
                        });
                      }}
                      className="text-xs text-primary-600 dark:text-primary-300 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteReview(review.id)}
                      className="text-xs text-red-600 dark:text-red-400 hover:underline flex items-center gap-1"
                    >
                      <TrashIcon className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
