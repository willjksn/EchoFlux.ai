import React, { useEffect, useMemo, useState, useRef } from "react";
import { MailIcon, XMarkIcon } from "./icons/UIIcons";
import { useAppContext } from "./AppContext";
import { auth } from "../firebaseConfig";
import {
  uploadFanSupportScreenshot,
  FAN_SUPPORT_SCREENSHOT_MAX_BYTES,
  FAN_SUPPORT_SCREENSHOT_MAX_FILES,
} from "../src/lib/supportTicketImageUpload";

const FORM_FIELD_CLASS =
  "mt-1 w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400";

interface ReportProblemModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Destination address for mailto when `mode` is `email`. */
  contactEmail?: string;
  /** Brand/support name used in email subject/body copy and headings. */
  supportName?: string;
  /** Shown on `contactPage` layout in the Support row; omit for “thread only” messaging. */
  panelSupportEmail?: string | null;
  /** Submission channel. `platform` posts to `/api/reportProblem`; `inApp` uses creator-scoped tickets. */
  mode?: "email" | "inApp" | "platform";
  /** Override `Page:` line in diagnostics and `page` on the ticket (recommended in Fan Hub). */
  pageLabelForReporting?: string;
  /** When `mode` is `platform`, stored on the ticket as `contact` vs `it_support`. */
  platformInboxBucket?: "contact" | "it_support";
  /** Optional callback for in-app support submission. */
  onSubmitInApp?: (payload: { message: string; diagnostics: string; attachmentUrls?: string[] }) => Promise<void>;
  /** Optional callback after successful submit. */
  onSubmitted?: () => void;
  /** Default compact dialog; `contactPage` matches the creator Contact screen (two-column). */
  layout?: "standard" | "contactPage";
  /** If set with `contactPage`, shows “Back” to reopen the Help chooser. */
  onBack?: () => void;
  /** When false, hides the diagnostics pre/copy UI; data is still sent to the server. Default true (creator app / email flow). */
  showDiagnosticsUi?: boolean;
  /** Screenshot uploads (Firebase Storage → URLs on ticket). Defaults to true when `layout` is `contactPage`. */
  allowImageAttachments?: boolean;
  /** Extra lines appended to diagnostics (e.g. member @username + creator handle on fan hubs). */
  additionalDiagnosticsLines?: string[];
  /**
   * Fan hub: server validates this creators/{id} doc and stores creatorId/handle on platform tickets for admin triage.
   */
  hubCreatorId?: string | null;
}

