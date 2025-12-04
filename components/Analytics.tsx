
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { AnalyticsData, Platform } from '../types';
import { useAppContext } from './AppContext';
import { UpgradePrompt } from './UpgradePrompt';
import { SparklesIcon } from './icons/UIIcons';
import { generateAnalyticsReport, getAnalytics } from "../src/services/geminiService";
import { AnalyticsReportModal } from './analytics/AnalyticsReportModal';

// Lazy load child components
const StatCardGrid = lazy(() => import('./analytics/StatCardGrid'));
const AnalyticsCharts = lazy(() => import('./analytics/AnalyticsCharts'));
const AIPoweredInsights = lazy(() => import('./analytics/AIPoweredInsights'));
const SocialListening = lazy(() => import('./analytics/SocialListening').then(module => ({ default: module.SocialListening })));
const CompetitorAnalysis = lazy(() => import('./analytics/CompetitorAnalysis').then(module => ({ default: module.CompetitorAnalysis })));

const AnalyticsSkeleton = () => (
    <div className="space-y-6 animate-pulse">
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="h-9 w-3/4 sm:w-1/2 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
             <div className="flex items-center gap-4">
                <div className="h-10 w-32 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
                <div className="h-10 w-36 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
            </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="h-28 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
            <div className="h-28 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
            <div className="h-28 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             <div className="h-72 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
             <div className="h-72 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
        </div>
         <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
         <div className="h-56 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
    </div>
);

const EMPTY_ANALYTICS_DATA: AnalyticsData = {
    responseRate: [],
    followerGrowth: [],
    sentiment: [],
    totalReplies: 0,
    newFollowers: 0,
    engagementIncrease: 0,
    topTopics: [],
    suggestedFaqs: [],
    engagementInsights: [],
};

type Tab = 'Overview' | 'Listening' | 'Competitors';

