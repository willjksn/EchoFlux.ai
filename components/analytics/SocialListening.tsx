
import React, { useState } from 'react';
import { ListeningIcon, RefreshIcon, CheckCircleIcon } from '../icons/UIIcons';
import { Platform } from '../../types';
import { XIcon, InstagramIcon, TikTokIcon, LinkedInIcon, FacebookIcon, ThreadsIcon, YouTubeIcon, PinterestIcon, DiscordIcon, TelegramIcon, RedditIcon } from '../icons/PlatformIcons';

const MockMentions = [
    { id: 1, user: '@tech_guru_99', platform: 'X', text: "Just tried EngageSuite.ai and it's a game changer for my workflow! #AI #SocialMedia", sentiment: 'Positive', time: '2h ago' },
    { id: 2, user: '@sarah_marketing', platform: 'Instagram', text: "Comparing tools today. EngageSuite vs Buffer. Thoughts?", sentiment: 'Neutral', time: '4h ago' },
    { id: 3, user: '@angry_customer', platform: 'X', text: "Why is the API down again? @EngageSuiteSupport", sentiment: 'Negative', time: '1d ago' },
    { id: 4, user: '@startup_daily', platform: 'LinkedIn', text: "Top 10 tools for founders in 2025. #1 EngageSuite.ai", sentiment: 'Positive', time: '1d ago' },
];

const platformIcons: any = {
    X: <XIcon />,
    Instagram: <InstagramIcon />,
    TikTok: <TikTokIcon />,
    Threads: <ThreadsIcon />,
    YouTube: <YouTubeIcon />,
    LinkedIn: <LinkedInIcon />,
    Facebook: <FacebookIcon />,
    Pinterest: <PinterestIcon />,
    Discord: <DiscordIcon />,
    Telegram: <TelegramIcon />,
    Reddit: <RedditIcon />,
};

export const SocialListening: React.FC = () => {
    const [keywords, setKeywords] = useState<string[]>(['EngageSuite', 'EngageSuite.ai']);
    const [newKeyword, setNewKeyword] = useState('');

    const handleAddKeyword = () => {
        if (newKeyword && !keywords.includes(newKeyword)) {
            setKeywords([...keywords, newKeyword]);
            setNewKeyword('');
        }
    };

    const handleRemoveKeyword = (keyword: string) => {
        setKeywords(keywords.filter(k => k !== keyword));
    };

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <ListeningIcon /> Active Listeners
                    </h3>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                    {keywords.map(k => (
                        <span key={k} className="px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-sm font-medium flex items-center gap-2">
                            {k}
                            <button onClick={() => handleRemoveKeyword(k)} className="hover:text-primary-900 dark:hover:text-primary-100">×</button>
                        </span>
                    ))}
                </div>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={newKeyword} 
                        onChange={e => setNewKeyword(e.target.value)} 
                        placeholder="Add keyword (e.g. YourBrandName)" 
                        className="flex-grow p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                    />
                    <button onClick={handleAddKeyword} className="px-4 py-2 bg-primary-600 text-white rounded-md">Track</button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md text-center">
                    <p className="text-gray-500">Mentions (7d)</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">142</p>
                    <p className="text-green-500 text-sm">↑ 12%</p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md text-center">
                    <p className="text-gray-500">Sentiment Score</p>
                    <p className="text-3xl font-bold text-green-600">88/100</p>
                    <p className="text-gray-400 text-sm">Mostly Positive</p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md text-center">
                    <p className="text-gray-500">Potential Reach</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">45.2k</p>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Recent Mentions</h3>
                <div className="space-y-4">
                    {MockMentions.map(mention => (
                        <div key={mention.id} className="border-b border-gray-100 dark:border-gray-700 pb-4 last:border-0">
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2">
                                    <div className="p-1 bg-gray-100 rounded-full dark:bg-gray-700 w-8 h-8 flex items-center justify-center">
                                        {platformIcons[mention.platform] || <ListeningIcon />}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm">{mention.user}</p>
                                        <p className="text-xs text-gray-500">{mention.time}</p>
                                    </div>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-xs ${
                                    mention.sentiment === 'Positive' ? 'bg-green-100 text-green-700' : 
                                    mention.sentiment === 'Negative' ? 'bg-red-100 text-red-700' : 
                                    'bg-gray-100 text-gray-700'
                                }`}>{mention.sentiment}</span>
                            </div>
                            <p className="mt-2 text-gray-600 dark:text-gray-300 text-sm">"{mention.text}"</p>
                            <div className="mt-2 flex gap-2">
                                <button className="text-xs text-primary-600 hover:underline">Reply</button>
                                <button className="text-xs text-gray-500 hover:text-gray-700">View Context</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SocialListening;
