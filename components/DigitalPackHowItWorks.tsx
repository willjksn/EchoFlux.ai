import React from "react";
import { EchoFluxHowItWorksModal } from "./EchoFluxHowItWorksModal";
import { MAX_DIGITAL_PACK_PREVIEW_IMAGES } from "../src/lib/digitalPackProduct";

/** Body copy for the digital pack help modal. */
export const DigitalPackHowItWorksContent: React.FC = () => (
  <>
    <section>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
        Upload once
      </h4>
      <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
        Add every photo, video, and voice note fans receive after checkout — one list, delivered automatically.
      </p>
    </section>
    <section>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
        Pick preview photos
      </h4>
      <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
        Tap <strong className="text-gray-800 dark:text-gray-200">Set as preview</strong> on up to{" "}
        {MAX_DIGITAL_PACK_PREVIEW_IMAGES} images (like choosing which feed unlock photo stays visible). Those stay{" "}
        <strong className="text-gray-800 dark:text-gray-200">sharp</strong> in your store.
      </p>
    </section>
    <section>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
        Everything else stays locked
      </h4>
      <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
        Non-preview images show blurred; videos and voice stay hidden until purchase. Fans unlock the full pack in{" "}
        <strong className="text-gray-800 dark:text-gray-200">Purchases</strong> — you do not deliver manually.
      </p>
    </section>
    <section>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
        Sales voice (optional)
      </h4>
      <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
        A short promo clip fans can play before buying. It is <em>not</em> included in the pack they receive.
      </p>
    </section>
  </>
);

/** Matches Purchases / Fan Hub “How it works” trigger styling. */
export const DigitalPackHowItWorksButton: React.FC<{
  onClick: () => void;
  className?: string;
}> = ({ onClick, className = "" }) => (
  <button
    type="button"
    className={`treats-how-it-works-btn${className ? ` ${className}` : ""}`}
    onClick={onClick}
  >
    How it works
  </button>
);

type ModalProps = {
  open: boolean;
  onClose: () => void;
};

/** Stacked above Treats product form modal (z 1000). */
export const DigitalPackHowItWorksModal: React.FC<ModalProps> = ({ open, onClose }) => (
  <EchoFluxHowItWorksModal
    open={open}
    onClose={onClose}
    overlayClassName="z-[1100]"
    ariaTitleId="digital-pack-how-title"
    title="How digital packs work"
    subtitle="Treats store → Add digital pack"
  >
    <DigitalPackHowItWorksContent />
  </EchoFluxHowItWorksModal>
);