export const Analytics: React.FC = () => {
    const { selectedClient, user, setActivePage, showToast } = useAppContext();
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');
    const [platform, setPlatform] = useState<Platform | 'All'>('All');
    const [activeTab, setActiveTab] = useState<Tab>('Overview');
    
    // State for AI Report Modal
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportContent, setReportContent] = useState('');
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);


    useEffect(() => {
        const fetchAnalytics = async () => {
            setIsLoading(true);
            setData(null);

            try {
                // Fetch real analytics data from backend
                const analyticsData = await getAnalytics(dateRange, platform);
                
                // Validate that we got a proper data structure, fallback to empty if incomplete
                if (analyticsData && typeof analyticsData === 'object' && 
                    Array.isArray(analyticsData.responseRate) && 
                    Array.isArray(analyticsData.followerGrowth) &&
                    Array.isArray(analyticsData.sentiment) &&
                    Array.isArray(analyticsData.topTopics) &&
                    Array.isArray(analyticsData.suggestedFaqs) &&
                    Array.isArray(analyticsData.engagementInsights) &&
                    typeof analyticsData.totalReplies === 'number' &&
                    typeof analyticsData.newFollowers === 'number' &&
                    typeof analyticsData.engagementIncrease === 'number') {
                    setData(analyticsData);
                } else {
                    // Data structure is incomplete or empty object, use fallback
                    setData(EMPTY_ANALYTICS_DATA);
                }
            } catch (error: any) {
                // Silently fallback to empty data - don't spam console with expected errors
                // Only log in development mode
                if (process.env.NODE_ENV === 'development') {
                    console.warn('Analytics API unavailable (using fallback):', error?.message || 'Unknown error');
                }
                // Fallback to empty data on error - this is acceptable
                setData(EMPTY_ANALYTICS_DATA);
                // Don't show error toast - empty state is a valid fallback
            } finally {
                setIsLoading(false);
            }
        };

        fetchAnalytics();
    }, [selectedClient, dateRange, platform]);

    const handleGenerateReport = async () => {
        // Use fallback data if data is null
        const analyticsData = data || EMPTY_ANALYTICS_DATA;
        
        // Validate that we have at least some meaningful data
        if (!analyticsData || (typeof analyticsData === 'object' && Object.keys(analyticsData).length === 0)) {
            showToast('No analytics data available. Please wait for data to load or try again.', 'error');
            return;
        }
        
        setIsGeneratingReport(true);
        setIsReportModalOpen(true);
        setReportContent(""); // Clear previous report
        try {
            const report = await generateAnalyticsReport(analyticsData);
            
            // Handle new format: { report: "formatted text" }
            if (report && typeof report === 'object' && report.report && typeof report.report === 'string') {
                setReportContent(report.report);
            }
            // Handle legacy JSON format (fallback)
            else if (report && typeof report === 'object') {
                // Format the report object into a readable string
                let formattedReport = '';
                if (report.summary) {
                    formattedReport += `## Summary\n\n${report.summary}\n\n`;
                }
                if (report.growthInsights && Array.isArray(report.growthInsights) && report.growthInsights.length > 0) {
                    formattedReport += `## Growth Insights\n\n${report.growthInsights.map((insight: string, idx: number) => `${idx + 1}. ${insight}`).join('\n')}\n\n`;
                }
                if (report.recommendedActions && Array.isArray(report.recommendedActions) && report.recommendedActions.length > 0) {
                    formattedReport += `## Recommended Actions\n\n${report.recommendedActions.map((action: string, idx: number) => `${idx + 1}. ${action}`).join('\n')}\n\n`;
                }
                if (report.riskFactors && Array.isArray(report.riskFactors) && report.riskFactors.length > 0) {
                    formattedReport += `## Risk Factors\n\n${report.riskFactors.map((risk: string, idx: number) => `${idx + 1}. ${risk}`).join('\n')}\n\n`;
                }
                if (report.error || report.note) {
                    formattedReport = `Error: ${report.error || report.note}`;
                }
                setReportContent(formattedReport || "Sorry, there was an error generating the report. Please try again.");
            } 
            // Handle string format (legacy)
            else if (typeof report === 'string') {
                setReportContent(report);
            } 
            else {
                setReportContent("Sorry, there was an error generating the report. Please try again.");
            }
        } catch (error: any) {
            const errorMessage = error?.message || 'Unknown error';
            // Check if it's a 400 error about missing data
            if (errorMessage.includes('Missing analytics data') || errorMessage.includes('Empty analytics data')) {
                setReportContent(`Unable to generate report: No analytics data is available. Please wait for data to load or try refreshing the page.`);
                showToast('No analytics data available. Please wait for data to load.', 'error');
            } else {
                setReportContent(`Sorry, there was an error generating the report: ${errorMessage}. Please try again.`);
            }
            console.error('Analytics report error:', error);
        } finally {
            setIsGeneratingReport(false);
        }
    };

    const renderTabContent = () => {
        if (activeTab === 'Listening') {
            // For Business users: Only Growth and Agency plans
            // For Creator users: Pro, Elite, Agency plans
            const hasAccess = (() => {
                if (user?.role === 'Admin') return true;
                if (user?.userType === 'Business') {
                    return ['Growth', 'Agency'].includes(user.plan || '');
                }
                // Creator users
                return ['Pro', 'Elite', 'Agency'].includes(user?.plan || '');
            })();
            
            if (!hasAccess) {
                return (
                    <UpgradePrompt 
                        featureName="Social Listening" 
                        onUpgradeClick={() => setActivePage('pricing')}
                        userType={user?.userType === 'Business' ? 'Business' : 'Creator'}
                    />
                );
            }
            return <SocialListening />;
        }
        if (activeTab === 'Competitors') {
            // For Business users: Only Growth and Agency plans
            // For Creator users: Pro, Elite, Agency plans
            const hasAccess = (() => {
                if (user?.role === 'Admin') return true;
                if (user?.userType === 'Business') {
                    return ['Growth', 'Agency'].includes(user.plan || '');
                }
                // Creator users
                return ['Pro', 'Elite', 'Agency'].includes(user?.plan || '');
            })();
            
            if (!hasAccess) {
                return (
                    <UpgradePrompt 
                        featureName="Competitor Analysis" 
                        onUpgradeClick={() => setActivePage('pricing')}
                        userType={user?.userType === 'Business' ? 'Business' : 'Creator'}
                    />
                );
            }
            return <CompetitorAnalysis />;
        }

        return (
             <>
                <StatCardGrid data={data || EMPTY_ANALYTICS_DATA} />
                <AnalyticsCharts data={data || EMPTY_ANALYTICS_DATA} />
                <AIPoweredInsights data={data || EMPTY_ANALYTICS_DATA} />
             </>
        );
    };


    return (
        <div className="space-y-6">
            <AnalyticsReportModal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
                report={reportContent}
                isLoading={isGeneratingReport}
            />
             <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex-1">
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                        {selectedClient ? `Analytics for: ${selectedClient.name}` : 'Analytics'}
                    </h2>
                </div>
                <div className="flex items-center gap-4">
                    <button 
                        onClick={handleGenerateReport}
                        disabled={isLoading || !data}
                        className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 transition-colors"
                    >
                        <SparklesIcon /> Generate Report
                    </button>
                    <select
                        value={dateRange}
                        onChange={(e) => setDateRange(e.target.value as '7d' | '30d' | '90d')}
                        className="rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:text-white"
                    >
                        <option value="7d">Last 7 days</option>
                        <option value="30d">Last 30 days</option>
                        <option value="90d">Last 90 days</option>
                    </select>

                    <select
                        value={platform}
                        onChange={(e) => setPlatform(e.target.value as Platform | 'All')}
                        className="rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:text-white"
                    >
                        <option value="All">All Platforms</option>
                        <option value="Instagram">Instagram</option>
                        <option value="TikTok">TikTok</option>
                        <option value="X">X</option>
                        <option value="Threads">Threads</option>
                        <option value="YouTube">YouTube</option>
                        <option value="LinkedIn">LinkedIn</option>
                        <option value="Facebook">Facebook</option>
                    </select>
                </div>
            </div>

            <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg w-fit">
                {(['Overview', 'Listening', 'Competitors'] as Tab[]).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === tab ? 'bg-white dark:bg-gray-600 shadow text-primary-600 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <Suspense fallback={<AnalyticsSkeleton />}>
                {isLoading || !data ? <AnalyticsSkeleton /> : renderTabContent()}
            </Suspense>
        </div>
    );
};