export const ReportProblemModal: React.FC<ReportProblemModalProps> = ({
  isOpen,
  onClose,
  contactEmail = "contact@echoflux.ai",
  supportName = "EchoFlux",
  panelSupportEmail,
  mode = "email",
  pageLabelForReporting,
  platformInboxBucket = "contact",
  onSubmitInApp,
  onSubmitted,
  layout = "standard",
  onBack,
  showDiagnosticsUi = true,
  allowImageAttachments,
  additionalDiagnosticsLines,
  hubCreatorId,
}) => {
  const { user, activePage, showToast } = useAppContext();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** Pending images (preview uses object URLs). */
  const [screenshotItems, setScreenshotItems] = useState<{ id: string; file: File; previewUrl: string }[]>([]);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  const allowScreenshots = allowImageAttachments ?? layout === "contactPage";

  const pageLabel = pageLabelForReporting ?? activePage;

  const diagnostics = useMemo(() => {
    const lines: string[] = [];
    lines.push(`User: ${user?.email || auth.currentUser?.email || "unknown"} (${user?.id || auth.currentUser?.uid || "unknown"})`);
    lines.push(`Plan: ${user?.plan || "unknown"} | Role: ${user?.role || "unknown"}`);
    lines.push(`Page: ${pageLabel}`);
    lines.push(`URL: ${typeof window !== "undefined" ? window.location.href : ""}`);
    lines.push(`Time: ${new Date().toISOString()}`);
    lines.push(`User-Agent: ${typeof navigator !== "undefined" ? navigator.userAgent : ""}`);
    for (const line of additionalDiagnosticsLines || []) {
      const t = typeof line === "string" ? line.trim() : "";
      if (t) lines.push(t);
    }
    return lines.join("\n");
  }, [user?.email, user?.id, user?.plan, user?.role, pageLabel, additionalDiagnosticsLines]);

  const readonlyName =
    auth.currentUser?.displayName?.trim() ||
    user?.displayName?.trim() ||
    user?.name?.trim() ||
    "";
  const readonlyEmail = auth.currentUser?.email || user?.email || "";

  const mailtoHref = useMemo(() => {
    const subject = `${supportName} Bug Report (${user?.email || auth.currentUser?.email || "unknown"})`;
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

  const removeScreenshot = (id: string) => {
    setScreenshotItems((prev) => {
      const t = prev.find((p) => p.id === id);
      if (t) URL.revokeObjectURL(t.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const onScreenshotFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setScreenshotItems((prev) => {
      let room = FAN_SUPPORT_SCREENSHOT_MAX_FILES - prev.length;
      if (room <= 0) {
        showToast(`You can attach up to ${FAN_SUPPORT_SCREENSHOT_MAX_FILES} images.`, "info");
        return prev;
      }
      const next = [...prev];
      let skippedKind = false;
      for (const f of files) {
        if (room <= 0) break;
        if (!f.type.startsWith("image/")) {
          skippedKind = true;
          continue;
        }
        if (f.size > FAN_SUPPORT_SCREENSHOT_MAX_BYTES) {
          showToast("Each screenshot must be 5 MB or smaller.", "error");
          continue;
        }
        next.push({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
          file: f,
          previewUrl: URL.createObjectURL(f),
        });
        room--;
      }
      if (skippedKind) {
        showToast("Only image files can be attached as screenshots.", "info");
      }
      return next;
    });
  };

  const uploadPendingScreenshots = async (): Promise<string[]> => {
    if (!allowScreenshots || screenshotItems.length === 0) return [];
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Please sign in to attach images.");
    const urls: string[] = [];
    for (const item of screenshotItems) {
      urls.push(await uploadFanSupportScreenshot(uid, item.file));
    }
    return urls;
  };

  useEffect(() => {
    if (!isOpen) {
      setMessage("");
      setIsSubmitting(false);
      setScreenshotItems((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
        return [];
      });
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!message.trim()) {
      showToast("Please describe the issue.", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const attachmentUrls = await uploadPendingScreenshots();
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const trimmedHubCreatorId = hubCreatorId?.trim();
      const platformPayload = {
        message: message.trim(),
        diagnostics,
        page: pageLabel,
        url: typeof window !== "undefined" ? window.location.href : "",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        ...(attachmentUrls.length > 0 ? { attachmentUrls } : {}),
        ...(trimmedHubCreatorId ? { hubCreatorId: trimmedHubCreatorId } : {}),
      };

      if (mode === "platform") {
        if (!token) throw new Error("Please sign in to contact support.");
        const res = await fetch("/api/reportProblem", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...platformPayload,
            inboxBucket: platformInboxBucket,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !(data as { success?: boolean }).success) {
          throw new Error((data as { error?: string }).error || "Failed to send message");
        }
        showToast(
          `Message sent to ${supportName}. You can follow up under Support threads on your profile.`,
          "success"
        );
        onClose();
        setMessage("");
        onSubmitted?.();
        return;
      }

      const skipDuplicatePlatformTicket = mode === "inApp" && typeof onSubmitInApp === "function";
      if (token && !skipDuplicatePlatformTicket) {
        await fetch("/api/reportProblem", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...platformPayload,
            inboxBucket: "it_support",
          }),
        }).catch(() => {});
      }

      if (mode === "inApp") {
        if (!onSubmitInApp) {
          throw new Error("In-app support is not configured.");
        }
        await onSubmitInApp({
          message: message.trim(),
          diagnostics,
          ...(attachmentUrls.length > 0 ? { attachmentUrls } : {}),
        });
        showToast("Report sent to IT support.", "success");
      } else {
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
      await navigator.clipboard.writeText(`Problem:\n${message}\n\nDiagnostics:\n${diagnostics}\n`);
      showToast("Copied report details to clipboard.", "success");
    } catch {
      showToast("Could not copy to clipboard.", "error");
    }
  };

  if (!isOpen) return null;

  const infoEmail = (panelSupportEmail ?? "").trim() || null;

  const isPlatformContactBucket = mode === "platform" && platformInboxBucket === "contact";
  const isPlatformItBucket = mode === "platform" && platformInboxBucket === "it_support";

  const contactPageHeroTitle =
    isPlatformContactBucket
      ? `Contact ${supportName}`
      : isPlatformItBucket
        ? "Report a problem"
        : mode === "inApp"
          ? "Report a problem"
          : `Contact ${supportName}`;

  const contactPageHeroSubtitle = isPlatformContactBucket
    ? `Questions about ${supportName} — account, billing, safety, or general feedback.`
    : isPlatformItBucket
      ? `Tell us what went wrong in the EchoFlux creator app — dashboard, payouts, storefront tools, or media.`
      : mode === "inApp"
        ? "Tell us what went wrong on this member hub. We’ll share this with the support team for this page."
        : `Questions about ${supportName} — account, billing, safety, or general feedback.`;

  const contactPageMessagePlaceholder = isPlatformContactBucket
    ? "What do you need help with? Include dates, charges, or usernames if relevant."
    : isPlatformItBucket
      ? "What happened, what you expected, and any error text or steps to reproduce…"
      : mode === "inApp"
        ? "What happened, what you expected, and any error text or steps to reproduce…"
        : "What do you need help with? Include dates, charges, or usernames if relevant.";

  const standardModalTitle = isPlatformItBucket
    ? "Report a problem"
    : mode === "platform"
      ? `Contact ${supportName}`
      : "Report a Problem";

  const standardModalSubtitle = isPlatformContactBucket
    ? `Reach the ${supportName} team about billing, account access, safety, or general questions.`
    : isPlatformItBucket
      ? `Technical issues with EchoFlux — include what you tried and any error messages.`
      : mode === "inApp"
        ? "Send this directly to support in-app."
        : `We’ll respond via \`${contactEmail}\`.`;

  if (layout === "contactPage") {
    return (
      <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6">
        <div
          role="dialog"
          aria-modal="true"
          className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-gray-100 dark:bg-gray-950 shadow-2xl border border-gray-200 dark:border-gray-800"
        >
          <div className="absolute right-3 top-3 flex items-center gap-1 z-10">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
              >
                ← Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500"
              aria-label="Close"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 sm:p-8 space-y-8">
            <div className="text-center px-2">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{contactPageHeroTitle}</h2>
              <p className="mt-2 text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">{contactPageHeroSubtitle}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Send us a message</h3>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="fan-help-readonly-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Your name
                    </label>
                    <input
                      id="fan-help-readonly-name"
                      type="text"
                      readOnly
                      value={readonlyName || "—"}
                      className={`${FORM_FIELD_CLASS} opacity-90 cursor-not-allowed`}
                    />
                  </div>
                  <div>
                    <label htmlFor="fan-help-readonly-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Your email
                    </label>
                    <input
                      id="fan-help-readonly-email"
                      type="email"
                      readOnly
                      value={readonlyEmail || "—"}
                      className={`${FORM_FIELD_CLASS} opacity-90 cursor-not-allowed`}
                    />
                  </div>
                  <div>
                    <label htmlFor="fan-help-message" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Message
                    </label>
                    <textarea
                      id="fan-help-message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={5}
                      className={FORM_FIELD_CLASS}
                      placeholder={contactPageMessagePlaceholder}
                    />
                  </div>
                  {allowScreenshots ? (
                    <div className="space-y-2">
                      <input
                        ref={screenshotInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="sr-only"
                        aria-hidden
                        tabIndex={-1}
                        onChange={onScreenshotFiles}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={isSubmitting || screenshotItems.length >= FAN_SUPPORT_SCREENSHOT_MAX_FILES}
                          onClick={() => screenshotInputRef.current?.click()}
                          className="px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                        >
                          Add screenshot
                        </button>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Optional — up to {FAN_SUPPORT_SCREENSHOT_MAX_FILES} images,{" "}
                          {FAN_SUPPORT_SCREENSHOT_MAX_BYTES / (1024 * 1024)} MB each.
                        </span>
                      </div>
                      {screenshotItems.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {screenshotItems.map((s) => (
                            <div
                              key={s.id}
                              className="relative h-16 w-16 rounded border overflow-hidden border-gray-200 dark:border-gray-600 shrink-0"
                            >
                              <img src={s.previewUrl} alt="" className="h-full w-full object-cover" />
                              <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => removeScreenshot(s.id)}
                                aria-label="Remove screenshot"
                                className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold leading-none text-white shadow hover:bg-red-700 disabled:opacity-40"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleSubmit}
                    className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50"
                  >
                    {isSubmitting
                      ? "Sending…"
                      : isPlatformContactBucket
                        ? "Submit"
                        : isPlatformItBucket || mode === "inApp"
                          ? "Submit report"
                          : "Submit"}
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Contact information</h3>
                <div className="space-y-4 text-gray-700 dark:text-gray-300">
                  {mode === "platform" ? (
                    <>
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          <MailIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {isPlatformItBucket ? "EchoFlux support" : "Support"}
                          </p>
                          {infoEmail ? (
                            <>
                              <a
                                href={`mailto:${infoEmail}`}
                                className="text-primary-600 dark:text-primary-400 font-medium break-all"
                              >
                                {infoEmail}
                              </a>
                              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                You can also email us directly. Include the same details you add in your message.
                              </p>
                            </>
                          ) : (
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                              Replies are sent in-app. After you submit, check <span className="font-semibold">Support threads</span>{" "}
                              on your profile for updates.
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="p-4 bg-gray-50 dark:bg-gray-700/40 rounded-lg border border-gray-200 dark:border-gray-600">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">What helps us most</p>
                        <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 list-disc pl-5">
                          <li>The email you use to sign in</li>
                          <li>What you were trying to do</li>
                          <li>Screenshots or error text, if you have them</li>
                        </ul>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          <MailIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">Hub support</p>
                          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                            This report is tied to your account and the member page you&apos;re on. Support can follow up
                            in your <span className="font-semibold">Support threads</span>.
                          </p>
                        </div>
                      </div>
                      <div className="p-4 bg-gray-50 dark:bg-gray-700/40 rounded-lg border border-gray-200 dark:border-gray-600">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">To help us fix it faster</p>
                        <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 list-disc pl-5">
                          <li>What section you were in (Feed, Messages, Store, …)</li>
                          <li>What you tapped and what you expected</li>
                          <li>Error text or a screenshot</li>
                        </ul>
                      </div>
                    </>
                  )}

                  {showDiagnosticsUi ? (
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 p-3">
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
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                      Page address, time, and basic device details are attached to your submission automatically so support
                      can help — you don&apos;t need to copy anything here.
                    </p>
                  )}

                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {standardModalTitle}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {standardModalSubtitle}
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
            {isPlatformContactBucket ? "Your message" : "What happened?"}
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder={
              isPlatformContactBucket
                ? "What do you need help with? Include any relevant dates, charges, or usernames."
                : "Describe the issue and what you were trying to do…"
            }
          />

          {showDiagnosticsUi ? (
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
          ) : null}
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
            {isSubmitting
              ? "Sending…"
              : isPlatformContactBucket
                ? "Send message"
                : isPlatformItBucket || mode === "inApp"
                  ? "Send Report"
                  : "Email Support"}
          </button>
        </div>
      </div>
    </div>
  );
};
