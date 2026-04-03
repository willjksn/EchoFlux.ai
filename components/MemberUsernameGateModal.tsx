import React, { useState } from "react";
import { auth } from "../firebaseConfig";
import { validateMemberUsernameFormat, normalizeMemberUsername } from "../src/lib/memberUsername";

type Props = {
  creatorId: string;
  creatorDisplayName: string;
  primaryColor: string;
  textColor?: string;
  onComplete: () => void;
};

/**
 * Blocks member area until the fan picks a unique @handle-style username.
 */
export const MemberUsernameGateModal: React.FC<Props> = ({
  creatorId,
  creatorDisplayName,
  primaryColor,
  textColor = "#1f2937",
  onComplete,
}) => {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [availabilityHint, setAvailabilityHint] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const checkAvailability = async () => {
    setError(null);
    setAvailabilityHint(null);
    const fmt = validateMemberUsernameFormat(value);
    if (fmt) {
      setError(fmt);
      return;
    }
    const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
    if (!token) {
      setError("Please sign in again.");
      return;
    }
    setChecking(true);
    try {
      const normalized = normalizeMemberUsername(value);
      const res = await fetch(
        `/api/checkMemberUsernameAvailability?username=${encodeURIComponent(normalized)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error || "Could not check availability. Try again.");
        return;
      }
      const available = (data as { available?: boolean }).available;
      const message = (data as { message?: string }).message || "";
      const reason = (data as { reason?: string }).reason || "";
      if (available) {
        setAvailabilityHint(message || "That username is available.");
      } else if (reason === "invalid") {
        setError(message || "Invalid username.");
      } else {
        setError(message || "That username is already taken.");
      }
    } catch {
      setError("Could not check availability. Try again.");
    } finally {
      setChecking(false);
    }
  };

  const submit = async () => {
    setError(null);
    const fmt = validateMemberUsernameFormat(value);
    if (fmt) {
      setError(fmt);
      return;
    }
    const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
    if (!token) {
      setError("Please sign in again.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/claimMemberUsername", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          username: normalizeMemberUsername(value),
          creatorId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error || "Could not save username.");
        return;
      }
      onComplete();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-username-title"
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 shadow-xl"
        style={{ backgroundColor: "#fff", color: textColor }}
      >
        <h2 id="member-username-title" className="text-xl font-bold mb-1">
          Choose your member name
        </h2>
        <p className="text-sm mb-4 opacity-80">
          Pick a unique handle for member areas. This is how you show up for {creatorDisplayName} (not your email).
        </p>
        <label className="block text-sm font-medium mb-1" htmlFor="member-username-input">
          Username
        </label>
        <div className="flex gap-2 mb-2">
          <span className="flex items-center text-sm opacity-60" aria-hidden>
            @
          </span>
          <input
            id="member-username-input"
            type="text"
            name="member_handle"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={32}
            className="flex-1 rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
            style={{ borderColor: `${primaryColor}55`, color: textColor }}
            value={value}
            onChange={(e) => {
              setAvailabilityHint(null);
              setValue(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
            }}
            placeholder="your_handle"
          />
        </div>
        <p className="text-xs opacity-70 mb-3">3–32 characters: lowercase letters, numbers, underscores only.</p>
        {error && (
          <p className="text-sm text-red-600 mb-3" role="alert">
            {error}
          </p>
        )}
        {availabilityHint && !error && (
          <p className="text-sm text-emerald-700 mb-3" role="status">
            {availabilityHint}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="px-4 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: `${primaryColor}66`, color: primaryColor }}
            onClick={checkAvailability}
            disabled={checking || submitting}
          >
            {checking ? "Checking…" : "Check available"}
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}
            onClick={submit}
            disabled={submitting || checking}
          >
            {submitting ? "Saving…" : "Save & continue"}
          </button>
        </div>
      </div>
    </div>
  );
};
