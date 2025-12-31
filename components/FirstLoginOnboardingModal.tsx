import React from 'react';
import { XIcon } from './icons/UIIcons';
import { WAITLIST_EMAIL_TEMPLATES } from '../api/_waitlistEmailTemplates';

interface FirstLoginOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string | null;
}

export const FirstLoginOnboardingModal: React.FC<FirstLoginOnboardingModalProps> = ({
  isOpen,
  onClose,
  userName,
}) => {
  if (!isOpen) return null;

  const message = WAITLIST_EMAIL_TEMPLATES.firstLoginOnboarding(userName || null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Welcome to EchoFlux.ai — Early Testing Access
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <XIcon />
          </button>
        </div>
        <div className="px-6 py-6">
          <div className="prose dark:prose-invert max-w-none">
            <pre className="whitespace-pre-wrap text-gray-700 dark:text-gray-300 font-sans text-sm leading-relaxed">
              {message}
            </pre>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 transition-colors"
            >
              Got it, let's get started!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

