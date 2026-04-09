import React, { useMemo, useState } from "react";
import { XMarkIcon } from "./icons/UIIcons";
import { useAppContext } from "./AppContext";
import { auth } from "../firebaseConfig";

interface ReportProblemModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Destination address for mailto; defaults to EchoFlux support. */
  contactEmail?: string;
  /** Brand/support name used in email subject/body copy. */
  supportName?: string;
  /** Submission channel. `inApp` sends to internal support threads; `email` opens mail app. */
  mode?: "email" | "inApp";
  /** Optional callback for in-app support submission. */
  onSubmitInApp?: (payload: { message: string; diagnostics: string }) => Promise<void>;
  /** Optional callback after successful submit. */
  onSubmitted?: () => void;
}

export const ReportProblemModal: React.FC<ReportProblemModalProps> = ({
  isOpen,
  onClose,
  contactEmail = "contact@echoflux.ai",
  supportName = "EchoFlux",
  mode = "email",
  onSubmitInApp,
  onSubmitted,
}) => {
  const { user, activePage, showToast } = useAppContext();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const diagnostics = useMemo(() => {
    const lines: string[] = [];
    lines.push(`User: ${user?.email || "unknown"} (${user?.id || "unknown"})`);
    lines.push(`Plan: ${user?.plan || "unknown"} | Role: ${user?.role || "unknown"}`);
    lines.push(`Page: ${activePage}`);
    lines.push(`URL: ${typeof window !== "undefined" ? window.location.href : ""}`);
    lines.push(`Time: ${new Date().toISOString()}`);
    lines.push(`User-Agent: ${typeof navigator !== "undefined" ? navigator.userAgent : ""}`);
    return lines.join("\n");
  }, [user?.email, user?.id, user?.plan, user?.role, activePage]);

  const mailtoHref = useMemo(() => {
    const subject = `${supportName} Bug Report (${user?.email || "unknown"})`;
    const body =
      `Hi ${supportName} Support,\n\n` +
      `Problem:\n${message || "[describe what happened]"}\n\n` +
      `Steps to reproduce:\n1.\n2.\n3.\n\n` +
      `Expected:\n\nActual:\n\n` +
      `Diagnostics:\n${diagnostics}\n\n` +
      `Screenshot/video (if possible):\n`;
    const qs = new URLSearchParams({
      subject,
      body,
    });
    return `mailto:${contactEmail}?${qs.toString()}`;
  }, [message, diagnostics, user?.email, contactEmail, supportName]);

  const handleSubmit = async () => {
    if (!message.trim()) {
      showToast("Please describe the issue.", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      // Fan Hub / storefront in-app flow uses createSupportTicket only (creator-scoped). Calling
      // reportProblem here too created a second platform-level IT ticket for the same report.
      const skipDuplicatePlatformTicket = mode === "inApp" && typeof onSubmitInApp === "function";
      if (token && !skipDuplicatePlatformTicket) {
        await fetch("/api/reportProblem", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message,
            page: activePage,
            url: typeof window !== "undefined" ? window.location.href : "",
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          }),
        }).catch(() => {});
      }

      if (mode === "inApp") {
        if (!onSubmitInApp) {
          throw new Error("In-app support is not configured.");
        }
        await onSubmitInApp({ message: message.trim(), diagnostics });
        showToast("Report sent to IT support.", "success");
      } else {
        // Open email client for direct support response
        window.location.href = mailtoHref;
        showToast("Opening your email client to send the report…", "success");
      }

      onClose();
      setMessage("");
      onSubmitted?.();
    } catch (e: any) {
      showToast(e?.message || "Failed to submit report", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        `Problem:\n${message}\n\nDiagnostics:\n${diagnostics}\n`
      );
      showToast("Copied report details to clipboard.", "success");
    } catch {
      showToast("Could not copy to clipboard.", "error");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Report a Problem</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {mode === "inApp" ? "Send this directly to support in-app." : `We’ll respond via \`${contactEmail}\`.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            What happened?
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Describe the issue and what you were trying to do…"
          />

          <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Diagnostics</p>
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
              >
                Copy
              </button>
            </div>
            <pre className="text-[11px] leading-relaxed whitespace-pre-wrap text-gray-700 dark:text-gray-300">
              {diagnostics}
            </pre>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="px-4 py-2 rounded-md text-sm bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {isSubmitting ? "Sending…" : mode === "inApp" ? "Send Report" : "Email Support"}
          </button>
        </div>
      </div>
    </div>
  );
};


