import React from 'react';
import { LogoIcon } from './icons/UIIcons';

interface InviteOnlyPageProps {
  email?: string | null;
  onSignOut?: () => void;
}

export const InviteOnlyPage: React.FC<InviteOnlyPageProps> = ({ email, onSignOut }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center">
        <div className="flex justify-center mb-8">
          <div className="flex items-center">
            <LogoIcon />
            <span className="ml-2 text-2xl font-bold text-white">EchoFlux.ai</span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 md:p-12">
          <div className="mb-6">
            <div className="inline-block px-4 py-2 mb-4 rounded-full bg-primary-100 text-primary-800 font-semibold text-sm dark:bg-primary-900/30 dark:text-primary-200">
              INVITE‑ONLY BETA
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              You need an invite to access EchoFlux.ai
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              We’re onboarding a small number of creators first so we can deliver fast support and iterate quickly.
            </p>
          </div>

          {email && (
            <div className="bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-gray-700 dark:text-gray-200">
                Signed in as: <span className="font-semibold">{email}</span>
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                This email is not on the current beta allowlist.
              </p>
            </div>
          )}

          <div className="text-sm text-gray-600 dark:text-gray-300">
            <p>
              To request access, email{' '}
              <a href="mailto:contact@echoflux.ai" className="text-primary-600 dark:text-primary-400 hover:underline font-semibold">
                contact@echoflux.ai
              </a>
              .
            </p>
          </div>

          {onSignOut && (
            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={onSignOut}
                className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>

        <div className="mt-8 text-sm text-gray-400">
          <p>&copy; {new Date().getFullYear()} EchoFlux.ai. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};


