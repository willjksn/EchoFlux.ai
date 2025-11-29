import React from 'react';
import { AnalyticsData } from '../../types';
import { useAppContext } from '../AppContext';

const StatCard: React.FC<{ title: string; value: string | number; change?: number }> = ({ title, value, change }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
        {change !== undefined && (
            <p className={`mt-2 text-sm font-medium ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {change >= 0 ? '+' : ''}{change.toFixed(1)}% from last period
            </p>
        )}
    </div>
);

interface StatCardGridProps {
    data: AnalyticsData;
}

export const StatCardGrid: React.FC<StatCardGridProps> = ({ data }) => {
    const { user } = useAppContext();
    const isBusiness = user?.userType === 'Business';

    // Business users see lead/customer metrics, Creators see follower metrics
    const secondMetricTitle = isBusiness ? 'New Leads' : 'New Followers';
    const thirdMetricTitle = isBusiness ? 'Lead Conversion' : 'Engagement';

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard title="Total AI Replies" value={data?.totalReplies ?? 0} />
            <StatCard title={secondMetricTitle} value={data?.newFollowers ?? 0} />
            <StatCard title={thirdMetricTitle} value={`${((data?.engagementIncrease ?? 0)).toFixed(1)}%`} change={data?.engagementIncrease ?? 0} />
        </div>
    );
};

export default StatCardGrid;
