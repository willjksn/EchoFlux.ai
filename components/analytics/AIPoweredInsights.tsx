import React from 'react';
import { AnalyticsData } from '../../types';
import { LightbulbIcon, TopicIcon, QuestionIcon } from '../icons/UIIcons';

const insightIcons = {
    idea: <LightbulbIcon />,
    topic: <TopicIcon />,
    question: <QuestionIcon />,
};

interface AIPoweredInsightsProps {
    data: AnalyticsData;
}

export const AIPoweredInsights: React.FC<AIPoweredInsightsProps> = ({ data }) => {
    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">AI-Powered Insights</h3>
            <div className="space-y-4">
                {(data?.engagementInsights || []).map((insight, index) => (
                    <div key={index} className="flex items-start space-x-4">
                        <div className="flex-shrink-0 mt-1 p-2 bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 rounded-full">
                            {insightIcons[insight.icon]}
                        </div>
                        <div>
                            <p className="font-semibold text-gray-800 dark:text-gray-200">{insight.title}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{insight.description}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AIPoweredInsights;
