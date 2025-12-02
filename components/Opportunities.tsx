
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

    // Opportunities: Creator feature, available on Pro, Elite, and Agency plans
    // Agency (Business) also gets access since they manage creators
    const isFeatureUnlocked = (() => {
        if (user?.role === 'Admin') return true;
        // Available for Creator users OR Agency plan (Business or Creator)
        const isCreatorOrAgency = user?.userType === 'Creator' || user?.plan === 'Agency';
        if (!isCreatorOrAgency) return false;
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
            console.error('Error finding trends:', err);
            setError('Failed to find trends. Please try again.');
            setResults([]);
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
        <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Engagement Opportunities</h1>
                    <p className="mt-2 text-gray-500 dark:text-gray-400">Let AI find trending topics, hashtags, and partnerships for you.</p>
                </div>
                {user?.plan === 'Pro' && (
                    <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <p className="text-sm text-amber-700 dark:text-amber-300 font-semibold">
                            ⭐ Upgrade to Elite for deeper insights!
                        </p>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Trend Finder */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-full">
                                <TrendingIcon className="w-5 h-5" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Discover Trends</h3>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Enter a topic or niche to find relevant trends and opportunities.</p>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={niche}
                                onChange={(e) => setNiche(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && niche.trim() && handleFindTrends()}
                                placeholder="e.g., sustainable fashion, tech reviews"
                                className="flex-grow p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 focus:ring-2 focus:ring-primary-500"
                            />
                            <button
                                onClick={handleFindTrends}
                                disabled={!niche.trim() || isLoading}
                                className="flex items-center justify-center px-6 py-3 text-base font-medium text-white bg-gradient-to-r from-primary-600 to-primary-500 rounded-lg hover:from-primary-700 hover:to-primary-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-sm transition-all"
                            >
                                {isLoading ? (
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5 mr-2" /> Scan
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                    
                    {isLoading && (
                        <div className="bg-white dark:bg-gray-800 p-12 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                            <svg className="animate-spin h-8 w-8 text-primary-600 dark:text-primary-400 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <p className="text-gray-500 dark:text-gray-400 font-medium">Scanning for trends...</p>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-xl">
                            <p className="text-red-600 dark:text-red-400 text-sm font-medium">{error}</p>
                        </div>
                    )}
                    
                    {results.length > 0 && (
                         <div className="space-y-4">
                             <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Top Opportunities</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Found {results.length} opportunities for "{niche}"</p>
                                </div>
                             </div>
                             {results.map((result) => {
                                 const typeColors: Record<string, string> = {
                                     'Trending Hashtag': 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
                                     'Viral Audio': 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200',
                                     'Popular Topic': 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
                                     'Collaboration Opportunity': 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200',
                                     'Content Gap': 'bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-200',
                                 };
                                 
                                 const velocityColors: Record<string, string> = {
                                     'Rising': 'text-green-600 dark:text-green-400',
                                     'Peak': 'text-red-600 dark:text-red-400',
                                     'Declining': 'text-yellow-600 dark:text-yellow-400',
                                 };

                                 return (
                                 <div key={result.id} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
                                     <div className="flex items-start justify-between mb-3">
                                         <div className="flex items-center gap-3 flex-wrap">
                                             <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${typeColors[result.type] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}`}>
                                              {result.type}
                                            </span>
                                            <div className="text-gray-400 dark:text-gray-500">{platformIcons[result.platform]}</div>
                                            {result.trendingVelocity && (
                                                <span className={`text-xs font-medium ${velocityColors[result.trendingVelocity] || ''}`}>
                                                    {result.trendingVelocity === 'Rising' && '📈'} 
                                                    {result.trendingVelocity === 'Peak' && '🔥'} 
                                                    {result.trendingVelocity === 'Declining' && '📉'} 
                                                    {result.trendingVelocity}
                                                </span>
                                            )}
                                            {result.engagementPotential && (
                                                <div className="flex items-center gap-1">
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">Potential:</span>
                                                    <div className="flex gap-0.5">
                                                        {[...Array(10)].map((_, i) => (
                                                            <div
                                                                key={i}
                                                                className={`w-1.5 h-1.5 rounded-full ${
                                                                    i < result.engagementPotential! 
                                                                        ? 'bg-primary-600 dark:bg-primary-400' 
                                                                        : 'bg-gray-200 dark:bg-gray-700'
                                                                }`}
                                                            />
                                                        ))}
                                                    </div>
                                                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 ml-1">
                                                        {result.engagementPotential}/10
                                                    </span>
                                                </div>
                                            )}
                                         </div>
                                     </div>
                                     <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{result.title}</h4>
                                     <p className="text-gray-600 dark:text-gray-300 text-sm mb-3">{result.description}</p>
                                     
                                     {result.relatedHashtags && result.relatedHashtags.length > 0 && (
                                         <div className="flex flex-wrap gap-2 mb-3">
                                             {result.relatedHashtags.map((tag: string, idx: number) => (
                                                 <span key={idx} className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
                                                     {tag}
                                                 </span>
                                             ))}
                                         </div>
                                     )}
                                     
                                     {result.bestPractices && (
                                         <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg">
                                             <p className="text-xs font-semibold text-blue-900 dark:text-blue-300 mb-1">💡 Best Practice</p>
                                             <p className="text-xs text-blue-700 dark:text-blue-400">{result.bestPractices}</p>
                                         </div>
                                     )}
                                     
                                     <div className="flex gap-2">
                                         <button
                                             onClick={() => {
                                                 setComposeContext({ 
                                                     topic: result.title, 
                                                     platform: result.platform,
                                                     hashtags: result.relatedHashtags?.join(' ') || ''
                                                 });
                                                 setActivePage('compose');
                                             }}
                                             className="flex-1 px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-lg hover:from-primary-700 hover:to-primary-600 text-sm font-semibold shadow-sm transition-all"
                                         >
                                             Create Content →
                                         </button>
                                     </div>
                                 </div>
                                 );
                             })}
                        </div>
                    )}

                    {!isLoading && !error && results.length === 0 && niche && (
                        <div className="bg-white dark:bg-gray-800 p-12 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                            <TrendingIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                            <p className="text-gray-500 dark:text-gray-400 font-medium">No trends found. Try a different search term.</p>
                        </div>
                    )}

                    {!niche && !isLoading && (
                        <div className="bg-white dark:bg-gray-800 p-12 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                            <SparklesIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                            <p className="text-gray-500 dark:text-gray-400 font-medium">Enter a topic above to discover trending opportunities</p>
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
