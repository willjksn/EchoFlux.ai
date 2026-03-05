import React, { useState } from "react";
import { useAppContext } from "./AppContext";
import { auth } from "../firebaseConfig";
import type { TreatProduct } from "../types";

interface LiveVideoChatRequestProps {
  product: TreatProduct;
  creatorId: string;
  creatorName?: string;
  onClose: () => void;
  onSuccess: (sessionId: string) => void;
}

const VideoIcon = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="10" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
  </svg>
);

export const LiveVideoChatRequest: React.FC<LiveVideoChatRequestProps> = ({
  product,
  creatorId,
  creatorName,
  onClose,
  onSuccess,
}) => {
  const { user, showToast } = useAppContext();
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<"confirm" | "processing" | "success">("confirm");

  const durationMinutes = product.durationMinutes || 
    (product.type === "live_video_5m" ? 5 :
     product.type === "live_video_10m" ? 10 :
     product.type === "live_video_15m" ? 15 :
     product.type === "live_video_30m" ? 30 : 10);

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const handleSubmit = async () => {
    if (!user?.id) {
      showToast?.("Please sign in to request a video chat", "error");
      return;
    }

    setIsSubmitting(true);
    setStep("processing");

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      if (!token) {
        throw new Error("Please sign in to continue");
      }

      // Request the video chat session
      const res = await fetch("/api/liveVideoChat?action=request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          creatorId,
          productId: product.id,
          durationMinutes,
          amountPaidCents: product.priceCents,
          fanNote: note.trim() || undefined,
          fanEmail: user.email,
          fanDisplayName: user.displayName || user.email,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to request video chat");
      }

      const data = await res.json();
      setStep("success");
      
      setTimeout(() => {
        onSuccess(data.sessionId);
      }, 2000);
    } catch (e) {
      console.error("Failed to request video chat:", e);
      showToast?.(e instanceof Error ? e.message : "Failed to request video chat", "error");
      setStep("confirm");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-pink-500 to-purple-600 p-6 text-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
              <VideoIcon />
            </div>
            <div>
              <h2 className="text-xl font-bold">Live Video Chat</h2>
              <p className="text-white/80 text-sm">
                {creatorName ? `with ${creatorName}` : "Request a video call"}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 mt-4 text-sm">
            <div className="flex items-center gap-1">
              <ClockIcon />
              <span>{durationMinutes} minutes</span>
            </div>
            <div className="font-bold text-lg">
              {formatPrice(product.priceCents)}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === "confirm" && (
            <>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Request a live 1-on-1 video call. The creator will be notified and can accept or schedule a time with you.
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Add a note (optional)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What would you like to talk about?"
                  rows={3}
                  maxLength={500}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none"
                />
                <p className="text-xs text-gray-400 mt-1 text-right">{note.length}/500</p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6">
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">How it works:</h4>
                <ol className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
                  <li className="flex gap-2">
                    <span className="font-bold text-pink-500">1.</span>
                    Submit your request
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-pink-500">2.</span>
                    Creator gets notified
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-pink-500">3.</span>
                    Once accepted, you'll get a notification to join
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-pink-500">4.</span>
                    Enjoy your private video chat!
                  </li>
                </ol>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 text-white font-medium hover:from-pink-600 hover:to-purple-700 transition disabled:opacity-50"
                >
                  {isSubmitting ? "Processing..." : `Pay ${formatPrice(product.priceCents)}`}
                </button>
              </div>
            </>
          )}

          {step === "processing" && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-300">Processing your request...</p>
            </div>
          )}

          {step === "success" && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Request Sent!</h3>
              <p className="text-gray-600 dark:text-gray-300">
                The creator will be notified. You'll receive an alert when they're ready to chat.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveVideoChatRequest;
