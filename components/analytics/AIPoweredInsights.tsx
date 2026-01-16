import React from 'react';
import { AnalyticsData } from '../../types';
import { LightbulbIcon, TopicIcon, QuestionIcon, SparklesIcon } from '../icons/UIIcons';

const insightIcons = {
    idea: <LightbulbIcon />,
    topic: <TopicIcon />,
    question: <QuestionIcon />,
};

interface AIPoweredInsightsProps {
    data: AnalyticsData;
}

export const AIPoweredInsights: React.FC<AIPoweredInsightsProps> = ({ data }) => {
    const insights = data?.engagementInsights || [];
    const hasInsights = insights.length > 0;

    return (
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-600">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl">
                    <SparklesIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Insights</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Helpful tips</p>
                </div>
            </div>
            
            {hasInsights ? (
                <div className="space-y-4">
                    {insights.map((insight, index) => (
                        <div key={index} className="flex items-start gap-3 p-3.5 rounded-xl border bg-white dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 hover:shadow-md transition-all">
                            <div className="flex-shrink-0 mt-0.5 p-2 bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 rounded-full">
                                {insightIcons[insight.icon] || <LightbulbIcon />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-1">{insight.title}</p>
                                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{insight.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full mb-4">
                        <SparklesIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 font-medium mb-2">No insights available yet</p>
                    <p className="text-sm text-gray-500 dark:text-gray-500">
                        Insights will appear here after we review your results.
                    </p>
                </div>
            )}
        </div>
    );
};

export default AIPoweredInsights;
