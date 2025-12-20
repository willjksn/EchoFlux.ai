import React, { useState } from 'react';
import { useAppContext } from './AppContext';
import { SparklesIcon, SettingsIcon } from './icons/UIIcons';
import { OnlyFansContentBrain } from './OnlyFansContentBrain';
import { OnlyFansRoleplay } from './OnlyFansRoleplay';
import { OnlyFansStudioSettings } from './OnlyFansStudioSettings';
import { OnlyFansExportHub } from './OnlyFansExportHub';
import { OnlyFansCalendar } from './OnlyFansCalendar';
import { OnlyFansMediaVault } from './OnlyFansMediaVault';
import { OnlyFansGuides } from './OnlyFansGuides';
import { OnlyFansAnalytics } from './OnlyFansAnalytics';
import { ErrorBoundary } from './ErrorBoundary';
import { ContentIntelligence } from './ContentIntelligence';

type ActiveView = 'dashboard' | 'contentBrain' | 'roleplay' | 'calendar' | 'mediaVault' | 'export' | 'guides' | 'settings' | 'analytics' | 'contentIntelligence';

export const OnlyFansStudio: React.FC = () => {
    const { user, setActivePage, showToast } = useAppContext();
    const [activeView, setActiveView] = useState<ActiveView>('dashboard');

    // Check if user has access (OnlyFansStudio, Elite, or Agency plan)
    const hasAccess = user?.plan === 'OnlyFansStudio' || user?.plan === 'Elite' || user?.plan === 'Agency';

    if (!hasAccess) {
        return (
            <div className="max-w-4xl mx-auto">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
                    <SparklesIcon className="w-16 h-16 mx-auto mb-4 text-primary-600 dark:text-primary-400" />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                        OnlyFans Studio
                    </h1>
                    <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
                        Upgrade to <strong>OnlyFans Studio</strong>, <strong>Creator Elite</strong>, or <strong>Agency</strong> to unlock OnlyFans Studio.
                    </p>
                    <p className="text-gray-500 dark:text-gray-500 mb-8">
                        OnlyFans Studio provides AI-powered content planning, roleplay ideas, body ratings, 
                        content calendars, and export packages for manual upload.
                    </p>
                    <button
                        onClick={() => setActivePage('pricing')}
                        className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold"
                    >
                        View Plans & Upgrade
                    </button>
                </div>
            </div>
        );
    }

    // If a specific view is active, show that view
    if (activeView === 'contentBrain') {
        return (
            <div className="max-w-7xl mx-auto">
                <button
                    onClick={() => setActiveView('dashboard')}
                    className="mb-4 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2"
                >
                    ← Back to OnlyFans Studio
                </button>
                <ErrorBoundary>
                    <OnlyFansContentBrain />
                </ErrorBoundary>
            </div>
        );
    }

    if (activeView === 'roleplay') {
        return (
            <div className="max-w-7xl mx-auto">
                <button
                    onClick={() => setActiveView('dashboard')}
                    className="mb-4 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2"
                >
                    ← Back to OnlyFans Studio
                </button>
                <OnlyFansRoleplay />
            </div>
        );
    }

    if (activeView === 'settings') {
        return (
            <div className="max-w-7xl mx-auto">
                <button
                    onClick={() => setActiveView('dashboard')}
                    className="mb-4 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2"
                >
                    ← Back to OnlyFans Studio
                </button>
                <OnlyFansStudioSettings />
            </div>
        );
    }

    if (activeView === 'export') {
        return (
            <div className="max-w-7xl mx-auto">
                <button
                    onClick={() => setActiveView('dashboard')}
                    className="mb-4 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2"
                >
                    ← Back to OnlyFans Studio
                </button>
                <OnlyFansExportHub />
            </div>
        );
    }

    if (activeView === 'calendar') {
        return (
            <div className="max-w-7xl mx-auto">
                <button
                    onClick={() => setActiveView('dashboard')}
                    className="mb-4 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2"
                >
                    ← Back to OnlyFans Studio
                </button>
                <OnlyFansCalendar />
            </div>
        );
    }

    if (activeView === 'mediaVault') {
        return (
            <div className="max-w-7xl mx-auto">
                <button
                    onClick={() => setActiveView('dashboard')}
                    className="mb-4 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2"
                >
                    ← Back to OnlyFans Studio
                </button>
                <OnlyFansMediaVault />
            </div>
        );
    }

    if (activeView === 'guides') {
        return (
            <div className="max-w-7xl mx-auto">
                <button
                    onClick={() => setActiveView('dashboard')}
                    className="mb-4 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2"
                >
                    ← Back to OnlyFans Studio
                </button>
                <OnlyFansGuides />
            </div>
        );
    }

    if (activeView === 'contentIntelligence') {
        return (
            <div className="max-w-7xl mx-auto">
                <button
                    onClick={() => setActiveView('dashboard')}
                    className="mb-4 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2"
                >
                    ← Back to OnlyFans Studio
                </button>
                <ContentIntelligence />
            </div>
        );
    }

    if (activeView === 'analytics') {
        return (
            <div className="max-w-7xl mx-auto">
                <button
                    onClick={() => setActiveView('dashboard')}
                    className="mb-4 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2"
                >
                    ← Back to OnlyFans Studio
                </button>
                <ErrorBoundary>
                    <OnlyFansAnalytics />
                </ErrorBoundary>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <SparklesIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        OnlyFans Studio
                    </h1>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    Your AI-powered content and monetization brain. Plan, create, and organize premium content.
                </p>
            </div>

            {/* Important Notice */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Important:</strong> OnlyFans Studio does not integrate with or access your OnlyFans account. 
                    This is a planning and content creation tool. All content must be reviewed and uploaded manually to OnlyFans.
                </p>
            </div>

            {/* Main Dashboard Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Content Brain Card */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                        Content Brain
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                        Generate AI captions, post ideas, shoot concepts, and weekly content plans.
                    </p>
                    <button
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                        onClick={() => setActiveView('contentBrain')}
                    >
                        Open Content Brain
                    </button>
                </div>

                {/* Roleplay & Interactive Ideas Card */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                        Roleplay & Interactive Ideas
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                        Generate roleplay scenarios, persona ideas, body rating prompts, and interactive post concepts.
                    </p>
                    <button
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                        onClick={() => setActiveView('roleplay')}
                    >
                        Generate Ideas
                    </button>
                </div>

                {/* Content Calendar Card */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                        Content Calendar
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                        Plan your posting schedule with manual upload reminders and content pacing.
                    </p>
                    <button
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                        onClick={() => setActiveView('calendar')}
                    >
                        View Calendar
                    </button>
                </div>

                {/* Media Vault Card */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                        Media Vault
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                        Organize photos, videos, and teasers with AI tagging and basic editing tools.
                    </p>
                    <button
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                        onClick={() => setActiveView('mediaVault')}
                    >
                        Open Media Vault
                    </button>
                </div>

                {/* Content Intelligence Card */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                        Content Intelligence
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                        Analyze content gaps, optimize captions, predict performance, and repurpose content across platforms.
                    </p>
                    <button
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                        onClick={() => setActiveView('contentIntelligence')}
                    >
                        Open Content Intelligence
                    </button>
                </div>

                {/* Export Hub Card */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                        Export Hub
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                        Generate ready-to-upload content packages with captions, media, and checklists.
                    </p>
                    <button
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                        onClick={() => setActiveView('export')}
                    >
                        Create Export Package
                    </button>
                </div>

                {/* Guides & Tips Card */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                        Guides & Tips
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                        Step-by-step upload guides, best practices, and monetization strategy tips.
                    </p>
                    <button
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                        onClick={() => setActiveView('guides')}
                    >
                        View Guides
                    </button>
                </div>

                {/* Analytics & Insights Card */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                        Analytics & Insights
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                        Track content generation, media stats, and manual performance metrics.
                    </p>
                    <button
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                        onClick={() => setActiveView('analytics')}
                    >
                        View Analytics
                    </button>
                </div>

                {/* Settings Card */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                        Settings
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                        Manage your profile, AI training, billing, and preferences.
                    </p>
                    <button
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                        onClick={() => setActiveView('settings')}
                    >
                        <SettingsIcon className="w-4 h-4" />
                        Open Settings
                    </button>
                </div>
            </div>

            {/* Quick Stats / Next Actions (Placeholder) */}
            <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                    Next Actions
                </h2>
                <div className="space-y-2 text-gray-600 dark:text-gray-400">
                    <p className="text-sm">• Features coming soon - stay tuned!</p>
                    <p className="text-sm">• Start by exploring the Content Brain for AI-generated captions and ideas.</p>
                </div>
            </div>
        </div>
    );
};
