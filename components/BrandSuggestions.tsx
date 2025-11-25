
import React, { useState, useEffect } from 'react';
import { SparklesIcon, BriefcaseIcon } from './icons/UIIcons';
import { generateBrandSuggestions } from '../src/services/geminiService';
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
            
            // If we have posts, add some context from hashtags or content
            if (posts.length > 0) {
                 const recentTags = posts.slice(0, 5)
                    .flatMap(p => p.content.match(/#\w+/g) || [])
                    .slice(0, 3); // Take top 3 tags
                 
                 if (recentTags.length > 0) {
                     potentialNiche += ` ${recentTags.join(' ')}`;
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
            const results = await generateBrandSuggestions(niche);
            setSuggestions(results);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full">
                    <BriefcaseIcon className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Brand Partnership Finder</h3>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Find brands that align with your content for potential sponsorships and collaborations.
            </p>
            
            <div className="flex gap-2 mb-6">
                <input 
                    type="text" 
                    value={niche} 
                    onChange={(e) => setNiche(e.target.value)} 
                    placeholder="Enter your niche (e.g., 'Vegan Cooking', 'Tech Reviews')"
                    className="flex-grow p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-sm dark:text-white dark:placeholder-gray-400"
                />
                <button 
                    onClick={handleGenerate} 
                    disabled={isLoading || !niche}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 text-sm font-medium flex items-center gap-2"
                >
                    {isLoading ? <SparklesIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
                    Find Brands
                </button>
            </div>

            <div className="space-y-3">
                {suggestions.map((brand, idx) => (
                    <div key={idx} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                        <div className="flex justify-between items-start">
                            <h4 className="font-bold text-gray-900 dark:text-white">{brand.name}</h4>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${brand.matchScore > 90 ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                                {brand.matchScore}% Match
                            </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{brand.reason}</p>
                    </div>
                ))}
                {suggestions.length === 0 && !isLoading && (
                    <p className="text-center text-sm text-gray-400 italic py-4">Enter your niche to see suggestions.</p>
                )}
            </div>
        </div>
    );
};
