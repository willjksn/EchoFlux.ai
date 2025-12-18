
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { AnalyticsData, Platform } from '../types';
import { useAppContext } from './AppContext';
import { UpgradePrompt } from './UpgradePrompt';
import { SparklesIcon, ClockIcon, TrashIcon } from './icons/UIIcons';
import { generateAnalyticsReport, getAnalytics } from "../src/services/geminiService";
import { AnalyticsReportModal } from './analytics/AnalyticsReportModal';
import { db } from '../firebaseConfig';
import { collection, setDoc, doc, getDocs, query, orderBy, deleteDoc } from 'firebase/firestore';

// Lazy load child components
const StatCardGrid = lazy(() => import('./analytics/StatCardGrid'));
const AnalyticsCharts = lazy(() => import('./analytics/AnalyticsCharts'));
const AIPoweredInsights = lazy(() => import('./analytics/AIPoweredInsights'));

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

type Tab = 'Overview';

export const Analytics: React.FC = () => {
    let selectedClient, user, setActivePage, showToast;
    
    try {
        const context = useAppContext();
        selectedClient = context?.selectedClient;
        user = context?.user;
        setActivePage = context?.setActivePage;
        showToast = context?.showToast;
    } catch (error: any) {
        console.error('Error accessing AppContext in Analytics:', error);
        return (
            <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full flex items-center justify-center">
                <div className="text-center">
                    <p className="text-red-600 dark:text-red-400 mb-2">Failed to load Analytics.</p>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">Please refresh the page.</p>
                    <button 
                        onClick={() => window.location.reload()} 
                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                    >
                        Reload Page
                    </button>
                </div>
            </div>
        );
    }
    
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');
    const [platform, setPlatform] = useState<Platform | 'All'>('All');
    const [activeTab, setActiveTab] = useState<Tab>('Overview');
    
    // State for AI Report Modal
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportContent, setReportContent] = useState('');
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    
    // State for Report History
    const [savedReports, setSavedReports] = useState<Array<{ id: string; content: string; createdAt: string; dateRange: string; platform: string }>>([]);
    const [showHistory, setShowHistory] = useState(false);


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

    // Load saved reports on mount
    useEffect(() => {
        const loadSavedReports = async () => {
            if (!user?.id) return;
            try {
                const reportsRef = collection(db, 'users', user.id, 'analytics_reports');
                const q = query(reportsRef, orderBy('createdAt', 'desc'));
                const snapshot = await getDocs(q);
                const reports: Array<{ id: string; content: string; createdAt: string; dateRange: string; platform: string }> = [];
                snapshot.forEach((doc) => {
                    reports.push({
                        id: doc.id,
                        ...doc.data(),
                    } as any);
                });
                setSavedReports(reports);
            } catch (error) {
                console.error('Failed to load saved reports:', error);
            }
        };
        loadSavedReports();
    }, [user?.id]);

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
            let finalReportContent = '';
            if (report && typeof report === 'object' && report.report && typeof report.report === 'string') {
                finalReportContent = report.report;
                setReportContent(finalReportContent);
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
                finalReportContent = formattedReport || "Sorry, there was an error generating the report. Please try again.";
                setReportContent(finalReportContent);
            } 
            // Handle string format (legacy)
            else if (typeof report === 'string') {
                finalReportContent = report;
                setReportContent(finalReportContent);
            } 
            else {
                finalReportContent = "Sorry, there was an error generating the report. Please try again.";
                setReportContent(finalReportContent);
            }
            
            // Save report to Firestore
            if (finalReportContent && user?.id && !finalReportContent.includes('Error:') && !finalReportContent.includes('Sorry')) {
                try {
                    const reportId = `report_${Date.now()}`;
                    await setDoc(doc(db, 'users', user.id, 'analytics_reports', reportId), {
                        content: finalReportContent,
                        createdAt: new Date().toISOString(),
                        dateRange: dateRange,
                        platform: platform,
                    });
                    // Reload reports
                    const reportsRef = collection(db, 'users', user.id, 'analytics_reports');
                    const q = query(reportsRef, orderBy('createdAt', 'desc'));
                    const snapshot = await getDocs(q);
                    const reports: Array<{ id: string; content: string; createdAt: string; dateRange: string; platform: string }> = [];
                    snapshot.forEach((doc) => {
                        reports.push({
                            id: doc.id,
                            ...doc.data(),
                        } as any);
                    });
                    setSavedReports(reports);
                } catch (error) {
                    console.error('Failed to save report:', error);
                }
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
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                    >
                        <ClockIcon className="w-4 h-4" />
                        {showHistory ? 'Hide' : 'View'} History ({savedReports.length})
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
                        <option value="Pinterest">Pinterest</option>
                    </select>
                </div>
            </div>


            {/* Report History View */}
            {showHistory && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Saved Reports</h2>
                    {savedReports.length === 0 ? (
                        <p className="text-gray-500 dark:text-gray-400 text-center py-8">No saved reports yet. Generate your first report!</p>
                    ) : (
                        <div className="space-y-3">
                            {savedReports.map((report) => (
                                <div
                                    key={report.id}
                                    className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="font-semibold text-gray-900 dark:text-white">
                                                    Report - {report.dateRange} • {report.platform}
                                                </h3>
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                                Created: {new Date(report.createdAt).toLocaleDateString()} at {new Date(report.createdAt).toLocaleTimeString()}
                                            </p>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                                                {report.content.substring(0, 150)}...
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 ml-4">
                                            <button
                                                onClick={() => {
                                                    setReportContent(report.content);
                                                    setIsReportModalOpen(true);
                                                    setShowHistory(false);
                                                }}
                                                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                                            >
                                                View
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (!user?.id) return;
                                                    try {
                                                        await deleteDoc(doc(db, 'users', user.id, 'analytics_reports', report.id));
                                                        setSavedReports(prev => prev.filter(r => r.id !== report.id));
                                                        showToast('Report deleted', 'success');
                                                    } catch (error) {
                                                        console.error('Failed to delete report:', error);
                                                        showToast('Failed to delete report', 'error');
                                                    }
                                                }}
                                                className="p-1.5 text-gray-500 hover:text-red-600 transition-colors"
                                                title="Delete"
                                            >
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <Suspense fallback={<AnalyticsSkeleton />}>
                {isLoading || !data ? <AnalyticsSkeleton /> : renderTabContent()}
            </Suspense>
        </div>
    );
};
