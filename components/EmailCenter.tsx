import React, { useState } from 'react';
import { BioPageEmailDashboard } from './BioPageEmailDashboard';
import { EmailHistory } from './EmailHistory';
import { EmailTemplatesManager } from './EmailTemplatesManager';
import { ScheduledEmailManager } from './ScheduledEmailManager';
import { MassEmailComposer } from './MassEmailComposer';

type EmailSection = 'send' | 'history' | 'templates' | 'scheduled' | 'bio';

export const EmailCenter: React.FC = () => {
  const [section, setSection] = useState<EmailSection>('send');
  const [isMassEmailOpen, setIsMassEmailOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Email</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Everything email-related in one place: send, templates, scheduling, history, and bio-page subscribers.
          </p>
        </div>
        <button
          onClick={() => setIsMassEmailOpen(true)}
          className="px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700"
        >
          Send Email
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
        <button
          onClick={() => setSection('send')}
          className={`px-4 py-2 rounded-md transition-colors ${section === 'send' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
        >
          Send
        </button>
        <button
          onClick={() => setSection('templates')}
          className={`px-4 py-2 rounded-md transition-colors ${section === 'templates' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
        >
          Templates
        </button>
        <button
          onClick={() => setSection('scheduled')}
          className={`px-4 py-2 rounded-md transition-colors ${section === 'scheduled' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
        >
          Scheduled
        </button>
        <button
          onClick={() => setSection('history')}
          className={`px-4 py-2 rounded-md transition-colors ${section === 'history' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
        >
          History
        </button>
        <button
          onClick={() => setSection('bio')}
          className={`px-4 py-2 rounded-md transition-colors ${section === 'bio' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
        >
          Bio Emails
        </button>
      </div>

      {section === 'send' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
          <div className="text-lg font-semibold text-gray-900 dark:text-white">Send emails</div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Use the button above to send a mass email to users (with optional filters and templates).
          </p>
          <div className="mt-4">
            <button
              onClick={() => setIsMassEmailOpen(true)}
              className="px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700"
            >
              Open Mass Email Composer
            </button>
          </div>
        </div>
      )}

      {/* These sub-pages already have their own padding; cancel the parent padding for clean alignment */}
      {section === 'templates' && (
        <div className="-mx-6">
          <EmailTemplatesManager />
        </div>
      )}
      {section === 'scheduled' && (
        <div className="-mx-6">
          <ScheduledEmailManager />
        </div>
      )}
      {section === 'history' && (
        <div className="-mx-6">
          <EmailHistory />
        </div>
      )}
      {section === 'bio' && (
        <div className="-mx-6">
          <BioPageEmailDashboard />
        </div>
      )}

      <MassEmailComposer isOpen={isMassEmailOpen} onClose={() => setIsMassEmailOpen(false)} />
    </div>
  );
};


