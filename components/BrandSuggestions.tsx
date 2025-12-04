
import React, { useState, useEffect } from 'react';
import { SparklesIcon, BriefcaseIcon } from './icons/UIIcons';
import { generateBrandSuggestions } from "../src/services/geminiService"
import { useAppContext } from './AppContext';

export const BrandSuggestions: React.FC = () => {
    const { user, selectedClient, posts } = useAppContext();
    const [niche, setNiche] = useState('');
    const [suggestions, setSuggestions] = useState<Array<{ name: string; reason: string; matchScore: number }>>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Auto-populate niche based on user/client profile
    useEffect(() => {
        const profile = selectedClient || user;
        if (profile && !niche) {
            // Attempt to derive a niche from bio or name, simple heuristic
            let potentialNiche = 'bio' in profile ? (profile as any).bio : profile.name;
            
            // If we have posts, add some context from content (but NOT hashtags)
            if (posts.length > 0) {
                 // Extract keywords from content without hashtags
                 const recentContent = posts.slice(0, 5)
                    .map(p => p.content.replace(/#\w+/g, '').trim())
                    .filter(c => c.length > 0)
                    .join(' ')
                    .substring(0, 100);
                 
                 if (recentContent) {
                     potentialNiche += ` ${recentContent}`;
                 }
            }

            if (potentialNiche) {
                setNiche(potentialNiche.substring(0, 60));
            }
        }
    }, [user, selectedClient, posts]);

    const handleGenerate = async () => {
        if (!niche.trim()) return;
        setIsLoading(true);
        try {
            const profile = selectedClient || user;
            const results = await generateBrandSuggestions({
                niche: niche.trim(),
                audience: profile?.name || 'General Audience',
                userType: user?.userType || 'Creator'
            });
            // Handle both array format and object format
            if (Array.isArray(results)) {
                setSuggestions(results);
            } else if (results.suggestions && Array.isArray(results.suggestions)) {
                setSuggestions(results.suggestions);
            } else if (results.brands && Array.isArray(results.brands)) {
                setSuggestions(results.brands);
            } else {
                // If API returns strings, convert to expected format
                const suggestionsArray = Array.isArray(results) ? results : [results];
                setSuggestions(suggestionsArray.map((s: any, idx: number) => {
                    if (typeof s === 'string') {
                        return { name: `Brand ${idx + 1}`, reason: s, matchScore: 85 };
                    }
                    return s;
                }));
            }
        } catch (e: any) {
            console.error('Brand suggestions error:', e);
            setSuggestions([]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full">
                    <BriefcaseIcon className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Brand Partnership Finder</h3>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Find brands that align with your content for potential sponsorships and collaborations.
            </p>
            
            <div className="flex gap-2 mb-6">
                <input 
                    type="text" 
                    value={niche} 
                    onChange={(e) => setNiche(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && niche.trim() && handleGenerate()}
                    placeholder="Enter your niche..."
                    className="flex-grow p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-sm dark:text-white dark:placeholder-gray-400 focus:ring-2 focus:ring-green-500"
                />
                <button 
                    onClick={handleGenerate} 
                    disabled={isLoading || !niche.trim()}
                    className="px-4 py-3 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-lg hover:from-green-700 hover:to-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold flex items-center gap-2 shadow-sm transition-all"
                >
                    {isLoading ? (
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : (
                        <SparklesIcon className="w-4 h-4" />
                    )}
                    Find
                </button>
            </div>

            <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar">
                {suggestions.map((brand, idx) => (
                    <div key={idx} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700/30 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-gray-900 dark:text-white text-sm">{brand.name}</h4>
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${brand.matchScore > 90 ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200' : brand.matchScore > 70 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'}`}>
                                {brand.matchScore}% Match
                            </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{brand.reason}</p>
                    </div>
                ))}
                {suggestions.length === 0 && !isLoading && (
                    <div className="text-center py-8">
                        <BriefcaseIcon className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                        <p className="text-sm text-gray-400 dark:text-gray-500 italic">Enter your niche to see brand suggestions.</p>
                    </div>
                )}
                {isLoading && (
                    <div className="text-center py-8">
                        <svg className="animate-spin h-6 w-6 text-green-600 dark:text-green-400 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p className="text-xs text-gray-400 dark:text-gray-500">Finding brands...</p>
                    </div>
                )}
            </div>
        </div>
    );
};
