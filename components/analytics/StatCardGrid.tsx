import React from 'react';
import { AnalyticsData } from '../../types';

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
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard title="Total AI Replies" value={data.totalReplies} />
            <StatCard title="New Followers" value={data.newFollowers} />
            <StatCard title="Engagement" value={`${data.engagementIncrease.toFixed(1)}%`} change={data.engagementIncrease} />
        </div>
    );
};

export default StatCardGrid;
