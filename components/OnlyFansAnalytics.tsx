import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { db } from '../firebaseConfig';
import { collection, getDocs, query, orderBy, where, Timestamp, addDoc } from 'firebase/firestore';
import { AnalyticsIcon, TrendingIcon, SparklesIcon, ImageIcon, VideoIcon, FolderIcon, CalendarIcon } from './icons/UIIcons';

// PhotoIcon alias for ImageIcon
const PhotoIcon = ImageIcon;
// TrendingUpIcon alias for TrendingIcon
const TrendingUpIcon = TrendingIcon;

interface ContentStats {
    captionsGenerated: number;
    scenariosGenerated: number;
    personasGenerated: number;
    ratingsGenerated: number;
    interactivePostsGenerated: number;
}

interface MediaStats {
    totalFiles: number;
    totalFolders: number;
    imagesCount: number;
    videosCount: number;
    aiTagsGenerated: number;
}

interface PerformanceMetrics {
    date: string;
    views?: number;
    likes?: number;
    revenue?: number;
    newSubscribers?: number;
}

export const OnlyFansAnalytics: React.FC = () => {
    let user, showToast;
    
    try {
        const context = useAppContext();
        user = context?.user;
        showToast = context?.showToast;
    } catch (error: any) {
        console.error('Error accessing AppContext in OnlyFansAnalytics:', error);
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
    const [contentStats, setContentStats] = useState<ContentStats>({
        captionsGenerated: 0,
        scenariosGenerated: 0,
        personasGenerated: 0,
        ratingsGenerated: 0,
        interactivePostsGenerated: 0,
    });
    const [mediaStats, setMediaStats] = useState<MediaStats>({
        totalFiles: 0,
        totalFolders: 0,
        imagesCount: 0,
        videosCount: 0,
        aiTagsGenerated: 0,
    });
    const [exportPackagesCount, setExportPackagesCount] = useState(0);
    const [calendarEventsCount, setCalendarEventsCount] = useState(0);
    const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics[]>([]);
    const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
    const [isLoading, setIsLoading] = useState(true);
    const [showAddMetric, setShowAddMetric] = useState(false);
    const [newMetric, setNewMetric] = useState<PerformanceMetrics>({
        date: new Date().toISOString().split('T')[0],
        views: 0,
        likes: 0,
        revenue: 0,
        newSubscribers: 0,
    });

    useEffect(() => {
        if (!user?.id) return;
        loadAnalytics();
    }, [user?.id, dateRange]);

    const loadAnalytics = async () => {
        if (!user?.id) return;
        setIsLoading(true);
        try {
            console.log('Loading OnlyFans Analytics for user:', user.id, 'dateRange:', dateRange);
            // Calculate date filter
            const now = new Date();
            let startDate: Date | null = null;
            if (dateRange === '7d') {
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            } else if (dateRange === '30d') {
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            } else if (dateRange === '90d') {
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            }

            // Load content generation stats
            const scenariosQuery = startDate 
                ? query(collection(db, 'users', user.id, 'onlyfans_saved_scenarios'), where('savedAt', '>=', Timestamp.fromDate(startDate)))
                : query(collection(db, 'users', user.id, 'onlyfans_saved_scenarios'));
            const personasQuery = startDate 
                ? query(collection(db, 'users', user.id, 'onlyfans_saved_personas'), where('savedAt', '>=', Timestamp.fromDate(startDate)))
                : query(collection(db, 'users', user.id, 'onlyfans_saved_personas'));
            const ratingsQuery = startDate 
                ? query(collection(db, 'users', user.id, 'onlyfans_saved_ratings'), where('savedAt', '>=', Timestamp.fromDate(startDate)))
                : query(collection(db, 'users', user.id, 'onlyfans_saved_ratings'));
            const interactiveQuery = startDate 
                ? query(collection(db, 'users', user.id, 'onlyfans_saved_interactive'), where('savedAt', '>=', Timestamp.fromDate(startDate)))
                : query(collection(db, 'users', user.id, 'onlyfans_saved_interactive'));
            
            const [scenarios, personas, ratings, interactive] = await Promise.all([
                getDocs(scenariosQuery),
                getDocs(personasQuery),
                getDocs(ratingsQuery),
                getDocs(interactiveQuery),
            ]);

            setContentStats(prev => ({
                ...prev,
                scenariosGenerated: scenarios.size,
                personasGenerated: personas.size,
                ratingsGenerated: ratings.size,
                interactivePostsGenerated: interactive.size,
            }));

            // Load media stats
            const mediaItemsQuery = startDate 
                ? query(collection(db, 'users', user.id, 'onlyfans_media_library'), where('uploadedAt', '>=', startDate.toISOString()))
                : query(collection(db, 'users', user.id, 'onlyfans_media_library'));
            const [mediaItems, folders] = await Promise.all([
                getDocs(mediaItemsQuery),
                getDocs(collection(db, 'users', user.id, 'onlyfans_media_folders')),
            ]);

            const images = mediaItems.docs.filter(doc => doc.data().type === 'image').length;
            const videos = mediaItems.docs.filter(doc => doc.data().type === 'video').length;
            const withTags = mediaItems.docs.filter(doc => doc.data().aiTags).length;

            setMediaStats({
                totalFiles: mediaItems.size,
                totalFolders: folders.size,
                imagesCount: images,
                videosCount: videos,
                aiTagsGenerated: withTags,
            });

            // Load export packages
            const packagesQuery = startDate 
                ? query(collection(db, 'users', user.id, 'onlyfans_export_packages'), where('createdAt', '>=', Timestamp.fromDate(startDate)))
                : query(collection(db, 'users', user.id, 'onlyfans_export_packages'));
            const packages = await getDocs(packagesQuery);
            setExportPackagesCount(packages.size);

            // Load calendar events
            const eventsQuery = startDate
                ? query(collection(db, 'users', user.id, 'onlyfans_calendar_events'), where('date', '>=', startDate.toISOString()))
                : query(collection(db, 'users', user.id, 'onlyfans_calendar_events'));
            const events = await getDocs(eventsQuery);
            setCalendarEventsCount(events.size);

            // Load manual performance metrics
            const metricsQuery = query(
                collection(db, 'users', user.id, 'onlyfans_performance_metrics'),
                orderBy('date', 'desc')
            );
            const metrics = await getDocs(metricsQuery);
            const metricsData = metrics.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                date: doc.data().date || doc.data().createdAt?.toDate?.()?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
            })) as PerformanceMetrics[];

            // Filter by date range
            const filteredMetrics = startDate
                ? metricsData.filter(m => new Date(m.date) >= startDate)
                : metricsData;

            setPerformanceMetrics(filteredMetrics.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));

        } catch (error) {
            console.error('Error loading analytics:', error);
            showToast('Failed to load analytics data. Please try again.', 'error');
            // Set default values on error
            setContentStats({
                captionsGenerated: 0,
                scenariosGenerated: 0,
                personasGenerated: 0,
                ratingsGenerated: 0,
                interactivePostsGenerated: 0,
            });
            setMediaStats({
                totalFiles: 0,
                totalFolders: 0,
                imagesCount: 0,
                videosCount: 0,
                aiTagsGenerated: 0,
            });
            setExportPackagesCount(0);
            setCalendarEventsCount(0);
            setPerformanceMetrics([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddMetric = async () => {
        if (!user?.id) return;
        try {
            await addDoc(collection(db, 'users', user.id, 'onlyfans_performance_metrics'), {
                ...newMetric,
                createdAt: Timestamp.now(),
            });
            showToast('Performance metric added successfully!', 'success');
            setShowAddMetric(false);
            setNewMetric({
                date: new Date().toISOString().split('T')[0],
                views: 0,
                likes: 0,
                revenue: 0,
                newSubscribers: 0,
            });
            loadAnalytics();
        } catch (error) {
            console.error('Error adding metric:', error);
            showToast('Failed to add performance metric', 'error');
        }
    };

    const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; subtitle?: string }> = ({ title, value, icon, subtitle }) => (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</h3>
                <div className="text-primary-600 dark:text-primary-400">{icon}</div>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
            {subtitle && <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">{subtitle}</p>}
        </div>
    );

    if (isLoading) {
        return (
            <div className="max-w-7xl mx-auto">
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600 dark:text-gray-400">Loading analytics...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <AnalyticsIcon />
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                            Analytics & Insights
                        </h1>
                    </div>
                    <div className="flex gap-2">
                        <select
                            value={dateRange}
                            onChange={(e) => setDateRange(e.target.value as any)}
                            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        >
                            <option value="7d">Last 7 days</option>
                            <option value="30d">Last 30 days</option>
                            <option value="90d">Last 90 days</option>
                            <option value="all">All time</option>
                        </select>
                        <button
                            onClick={() => setShowAddMetric(true)}
                            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm font-medium"
                        >
                            Add Metrics
                        </button>
                    </div>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    Track your content creation activity and performance metrics.
                </p>
            </div>

            {/* Content Generation Stats */}
            <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <AnalyticsIcon />
                    <span className="text-primary-600 dark:text-primary-400">Content Generation</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <StatCard
                        title="Scenarios"
                        value={contentStats.scenariosGenerated}
                        icon={<SparklesIcon className="w-5 h-5" />}
                    />
                    <StatCard
                        title="Personas"
                        value={contentStats.personasGenerated}
                        icon={<SparklesIcon className="w-5 h-5" />}
                    />
                    <StatCard
                        title="Body Ratings"
                        value={contentStats.ratingsGenerated}
                        icon={<SparklesIcon className="w-5 h-5" />}
                    />
                    <StatCard
                        title="Interactive Posts"
                        value={contentStats.interactivePostsGenerated}
                        icon={<SparklesIcon className="w-5 h-5" />}
                    />
                    <StatCard
                        title="Export Packages"
                        value={exportPackagesCount}
                        icon={<SparklesIcon className="w-5 h-5" />}
                    />
                </div>
            </div>

            {/* Media Library Stats */}
            <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                    Media Library
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <StatCard
                        title="Total Files"
                        value={mediaStats.totalFiles}
                        icon={<ImageIcon className="w-5 h-5" />}
                    />
                    <StatCard
                        title="Images"
                        value={mediaStats.imagesCount}
                        icon={<PhotoIcon className="w-5 h-5" />}
                    />
                    <StatCard
                        title="Videos"
                        value={mediaStats.videosCount}
                        icon={<PhotoIcon className="w-5 h-5" />}
                    />
                    <StatCard
                        title="Folders"
                        value={mediaStats.totalFolders}
                        icon={<FolderIcon className="w-5 h-5" />}
                    />
                    <StatCard
                        title="AI Tags Generated"
                        value={mediaStats.aiTagsGenerated}
                        icon={<SparklesIcon className="w-5 h-5" />}
                    />
                </div>
            </div>

            {/* Calendar & Planning */}
            <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                    Content Planning
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <StatCard
                        title="Scheduled Events"
                        value={calendarEventsCount}
                        icon={<CalendarIcon className="w-5 h-5" />}
                        subtitle="Posts & reminders scheduled"
                    />
                </div>
            </div>

            {/* Performance Metrics */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <TrendingUpIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                        Performance Metrics
                    </h2>
                </div>
                {performanceMetrics.length > 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 dark:bg-gray-700">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Views</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Likes</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">New Subscribers</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Revenue</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                    {performanceMetrics.map((metric, index) => (
                                        <tr key={index}>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                                {new Date(metric.date).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                                {metric.views?.toLocaleString() || '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                                {metric.likes?.toLocaleString() || '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                                {metric.newSubscribers?.toLocaleString() || '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                                {metric.revenue ? `$${metric.revenue.toLocaleString()}` : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
                        <TrendingIcon className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
                        <p className="text-gray-600 dark:text-gray-400 mb-4">No performance metrics yet.</p>
                        <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
                            Manually track your OnlyFans performance by adding metrics. Enter views, likes, revenue, and subscriber counts.
                        </p>
                        <button
                            onClick={() => setShowAddMetric(true)}
                            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm font-medium"
                        >
                            Add First Metric
                        </button>
                    </div>
                )}
            </div>

            {/* Add Metric Modal */}
            {showAddMetric && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Add Performance Metric</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                                <input
                                    type="date"
                                    value={newMetric.date}
                                    onChange={(e) => setNewMetric({ ...newMetric, date: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Views</label>
                                <input
                                    type="number"
                                    value={newMetric.views || ''}
                                    onChange={(e) => setNewMetric({ ...newMetric, views: parseInt(e.target.value) || 0 })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Likes</label>
                                <input
                                    type="number"
                                    value={newMetric.likes || ''}
                                    onChange={(e) => setNewMetric({ ...newMetric, likes: parseInt(e.target.value) || 0 })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Subscribers</label>
                                <input
                                    type="number"
                                    value={newMetric.newSubscribers || ''}
                                    onChange={(e) => setNewMetric({ ...newMetric, newSubscribers: parseInt(e.target.value) || 0 })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Revenue ($)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={newMetric.revenue || ''}
                                    onChange={(e) => setNewMetric({ ...newMetric, revenue: parseFloat(e.target.value) || 0 })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-6 justify-end">
                            <button
                                onClick={() => {
                                    setShowAddMetric(false);
                                    setNewMetric({
                                        date: new Date().toISOString().split('T')[0],
                                        views: 0,
                                        likes: 0,
                                        revenue: 0,
                                        newSubscribers: 0,
                                    });
                                }}
                                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddMetric}
                                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                            >
                                Save Metric
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
