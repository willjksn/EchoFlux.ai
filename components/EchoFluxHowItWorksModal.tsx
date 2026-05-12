import React from "react";
import { XMarkIcon } from "./icons/UIIcons";

type Props = {
  open: boolean;
  onClose: () => void;
  ariaTitleId: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

/**
 * Shared “How it works” overlay (matches Creator OS help modal styling).
 */
export const EchoFluxHowItWorksModal: React.FC<Props> = ({
  open,
  onClose,
  ariaTitleId,
  title,
  subtitle,
  children,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[62] flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaTitleId}
        className="my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col rounded-xl border border-primary-100 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-primary-100 bg-gradient-to-r from-primary-50/90 to-white p-4 dark:border-gray-700 dark:from-primary-950/30 dark:to-gray-800">
          <div>
            <h3 id={ariaTitleId} className="text-lg font-semibold text-gray-900 dark:text-white">
              {title}
            </h3>
            {subtitle ? (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4 text-sm text-gray-700 dark:text-gray-300">{children}</div>

        <div className="flex justify-end gap-2 rounded-b-xl border-t border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/80">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
