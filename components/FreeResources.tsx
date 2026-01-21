import React, { useState } from 'react';
import { useAppContext } from './AppContext';
import { DownloadIcon, FileIcon, CalendarIcon, SparklesIcon } from './icons/UIIcons';

interface Resource {
  id: string;
  title: string;
  description: string;
  type: 'template' | 'guide' | 'calendar';
  downloadUrl: string;
  icon: React.ReactNode;
  category: string;
}

const resources: Resource[] = [
  {
    id: 'content-calendar',
    title: '30-Day Content Calendar Template',
    description: 'Plan your entire month with this comprehensive content calendar. Includes posting schedules, content themes, and engagement tracking.',
    type: 'calendar',
    downloadUrl: '/templates/content-calendar-template.xlsx',
    icon: <CalendarIcon className="w-8 h-8" />,
    category: 'Planning',
  },
  {
    id: 'caption-templates',
    title: '100+ Caption Templates Library',
    description: 'Ready-to-use caption templates for Instagram, TikTok, Twitter, and more. Organized by niche and engagement style.',
    type: 'template',
    downloadUrl: '/templates/caption-templates-library.pdf',
    icon: <FileIcon className="w-8 h-8" />,
    category: 'Content',
  },
  {
    id: 'engagement-scripts',
    title: 'Engagement & Reply Scripts',
    description: 'Professional scripts for responding to comments, DMs, and building relationships with your audience.',
    type: 'template',
    downloadUrl: '/templates/engagement-scripts.pdf',
    icon: <SparklesIcon className="w-8 h-8" />,
    category: 'Engagement',
  },
  {
    id: 'content-strategy-guide',
    title: 'Content Strategy Playbook',
    description: 'Step-by-step guide to building a winning content strategy. Includes audience analysis, content pillars, and growth tactics.',
    type: 'guide',
    downloadUrl: '/templates/content-strategy-playbook.pdf',
    icon: <FileIcon className="w-8 h-8" />,
    category: 'Strategy',
  },
  {
    id: 'hashtag-research',
    title: 'Hashtag Research Worksheet',
    description: 'Systematic approach to finding and organizing the best hashtags for your niche. Includes tracking and performance analysis.',
    type: 'template',
    downloadUrl: '/templates/hashtag-research-worksheet.xlsx',
    icon: <FileIcon className="w-8 h-8" />,
    category: 'Growth',
  },
  {
    id: 'analytics-dashboard',
    title: 'Social Media Analytics Tracker',
    description: 'Track your growth metrics, engagement rates, and content performance all in one place. Monthly and weekly views included.',
    type: 'template',
    downloadUrl: '/templates/analytics-tracker.xlsx',
    icon: <CalendarIcon className="w-8 h-8" />,
    category: 'Analytics',
  },
];

export const FreeResources: React.FC = () => {
  const { user, showToast } = useAppContext();
  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      showToast('Please enter a valid email address', 'error');
      return;
    }
    setSubmittedEmail(email);
    showToast('Email saved! You can now download any resource.', 'success');
  };

  const handleDownload = async (resource: Resource) => {
    // If user is logged in, use their email. Otherwise require email submission.
    const userEmail = user?.email || submittedEmail;
    
    if (!userEmail) {
      showToast('Please enter your email to download resources', 'error');
      return;
    }

    setDownloading(resource.id);
    
    try {
      // Fetch the resource from API endpoint
      const response = await fetch(`/api/getResourceTemplate?resourceId=${resource.id}`);
      
      if (!response.ok) {
        throw new Error('Failed to download resource');
      }

      // Get the file content
      const blob = await response.blob();
      
      // Determine file extension based on resource type
      let extension = '.csv';
      if (resource.id === 'caption-templates' || resource.id === 'engagement-scripts' || resource.id === 'content-strategy-guide') {
        extension = '.csv';
      } else if (resource.id.includes('calendar') || resource.id.includes('tracker') || resource.id.includes('worksheet')) {
        extension = '.csv'; // CSV files open in Excel
      }
      
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${resource.id.replace(/-/g, '_')}${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      showToast(`Downloaded ${resource.title}!`, 'success');
      
      // Track download (you can add analytics here)
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'download', {
          resource_id: resource.id,
          resource_title: resource.title,
          resource_type: resource.type,
        });
      }
    } catch (error) {
      console.error('Download error:', error);
      showToast('Failed to download resource. Please try again.', 'error');
    } finally {
      setDownloading(null);
    }
  };

  const categories = Array.from(new Set(resources.map(r => r.category)));

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Free Resources for Creators
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Download professional templates, guides, and tools to level up your content game. 
            All resources are free and ready to use.
          </p>
        </div>

        {/* Email Capture (if not logged in and not submitted) */}
        {!user && !submittedEmail && (
          <div className="max-w-md mx-auto mb-12 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Get Instant Access
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Enter your email to download any resource. We'll also send you updates on new templates and guides.
            </p>
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
              <button
                type="submit"
                className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl"
              >
                Get Access
              </button>
            </form>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 text-center">
              No spam. Unsubscribe anytime.
            </p>
          </div>
        )}

        {/* Resources Grid */}
        <div className="space-y-8">
          {categories.map((category) => (
            <div key={category}>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <span className="w-1 h-8 bg-gradient-to-b from-purple-500 to-indigo-500 rounded-full"></span>
                {category}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {resources
                  .filter((r) => r.category === category)
                  .map((resource) => (
                    <div
                      key={resource.id}
                      className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-xl transition-all border border-gray-200 dark:border-gray-700 p-6 flex flex-col"
                    >
                      <div className="flex items-start gap-4 mb-4">
                        <div className="p-3 bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 rounded-lg">
                          <div className="text-purple-600 dark:text-purple-400">
                            {resource.icon}
                          </div>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                            {resource.title}
                          </h3>
                          <span className="inline-block px-2 py-1 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                            {resource.type === 'template' ? 'Template' : resource.type === 'guide' ? 'Guide' : 'Calendar'}
                          </span>
                        </div>
                      </div>
                      
                      <p className="text-gray-600 dark:text-gray-400 mb-6 flex-1">
                        {resource.description}
                      </p>
                      
                      <button
                        onClick={() => handleDownload(resource)}
                        disabled={downloading === resource.id}
                        className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {downloading === resource.id ? (
                          <>
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Downloading...
                          </>
                        ) : (
                          <>
                            <DownloadIcon className="w-5 h-5" />
                            Download Free
                          </>
                        )}
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {/* CTA Section */}
        <div className="mt-16 text-center bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-12 text-white">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Take Your Content to the Next Level?
          </h2>
          <p className="text-xl mb-8 text-purple-100">
            Join thousands of creators using EchoFlux.ai to create, schedule, and grow their audience.
          </p>
          <button
            onClick={() => {
              if (user) {
                window.location.href = '/dashboard';
              } else {
                window.location.href = '/pricing';
              }
            }}
            className="px-8 py-4 bg-white text-purple-600 rounded-lg font-bold text-lg hover:bg-purple-50 transition-all shadow-lg hover:shadow-xl"
          >
            {user ? 'Go to Dashboard' : 'Start Free Trial'}
          </button>
        </div>
      </div>
    </div>
  );
};
