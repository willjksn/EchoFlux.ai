import React, { useEffect, useState } from "react";
import { XMarkIcon } from "./icons/UIIcons";
import { useAppContext } from "./AppContext";
import { auth } from "../firebaseConfig";

interface ShareReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ReviewResponse = {
  id: string;
  rating: number;
  text: string;
  showAvatar: boolean;
  country?: string | null;
  plan?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
};

export const ShareReviewModal: React.FC<ShareReviewModalProps> = ({ isOpen, onClose }) => {
  const { user, showToast } = useAppContext();
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [country, setCountry] = useState("");
  const [showAvatar, setShowAvatar] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadExisting = async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch("/api/getMyReview", {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (res.ok && data?.review) {
        const r: ReviewResponse = data.review;
        setRating(r.rating || 5);
        setText(r.text || "");
        setCountry(r.country || "");
        setShowAvatar(Boolean(r.showAvatar));
      } else {
        setRating(5);
        setText("");
        setCountry("");
        setShowAvatar(true);
      }
    } catch (e) {
      console.error("Failed to load review", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadExisting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user?.id]);

  const save = async () => {
    if (!text.trim()) {
      showToast("Please add your review text.", "error");
      return;
    }
    setIsSaving(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch("/api/submitReview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          rating,
          text: text.trim(),
          showAvatar,
          country: country.trim() || null,
          plan: user?.plan || null,
          username: user?.username || user?.name || (user?.email ? user.email.split("@")[0] : "Creator"),
          avatarUrl: showAvatar ? user?.avatar || user?.photoURL || null : null,
        }),
      });
      const textBody = await res.text();
      const data = textBody ? JSON.parse(textBody) : null;
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to save review");
      showToast("Review saved", "success");
      onClose();
    } catch (e: any) {
      console.error("Failed to save review", e);
      showToast(e?.message || "Failed to save review", "error");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          aria-label="Close"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-primary-600 dark:text-primary-300 uppercase tracking-wide">Share a review</p>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Tell creators what you think</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">One review per user. You can edit any time.</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Your rating</p>
            <div className="flex items-center gap-2">
              {Array.from({ length: 5 }).map((_, idx) => {
                const value = idx + 1;
                const filled = value <= rating;
                return (
                  <button
                    key={value}
                    onClick={() => setRating(value)}
                    className="text-2xl focus:outline-none"
                    aria-label={`Rate ${value} star${value > 1 ? "s" : ""}`}
                  >
                    {filled ? "★" : "☆"}
                  </button>
                );
              })}
              <span className="text-sm text-gray-600 dark:text-gray-400">{rating} / 5</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Plan</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded-md border border-gray-200 dark:border-gray-600">
                {user?.plan || "N/A"}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Country (optional)</label>
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
                placeholder="e.g., US"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={showAvatar}
              onChange={(e) => setShowAvatar(e.target.checked)}
            />
            Use profile photo (otherwise we’ll show initials)
          </label>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Your review</label>
            <textarea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
              placeholder="Share how EchoFlux helps you."
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={isSaving}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Send review"}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
