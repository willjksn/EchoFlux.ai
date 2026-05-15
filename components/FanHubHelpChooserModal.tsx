import React from "react";
import { XMarkIcon } from "./icons/UIIcons";
import { ECHOFLUX_APP_ACCENT_HEX } from "../constants";

export interface FanHubHelpChooserModalProps {
  isOpen: boolean;
  onClose: () => void;
  fanBrand: string;
  creatorDisplayName: string;
  /** Creator storefront theme primary (hex), for member-facing accents. */
  primaryColor?: string;
  /** Member hub (default) vs EchoFlux creator app profile — copy and routing hints only (both use your handlers). */
  variant?: "fanHub" | "creatorApp";
  onChooseReport: () => void;
  onChooseContact: () => void;
}

export const FanHubHelpChooserModal: React.FC<FanHubHelpChooserModalProps> = ({
  isOpen,
  onClose,
  fanBrand,
  creatorDisplayName,
  primaryColor = ECHOFLUX_APP_ACCENT_HEX,
  variant = "fanHub",
  onChooseReport,
  onChooseContact,
}) => {
  if (!isOpen) return null;

  /** Member hub: use the storefront/creator theme primary. Creator app / EchoFlux: always platform indigo. */
  const accent =
    variant === "creatorApp"
      ? ECHOFLUX_APP_ACCENT_HEX
      : (primaryColor || ECHOFLUX_APP_ACCENT_HEX);

  const hubLabel = creatorDisplayName.trim() ? `${creatorDisplayName.trim()}'s hub` : "this member page";
  const shellBorder = `color-mix(in srgb, ${accent} 30%, rgb(229 231 235))`;
  const shellBg = `linear-gradient(165deg, color-mix(in srgb, ${accent} 12%, rgb(255 255 255)) 0%, color-mix(in srgb, ${accent} 6%, rgb(243 244 246)) 38%, rgb(241 245 249) 100%)`;
  const cardSurface = `color-mix(in srgb, ${accent} 5%, rgb(255 255 255))`;
  const cardBorder = `color-mix(in srgb, ${accent} 22%, rgb(226 232 240))`;
  const cardBorderHover = `color-mix(in srgb, ${accent} 42%, rgb(203 213 225))`;
  const subtitleTint = `color-mix(in srgb, ${accent} 22%, rgb(71 85 105))`;

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
        <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: accent }} aria-hidden />

        <div className="p-6 sm:p-8 space-y-8 max-h-[calc(92vh-0.375rem)] overflow-y-auto">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-6 p-2 rounded-full transition-colors text-gray-500 z-10"
            style={{
              backgroundColor: "color-mix(in srgb, white 88%, transparent)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${accent} 14%, white)`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "color-mix(in srgb, white 88%, transparent)";
            }}
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>

          <div className="text-center px-2 sm:px-8 pr-10">
            <h2 id="fan-help-chooser-title" className="text-3xl font-bold" style={{ color: accent }}>
              How can we help?
            </h2>
            <p
              className="mt-2 text-lg max-w-2xl mx-auto font-medium"
              style={{ color: subtitleTint }}
            >
              {variant === "creatorApp"
                ? "Reach EchoFlux support from your creator account. Pick the option that best matches what you need."
                : "We&apos;d love to hear from you! Pick the option that best matches what you need."}
            </p>
          </div>

          <div
            className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8"
            style={{ ["--help-accent" as string]: accent }}
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
                boxShadow: `0 1px 2px color-mix(in srgb, ${accent} 8%, transparent)`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = cardBorderHover;
                e.currentTarget.style.boxShadow = `0 4px 14px color-mix(in srgb, ${accent} 16%, transparent)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = cardBorder;
                e.currentTarget.style.boxShadow = `0 1px 2px color-mix(in srgb, ${accent} 8%, transparent)`;
              }}
            >
              <h3 className="text-2xl font-bold mb-4" style={{ color: accent }}>
                Report a problem
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {variant === "creatorApp"
                  ? "Something isn’t working in the EchoFlux creator app or your dashboard — tools, payouts, media, checkout, or other technical issues. This goes to EchoFlux support."
                  : `Something broke or misbehaved on ${hubLabel} — errors, media, checkout, or other technical issues. This goes to the team supporting this page.`}
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
                boxShadow: `0 1px 2px color-mix(in srgb, ${accent} 8%, transparent)`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = cardBorderHover;
                e.currentTarget.style.boxShadow = `0 4px 14px color-mix(in srgb, ${accent} 16%, transparent)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = cardBorder;
                e.currentTarget.style.boxShadow = `0 1px 2px color-mix(in srgb, ${accent} 8%, transparent)`;
              }}
            >
              <h3 className="text-2xl font-bold mb-4" style={{ color: accent }}>
                Contact support
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {variant === "creatorApp"
                  ? "General questions about EchoFlux — your creator account, billing, payouts, safety, policies, or feedback about the platform."
                  : `General questions about ${fanBrand} — your account, billing, safety, or feedback about the site (not specific to one creator's content).`}
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
