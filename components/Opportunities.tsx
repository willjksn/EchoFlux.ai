
import React, { useState, useEffect } from 'react';
import { findTrends, generateCaptions, generateContentStrategy } from "../src/services/geminiService"
import { Opportunity, Platform, HashtagSet } from '../types';
import { SparklesIcon, TrendingIcon, HashtagIcon, TrashIcon, XMarkIcon, RocketIcon, TargetIcon, DownloadIcon } from './icons/UIIcons';
import { InstagramIcon, TikTokIcon, XIcon, ThreadsIcon, YouTubeIcon, LinkedInIcon, FacebookIcon } from './icons/PlatformIcons';
import { useAppContext } from './AppContext';
import { UpgradePrompt } from './UpgradePrompt';
import { BrandSuggestions } from './BrandSuggestions';
import { db } from '../firebaseConfig';
import { doc, setDoc, getDoc, collection, addDoc, getDocs, query, orderBy, deleteDoc, Timestamp } from 'firebase/firestore';

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
    const { user, setActivePage, setComposeContext, hashtagSets, setHashtagSets, showToast } = useAppContext();
    const [niche, setNiche] = useState('');
    const [results, setResults] = useState<Opportunity[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filterPlatform, setFilterPlatform] = useState<Platform | 'All'>('All');
    const [filterType, setFilterType] = useState<string>('All');
    const [sortBy, setSortBy] = useState<'relevance' | 'engagement' | 'trending'>('engagement');
    const [autoScanEnabled, setAutoScanEnabled] = useState(true);
    const [lastScanDate, setLastScanDate] = useState<string | null>(null);
    const [isAutoScanning, setIsAutoScanning] = useState(false);
    const [savedScans, setSavedScans] = useState<any[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
    const [showContentModal, setShowContentModal] = useState(false);
    const [isGeneratingContent, setIsGeneratingContent] = useState(false);
    const [generatedCaptions, setGeneratedCaptions] = useState<Array<{ caption: string; hashtags: string[] }>>([]);
    const [showAIGeneratedModal, setShowAIGeneratedModal] = useState(false);

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

    // Load saved scan from localStorage on mount
    useEffect(() => {
        if (!user?.id) return;
        
        const saved = localStorage.getItem(`opportunities_scan_${user.id}`);
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (data.results && Array.isArray(data.results) && data.results.length > 0) {
                    setResults(data.results);
                    setNiche(data.niche || '');
                    setLastScanDate(data.scanDate || null);
                }
            } catch (err) {
                console.error('Failed to load saved opportunities scan:', err);
            }
        }
        
        // Load selected opportunity if navigating back
        const selected = localStorage.getItem(`selected_opportunity_${user.id}`);
        if (selected) {
            try {
                const opp = JSON.parse(selected);
                setSelectedOpportunity(opp);
            } catch (err) {
                console.error('Failed to load selected opportunity:', err);
            }
        }
        
        // Load history from Firestore
        loadScanHistory();
    }, [user?.id]);

    // Load scan history from Firestore
    const loadScanHistory = async () => {
        if (!user?.id) return;
        
        try {
            const scansRef = collection(db, 'users', user.id, 'opportunities_history');
            const q = query(scansRef, orderBy('scannedAt', 'desc'));
            const snapshot = await getDocs(q);
            
            const history = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            setSavedScans(history);
        } catch (error) {
            console.error('Failed to load scan history:', error);
        }
    };

    // Save scan to Firestore history
    const saveScanToHistory = async (niche: string, results: Opportunity[]) => {
        if (!user?.id || !results || results.length === 0) return;
        
        try {
            await addDoc(collection(db, 'users', user.id, 'opportunities_history'), {
                niche,
                results,
                scannedAt: Timestamp.now(),
                resultCount: results.length
            });
            await loadScanHistory(); // Refresh history
        } catch (error) {
            console.error('Failed to save scan to history:', error);
        }
    };

    const handleFindTrends = async (isAutoScan = false) => {
        if (!niche.trim()) return;
        setIsLoading(true);
        setError(null);
        // Don't clear results - keep previous results until new ones arrive
        try {
            const trends = await findTrends(niche);
            if (!trends || trends.length === 0) {
                setError('No opportunities found. Try a different search term or check your API configuration.');
                // Only clear if no results found
                setResults([]);
            } else {
                console.log('Found opportunities:', trends.length, trends);
                // Update results with new scan - this replaces previous results
                setResults(trends);
                setError(null); // Clear any previous errors on success
                const scanDate = new Date().toISOString();
                setLastScanDate(scanDate);
                
                // Save to localStorage for persistence
                localStorage.setItem(`opportunities_scan_${user.id}`, JSON.stringify({
                    niche,
                    results: trends,
                    scanDate
                }));
                
                // Save to Firestore history (both manual and auto-scan)
                await saveScanToHistory(niche, trends);
                
                // Auto-save trending hashtags from opportunities
                autoSaveTrendingHashtags(trends);
                
                if (!isAutoScan) {
                    showToast(`Found ${trends.length} opportunities!`, 'success');
                }
            }
        } catch (err: any) {
            console.error('Error finding trends:', err);
            // Extract error message from various possible formats
            const errorMessage = err?.note || err?.message || err?.error || 'Failed to find trends. Please try again.';
            setError(errorMessage);
            // Don't clear results on error - keep previous results visible
        } finally {
            setIsLoading(false);
        }
    };

    const autoSaveTrendingHashtags = (opportunities: Opportunity[]) => {
        if (!setHashtagSets || !showToast) return;
        
        // Collect all hashtags from trending hashtag opportunities
        const hashtagMap = new Map<string, string[]>(); // platform -> hashtags
        
        opportunities.forEach(opp => {
            if (opp.type === 'Trending Hashtag' && opp.relatedHashtags && opp.relatedHashtags.length > 0) {
                const platform = opp.platform || 'All Platforms';
                if (!hashtagMap.has(platform)) {
                    hashtagMap.set(platform, []);
                }
                opp.relatedHashtags.forEach(tag => {
                    if (!hashtagMap.get(platform)!.includes(tag)) {
                        hashtagMap.get(platform)!.push(tag);
                    }
                });
            }
        });

        // Create hashtag sets for each platform
        hashtagMap.forEach((tags, platform) => {
            if (tags.length > 0) {
                const setName = `Trending: ${platform} - ${new Date().toLocaleDateString()}`;
                
                // Check if set already exists
                const existingSet = hashtagSets?.find(set => set.name === setName);
                if (!existingSet) {
                    const newSet: HashtagSet = {
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                        name: setName,
                        tags: tags.filter(tag => tag.startsWith('#'))
                    };
                    
                    setHashtagSets(prev => [...(prev || []), newSet]);
                }
            }
        });

        if (hashtagMap.size > 0) {
            showToast(`Saved ${hashtagMap.size} trending hashtag set(s) to Hashtag Manager!`, 'success');
        }
    };

    const handleSaveHashtags = (opportunity: Opportunity) => {
        if (!setHashtagSets || !showToast || !opportunity.relatedHashtags || opportunity.relatedHashtags.length === 0) {
            showToast?.('No hashtags to save.', 'error');
            return;
        }

        const tags = opportunity.relatedHashtags.filter(tag => tag.startsWith('#'));
        if (tags.length === 0) {
            showToast('No valid hashtags found.', 'error');
            return;
        }

        const setName = `${opportunity.type}: ${opportunity.title}`;
        const newSet: HashtagSet = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: setName.length > 50 ? setName.substring(0, 50) : setName,
            tags: tags
        };

        setHashtagSets(prev => [...(prev || []), newSet]);
        showToast(`Saved "${setName}" to Hashtag Manager!`, 'success');
    };

    // Handle AI Generate Content
    const handleAIGenerate = async () => {
        if (!selectedOpportunity) return;
        
        setIsGeneratingContent(true);
        try {
            const prompt = `Create engaging social media content based on this trending opportunity:
Title: ${selectedOpportunity.title}
Description: ${selectedOpportunity.description}
Platform: ${selectedOpportunity.platform}
${selectedOpportunity.relatedHashtags ? `Hashtags: ${selectedOpportunity.relatedHashtags.join(', ')}` : ''}
${selectedOpportunity.bestPractices ? `Best Practices: ${selectedOpportunity.bestPractices}` : ''}

Generate multiple compelling captions (at least 5) that leverage this trend. Each caption should be unique and engaging.`;

            const captions = await generateCaptions({
                goal: 'engagement',
                tone: 'friendly',
                promptText: prompt,
                platforms: [selectedOpportunity.platform]
            });

            if (captions && captions.length > 0) {
                setGeneratedCaptions(captions);
                setShowContentModal(false);
                setShowAIGeneratedModal(true);
            } else {
                showToast('Failed to generate content. Please try again.', 'error');
            }
        } catch (error: any) {
            console.error('Error generating content:', error);
            showToast(error?.message || 'Failed to generate content. Please try again.', 'error');
        } finally {
            setIsGeneratingContent(false);
        }
    };

    // Handle saving generated caption to compose
    const handleUseCaption = (caption: { caption: string; hashtags: string[] }) => {
        if (!selectedOpportunity) return;
        
        setComposeContext({
            topic: selectedOpportunity.title,
            platform: selectedOpportunity.platform,
            hashtags: caption.hashtags.join(' ') || selectedOpportunity.relatedHashtags?.join(' ') || '',
            captionText: caption.caption
        });
        
        setShowAIGeneratedModal(false);
        setActivePage('compose');
        showToast('Caption loaded in Compose!', 'success');
    };

    // Handle downloading captions
    const handleDownloadCaptions = () => {
        if (generatedCaptions.length === 0) return;
        
        const content = generatedCaptions.map((item, idx) => {
            return `Caption ${idx + 1}:\n${item.caption}\n\nHashtags: ${item.hashtags.join(' ')}\n\n${'='.repeat(50)}\n\n`;
        }).join('');
        
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `generated-captions-${selectedOpportunity?.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('Captions downloaded!', 'success');
    };

    // Handle Send to Strategy
    const handleSendToStrategy = () => {
        if (!selectedOpportunity) return;
        
        // Save opportunity context for Strategy
        localStorage.setItem(`opportunity_for_strategy_${user.id}`, JSON.stringify({
            opportunity: selectedOpportunity,
            niche: niche,
            goal: `Create content around: ${selectedOpportunity.title}`,
            platform: selectedOpportunity.platform
        }));
        
        setShowContentModal(false);
        setActivePage('strategy');
        showToast('Opportunity sent to Strategy! Generate your roadmap.', 'success');
    };

    // Handle Manual Create
    const handleManualCreate = () => {
        if (!selectedOpportunity) return;
        
        // Create a pre-filled caption with opportunity details
        let preFilledCaption = `${selectedOpportunity.title}\n\n${selectedOpportunity.description}`;
        
        if (selectedOpportunity.bestPractices) {
            preFilledCaption += `\n\n💡 ${selectedOpportunity.bestPractices}`;
        }
        
        if (selectedOpportunity.relatedHashtags && selectedOpportunity.relatedHashtags.length > 0) {
            preFilledCaption += `\n\n${selectedOpportunity.relatedHashtags.join(' ')}`;
        }
        
        setComposeContext({
            topic: selectedOpportunity.title,
            platform: selectedOpportunity.platform,
            hashtags: selectedOpportunity.relatedHashtags?.join(' ') || '',
            captionText: preFilledCaption
        });
        
        setShowContentModal(false);
        setActivePage('compose');
        showToast('Opportunity details pre-filled in Compose!', 'success');
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

            <div className="max-w-5xl mx-auto">
                {/* Centered: Trend Finder */}
                <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-full">
                                <TrendingIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Discover Trends</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        {lastScanDate ? `Last scanned: ${new Date(lastScanDate).toLocaleDateString()}` : 'Not scanned yet'}
                                        {isAutoScanning && <span className="ml-2 text-primary-600 dark:text-primary-400">⭐ Auto-scanning...</span>}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowHistory(!showHistory)}
                                    className="relative px-3 py-1.5 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800"
                                >
                                    {showHistory ? 'Hide' : 'Show'} History
                                    {savedScans.length > 0 && (
                                        <span className="absolute -top-2 -right-2 bg-primary-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                            {savedScans.length}
                                        </span>
                                    )}
                                </button>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={autoScanEnabled}
                                        onChange={(e) => setAutoScanEnabled(e.target.checked)}
                                        className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-400 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                    />
                                    <span className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1">
                                        <span className="text-yellow-500">⭐</span> Auto-scan weekly
                                    </span>
                                </label>
                            </div>
                        </div>
                        
                        {/* History Panel */}
                        {showHistory && (
                            <div className="mb-6 bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Scan History</h4>
                                {savedScans.length === 0 ? (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">No saved scans yet. Your scans will appear here.</p>
                                ) : (
                                    <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                                        {savedScans.map((scan) => (
                                            <div
                                                key={scan.id}
                                                className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                            >
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{scan.niche}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                        {scan.resultCount || 0} opportunities • {scan.scannedAt?.toDate ? new Date(scan.scannedAt.toDate()).toLocaleDateString() : 'Recently'}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => {
                                                            setResults(scan.results || []);
                                                            setNiche(scan.niche || '');
                                                            setLastScanDate(scan.scannedAt?.toDate ? scan.scannedAt.toDate().toISOString() : null);
                                                            // Update localStorage
                                                            localStorage.setItem(`opportunities_scan_${user.id}`, JSON.stringify({
                                                                niche: scan.niche,
                                                                results: scan.results,
                                                                scanDate: scan.scannedAt?.toDate ? scan.scannedAt.toDate().toISOString() : null
                                                            }));
                                                            setShowHistory(false);
                                                            showToast('Scan loaded', 'success');
                                                        }}
                                                        className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700"
                                                    >
                                                        Load
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            if (window.confirm('Delete this scan from history?')) {
                                                                try {
                                                                    await deleteDoc(doc(db, 'users', user.id, 'opportunities_history', scan.id));
                                                                    await loadScanHistory();
                                                                    showToast('Scan deleted', 'success');
                                                                } catch (error) {
                                                                    console.error('Failed to delete scan:', error);
                                                                    showToast('Failed to delete scan', 'error');
                                                                }
                                                            }
                                                        }}
                                                        className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                            Enter a topic or niche to find relevant trends and opportunities. {autoScanEnabled && '⭐ Trends will auto-update weekly or scan on-demand.'}
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input
                                type="text"
                                value={niche}
                                onChange={(e) => setNiche(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && niche.trim() && handleFindTrends()}
                                placeholder="e.g., sustainable fashion, tech reviews"
                                className="flex-1 p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 focus:ring-2 focus:ring-primary-500"
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
                    
                    {/* Show selected opportunity indicator if returning from content creation */}
                    {selectedOpportunity && (
                        <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4 mb-4">
                            <div className="flex items-center justify-between">
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-primary-900 dark:text-primary-300 mb-1">
                                        📝 Working on: {selectedOpportunity.title}
                                    </p>
                                    <p className="text-xs text-primary-700 dark:text-primary-400">
                                        {selectedOpportunity.platform} • Click "Create Content" again to continue
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setSelectedOpportunity(null);
                                        localStorage.removeItem(`selected_opportunity_${user.id}`);
                                    }}
                                    className="px-3 py-1 text-xs text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded"
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                    )}

                    {results.length > 0 && (
                         <div className="space-y-4">
                             <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                                <div>
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Top Opportunities</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        Found {results.length} opportunities for "{niche}"
                                        {filterPlatform !== 'All' && ` • Filtered by ${filterPlatform}`}
                                    </p>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                    {/* Platform Filter */}
                                    <select
                                        value={filterPlatform}
                                        onChange={(e) => setFilterPlatform(e.target.value as Platform | 'All')}
                                        className="px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                    >
                                        <option value="All">All Platforms</option>
                                        <option value="Instagram">Instagram</option>
                                        <option value="TikTok">TikTok</option>
                                        <option value="X">X (Twitter)</option>
                                        <option value="LinkedIn">LinkedIn</option>
                                        <option value="YouTube">YouTube</option>
                                        <option value="Facebook">Facebook</option>
                                        <option value="Threads">Threads</option>
                                    </select>
                                    {/* Type Filter */}
                                    <select
                                        value={filterType}
                                        onChange={(e) => setFilterType(e.target.value)}
                                        className="px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                    >
                                        <option value="All">All Types</option>
                                        <option value="Trending Hashtag">Hashtags</option>
                                        <option value="Viral Audio">Viral Audio</option>
                                        <option value="Popular Topic">Topics</option>
                                        <option value="Collaboration Opportunity">Collaborations</option>
                                        <option value="Content Gap">Content Gaps</option>
                                    </select>
                                    {/* Sort */}
                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value as 'relevance' | 'engagement' | 'trending')}
                                        className="px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                    >
                                        <option value="engagement">Sort by Engagement</option>
                                        <option value="trending">Sort by Trending</option>
                                        <option value="relevance">Sort by Relevance</option>
                                    </select>
                                </div>
                             </div>
                             {(() => {
                                 // Filter and sort results
                                 let filtered = results.filter(opp => {
                                     const platformMatch = filterPlatform === 'All' || opp.platform === filterPlatform;
                                     const typeMatch = filterType === 'All' || opp.type === filterType;
                                     return platformMatch && typeMatch;
                                 });
                                 
                                 // Sort results
                                 filtered.sort((a, b) => {
                                     if (sortBy === 'engagement') {
                                         return (b.engagementPotential || 0) - (a.engagementPotential || 0);
                                     } else if (sortBy === 'trending') {
                                         const velocityOrder: Record<string, number> = { 'Peak': 3, 'Rising': 2, 'Declining': 1 };
                                         return (velocityOrder[b.trendingVelocity || 'Rising'] || 0) - (velocityOrder[a.trendingVelocity || 'Rising'] || 0);
                                     } else {
                                         // Relevance - keep original order
                                         return 0;
                                     }
                                 });
                                 
                                 return filtered.length > 0 ? filtered.map((result) => {
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
                                     <div key={result.id} className={`bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border-2 hover:shadow-md transition-shadow ${
                                         selectedOpportunity && (selectedOpportunity.id === result.id || selectedOpportunity.title === result.title)
                                             ? 'border-primary-500 dark:border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                                             : 'border-gray-100 dark:border-gray-700'
                                     }`}>
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
                                             <div className="mb-3">
                                                 <div className="flex items-center justify-between mb-2">
                                                     <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Hashtags:</p>
                                                     <button
                                                         onClick={() => handleSaveHashtags(result)}
                                                         className="flex items-center gap-1 px-2 py-1 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-colors"
                                                         title="Save to Hashtag Manager"
                                                     >
                                                         <HashtagIcon />
                                                         Save
                                                     </button>
                                                 </div>
                                                 <div className="flex flex-wrap gap-2">
                                                 {result.relatedHashtags.map((tag: string, idx: number) => (
                                                     <span key={idx} className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
                                                         {tag}
                                                     </span>
                                                 ))}
                                                 </div>
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
                                                     setSelectedOpportunity(result);
                                                     // Save to localStorage for persistence
                                                     localStorage.setItem(`selected_opportunity_${user.id}`, JSON.stringify(result));
                                                     setShowContentModal(true);
                                                 }}
                                                 className="flex-1 px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-lg hover:from-primary-700 hover:to-primary-600 text-sm font-semibold shadow-sm transition-all"
                                             >
                                                 Create Content →
                                             </button>
                                         </div>
                                     </div>
                                     );
                                 }) : (
                                     <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                                         <p className="text-gray-500 dark:text-gray-400">No opportunities match your filters. Try adjusting your filters.</p>
                                     </div>
                                 );
                             })()}
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
            </div>

            {/* Content Creation Modal */}
            {showContentModal && selectedOpportunity && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Create Content from Opportunity</h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    {selectedOpportunity.title} • {selectedOpportunity.platform}
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setShowContentModal(false);
                                    // Don't clear selectedOpportunity - keep it for when user returns
                                }}
                                className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Opportunity Details */}
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 mb-6">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{selectedOpportunity.title}</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{selectedOpportunity.description}</p>
                                
                                {selectedOpportunity.relatedHashtags && selectedOpportunity.relatedHashtags.length > 0 && (
                                    <div className="mb-3">
                                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Trending Hashtags:</p>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedOpportunity.relatedHashtags.map((tag, idx) => (
                                                <span key={idx} className="text-xs px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                
                                {selectedOpportunity.bestPractices && (
                                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg">
                                        <p className="text-xs font-semibold text-blue-900 dark:text-blue-300 mb-1">💡 Best Practice</p>
                                        <p className="text-xs text-blue-700 dark:text-blue-400">{selectedOpportunity.bestPractices}</p>
                                    </div>
                                )}
                            </div>

                            {/* Content Creation Options */}
                            <div className="space-y-4">
                                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Choose how to create content:</h4>
                                
                                {/* Option 1: AI Generate */}
                                <button
                                    onClick={handleAIGenerate}
                                    disabled={isGeneratingContent}
                                    className="w-full p-4 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-lg hover:from-primary-700 hover:to-primary-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 shadow-md transition-all"
                                >
                                    <SparklesIcon className="w-6 h-6" />
                                    <div className="flex-1 text-left">
                                        <p className="font-semibold">AI Generate Content</p>
                                        <p className="text-sm text-primary-100">Let Gemini create captions and content ideas for you</p>
                                    </div>
                                    {isGeneratingContent && (
                                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    )}
                                </button>

                                {/* Option 2: Send to Strategy */}
                                <button
                                    onClick={handleSendToStrategy}
                                    className="w-full p-4 bg-gradient-to-r from-purple-600 to-purple-500 text-white rounded-lg hover:from-purple-700 hover:to-purple-600 flex items-center gap-3 shadow-md transition-all"
                                >
                                    <TargetIcon className="w-6 h-6" />
                                    <div className="flex-1 text-left">
                                        <p className="font-semibold">Send to Strategy</p>
                                        <p className="text-sm text-purple-100">Generate a multi-week content roadmap around this trend</p>
                                    </div>
                                </button>

                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Generated Content Modal */}
            {showAIGeneratedModal && selectedOpportunity && generatedCaptions.length > 0 && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">AI Generated Content</h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    {generatedCaptions.length} captions generated for {selectedOpportunity.title}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleDownloadCaptions}
                                    className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
                                >
                                    <DownloadIcon className="w-4 h-4" />
                                    Download All
                                </button>
                                <button
                                    onClick={() => {
                                        setShowAIGeneratedModal(false);
                                        setGeneratedCaptions([]);
                                    }}
                                    className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                >
                                    <XMarkIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <div className="space-y-4">
                                {generatedCaptions.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 border border-gray-200 dark:border-gray-600"
                                    >
                                        <div className="flex items-start justify-between mb-3">
                                            <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">
                                                Caption {idx + 1}
                                            </span>
                                            <button
                                                onClick={() => handleUseCaption(item)}
                                                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                                            >
                                                Use This Caption
                                            </button>
                                        </div>
                                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap mb-3">
                                            {item.caption}
                                        </p>
                                        {item.hashtags && item.hashtags.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {item.hashtags.map((tag, tagIdx) => (
                                                    <span
                                                        key={tagIdx}
                                                        className="text-xs px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full"
                                                    >
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
