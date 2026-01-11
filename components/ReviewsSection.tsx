import React, { useEffect, useState } from "react";
import { SparklesIcon, UserIcon } from "./icons/UIIcons";

type Review = {
  id: string;
  username: string;
  country?: string | null;
  plan?: string | null;
  rating: number;
  text: string;
  showAvatar: boolean;
  avatarUrl?: string | null;
  createdAt?: string | null;
};

const fallbackReviews: Review[] = [
  {
    id: "sample-1",
    username: "Amelia R.",
    country: "US",
    plan: "Elite",
    rating: 5,
    text: "EchoFlux made it so much easier to plan premium content and keep my DMs converting. I copy captions and scripts straight from the studio.",
    showAvatar: false,
    avatarUrl: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
  {
    id: "sample-2",
    username: "Leo M.",
    country: "CA",
    plan: "Pro",
    rating: 4.5,
    text: "The weekly planner plus AI captions are lifesavers. I can plan my schedule and export packs without bouncing between tools.",
    showAvatar: false,
    avatarUrl: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
  {
    id: "sample-3",
    username: "Sasha V.",
    country: "UK",
    plan: "Elite",
    rating: 5,
    text: "I like that it’s built for premium creator platforms. Content Brain gives me Fansly- and Fanvue-ready ideas without me rewriting everything.",
    showAvatar: false,
    avatarUrl: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
  },
];

const formatRelativeTime = (iso?: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
};

const Stars: React.FC<{ rating: number }> = ({ rating }) => {
  const rounded = Math.round(rating * 2) / 2;
  return (
    <div className="flex items-center gap-1 text-amber-500">
      {Array.from({ length: 5 }).map((_, idx) => {
        const value = idx + 1;
        const full = rounded >= value;
        const half = !full && rounded >= value - 0.5;
        return (
          <span key={idx} className="text-lg leading-none">
            {full ? "★" : half ? "☆" : "☆"}
          </span>
        );
      })}
      <span className="text-sm text-gray-600 dark:text-gray-400 ml-1">{rounded.toFixed(1)}</span>
    </div>
  );
};

export const ReviewsSection: React.FC = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/getFeaturedReviews");
        const data = await res.json().catch(() => null);
        if (res.ok && data?.items?.length) {
          setReviews(data.items);
        } else {
          setReviews(fallbackReviews);
        }
      } catch (e) {
        console.error("Failed to load featured reviews", e);
        setReviews(fallbackReviews);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading && reviews.length === 0) {
    return (
      <section className="py-12 sm:py-16 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
            <div className="h-4 w-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <span>Loading what creators are saying…</span>
          </div>
        </div>
      </section>
    );
  }

  if (!reviews.length) {
    return (
      <section className="py-12 sm:py-16 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 dark:bg-primary-900/40 rounded-lg text-primary-600 dark:text-primary-300">
              <SparklesIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-primary-600 dark:text-primary-300 font-semibold uppercase tracking-wide">What creators are saying</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Reviews coming soon</h2>
            </div>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-sm">Check back shortly—our newest reviews will appear here.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 sm:py-16 bg-white dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-100 dark:bg-primary-900/40 rounded-lg text-primary-600 dark:text-primary-300">
            <SparklesIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-primary-600 dark:text-primary-300 font-semibold uppercase tracking-wide">What creators are saying</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Real feedback from active users</h2>
          </div>
        </div>

        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-full">
            {reviews.map((review) => {
              const initials = review.username
                ?.split(" ")
                .map((p) => p[0])
                .join("")
                .slice(0, 2)
                .toUpperCase() || "U";
              return (
                <div
                  key={review.id}
                  className="min-w-[280px] max-w-sm flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 flex items-center justify-center overflow-hidden">
                      {review.showAvatar && review.avatarUrl ? (
                        <img src={review.avatarUrl} alt={review.username} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-sm font-semibold">{initials}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white truncate">{review.username}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {review.country ? `${review.country} • ` : ""}
                        {review.plan ? `${review.plan} plan` : "Creator"}
                      </p>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {formatRelativeTime(review.createdAt)}
                    </div>
                  </div>
                  <Stars rating={review.rating || 5} />
                  <p className="mt-3 text-sm text-gray-700 dark:text-gray-200 leading-relaxed line-clamp-4">{review.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
