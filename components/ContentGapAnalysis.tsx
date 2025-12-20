import React, { useState } from 'react';
import { useAppContext } from './AppContext';
import { SparklesIcon, RefreshIcon, XMarkIcon, CheckCircleIcon } from './icons/UIIcons';
import { auth } from '../firebaseConfig';

export const ContentGapAnalysis: React.FC = () => {
    const { user, showToast } = useAppContext();
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysis, setAnalysis] = useState<any>(null);
    const [showModal, setShowModal] = useState(false);

    const handleAnalyze = async () => {
        if (!user) {
            showToast('Please sign in to analyze content gaps', 'error');
            return;
        }

        setIsAnalyzing(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const response = await fetch('/api/analyzeContentGaps', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    daysToAnalyze: 90,
                    niche: user.niche || '',
                    platforms: ['Instagram', 'TikTok', 'X', 'LinkedIn', 'Facebook', 'Threads', 'YouTube'],
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to analyze content gaps');
            }

            const data = await response.json();
            if (data.success) {
                setAnalysis(data);
                setShowModal(true);
                showToast('Content gap analysis complete!', 'success');
            }
        } catch (error: any) {
            console.error('Error analyzing content gaps:', error);
            showToast(error.message || 'Failed to analyze content gaps', 'error');
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <>
            <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-all shadow-md hover:shadow-lg"
            >
                {isAnalyzing ? (
                    <>
                        <RefreshIcon className="w-5 h-5 animate-spin" />
                        Analyzing...
                    </>
                ) : (
                    <>
                        <SparklesIcon className="w-5 h-5" />
                        Analyze Content Gaps
                    </>
                )}
            </button>

            {showModal && analysis && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Content Gap Analysis</h2>
                            <button
                                onClick={() => setShowModal(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Summary */}
                            {analysis.summary && (
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                    <p className="text-blue-900 dark:text-blue-200">{analysis.summary}</p>
                                </div>
                            )}

                            {/* Gaps */}
                            {analysis.gaps && analysis.gaps.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Identified Gaps</h3>
                                    <div className="space-y-3">
                                        {analysis.gaps.map((gap: any, idx: number) => (
                                            <div
                                                key={idx}
                                                className={`p-4 rounded-lg border ${
                                                    gap.severity === 'high'
                                                        ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                                        : gap.severity === 'medium'
                                                        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                                                        : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between mb-2">
                                                    <span className={`text-xs font-semibold px-2 py-1 rounded ${
                                                        gap.severity === 'high'
                                                            ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                                                            : gap.severity === 'medium'
                                                            ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300'
                                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                                    }`}>
                                                        {gap.severity.toUpperCase()}
                                                    </span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">{gap.type}</span>
                                                </div>
                                                <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">{gap.description}</p>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{gap.impact}</p>
                                                <p className="text-xs text-gray-700 dark:text-gray-300">{gap.recommendation}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Suggestions */}
                            {analysis.suggestions && analysis.suggestions.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Content Suggestions to Fill Gaps</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {analysis.suggestions.map((suggestion: any, idx: number) => (
                                            <div
                                                key={idx}
                                                className="p-4 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
                                            >
                                                <div className="flex items-start justify-between mb-2">
                                                    <span className={`text-xs font-semibold px-2 py-1 rounded ${
                                                        suggestion.priority === 'high'
                                                            ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                                                            : suggestion.priority === 'medium'
                                                            ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300'
                                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                                    }`}>
                                                        {suggestion.priority.toUpperCase()}
                                                    </span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">{suggestion.type}</span>
                                                </div>
                                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{suggestion.title}</h4>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{suggestion.captionOutline}</p>
                                                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
                                                    <span>{suggestion.platform}</span>
                                                    <span>•</span>
                                                    <span>{suggestion.format}</span>
                                                </div>
                                                <p className="text-xs text-gray-700 dark:text-gray-300 italic">{suggestion.whyThisFillsGap}</p>
                                                {suggestion.trendRelevance && (
                                                    <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
                                                        🔥 {suggestion.trendRelevance}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
