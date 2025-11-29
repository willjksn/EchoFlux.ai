import React from 'react';
import { AnalyticsData } from '../../types';
import { useAppContext } from '../AppContext';

const SimpleBarChart: React.FC<{ data: { name: string, value: number }[], title: string, unit: string }> = ({ data, title, unit }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
        <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{title}</h3>
        <div className="flex justify-between items-end h-48 space-x-2">
            {(data || []).map((item, index) => {
                const maxValue = Math.max(...(data || []).map(d => d.value), 0);
                const heightPercentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
                return (
                    <div key={index} className="flex-1 flex flex-col items-center justify-end group">
                        <div 
                            className="w-full bg-primary-500 rounded-t-md transition-all duration-300 group-hover:bg-primary-600"
                            style={{ height: `${heightPercentage}%` }}
                            title={`${item.name}: ${item.value}${unit}`}
                        ></div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.name}</span>
                    </div>
                );
            })}
        </div>
    </div>
);

const SentimentBar: React.FC<{ data: { name: string, value: number }[] }> = ({ data }) => {
    const { navigateToDashboardWithFilter } = useAppContext();
    const total = data.reduce((acc, curr) => acc + curr.value, 0);
    const positive = data.find(d => d.name === 'Positive')?.value || 0;
    const neutral = data.find(d => d.name === 'Neutral')?.value || 0;
    const negative = data.find(d => d.name === 'Negative')?.value || 0;

    const getPercent = (value: number) => total > 0 ? (value / total) * 100 : 0;

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Sentiment Analysis</h3>
            <div className="w-full flex h-8 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                <button onClick={() => navigateToDashboardWithFilter({ sentiment: 'Positive' })} className="bg-green-500 hover:opacity-80 transition-all" style={{ width: `${getPercent(positive)}%` }} title={`Positive: ${getPercent(positive).toFixed(1)}%`}></button>
                <button onClick={() => navigateToDashboardWithFilter({ sentiment: 'Neutral' })} className="bg-blue-500 hover:opacity-80 transition-all" style={{ width: `${getPercent(neutral)}%` }} title={`Neutral: ${getPercent(neutral).toFixed(1)}%`}></button>
                <button onClick={() => navigateToDashboardWithFilter({ sentiment: 'Negative' })} className="bg-red-500 hover:opacity-80 transition-all" style={{ width: `${getPercent(negative)}%` }} title={`Negative: ${getPercent(negative).toFixed(1)}%`}></button>
            </div>
            <div className="flex justify-around mt-4 text-sm text-gray-700 dark:text-gray-300">
                <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-green-500 mr-2"></span>Positive ({positive})</div>
                <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-blue-500 mr-2"></span>Neutral ({neutral})</div>
                <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-red-500 mr-2"></span>Negative ({negative})</div>
            </div>
        </div>
    );
};

interface AnalyticsChartsProps {
    data: AnalyticsData;
}

export const AnalyticsCharts: React.FC<AnalyticsChartsProps> = ({ data }) => {
    const { user } = useAppContext();
    const isBusiness = user?.userType === 'Business';

    // Business users see lead growth, Creators see follower growth
    const growthChartTitle = isBusiness ? 'Lead Generation Growth' : 'Follower Growth';

    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SimpleBarChart data={data?.responseRate || []} title="Response Rate" unit="%" />
                <SimpleBarChart data={data?.followerGrowth || []} title={growthChartTitle} unit="" />
            </div>
            <SentimentBar data={data?.sentiment || []} />
        </>
    );
};

export default AnalyticsCharts;