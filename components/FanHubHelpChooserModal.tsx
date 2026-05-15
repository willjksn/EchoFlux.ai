import React from "react";
import { XMarkIcon } from "./icons/UIIcons";

export interface FanHubHelpChooserModalProps {
  isOpen: boolean;
  onClose: () => void;
  fanBrand: string;
  creatorDisplayName: string;
  /** Creator storefront theme primary (hex), for member-facing accents. */
  primaryColor?: string;
  onChooseReport: () => void;
  onChooseContact: () => void;
}

export const FanHubHelpChooserModal: React.FC<FanHubHelpChooserModalProps> = ({
  isOpen,
  onClose,
  fanBrand,
  creatorDisplayName,
  primaryColor = "#6366f1",
  onChooseReport,
  onChooseContact,
}) => {
  if (!isOpen) return null;

  const hubLabel = creatorDisplayName.trim() ? `${creatorDisplayName.trim()}'s hub` : "this member page";
  const shellBorder = `color-mix(in srgb, ${primaryColor} 30%, rgb(229 231 235))`;
  const shellBg = `linear-gradient(165deg, color-mix(in srgb, ${primaryColor} 12%, rgb(255 255 255)) 0%, color-mix(in srgb, ${primaryColor} 6%, rgb(243 244 246)) 38%, rgb(241 245 249) 100%)`;
  const cardSurface = `color-mix(in srgb, ${primaryColor} 5%, rgb(255 255 255))`;
  const cardBorder = `color-mix(in srgb, ${primaryColor} 22%, rgb(226 232 240))`;
  const cardBorderHover = `color-mix(in srgb, ${primaryColor} 42%, rgb(203 213 225))`;
  const subtitleTint = `color-mix(in srgb, ${primaryColor} 22%, rgb(71 85 105))`;

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fan-help-chooser-title"
        className="relative w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-2xl shadow-2xl dark:border dark:border-gray-700"
        style={{
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: shellBorder,
          background: shellBg,
        }}
      >
        <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: primaryColor }} aria-hidden />

        <div className="p-6 sm:p-8 space-y-8 max-h-[calc(92vh-0.375rem)] overflow-y-auto">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-6 p-2 rounded-full transition-colors text-gray-500 z-10"
            style={{
              backgroundColor: "color-mix(in srgb, white 88%, transparent)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${primaryColor} 14%, white)`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "color-mix(in srgb, white 88%, transparent)";
            }}
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>

          <div className="text-center px-2 sm:px-8 pr-10">
            <h2 id="fan-help-chooser-title" className="text-3xl font-bold" style={{ color: primaryColor }}>
              How can we help?
            </h2>
            <p
              className="mt-2 text-lg max-w-2xl mx-auto font-medium"
              style={{ color: subtitleTint }}
            >
              We&apos;d love to hear from you! Pick the option that best matches what you need.
            </p>
          </div>

          <div
            className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8"
            style={{ ["--help-accent" as string]: primaryColor }}
          >
            <button
              type="button"
              onClick={onChooseReport}
              className="text-left p-8 rounded-xl shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--help-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(243,244,246)] dark:focus-visible:ring-offset-gray-900"
              style={{
                backgroundColor: cardSurface,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: cardBorder,
                boxShadow: `0 1px 2px color-mix(in srgb, ${primaryColor} 8%, transparent)`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = cardBorderHover;
                e.currentTarget.style.boxShadow = `0 4px 14px color-mix(in srgb, ${primaryColor} 16%, transparent)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = cardBorder;
                e.currentTarget.style.boxShadow = `0 1px 2px color-mix(in srgb, ${primaryColor} 8%, transparent)`;
              }}
            >
              <h3 className="text-2xl font-bold mb-4" style={{ color: primaryColor }}>
                Report a problem
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                Something broke or misbehaved on {hubLabel} — errors, media, checkout, or other technical issues. This
                goes to the team supporting this page.
              </p>
            </button>
            <button
              type="button"
              onClick={onChooseContact}
              className="text-left p-8 rounded-xl shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--help-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(243,244,246)] dark:focus-visible:ring-offset-gray-900"
              style={{
                backgroundColor: cardSurface,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: cardBorder,
                boxShadow: `0 1px 2px color-mix(in srgb, ${primaryColor} 8%, transparent)`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = cardBorderHover;
                e.currentTarget.style.boxShadow = `0 4px 14px color-mix(in srgb, ${primaryColor} 16%, transparent)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = cardBorder;
                e.currentTarget.style.boxShadow = `0 1px 2px color-mix(in srgb, ${primaryColor} 8%, transparent)`;
              }}
            >
              <h3 className="text-2xl font-bold mb-4" style={{ color: primaryColor }}>
                Contact support
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                General questions about {fanBrand} — your account, billing, safety, or feedback about the site (not
                specific to one creator&apos;s content).
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
