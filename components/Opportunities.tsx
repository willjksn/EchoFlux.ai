
import React, { useState } from 'react';
import { findTrends } from "../src/services/geminiService"
import { Opportunity, Platform } from '../types';
import { SparklesIcon, TrendingIcon } from './icons/UIIcons';
import { InstagramIcon, TikTokIcon, XIcon, ThreadsIcon, YouTubeIcon, LinkedInIcon, FacebookIcon } from './icons/PlatformIcons';
import { useAppContext } from './AppContext';
import { UpgradePrompt } from './UpgradePrompt';
import { BrandSuggestions } from './BrandSuggestions';

const platformIcons: { [key in Platform]: React.ReactNode } = {
  Instagram: <InstagramIcon />,
  TikTok: <TikTokIcon />,
  X: <XIcon />,
  Threads: <ThreadsIcon />,
  YouTube: <YouTubeIcon />,
  LinkedIn: <LinkedInIcon />,
  Facebook: <FacebookIcon />,
};

export const Opportunities: React.FC = () => {
    const { user, setActivePage, setComposeContext } = useAppContext();
    const [niche, setNiche] = useState('');
    const [results, setResults] = useState<Opportunity[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Opportunities: Creator-only feature, available on Pro, Elite, and Agency plans
    const isFeatureUnlocked = (() => {
        if (user?.role === 'Admin') return true;
        // Only available for Creator users
        if (user?.userType !== 'Creator') return false;
        // Available on Pro, Elite, and Agency plans
        return ['Pro', 'Elite', 'Agency'].includes(user?.plan || '');
    })();

    const handleFindTrends = async () => {
        if (!niche.trim()) return;
        setIsLoading(true);
        setError(null);
        setResults([]);
        try {
            const trends = await findTrends(niche);
            setResults(trends);
        } catch (err) {
            setError('Failed to find trends. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isFeatureUnlocked) {
        return (
            <UpgradePrompt 
                featureName="Trend Detection" 
                onUpgradeClick={() => setActivePage('pricing')}
                userType={user?.userType === 'Business' ? 'Business' : 'Creator'}
            />
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            <div className="text-center">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Engagement Opportunities</h2>
                <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">Let AI find trending topics, hashtags, and partnerships for you.</p>
                 {user?.plan === 'Pro' && (

                    <p className="mt-2 text-sm text-primary-600 dark:text-primary-400 font-semibold">
                        Upgrade to Elite for deeper insights!
                    </p>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Trend Finder */}
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md text-center">
                         <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-primary-100 dark:bg-primary-900/50">
                            <TrendingIcon />
                        </div>
                        <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">Discover what's new</h3>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Enter a topic or niche to find relevant trends.</p>
                        <div className="mt-6 max-w-md mx-auto flex gap-2">
                            <input
                                type="text"
                                value={niche}
                                onChange={(e) => setNiche(e.target.value)}
                                placeholder="e.g., sustainable fashion"
                                className="flex-grow p-3 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                            />
                            <button
                                onClick={handleFindTrends}
                                disabled={!niche.trim()}
                                className="flex items-center justify-center px-6 py-3 text-base font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 whitespace-nowrap"
                            >
                                <SparklesIcon /> Scan
                            </button>
                        </div>
                    </div>
                    
                    {isLoading && (
                        <div className="text-center py-16">
                            <svg className="animate-spin h-8 w-8 text-primary-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        </div>
                    )}

                    {error && <p className="text-center text-red-500">{error}</p>}
                    
                    {results.length > 0 && (
                         <div className="space-y-6">
                             <div className="flex justify-between items-center">
                                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Top Opportunities for "{niche}"</h3>
                             </div>
                             {results.map((result) => (
                                 <div key={result.id} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                                     <div className="flex items-start justify-between">
                                         <div>
                                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${result.type === 'Trending Hashtag' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200' : result.type === 'Viral Audio' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200' : 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200'}`}>
                                              {result.type}
                                            </span>
                                            <h4 className="mt-3 text-lg font-bold text-gray-900 dark:text-white">{result.title}</h4>
                                         </div>
                                         <div className="text-gray-500 dark:text-gray-400">{platformIcons[result.platform]}</div>
                                     </div>
                                     <p className="text-gray-600 dark:text-gray-300 mt-2">{result.description}</p>
                                     <div className="mt-4">
                                        <button
                                            onClick={() => setComposeContext({ topic: result.title, platform: result.platform })}
                                            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm font-semibold"
                                        >
                                            Engage Now
                                        </button>
                                     </div>
                                 </div>
                             ))}
                        </div>
                    )}
                </div>

                {/* Right Column: Brand Suggestions */}
                <div className="lg:col-span-1">
                    <BrandSuggestions />
                </div>
            </div>
        </div>
    );
};
