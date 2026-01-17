import React, { useEffect, useRef, useState } from 'react';
import { useAppContext } from './AppContext';
import { SparklesIcon, RefreshIcon, DownloadIcon, UploadIcon, XMarkIcon, CopyIcon, ImageIcon, TrashIcon } from './icons/UIIcons';
import { auth, storage, db } from '../firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, Timestamp, query, getDocs, orderBy, getDoc, doc, setDoc, deleteDoc, where, limit } from 'firebase/firestore';
import { OnlyFansCalendarEvent } from './OnlyFansCalendar';
import { FanSelector } from './FanSelector';
import { loadEmojiSettings } from '../src/utils/loadEmojiSettings';
import { findAdultTrends } from '../src/services/geminiService';

type ContentType = 'captions' | 'mediaCaptions' | 'postIdeas' | 'shootConcepts' | 'weeklyPlan' | 'trends' | 'monetizationPlanner' | 'messaging' | 'guides' | 'history';

type AdultTrendOpportunity = {
    id: string;
    type: 'Trending Theme' | 'PPV Angle' | 'Interactive Trend' | 'Bundle/Offer' | 'Content Gap';
    title: string;
    description: string;
    platform: 'OnlyFans' | 'Fansly' | 'Fanvue';
    engagementPotential?: number;
    trendingVelocity?: 'Rising' | 'Peak' | 'Declining';
    relatedHashtags?: string[];
    bestPractices?: string;
};

// Predict Modal Component (similar to Compose)
const PredictModal: React.FC<{ result: any; onClose: () => void; onCopy: (text: string) => void; onSave?: () => void; showToast?: (message: string, type: 'success' | 'error') => void }> = ({ result, onClose, onCopy, onSave, showToast }) => {
    const ideas = result.ideas || result.postIdeas || result.nextPostIdeas;
    const weeklyMix = Array.isArray(result.weeklyMix) ? result.weeklyMix : [];
    const bestBet = result.bestBet || result.nextBestBet;
    const hasIdeas = Array.isArray(ideas) && ideas.length > 0;

    if (hasIdeas) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">What To Post Next</h2>
                            {result.platform && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    For {result.platform} creators
                                </p>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {result.summary && (
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                <p className="text-blue-900 dark:text-blue-200 text-sm">{result.summary}</p>
                            </div>
                        )}
                        {bestBet && (
                            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                                <p className="text-green-900 dark:text-green-200 text-sm">
                                    <span className="font-semibold">Best bet:</span> {bestBet}
                                </p>
                            </div>
                        )}
                        {weeklyMix.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Suggested Weekly Mix</h3>
                                <div className="flex flex-wrap gap-2">
                                    {weeklyMix.map((item: any, idx: number) => (
                                        <span
                                            key={`${item.type}-${idx}`}
                                            className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-xs text-gray-700 dark:text-gray-200 rounded-full"
                                        >
                                            {item.type} x{item.count}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="space-y-4">
                            {ideas.map((idea: any, idx: number) => (
                                <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <div>
                                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                                Idea {idx + 1}: {idea.title || 'Post idea'}
                                            </h4>
                                            {idea.format && (
                                                <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                                                    {idea.format}
                                                </span>
                                            )}
                                        </div>
                                        {Array.isArray(idea.tags) && idea.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                                {idea.tags.map((tag: string, tagIdx: number) => (
                                                    <span
                                                        key={`${tag}-${tagIdx}`}
                                                        className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200"
                                                    >
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {idea.description && (
                                        <p className="text-xs text-gray-700 dark:text-gray-300 mb-2">{idea.description}</p>
                                    )}
                                    {idea.why && (
                                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                                            <span className="font-semibold text-gray-800 dark:text-gray-200">Why it works:</span> {idea.why}
                                        </p>
                                    )}
                                    {idea.hook && (
                                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                                            <span className="font-semibold text-gray-800 dark:text-gray-200">Hook:</span> {idea.hook}
                                        </p>
                                    )}
                                    {idea.caption && (
                                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md p-3 text-xs text-gray-700 dark:text-gray-300 mb-2">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-semibold">Caption</span>
                                                <button
                                                    onClick={() => onCopy(idea.caption)}
                                                    className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                            <p className="whitespace-pre-wrap">{idea.caption}</p>
                                        </div>
                                    )}
                                    {idea.dmLine && (
                                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md p-3 text-xs text-gray-700 dark:text-gray-300 mb-2">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-semibold">DM Line</span>
                                                <button
                                                    onClick={() => onCopy(idea.dmLine)}
                                                    className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                            <p className="whitespace-pre-wrap">{idea.dmLine}</p>
                                        </div>
                                    )}
                                    {idea.ppvAngle && (
                                        <p className="text-xs text-gray-600 dark:text-gray-400">
                                            <span className="font-semibold text-gray-800 dark:text-gray-200">PPV angle:</span> {idea.ppvAngle}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">What To Post Next</h2>
                        {result.platform && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                Trend-based roadmap for {result.platform}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40">
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                            This looks like a legacy performance result. The new “What To Post Next” gives you a
                            trend-based roadmap and fresh ideas instead of grading captions.
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Click “What To Post Next” again to generate ideas.
                        </p>
                    </div>
                </div>
                <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                    {onSave && (
                        <button
                            onClick={async () => {
                                await onSave();
                            }}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors flex items-center gap-2"
                        >
                            <DownloadIcon className="w-4 h-4" />
                            Save to History
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
};

// Repurpose Modal Component (similar to Compose)
const RepurposeModal: React.FC<{ result: any; onClose: () => void; onCopy: (text: string) => void; onSave?: () => void; showToast?: (message: string, type: 'success' | 'error') => void }> = ({ result, onClose, onCopy, onSave, showToast }) => {
    const repurposedContent = result.repurposedContent || [];

    const copyPlatformContent = (item: any) => {
        const text = `${item.platform} (${item.format})\n\n${item.caption}\n\nHashtags: ${(item.hashtags || []).join(' ')}\n\nOptimizations:\n${(item.optimizations || []).map((opt: string) => `• ${opt}`).join('\n')}`;
        onCopy(text);
    };

    const copyAllContent = () => {
        const text = repurposedContent.map((item: any) => 
            `--- ${item.platform} (${item.format}) ---\n${item.caption}\n\nHashtags: ${(item.hashtags || []).join(' ')}\n\nOptimizations:\n${(item.optimizations || []).map((opt: string) => `• ${opt}`).join('\n')}`
        ).join('\n\n');
        onCopy(text);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Repurposed Content</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {result.summary && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                            <p className="text-blue-900 dark:text-blue-200 text-sm">{result.summary}</p>
                        </div>
                    )}
                    {repurposedContent.map((item: any, idx: number) => (
                        <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{item.platform}</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{item.format}</p>
                                </div>
                                <button
                                    onClick={() => copyPlatformContent(item)}
                                    className="px-3 py-1 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm flex items-center gap-1"
                                >
                                    <CopyIcon className="w-4 h-4" />
                                    Copy
                                </button>
                            </div>
                            <p className="text-gray-900 dark:text-white whitespace-pre-wrap mb-2">{item.caption}</p>
                            {item.hashtags && item.hashtags.length > 0 && (
                                <p className="text-primary-600 dark:text-primary-400 text-sm mb-2">
                                    {item.hashtags.join(' ')}
                                </p>
                            )}
                            {item.optimizations && item.optimizations.length > 0 && (
                                <div className="mt-3">
                                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Optimizations:</p>
                                    <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                                        {item.optimizations.map((opt: string, optIdx: number) => (
                                            <li key={optIdx}>• {opt}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                    {repurposedContent.length > 0 && (
                        <button
                            onClick={copyAllContent}
                            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                        >
                            <CopyIcon className="w-4 h-4" />
                            Copy All
                        </button>
                    )}
                    {onSave && (
                        <button
                            onClick={async () => {
                                await onSave();
                            }}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors flex items-center gap-2"
                        >
                            <DownloadIcon className="w-4 h-4" />
                            Save to History
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

// Helper function to get a summary from a weekly plan
const getWeeklyPlanSummary = (plan: any): string => {
    if (!plan) return '';
    
    // Handle string plans
    let planData = plan;
    if (typeof plan === 'string') {
        try {
            planData = JSON.parse(plan);
        } catch (e) {
            return plan.substring(0, 100) + (plan.length > 100 ? '...' : '');
        }
    }
    
    const actualPlan = planData?.plan || planData;
    
    // Try to extract meaningful summary
    if (actualPlan?.weeks && Array.isArray(actualPlan.weeks) && actualPlan.weeks.length > 0) {
        const firstWeek = actualPlan.weeks[0];
        const focus = firstWeek.focus || firstWeek.theme || '';
        const daysCount = (firstWeek.days || firstWeek.content || []).length;
        const totalWeeks = actualPlan.weeks.length;
        
        if (focus) {
            return `Week 1: ${focus} (${daysCount} posts)${totalWeeks > 1 ? ` • ${totalWeeks} weeks total` : ''}`;
        }
        return `${totalWeeks} week${totalWeeks > 1 ? 's' : ''} • ${daysCount} posts`;
    }
    
    // Fallback
    return typeof planData === 'string' ? planData.substring(0, 100) + (planData.length > 100 ? '...' : '') : 'Weekly Plan';
};

// Weekly Plan Formatter Component
const MonetizationPlanFormatter: React.FC<{ plan: any }> = ({ plan }) => {
    if (!plan) return null;
    
    // Handle string plans (try to parse if it's JSON)
    let planData = plan;
    if (typeof plan === 'string') {
        try {
            planData = JSON.parse(plan);
        } catch (e) {
            // If it's not JSON, just display as text
            return (
                <div className="text-gray-900 dark:text-white whitespace-pre-wrap">
                    {plan}
                </div>
            );
        }
    }
    
    // Handle plan structure: could be nested or direct
    // If planData has a 'plan' property, use that; otherwise use planData directly
    // This handles both { plan: {...} } and direct plan object structures
    const actualPlan = (planData && typeof planData === 'object' && 'plan' in planData && planData.plan) 
        ? planData.plan 
        : planData;
    
    // Debug: Check if we have the expected structure
    if (!actualPlan || (typeof actualPlan === 'object' && !actualPlan.summary && !actualPlan.balance && !actualPlan.ideas)) {
        // If the plan doesn't have expected properties, it might be malformed
        // Try to display it as JSON for debugging
        console.warn('MonetizationPlanFormatter: Unexpected plan structure', { plan, planData, actualPlan });
        return (
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-2">⚠️ Plan data structure issue. Raw data:</p>
                <pre className="text-gray-900 dark:text-white whitespace-pre-wrap font-mono text-xs overflow-auto max-h-96">
                    {JSON.stringify(actualPlan || planData || plan, null, 2)}
                </pre>
            </div>
        );
    }
    
    return (
        <div className="space-y-6">
            {/* Summary */}
            {actualPlan?.summary && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-200 mb-2">Strategy Summary</h3>
                    <p className="text-blue-800 dark:text-blue-300">{actualPlan.summary}</p>
                </div>
            )}

            {/* Balance Visualization */}
            {actualPlan?.balance && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Content Balance</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                            <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">{actualPlan.balance.engagement}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Engagement</p>
                        </div>
                        <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{actualPlan.balance.upsell}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Upsell</p>
                        </div>
                        <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{actualPlan.balance.retention}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Retention</p>
                        </div>
                        <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{actualPlan.balance.conversion}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Conversion</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Warnings */}
            {actualPlan?.warnings && Array.isArray(actualPlan.warnings) && actualPlan.warnings.length > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <h4 className="font-semibold text-yellow-900 dark:text-yellow-200 mb-2">⚠️ Warnings</h4>
                    <ul className="list-disc list-inside space-y-1 text-yellow-800 dark:text-yellow-300 text-sm">
                        {actualPlan.warnings.map((warning: string, index: number) => (
                            <li key={index}>{warning}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Tips */}
            {actualPlan?.tips && Array.isArray(actualPlan.tips) && actualPlan.tips.length > 0 && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <h4 className="font-semibold text-green-900 dark:text-green-200 mb-2">💡 Tips</h4>
                    <ul className="list-disc list-inside space-y-1 text-green-800 dark:text-green-300 text-sm">
                        {actualPlan.tips.map((tip: string, index: number) => (
                            <li key={index}>{tip}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Ideas by Category */}
            {actualPlan?.ideas && Array.isArray(actualPlan.ideas) && actualPlan.ideas.length > 0 && (
                <div className="space-y-4">
                    {/* Group ideas by label */}
                    {['engagement', 'upsell', 'retention', 'conversion'].map((label) => {
                        const categoryIdeas = actualPlan.ideas.filter((idea: any) => idea.label === label);
                        if (categoryIdeas.length === 0) return null;

                        const labelColors: Record<string, { bg: string; text: string; border: string }> = {
                            engagement: { bg: 'bg-primary-50 dark:bg-primary-900/20', text: 'text-primary-700 dark:text-primary-300', border: 'border-primary-200 dark:border-primary-800' },
                            upsell: { bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800' },
                            retention: { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
                            conversion: { bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-300', border: 'border-green-200 dark:border-green-800' },
                        };

                        const colors = labelColors[label] || labelColors.engagement;

                        return (
                            <div key={label} className={`${colors.bg} border ${colors.border} rounded-lg p-4`}>
                                <h4 className={`text-lg font-semibold ${colors.text} mb-3 capitalize`}>
                                    {label} Ideas ({categoryIdeas.length})
                                </h4>
                                <div className="space-y-3">
                                    {categoryIdeas.map((idea: any, index: number) => (
                                        <div key={index} className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                            <div className="flex items-start justify-between mb-2">
                                                <h5 className="font-semibold text-gray-900 dark:text-white">{idea.idea}</h5>
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                    idea.pricing === 'free' ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300' :
                                                    idea.pricing === 'teaser' ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300' :
                                                    'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                                                }`}>
                                                    {idea.pricing === 'free' ? 'FREE' : idea.pricing === 'teaser' ? 'TEASER' : 'PAID'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{idea.description}</p>
                                            <div className="flex flex-wrap gap-2 text-xs">
                                                <span className="text-gray-500 dark:text-gray-400">📅 {idea.suggestedTiming}</span>
                                                {idea.cta && (
                                                    <span className="text-primary-600 dark:text-primary-400">💬 CTA: {idea.cta}</span>
                                                )}
                                                {idea.priority && (
                                                    <span className="text-gray-500 dark:text-gray-400">⭐ Priority: {idea.priority}/5</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Weekly Distribution */}
            {actualPlan?.weeklyDistribution && Array.isArray(actualPlan.weeklyDistribution) && actualPlan.weeklyDistribution.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Weekly Distribution</h3>
                    <div className="space-y-3">
                        {actualPlan.weeklyDistribution.map((day: any, index: number) => (
                            <div key={index} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                <div className="flex items-start justify-between mb-2">
                                    <h4 className="font-semibold text-gray-900 dark:text-white">{day.day}</h4>
                                    <span className="text-xs text-primary-600 dark:text-primary-400">{day.focus}</span>
                                </div>
                                <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                    {Array.isArray(day.ideas) && day.ideas.map((idea: string, ideaIndex: number) => (
                                        <li key={ideaIndex}>{idea}</li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

type WeeklyPlanDayAction = {
    cardKey: string;
    weekIndex: number;
    dayIndex: number;
    week: any;
    day: any;
    dayName: string;
    postType: string;
    postIdea: string;
    focus?: string;
    description?: string;
    angle?: string;
    cta?: string;
};

type WeeklyPlanCardState = {
    mediaUrl?: string;
    mediaType?: 'image' | 'video';
    caption?: string;
    cta?: string;
    isGenerating?: boolean;
    isUploading?: boolean;
    used?: boolean;
    error?: string;
    showSchedulePicker?: boolean;
    scheduleDate?: string;
    scheduleTime?: string;
};

type WeeklyPlanActionHandlers = {
    uploadMenuKey?: string | null;
    cardStateByKey?: Record<string, WeeklyPlanCardState>;
    onToggleUploadMenu?: (cardKey: string | null) => void;
    onUploadFile?: (action: WeeklyPlanDayAction, file: File) => void;
    onSelectFromVault?: (action: WeeklyPlanDayAction) => void;
    onGenerateCaption?: (action: WeeklyPlanDayAction) => void;
    onAddToCalendar?: (action: WeeklyPlanDayAction) => void;
    onToggleSchedulePicker?: (action: WeeklyPlanDayAction) => void;
    onConfirmSchedule?: (action: WeeklyPlanDayAction) => void;
    onUpdateScheduleDate?: (action: WeeklyPlanDayAction, value: string) => void;
    onUpdateScheduleTime?: (action: WeeklyPlanDayAction, value: string) => void;
    onCopyForExport?: (action: WeeklyPlanDayAction) => void;
};

const WeeklyPlanFormatter: React.FC<{ plan: any } & WeeklyPlanActionHandlers> = ({
    plan,
    uploadMenuKey,
    cardStateByKey,
    onToggleUploadMenu,
    onUploadFile,
    onSelectFromVault,
    onGenerateCaption,
    onAddToCalendar,
    onToggleSchedulePicker,
    onConfirmSchedule,
    onUpdateScheduleDate,
    onUpdateScheduleTime,
    onCopyForExport,
}) => {
    if (!plan) return null;
    
    // Handle string plans (try to parse if it's JSON)
    let planData = plan;
    if (typeof plan === 'string') {
        try {
            planData = JSON.parse(plan);
        } catch (e) {
            // If it's not JSON, just display as text
            return (
                <div className="text-gray-900 dark:text-white whitespace-pre-wrap">
                    {plan}
                </div>
            );
        }
    }
    
    // Handle plan structure: could be plan.plan or plan directly
    const actualPlan = planData?.plan || planData;
    
    // Extract metrics if they exist
    const metrics = actualPlan?.metrics || planData?.metrics;
    
    return (
        <div className="space-y-4">
            {/* Metrics Section */}
            {metrics && metrics.milestones && metrics.milestones.length > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                    <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Weekly Goals & Milestones</h4>
                    <ul className="space-y-2">
                        {metrics.milestones.map((milestone: any, idx: number) => (
                            <li key={idx} className="text-sm text-blue-800 dark:text-blue-200">
                                {milestone.targetMetric && (
                                    <strong className="mr-2">{milestone.targetMetric}:</strong>
                                )}
                                {milestone.description && <span>{milestone.description}</span>}
                                {!milestone.targetMetric && !milestone.description && JSON.stringify(milestone)}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            
            {/* Weeks Section */}
            {actualPlan?.weeks && Array.isArray(actualPlan.weeks) && actualPlan.weeks.length > 0 ? (
                actualPlan.weeks.map((week: any, weekIndex: number) => {
                    const weekNum = week.week || week.weekNumber || weekIndex + 1;
                    const focus = week.focus || week.theme || 'Content Focus';
                    const days = week.days || week.content || [];
                    const isOneWeekPlan = actualPlan.weeks.length === 1;
                    
                    return (
                        <div
                            key={weekIndex}
                            className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden"
                        >
                            <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                        {isOneWeekPlan ? focus : `Week ${weekNum}`}
                                    </h3>
                                    {!isOneWeekPlan && (
                                        <span className="text-sm text-gray-600 dark:text-gray-400">
                                            {focus}
                                        </span>
                                    )}
                                </div>
                            </div>
                            
                            <div className="p-4 space-y-3">
                                {days.length > 0 ? (
                                    days.map((day: any, dayIndex: number) => {
                                        const dayName = day.day || `Day ${day.dayOffset !== undefined ? day.dayOffset + 1 : dayIndex + 1}`;
                                        const postType = day.postType || day.format || 'Post';
                                        const postIdea = day.postIdea || day.topic || day.content || 'Content idea';
                                        const description = day.description;
                                        const angle = day.angle;
                                        const cta = day.cta;
                                        const cardKey = `week-${weekIndex}-day-${dayIndex}`;
                                        const actionPayload: WeeklyPlanDayAction = {
                                            cardKey,
                                            weekIndex,
                                            dayIndex,
                                            week,
                                            day,
                                            dayName,
                                            postType,
                                            postIdea,
                                            focus,
                                            description,
                                            angle,
                                            cta,
                                        };
                                        const cardState = cardStateByKey?.[cardKey];
                                        const showActions = Boolean(onUploadFile || onSelectFromVault || onGenerateCaption || onAddToCalendar || onCopyForExport);
                                        const isUsed = Boolean(cardState?.used);
                                        const uploadMenuOpen = uploadMenuKey === cardKey;
                                        
                                        return (
                                            <div
                                                key={dayIndex}
                                                className={`bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 ${isUsed ? 'opacity-60' : ''}`}
                                            >
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-3 mb-2">
                                                            <span className="font-bold text-sm text-primary-600 dark:text-primary-400">
                                                                {dayName}
                                                            </span>
                                                            <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                                                                {postType}
                                                            </span>
                                                            {isUsed && (
                                                                <span className="px-2 py-0.5 text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                                                                    Used
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-gray-700 dark:text-gray-300 font-medium mb-1">
                                                            {postIdea}
                                                        </p>
                                                        {description && typeof description === 'string' && (
                                                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 mb-2">
                                                                {description}
                                                            </p>
                                                        )}
                                                        {angle && (
                                                            <p className="text-xs text-gray-600 dark:text-gray-400 italic mb-1">
                                                                <strong>Angle:</strong> {angle}
                                                            </p>
                                                        )}
                                                        {cta && (
                                                            <p className="text-xs text-primary-600 dark:text-primary-400 font-medium mt-1">
                                                                <strong>CTA:</strong> {cta}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                {cardState?.mediaUrl && (
                                                    <div className="mt-3">
                                                        {cardState.mediaType === 'video' ? (
                                                            <video
                                                                src={cardState.mediaUrl}
                                                                className="w-full max-w-sm rounded-lg border border-gray-200 dark:border-gray-700"
                                                                controls
                                                            />
                                                        ) : (
                                                            <img
                                                                src={cardState.mediaUrl}
                                                                alt={postIdea}
                                                                className="w-full max-w-sm rounded-lg border border-gray-200 dark:border-gray-700 object-cover"
                                                            />
                                                        )}
                                                    </div>
                                                )}
                                                {cardState?.caption && (
                                                    <div className="mt-3 space-y-2">
                                                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                                            Best caption
                                                        </div>
                                                        <div className="text-xs text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-600 p-2 whitespace-pre-wrap">
                                                            {cardState.caption}
                                                        </div>
                                                    </div>
                                                )}
                                                {cardState?.cta && (
                                                    <div className="mt-3 space-y-2">
                                                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                                            Best CTA
                                                        </div>
                                                        <div className="text-xs text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-600 p-2 whitespace-pre-wrap">
                                                            {cardState.cta}
                                                        </div>
                                                    </div>
                                                )}
                                                {showActions && (
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        {onUploadFile && onSelectFromVault && (
                                                            <button
                                                                onClick={() => onToggleUploadMenu?.(uploadMenuOpen ? null : cardKey)}
                                                                className="px-2.5 py-1 text-xs font-medium rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-60"
                                                                disabled={isUsed}
                                                            >
                                                                Upload media
                                                            </button>
                                                        )}
                                                        {onGenerateCaption && (
                                                            <button
                                                                onClick={() => onGenerateCaption(actionPayload)}
                                                                className="px-2.5 py-1 text-xs font-medium rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60"
                                                                disabled={isUsed || !cardState?.mediaUrl || cardState?.isGenerating}
                                                            >
                                                                {cardState?.isGenerating ? 'Generating...' : 'Generate caption'}
                                                            </button>
                                                        )}
                                                        {onAddToCalendar && (
                                                            <button
                                                                onClick={() => onToggleSchedulePicker?.(actionPayload)}
                                                                className="px-2.5 py-1 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                                                                disabled={isUsed}
                                                            >
                                                                Add to calendar
                                                            </button>
                                                        )}
                                                        {onCopyForExport && (
                                                            <button
                                                                onClick={() => onCopyForExport(actionPayload)}
                                                                className="px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                                                                disabled={isUsed}
                                                            >
                                                                Copy for export
                                                            </button>
                                                        )}
                                                        {uploadMenuOpen && !isUsed && (
                                                            <div className="w-full flex flex-wrap gap-2">
                                                                <label className="px-2.5 py-1 text-xs font-medium rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                                                                    Upload from computer
                                                                    <input
                                                                        type="file"
                                                                        accept="image/*,video/*"
                                                                        className="hidden"
                                                                        onChange={(event) => {
                                                                            const file = event.target.files?.[0];
                                                                            if (file) {
                                                                                onUploadFile?.(actionPayload, file);
                                                                            }
                                                                            event.currentTarget.value = '';
                                                                        }}
                                                                    />
                                                                </label>
                                                                <button
                                                                    onClick={() => onSelectFromVault?.(actionPayload)}
                                                                    className="px-2.5 py-1 text-xs font-medium rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                                                                >
                                                                    Choose from vault
                                                                </button>
                                                            </div>
                                                        )}
                                                        {cardState?.showSchedulePicker && !isUsed && (
                                                            <div className="w-full flex flex-wrap gap-2 items-end">
                                                                <div className="flex flex-col gap-1">
                                                                    <label className="text-xs text-gray-500 dark:text-gray-400">Date</label>
                                                                    <input
                                                                        type="date"
                                                                        value={cardState.scheduleDate || ''}
                                                                        onChange={(event) => onUpdateScheduleDate?.(actionPayload, event.target.value)}
                                                                        className="px-2 py-1 text-xs rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                                                                    />
                                                                </div>
                                                                <div className="flex flex-col gap-1">
                                                                    <label className="text-xs text-gray-500 dark:text-gray-400">Time</label>
                                                                    <input
                                                                        type="time"
                                                                        value={cardState.scheduleTime || ''}
                                                                        onChange={(event) => onUpdateScheduleTime?.(actionPayload, event.target.value)}
                                                                        className="px-2 py-1 text-xs rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                                                                    />
                                                                </div>
                                                                <button
                                                                    onClick={() => onConfirmSchedule?.(actionPayload)}
                                                                    className="px-2.5 py-1 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
                                                                >
                                                                    Confirm
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                ) : (
                                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                                        No content planned for this week
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })
            ) : (
                // Fallback: if it's a string or other format, display as-is
                <div className="text-gray-900 dark:text-white whitespace-pre-wrap">
                    {typeof actualPlan === 'string' ? actualPlan : JSON.stringify(actualPlan, null, 2)}
                </div>
            )}
        </div>
    );
};

type OnlyFansContentBrainProps = {
    initialTab?: ContentType;
};

export const OnlyFansContentBrain: React.FC<OnlyFansContentBrainProps> = ({ initialTab }) => {
    // All hooks must be called unconditionally at the top
    const context = useAppContext();
    const user = context?.user;
    const showToast = context?.showToast;
    
    // State management
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<ContentType>(initialTab ?? 'captions');
    const platformOptions: Array<'OnlyFans' | 'Fansly' | 'Fanvue'> = ['OnlyFans', 'Fansly', 'Fanvue'];
    const [selectedPlatform, setSelectedPlatform] = useState<'OnlyFans' | 'Fansly' | 'Fanvue'>('OnlyFans');
    const [isGenerating, setIsGenerating] = useState(false);
    
    // Caption generation state
    const [captionPrompt, setCaptionPrompt] = useState('');
    const [captionTone, setCaptionTone] = useState<
        | 'Playful'
        | 'Flirty'
        | 'Confident'
        | 'Teasing'
        | 'Intimate'
        | 'Seductive'
        | 'Erotic'
        | 'Raw/Uncensored'
        | 'Provocative'
        | 'Dominant'
        | 'Submissive'
        | 'Explicit'
    >('Teasing');
    const [captionGoal, setCaptionGoal] = useState('engagement');
    const [generatedCaptions, setGeneratedCaptions] = useState<string[]>([]);
    const [useCreatorPersonalityCaptions, setUseCreatorPersonalityCaptions] = useState(false);
    
    // Media upload state (for captions tab)
    const [uploadedMediaFile, setUploadedMediaFile] = useState<File | null>(null);
    const [uploadedMediaPreview, setUploadedMediaPreview] = useState<string | null>(null);
    const [uploadedMediaUrl, setUploadedMediaUrl] = useState<string | null>(null);
    const [uploadedMediaType, setUploadedMediaType] = useState<'image' | 'video' | null>(null);
    const [showMediaVaultModal, setShowMediaVaultModal] = useState(false);
    const [mediaVaultItems, setMediaVaultItems] = useState<any[]>([]);
    const [weeklyPlanUploadMenuKey, setWeeklyPlanUploadMenuKey] = useState<string | null>(null);
    const [weeklyPlanVaultTargetAction, setWeeklyPlanVaultTargetAction] = useState<WeeklyPlanDayAction | null>(null);
    const [weeklyPlanCardState, setWeeklyPlanCardState] = useState<Record<string, WeeklyPlanCardState>>({});
    const [isAnalyzingGaps, setIsAnalyzingGaps] = useState(false);
    const [isPredicting, setIsPredicting] = useState(false);
    const [isRepurposing, setIsRepurposing] = useState(false);
    const [contentGapAnalysis, setContentGapAnalysis] = useState<any>(null);
    const [showGapAnalysisModal, setShowGapAnalysisModal] = useState(false);
    const [currentCaptionForAI, setCurrentCaptionForAI] = useState<string>('');
    const [editedCaptions, setEditedCaptions] = useState<Map<number, string>>(new Map()); // Track individual caption edits by index
    const [scheduledDate, setScheduledDate] = useState<string>('');
    const [usedCaptions, setUsedCaptions] = useState<Set<number>>(new Set());
    const [usedCaptionsHash, setUsedCaptionsHash] = useState<Set<string>>(new Set()); // Track by caption hash for persistence
    
    // Media caption generation state (kept for backward compatibility)
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string | null>(null);
    const [mediaCaptionTone, setMediaCaptionTone] = useState<
        | 'Playful'
        | 'Flirty'
        | 'Confident'
        | 'Teasing'
        | 'Intimate'
        | 'Seductive'
        | 'Erotic'
        | 'Raw/Uncensored'
        | 'Provocative'
        | 'Dominant'
        | 'Submissive'
        | 'Explicit'
    >('Teasing');
    const [mediaCaptionGoal, setMediaCaptionGoal] = useState('engagement');
    const [mediaCaptionPrompt, setMediaCaptionPrompt] = useState('');
    const [generatedMediaCaptions, setGeneratedMediaCaptions] = useState<{caption: string; hashtags: string[]}[]>([]);
    
    // Post ideas state
    const [postIdeaPrompt, setPostIdeaPrompt] = useState('');
    const [generatedPostIdeas, setGeneratedPostIdeas] = useState<string[]>([]);
    const [useCreatorPersonalityPostIdeas, setUseCreatorPersonalityPostIdeas] = useState(false);
    
    // Shoot concepts state
    const [shootConceptPrompt, setShootConceptPrompt] = useState('');
    const [generatedShootConcepts, setGeneratedShootConcepts] = useState<string[]>([]);
    const [useCreatorPersonalityShootConcepts, setUseCreatorPersonalityShootConcepts] = useState(false);
    
    // Weekly plan state
    const [weeklyPlanPrompt, setWeeklyPlanPrompt] = useState('');
    const [generatedWeeklyPlan, setGeneratedWeeklyPlan] = useState<any>(null);
    const [useCreatorPersonalityWeeklyPlan, setUseCreatorPersonalityWeeklyPlan] = useState(false);

    // Trends state (adult monetized)
    const [trendsNiche, setTrendsNiche] = useState('');
    const [trendResults, setTrendResults] = useState<AdultTrendOpportunity[]>([]);
    const [isTrendsLoading, setIsTrendsLoading] = useState(false);
    const [trendsError, setTrendsError] = useState<string | null>(null);
    const [trendsLastScanDate, setTrendsLastScanDate] = useState<string | null>(null);
    const [trendFilterPlatform, setTrendFilterPlatform] = useState<'All' | 'OnlyFans' | 'Fansly' | 'Fanvue'>('All');
    const [trendFilterType, setTrendFilterType] = useState<'All' | AdultTrendOpportunity['type']>('All');
    const [trendSortBy, setTrendSortBy] = useState<'relevance' | 'engagement' | 'trending'>('engagement');
    const [trendsHistory, setTrendsHistory] = useState<any[]>([]);
    const [showTrendsHistory, setShowTrendsHistory] = useState(true);
    const [monthlyTrendsUsed, setMonthlyTrendsUsed] = useState<number>(0);
    const [trendsUsageMonth, setTrendsUsageMonth] = useState<string>('');
    
    // Monetization planner state
    const [monetizationGoals, setMonetizationGoals] = useState<string[]>([]);
    const [monetizationPreferences, setMonetizationPreferences] = useState('');
    const [subscriberCount, setSubscriberCount] = useState<number | ''>('');
    const [balanceEngagement, setBalanceEngagement] = useState(40);
    const [balanceUpsell, setBalanceUpsell] = useState(30);
    const [balanceRetention, setBalanceRetention] = useState(20);
    const [balanceConversion, setBalanceConversion] = useState(10);
    const [generatedMonetizationPlan, setGeneratedMonetizationPlan] = useState<any>(null);

    // Subscriber messaging toolkit
    const [messageType, setMessageType] = useState<'Welcome sequence' | 'Renewal reminder' | 'PPV follow-up' | 'Win-back'>(`Welcome sequence`);
    const [messageContext, setMessageContext] = useState('');
    const [messageTone, setMessageTone] = useState<'Warm' | 'Flirty' | 'Direct' | 'Explicit'>(`Warm`);
    const [generatedMessages, setGeneratedMessages] = useState<string>('');
    const [selectedFanId, setSelectedFanId] = useState<string | null>(null);
    const [useCreatorPersonalityMessaging, setUseCreatorPersonalityMessaging] = useState(false);

    const [aiHelpField, setAiHelpField] = useState<'captions' | 'postIdeas' | 'shootConcepts' | 'weeklyPlan' | 'messaging' | null>(null);
    const [aiHelpPrompt, setAiHelpPrompt] = useState('');
    const [isAiHelpGenerating, setIsAiHelpGenerating] = useState(false);
    const aiHelpRef = useRef<HTMLDivElement>(null);
    const [selectedFanName, setSelectedFanName] = useState<string | null>(null);
    const [fanPreferences, setFanPreferences] = useState<any>(null);
    const [isLoadingFanPreferences, setIsLoadingFanPreferences] = useState(false);
    const [isGeneratingMessages, setIsGeneratingMessages] = useState(false);
    
    // Saved items state for each tab
    const [savedPostIdeas, setSavedPostIdeas] = useState<any[]>([]);
    const [savedShootConcepts, setSavedShootConcepts] = useState<any[]>([]);
    const [savedWeeklyPlans, setSavedWeeklyPlans] = useState<any[]>([]);
    const [savedMonetizationPlans, setSavedMonetizationPlans] = useState<any[]>([]);
    
    // Collapse state for saved items sections

    // Modal state for AI features
    const [optimizeResult, setOptimizeResult] = useState<any>(null);
    const [predictResult, setPredictResult] = useState<any>(null);
    const [repurposeResult, setRepurposeResult] = useState<any>(null);
    const [showOptimizeModal, setShowOptimizeModal] = useState(false);
    const [showPredictModal, setShowPredictModal] = useState(false);
    const [showRepurposeModal, setShowRepurposeModal] = useState(false);
    
    // Modal state for viewing saved items
    const [viewingSavedItem, setViewingSavedItem] = useState<any>(null);
    const [showSavedItemModal, setShowSavedItemModal] = useState(false);

    // Analytics & Insights state
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [creatorAnalytics, setCreatorAnalytics] = useState({
        subscriberCount: '',
        engagementRate: '',
        topContentTypes: [] as string[],
        bestPostingTimes: [] as string[],
        topTopics: [] as string[],
        customInsights: ''
    });
    const [topContentTypeInput, setTopContentTypeInput] = useState('');
    const [bestPostingTimeInput, setBestPostingTimeInput] = useState('');
    const [topTopicInput, setTopTopicInput] = useState('');

    // Guides & Tips state
    const [guides, setGuides] = useState<any>(null);
    const [guidesLoading, setGuidesLoading] = useState(false);

    // Load fan preferences when fan is selected
    useEffect(() => {
        const loadFanPreferences = async () => {
            if (!user?.id || !selectedFanId) {
                setFanPreferences(null);
                return;
            }
            setIsLoadingFanPreferences(true);
            try {
                const fanDoc = await getDoc(doc(db, 'users', user.id, 'onlyfans_fan_preferences', selectedFanId));
                if (fanDoc.exists()) {
                    const data = fanDoc.data();
                    setFanPreferences(data);
                    
                    // Auto-apply fan preferences to caption tone
                    // Only auto-apply if tone hasn't been manually changed from default
                    if (data.preferredTone) {
                        // Map fan preferred tone to caption tone options
                        const toneMap: Record<string, string> = {
                            'soft': 'Intimate',
                            'dominant': 'Dominant',
                            'playful': 'Playful',
                            'dirty': 'Erotic',
                            'Very Explicit': 'Explicit'
                        };
                        const mappedTone = toneMap[data.preferredTone] || data.preferredTone;
                        if (mappedTone && captionTone === 'Playful') { // Only auto-apply if still on default
                            setCaptionTone(mappedTone as any);
                        }
                    }
                } else {
                    setFanPreferences(null);
                }
            } catch (error) {
                console.error('Error loading fan preferences:', error);
                setFanPreferences(null);
            } finally {
                setIsLoadingFanPreferences(false);
            }
        };
        loadFanPreferences();
    }, [user?.id, selectedFanId]);

    // Load user explicitness level
    useEffect(() => {
        const loadExplicitnessLevel = async () => {
            if (!user?.id) return;
            try {
                const { doc, getDoc } = await import('firebase/firestore');
                const userDoc = await getDoc(doc(db, 'users', user.id));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    // Store explicitness level for use in caption generation
                    // We'll use this when generating captions
                }
            } catch (error) {
                console.error('Error loading explicitness level:', error);
            }
        };
        loadExplicitnessLevel();
    }, [user?.id]);

    useEffect(() => {
        const loadCreatorPersonality = async () => {
            if (!user?.id) return;
            try {
                const userDoc = await getDoc(doc(db, 'users', user.id));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    setCreatorPersonality(data.creatorPersonality || '');
                    setAiPersonalitySetting(data.aiPersonality || '');
                    setAiToneSetting(data.aiTone || '');
                    setExplicitnessLevelSetting(data.explicitnessLevel ?? 7);
                }
            } catch (error) {
                console.error('Error loading creator personality:', error);
            }
        };
        loadCreatorPersonality();
    }, [user?.id]);

    // ------------------------------------------------------------
    // Personalization: use Elite OnlyFans onboarding answers
    // ------------------------------------------------------------
    const monetizedModeEnabled = Boolean(user?.settings?.monetizedModeEnabled);
    const monetizedOnboarding = (user?.settings?.monetizedOnboarding || {}) as any;
    const didInitMonetizedDefaults = useRef(false);

    const buildMonetizedContext = () => {
        if (!monetizedModeEnabled) return '';
        const platforms = Array.isArray(user?.settings?.monetizedPlatforms) ? user?.settings?.monetizedPlatforms.join(', ') : selectedPlatform;
        const postingFrequency = monetizedOnboarding?.postingFrequency ? String(monetizedOnboarding.postingFrequency) : '';
        const contentHelp = Array.isArray(monetizedOnboarding?.contentHelp) ? monetizedOnboarding.contentHelp.join(', ') : '';
        const biggestChallenge = monetizedOnboarding?.biggestChallenge ? String(monetizedOnboarding.biggestChallenge) : '';
        const monthlyGoal = monetizedOnboarding?.monthlyGoal ? String(monetizedOnboarding.monthlyGoal) : '';

        const lines = [
            platforms ? `Platforms: ${platforms}` : null,
            postingFrequency ? `Posting frequency: ${postingFrequency}` : null,
            contentHelp ? `Help planning: ${contentHelp}` : null,
            biggestChallenge ? `Biggest challenge: ${biggestChallenge}` : null,
            monthlyGoal ? `Monthly revenue goal: ${monthlyGoal}` : null,
        ].filter(Boolean);

        if (lines.length === 0) return '';
        return `Premium creator personalization (${selectedPlatform}):\n${lines.map((l) => `- ${l}`).join('\n')}`;
    };

    const runAiHelp = async (
        baseText: string,
        instruction: string,
        context: { goal?: string; tone?: string; platforms?: string[] },
        onApply: (text: string) => void,
        fieldLabel: string,
    ) => {
        setIsAiHelpGenerating(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            const extraContextLines = [
                selectedPlatform ? `Platform: ${selectedPlatform}` : null,
                context.goal ? `Goal: ${context.goal}` : null,
                context.tone ? `Tone: ${context.tone}` : null,
                user?.niche ? `Niche: ${user.niche}` : null,
                creatorPersonality ? `Creator Personality: ${creatorPersonality}` : null,
                aiPersonalitySetting ? `AI Personality: ${aiPersonalitySetting}` : null,
                aiToneSetting ? `Default AI Tone: ${aiToneSetting}` : null,
                explicitnessLevelSetting !== null && explicitnessLevelSetting !== undefined
                    ? `Explicitness Level: ${explicitnessLevelSetting}/10`
                    : null,
                monetizedModeEnabled ? buildMonetizedContext() : null,
                uploadedMediaType ? `Media attached: ${uploadedMediaType}` : null,
            ].filter(Boolean).join('\n');
            const prompt = instruction.trim()
                ? `You are rewriting the ${fieldLabel} field. Follow the instruction exactly and focus only on what was asked. If media is attached, keep wording consistent with it.\n\nINSTRUCTION:\n${instruction}\n\nCURRENT TEXT:\n${baseText || '(empty)'}\n\nCONTEXT:\n${extraContextLines || 'None'}\n\nOUTPUT:\nReturn only the rewritten ${fieldLabel} text.`
                : `You are rewriting the ${fieldLabel} field. Improve clarity and focus without adding new topics. If media is attached, keep wording consistent with it.\n\nCURRENT TEXT:\n${baseText || '(empty)'}\n\nCONTEXT:\n${extraContextLines || 'None'}\n\nOUTPUT:\nReturn only the rewritten ${fieldLabel} text.`;
            const response = await fetch('/api/generateText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    prompt,
                    context,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (data.error) {
                throw new Error(data.error || data.note || 'Failed to generate text');
            }
            const generatedText = data.text || data.caption || '';
            if (!generatedText) {
                throw new Error('No text generated');
            }
            onApply(generatedText);
        } catch (error: any) {
            showToast?.(error.message || 'AI help failed. Please try again.', 'error');
        } finally {
            setIsAiHelpGenerating(false);
            setAiHelpPrompt('');
            setAiHelpField(null);
        }
    };

    // Close AI help popover when clicking outside
    useEffect(() => {
        if (!aiHelpField) return;
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (aiHelpRef.current && !aiHelpRef.current.contains(target) && !target.closest('[title="AI Help"]')) {
                setAiHelpField(null);
                setAiHelpPrompt('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [aiHelpField]);

    // Prefill defaults once (do not overwrite user edits)
    useEffect(() => {
        if (!user?.id) return;
        if (!monetizedModeEnabled) return;
        if (didInitMonetizedDefaults.current) return;

        const contentHelpArr: string[] = Array.isArray(monetizedOnboarding?.contentHelp) ? monetizedOnboarding.contentHelp : [];
        const challenge = monetizedOnboarding?.biggestChallenge ? String(monetizedOnboarding.biggestChallenge) : '';
        const freq = monetizedOnboarding?.postingFrequency ? String(monetizedOnboarding.postingFrequency) : '';
        const goal = monetizedOnboarding?.monthlyGoal ? String(monetizedOnboarding.monthlyGoal) : '';

        // Weekly plan prompt: only set if empty
        if (!weeklyPlanPrompt.trim()) {
            const starter = [
                goal ? `Goal: ${goal}` : 'Goal: Sales conversion + consistency',
                freq ? `Cadence: ${freq}` : null,
                challenge ? `Challenge: ${challenge}` : null,
                contentHelpArr.length ? `Focus: ${contentHelpArr.join(', ')}` : null,
            ].filter(Boolean).join(' · ');
            setWeeklyPlanPrompt(starter);
        }

        // Monetization goals: only seed if empty
        if (monetizationGoals.length === 0) {
            const seeded: string[] = [];
            if (contentHelpArr.includes('PPV ideas')) seeded.push('Increase PPV conversions with better hooks + offers');
            if (contentHelpArr.includes('Engagement / fan messages')) seeded.push('Improve retention with engagement routines + message prompts');
            if (contentHelpArr.includes('Promo content')) seeded.push('Improve funnel conversion from socials to paid subscribers');
            if (!seeded.length) seeded.push('Increase subscriber conversion and retention');
            if (goal && goal !== 'Stay consistent') seeded.push(`Work toward ${goal} months`);
            setMonetizationGoals(seeded.slice(0, 5));
        }

        // Monetization preferences: only seed if empty
        if (!monetizationPreferences.trim()) {
            const pref = [
                'Account-safe planning (manual posting).',
                challenge ? `My biggest challenge: ${challenge}.` : null,
                'I want a simple weekly plan that balances engagement + upsells without burnout.',
            ].filter(Boolean).join(' ');
            setMonetizationPreferences(pref);
        }

        didInitMonetizedDefaults.current = true;
    }, [user?.id, monetizedModeEnabled]); // intentionally minimal deps

    // Initialize component and restore persisted state
    // Load captions history on mount and when user changes
    useEffect(() => {
        if (user?.id) {
            loadCaptionsHistory();
        }
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) return;
        const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const storedMonth = (user as any)?.monetizedTrendsUsageMonth || monthKey;
        const used = storedMonth === monthKey ? Number((user as any)?.monthlyMonetizedTrendsUsed || 0) : 0;
        setMonthlyTrendsUsed(used);
        setTrendsUsageMonth(storedMonth);
        loadTrendsHistory();
    }, [user?.id]);

    useEffect(() => {
        try {
            setIsLoading(false);
            console.log('OnlyFansContentBrain component loaded successfully');
            // If mediaCaptions tab is somehow selected, reset to captions
            if (activeTab === 'mediaCaptions') {
                setActiveTab('captions');
            }
            
            // Restore persisted state from localStorage
            if (user?.id) {
                const storageKey = `onlyfans_content_brain_${user.id}`;
                try {
                    const saved = localStorage.getItem(storageKey);
                    if (saved) {
                        const data = JSON.parse(saved);
                        if (data.uploadedMediaUrl) {
                            setUploadedMediaUrl(data.uploadedMediaUrl);
                            setUploadedMediaPreview(data.uploadedMediaUrl);
                            setUploadedMediaType(data.uploadedMediaType || 'image');
                        }
                        if (data.generatedCaptions && Array.isArray(data.generatedCaptions)) {
                            setGeneratedCaptions(data.generatedCaptions);
                        }
                        if (data.currentCaptionForAI) {
                            setCurrentCaptionForAI(data.currentCaptionForAI);
                        }
                        if (data.scheduledDate) {
                            setScheduledDate(data.scheduledDate);
                        }
                    }
                } catch (e) {
                    console.error('Error restoring persisted state:', e);
                }
            }
        } catch (err: any) {
            console.error('Error initializing OnlyFansContentBrain:', err);
            setError(err?.message || 'Failed to initialize component');
            setIsLoading(false);
        }
    }, [activeTab, user?.id]);
    
    // Load used captions from Firestore on mount
    useEffect(() => {
        if (!user?.id) return;
        
        const loadUsedCaptions = async () => {
            try {
                const usedCaptionsRef = collection(db, 'users', user.id, 'onlyfans_used_captions');
                const snapshot = await getDocs(usedCaptionsRef);
                const usedHashes = new Set<string>();
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    if (data.captionHash) {
                        usedHashes.add(data.captionHash);
                    }
                });
                setUsedCaptionsHash(usedHashes);
            } catch (error) {
                console.error('Error loading used captions:', error);
            }
        };
        
        loadUsedCaptions();
    }, [user?.id]);
    
    // Load saved items when respective tabs are active
    useEffect(() => {
        if (!user?.id) return;
        if (activeTab === 'postIdeas') {
            loadSavedPostIdeas();
        } else if (activeTab === 'shootConcepts') {
            loadSavedShootConcepts();
        } else if (activeTab === 'weeklyPlan') {
            loadSavedWeeklyPlans();
        } else if (activeTab === 'monetizationPlanner') {
            loadSavedMonetizationPlans();
        }
    }, [activeTab, user?.id]);

    // Persist media and captions to localStorage
    useEffect(() => {
        if (!user?.id) return;
        
        const storageKey = `onlyfans_content_brain_${user.id}`;
        const dataToSave = {
            uploadedMediaUrl,
            uploadedMediaType,
            generatedCaptions,
            currentCaptionForAI,
            scheduledDate,
        };
        
        try {
            localStorage.setItem(storageKey, JSON.stringify(dataToSave));
        } catch (e) {
            console.error('Error saving state to localStorage:', e);
        }
    }, [uploadedMediaUrl, uploadedMediaType, generatedCaptions, currentCaptionForAI, scheduledDate, user?.id]);

    // Save used caption to Firestore
    const markCaptionAsUsed = async (caption: string, index: number) => {
        if (!user?.id) return;
        
        try {
            // Create a hash of the caption to track it (Unicode-safe)
            // Use TextEncoder to handle Unicode characters properly
            const encoder = new TextEncoder();
            const data = encoder.encode(caption);
            const binaryString = Array.from(data, byte => String.fromCharCode(byte)).join('');
            const captionHash = btoa(binaryString).substring(0, 50); // Simple hash
            
            // Check if already saved
            if (usedCaptionsHash.has(captionHash)) {
                setUsedCaptions(prev => new Set(prev).add(index));
                return;
            }
            
            // Save to Firestore
            await addDoc(collection(db, 'users', user.id, 'onlyfans_used_captions'), {
                captionHash,
                caption: caption.substring(0, 200), // Store first 200 chars for reference
                usedAt: Timestamp.now(),
            });
            
            // Update local state
            setUsedCaptionsHash(prev => new Set(prev).add(captionHash));
            setUsedCaptions(prev => new Set(prev).add(index));
        } catch (error) {
            console.error('Error saving used caption:', error);
        }
    };

    // Show error state if context is not available
    if (!context || !user) {
        return (
            <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full flex items-center justify-center">
                <div className="text-center">
                    <p className="text-red-600 dark:text-red-400 mb-2">Failed to load Content Ideas</p>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">Please ensure you are logged in</p>
                    <button 
                        onClick={() => window.location.reload()} 
                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                    >
                        Reload Page
                    </button>
                </div>
            </div>
        );
    }

    const handleGenerateCaptions = async (promptOverride?: string) => {
        const promptSeed = promptOverride ?? captionPrompt;
        if (promptOverride && promptOverride !== captionPrompt) {
            setCaptionPrompt(promptOverride);
        }
        // If media is uploaded, require it to be analyzed
        if (uploadedMediaUrl && !promptSeed.trim()) {
            // Optional: user can add context but it's not required
        }

        // Clear old captions when regenerating
        setGeneratedCaptions([]);
        setCurrentCaptionForAI('');
        setEditedCaptions(new Map());
        setUsedCaptions(new Set());
        // Don't clear usedCaptionsHash - we need to filter out used captions from new generation
        // Reload used captions to ensure we have the latest
        if (user?.id) {
            try {
                const usedCaptionsRef = collection(db, 'users', user.id, 'onlyfans_used_captions');
                const snapshot = await getDocs(usedCaptionsRef);
                const usedHashes = new Set<string>();
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    if (data.captionHash) {
                        usedHashes.add(data.captionHash);
                    }
                });
                setUsedCaptionsHash(usedHashes);
            } catch (error) {
                console.error('Error reloading used captions:', error);
            }
        }
        
        setIsGenerating(true);
        setError(null);
        try {
            console.log('Generating captions...');
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            // Get user explicitness level
            let explicitnessLevel = 7; // Default
            try {
                const userDoc = await getDoc(doc(db, 'users', user.id));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    explicitnessLevel = userData?.explicitnessLevel ?? 7;
                }
            } catch (e) {
                console.error('Error loading explicitness level:', e);
            }

            // Determine tone based on explicitness level.
            // Important: do NOT downgrade the user's selected tone (e.g. Dominant/Erotic/etc.) to "Intimate".
            // Only escalate upward when explicitness is high enough.
            let finalTone = captionTone;
            if (explicitnessLevel >= 8) {
                // Force fully explicit when user explicitness is high.
                finalTone = 'Explicit';
            } else if (explicitnessLevel >= 6) {
                // Respect chosen tone; allow Explicit only when selected.
                finalTone = captionTone === 'Explicit' ? 'Explicit' : captionTone;
            }

            // Load AI personality/training settings
            let aiPersonality = '';
            let aiTone = '';
            let creatorGender = '';
            let targetAudienceGender = '';
            try {
                const userDoc = await getDoc(doc(db, 'users', user.id));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    aiPersonality = userData?.aiPersonality || '';
                    aiTone = userData?.aiTone || '';
                    creatorGender = userData?.creatorGender || '';
                    targetAudienceGender = userData?.targetAudienceGender || '';
                }
            } catch (e) {
                console.error('Error loading AI personality settings:', e);
            }

            // Build fan context if fan is selected
            let fanContext = '';
            if (selectedFanId && fanPreferences) {
                const contextParts = [];
                const fanName = selectedFanName || 'this fan';
                const subscriptionTier = fanPreferences.subscriptionTier;
                const isVip = fanPreferences.isVIP === true;
                if (subscriptionTier) {
                    contextParts.push(`Subscription tier: ${subscriptionTier}`);
                    if (subscriptionTier === 'Paid') {
                        contextParts.push('CTA rule: Already a paid subscriber - DO NOT ask them to subscribe or upgrade. Focus on appreciation, retention, PPV unlocks, tips, customs, and VIP treatment if applicable.');
                    } else {
                        contextParts.push('CTA rule: Free plan - encourage them to upgrade to paid for full access. PPV unlocks are allowed for free fans.');
                    }
                }
                if (isVip) {
                    contextParts.push('VIP: Provide special treatment and priority responses.');
                }
                if (fanPreferences.preferredTone) contextParts.push(`Preferred tone: ${fanPreferences.preferredTone}`);
                if (fanPreferences.communicationStyle) contextParts.push(`Communication style: ${fanPreferences.communicationStyle}`);
                if (fanPreferences.favoriteSessionType) contextParts.push(`Favorite session type: ${fanPreferences.favoriteSessionType}`);
                if (fanPreferences.languagePreferences) contextParts.push(`Language preferences: ${fanPreferences.languagePreferences}`);
                if (fanPreferences.boundaries) contextParts.push(`Boundaries: ${fanPreferences.boundaries}`);
                if (fanPreferences.suggestedFlow) contextParts.push(`What works best: ${fanPreferences.suggestedFlow}`);
                if (contextParts.length > 0) {
                    fanContext = `\n\nPERSONALIZE FOR FAN: ${fanName}\nFan Preferences:\n${contextParts.map(p => `- ${p}`).join('\n')}\n\nNATURAL PERSONALIZATION GUIDELINES:\n- Write FROM YOUR PERSPECTIVE (first person: "I", "my", "me") - YOU are the creator posting this\n- Write as if YOU are addressing ${fanName}, but make it sound NATURAL and CONVERSATIONAL\n- Use ${fanName}'s name OCCASIONALLY and NATURALLY - not in every sentence, just when it feels right (like a real person would)\n- Match ${fanPreferences.preferredTone || 'their preferred'} tone naturally - don't force it\n- Use ${fanPreferences.communicationStyle || 'their preferred'} communication style organically\n- Reference their preferences subtly - don't make it obvious you're following a checklist\n- Write like a REAL PERSON, not AI - natural flow, varied sentence structure, authentic voice\n- DO NOT overuse their name - use it sparingly, like you would in real conversation\n- Make it feel personal but NOT robotic or formulaic`;
                }
            } else if (selectedFanId && selectedFanName) {
                // Fan selected but preferences not loaded yet - still use their name
                fanContext = `\n\nPERSONALIZE FOR FAN: ${selectedFanName}\nNATURAL PERSONALIZATION GUIDELINES:\n- Write FROM YOUR PERSPECTIVE (first person: "I", "my", "me") - YOU are the creator posting this\n- Write as if YOU are addressing ${selectedFanName}, but make it sound NATURAL and CONVERSATIONAL\n- Use ${selectedFanName}'s name OCCASIONALLY and NATURALLY - not in every sentence, just when it feels right\n- Write like a REAL PERSON, not AI - natural flow, varied sentence structure, authentic voice\n- DO NOT overuse their name - use it sparingly, like you would in real conversation\n- Make it feel personal but NOT robotic or formulaic`;
            }

            // Build AI personality context
            let personalityContext = '';
            if (aiPersonality) {
                personalityContext = `\n\nAI PERSONALITY & TRAINING:\n${aiPersonality}`;
            }
            if (aiTone && aiTone !== captionTone) {
                personalityContext += `\nDefault AI Tone: ${aiTone}`;
            }
            if (creatorGender) {
                personalityContext += `\nCreator Gender: ${creatorGender}`;
            }
            if (targetAudienceGender) {
                personalityContext += `\nTarget Audience: ${targetAudienceGender}`;
            }
            if (explicitnessLevelSetting !== null && explicitnessLevelSetting !== undefined) {
                personalityContext += `\nExplicitness Level: ${explicitnessLevelSetting}/10`;
            }
            if (useCreatorPersonalityCaptions && creatorPersonality) {
                personalityContext += `\n\nCREATOR PERSONALITY:\n${creatorPersonality}`;
            }

            // Load emoji settings
            const emojiSettings = await loadEmojiSettings(user.id);

            const captionsUrl = new URL('/api/generateCaptions', window.location.origin);
            const response = await fetch(captionsUrl.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    mediaUrl: uploadedMediaUrl || undefined, // Include media URL to analyze image/video
                    tone: finalTone === 'Explicit' ? 'Sexy / Explicit' : finalTone,
                    goal: captionGoal,
                    // Target all premium creator platforms we support
                    platforms: [selectedPlatform],
                    promptText: uploadedMediaUrl 
                        ? `${promptSeed || `Analyze this image/video in detail and describe what you see. Create explicit captions tailored for ${selectedPlatform}. Mention ${selectedPlatform} naturally when it helps drive subs (e.g., "come see me on ${selectedPlatform}") but only when it fits the line. Be very descriptive and explicit about what is visually present.`}${personalityContext}${fanContext}\n\n[CRITICAL - GENERATE FRESH CAPTIONS: Variety seed ${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}] - You MUST generate completely NEW, UNIQUE captions that are DIFFERENT from any previous generation. Do NOT reuse, repeat, or modify previous captions. Create entirely fresh content with different wording, structure, and angles each time.`
                        : `${promptSeed || `Create explicit captions tailored for ${selectedPlatform}. Mention ${selectedPlatform} naturally when it helps drive subs (e.g., "come see me on ${selectedPlatform}") but only when it fits the line.`}${personalityContext}${fanContext}\n\n[CRITICAL - GENERATE FRESH CAPTIONS: Variety seed ${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}] - You MUST generate completely NEW, UNIQUE captions that are DIFFERENT from any previous generation. Do NOT reuse, repeat, or modify previous captions. Create entirely fresh content with different wording, structure, and angles each time.`,
                    emojiEnabled: emojiSettings.enabled,
                    emojiIntensity: emojiSettings.intensity,
                }),
            });

            if (!response.ok) {
                if (response.status === 413) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.note || 'File too large. Please use a smaller image/video (max 4MB for images, 20MB for videos).');
                }
                throw new Error('Failed to generate captions');
            }

            const data = await response.json();
            // API returns array of {caption: string, hashtags: string[]}
            let captions: string[] = [];
            if (Array.isArray(data)) {
                captions = data.map((item: any) => {
                    const caption = item.caption || '';
                    const hashtags = Array.isArray(item.hashtags) ? item.hashtags : [];
                    return hashtags.length > 0 ? `${caption} ${hashtags.join(' ')}` : caption;
                });
            } else if (data && typeof data === 'object' && Array.isArray(data.captions)) {
                captions = data.captions.map((item: any) => {
                    const caption = item.caption || '';
                    const hashtags = Array.isArray(item.hashtags) ? item.hashtags : [];
                    return hashtags.length > 0 ? `${caption} ${hashtags.join(' ')}` : caption;
                });
            }
            
            // Filter out used captions before setting state
            const encoder = new TextEncoder();
            const filteredCaptions = captions.filter((caption) => {
                const data = encoder.encode(caption);
                const binaryString = Array.from(data, byte => String.fromCharCode(byte)).join('');
                const captionHash = btoa(binaryString).substring(0, 50);
                return !usedCaptionsHash.has(captionHash);
            });
            
            setGeneratedCaptions(Array.isArray(filteredCaptions) ? filteredCaptions : []);
            showToast?.('Captions generated successfully!', 'success');

            // Lightweight usage tracking (best-effort)
            try {
                const { logUsageEvent } = await import('../src/services/usageEvents');
                await logUsageEvent(user.id, 'of_generate_captions', {
                    hasMedia: Boolean(uploadedMediaUrl),
                    tone: finalTone,
                    goal: captionGoal,
                });
            } catch {
                // ignore
            }
        } catch (error: any) {
            console.error('Error generating captions:', error);
            const errorMsg = error.message || 'Failed to generate captions. Please try again.';
            showToast?.(errorMsg, 'error');
            setError(errorMsg);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGeneratePostIdeas = async () => {
        if (!postIdeaPrompt.trim()) {
            showToast?.('Please enter what kind of post ideas you\'re looking for', 'error');
            return;
        }

        setIsGenerating(true);
        setError(null);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            // Load emoji settings
            const emojiSettings = await loadEmojiSettings(user.id);
            const settingsContext = [
                aiPersonalitySetting ? `AI PERSONALITY & TRAINING:\n${aiPersonalitySetting}` : null,
                aiToneSetting ? `Default AI Tone: ${aiToneSetting}` : null,
                explicitnessLevelSetting !== null && explicitnessLevelSetting !== undefined ? `Explicitness Level: ${explicitnessLevelSetting}/10` : null,
                useCreatorPersonalityPostIdeas && creatorPersonality ? `CREATOR PERSONALITY:\n${creatorPersonality}` : null,
            ].filter(Boolean).join('\n');
            
            const response = await fetch('/api/generateText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    prompt: `Generate 10 creative post ideas tailored for ${selectedPlatform} based on: ${postIdeaPrompt}. 
                    Each idea should be specific, engaging, and tailored for adult content creators. 
                    When natural, include a ${selectedPlatform} mention (e.g., "join me on ${selectedPlatform}") but only if it fits. 
                    Format as a numbered list with brief descriptions.${settingsContext ? `\n\n${settingsContext}` : ''}`,
                    context: {
                        goal: 'content-ideas',
                        tone: 'Explicit/Adult Content',
                        platforms: [selectedPlatform],
                    },
                    analyticsData: buildAnalyticsData(),
                    emojiEnabled: emojiSettings.enabled,
                    emojiIntensity: emojiSettings.intensity,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate post ideas');
            }

            const data = await response.json();
            const text = data.text || data.caption || '';
            // Parse the numbered list into array
            const ideas = typeof text === 'string' 
                ? text.split(/\d+\./).filter(item => item.trim()).map(item => item.trim())
                : [];
            const finalIdeas = Array.isArray(ideas) && ideas.length > 0 ? ideas : (typeof text === 'string' ? [text] : []);
            setGeneratedPostIdeas(finalIdeas);
            // Save to history
            await saveToHistory('post_ideas', `Post Ideas - ${new Date().toLocaleDateString()}`, { 
                ideas: finalIdeas, 
                prompt: postIdeaPrompt,
            });
            showToast?.('Post ideas generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating post ideas:', error);
            const errorMsg = error.message || 'Failed to generate post ideas. Please try again.';
            showToast?.(errorMsg, 'error');
            setError(errorMsg);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerateShootConcepts = async () => {
        if (!shootConceptPrompt.trim()) {
            showToast?.('Please describe the type of shoot concept you\'re looking for', 'error');
            return;
        }

        setIsGenerating(true);
        setError(null);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            const settingsContext = [
                aiPersonalitySetting ? `AI PERSONALITY & TRAINING:\n${aiPersonalitySetting}` : null,
                aiToneSetting ? `Default AI Tone: ${aiToneSetting}` : null,
                explicitnessLevelSetting !== null && explicitnessLevelSetting !== undefined ? `Explicitness Level: ${explicitnessLevelSetting}/10` : null,
                useCreatorPersonalityShootConcepts && creatorPersonality ? `CREATOR PERSONALITY:\n${creatorPersonality}` : null,
            ].filter(Boolean).join('\n');
            
            const response = await fetch('/api/generateText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    prompt: `Generate 8 detailed shoot concepts for ${selectedPlatform} based on: ${shootConceptPrompt}.
                    Each concept should include:
                    - Theme/Setting
                    - Outfit suggestions
                    - Lighting style
                    - Poses/angles
                    - Mood/energy
                    
                    Format as a numbered list with detailed descriptions. Make it creative and tailored for adult content.${settingsContext ? `\n\n${settingsContext}` : ''}`,
                    context: {
                        goal: 'shoot-planning',
                        tone: 'Explicit/Adult Content',
                        platforms: [selectedPlatform],
                    },
                    analyticsData: buildAnalyticsData(),
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate shoot concepts');
            }

            const data = await response.json();
            const text = data.text || data.caption || '';
            // Parse the numbered list into array
            const concepts = typeof text === 'string'
                ? text.split(/\d+\./).filter(item => item.trim()).map(item => item.trim())
                : [];
            const finalConcepts = Array.isArray(concepts) && concepts.length > 0 ? concepts : (typeof text === 'string' ? [text] : []);
            setGeneratedShootConcepts(finalConcepts);
            // Save to history
            await saveToHistory('shoot_concepts', `Shoot Concepts - ${new Date().toLocaleDateString()}`, { 
                concepts: finalConcepts, 
                prompt: shootConceptPrompt,
            });
            showToast?.('Shoot concepts generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating shoot concepts:', error);
            const errorMsg = error.message || 'Failed to generate shoot concepts. Please try again.';
            showToast?.(errorMsg, 'error');
            setError(errorMsg);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerateWeeklyPlan = async () => {
        if (!weeklyPlanPrompt.trim()) {
            showToast?.('Please describe your goals or preferences for the week', 'error');
            return;
        }

        setIsGenerating(true);
        setError(null);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            const settingsContext = [
                aiPersonalitySetting ? `AI PERSONALITY & TRAINING:\n${aiPersonalitySetting}` : null,
                aiToneSetting ? `Default AI Tone: ${aiToneSetting}` : null,
                explicitnessLevelSetting !== null && explicitnessLevelSetting !== undefined ? `Explicitness Level: ${explicitnessLevelSetting}/10` : null,
                useCreatorPersonalityWeeklyPlan && creatorPersonality ? `CREATOR PERSONALITY:\n${creatorPersonality}` : null,
            ].filter(Boolean).join('\n');
            
            const response = await fetch('/api/generateContentStrategy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    niche: `Adult Content Creator (${selectedPlatform})`,
                    audience: 'Subscribers and fans',
                    goal: `${weeklyPlanPrompt || 'Sales Conversion'}\n\n${buildMonetizedContext()}${settingsContext ? `\n${settingsContext}` : ''}`.trim(), // Personalize if available
                    duration: 1, // 1 week
                    tone: 'Explicit/Adult Content',
                    platformFocus: selectedPlatform,
                    analyticsData: buildAnalyticsData(),
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate weekly plan');
            }

            const data = await response.json();
            // Handle both object and string responses
            const plan = data.plan || data;
            // Store the plan object (not stringified)
            setGeneratedWeeklyPlan(plan);
            // Save to history
            await saveToHistory('weekly_plan', `Weekly Plan - ${new Date().toLocaleDateString()}`, { 
                plan, 
                prompt: weeklyPlanPrompt,
            });
            showToast?.('Weekly plan generated successfully!', 'success');

            // Lightweight usage tracking (best-effort)
            try {
                const { logUsageEvent } = await import('../src/services/usageEvents');
                await logUsageEvent(user.id, 'of_generate_weekly_plan', { prompt: weeklyPlanPrompt });
            } catch {
                // ignore
            }
        } catch (error: any) {
            console.error('Error generating weekly plan:', error);
            const errorMsg = error.message || 'Failed to generate weekly plan. Please try again.';
            showToast?.(errorMsg, 'error');
            setError(errorMsg);
        } finally {
            setIsGenerating(false);
        }
    };

    const buildWeeklyPlanPrompt = (action: WeeklyPlanDayAction) => {
        const parts = [
            action.postIdea,
            action.description ? `Description: ${action.description}` : null,
            action.angle ? `Angle: ${action.angle}` : null,
            action.cta ? `CTA: ${action.cta}` : null,
            action.focus ? `Weekly focus: ${action.focus}` : null,
            action.postType ? `Format: ${action.postType}` : null,
            action.dayName ? `Day: ${action.dayName}` : null,
        ].filter(Boolean);
        return parts.join('\n');
    };

    const updateWeeklyPlanCardState = (cardKey: string, next: Partial<WeeklyPlanCardState>) => {
        setWeeklyPlanCardState((prev) => ({
            ...prev,
            [cardKey]: {
                ...prev[cardKey],
                ...next,
            },
        }));
    };

    const getDayOffsetFromName = (dayName?: string) => {
        if (!dayName) return null;
        const key = dayName.trim().slice(0, 3).toLowerCase();
        const map: Record<string, number> = {
            sun: 0,
            mon: 1,
            tue: 2,
            wed: 3,
            thu: 4,
            fri: 5,
            sat: 6,
        };
        return map[key] ?? null;
    };

    const resolveWeeklyPlanDate = (weekIndex: number, day: any, dayIndex: number, overrideDate?: string, overrideTime?: string) => {
        if (overrideDate) {
            const datePart = overrideDate;
            const timePart = overrideTime || '12:00';
            const candidate = new Date(`${datePart}T${timePart}`);
            if (!Number.isNaN(candidate.getTime())) {
                return candidate;
            }
        }
        if (day?.date) {
            const parsed = new Date(day.date);
            if (!Number.isNaN(parsed.getTime())) {
                return parsed;
            }
        }
        const base = new Date();
        base.setHours(12, 0, 0, 0);
        const offset = Number.isFinite(day?.dayOffset)
            ? day.dayOffset
            : getDayOffsetFromName(day?.day) ?? dayIndex;
        base.setDate(base.getDate() + weekIndex * 7 + offset);
        return base;
    };

    const handleWeeklyPlanUploadFile = async (action: WeeklyPlanDayAction, file: File) => {
        if (!user?.id) return;
        updateWeeklyPlanCardState(action.cardKey, { isUploading: true, error: undefined });
        try {
            const timestamp = Date.now();
            const fileExtension = file.name.split('.').pop() || (file.type.startsWith('video/') ? 'mp4' : 'jpg');
            const storagePath = `users/${user.id}/onlyfans-uploads/${timestamp}.${fileExtension}`;
            const storageRef = ref(storage, storagePath);
            await uploadBytes(storageRef, file, { contentType: file.type });
            const mediaUrl = await getDownloadURL(storageRef);
            const mediaType = file.type.startsWith('video/') ? 'video' : 'image';

            updateWeeklyPlanCardState(action.cardKey, {
                mediaUrl,
                mediaType,
                isUploading: false,
            });
            setWeeklyPlanUploadMenuKey(null);

            // Auto-save to Media Vault
            try {
                const uniqueId = `${timestamp}_${Math.random().toString(36).substring(2, 9)}`;
                const mediaItem = {
                    id: uniqueId,
                    userId: user.id,
                    url: mediaUrl,
                    name: file.name,
                    type: mediaType,
                    mimeType: file.type,
                    size: file.size,
                    uploadedAt: new Date().toISOString(),
                    usedInPosts: [],
                    tags: [],
                    folderId: 'general',
                };
                await setDoc(doc(db, 'users', user.id, 'onlyfans_media_library', mediaItem.id), mediaItem);
            } catch (vaultError: any) {
                console.error('Failed to save to media vault:', vaultError);
            }
            await handleWeeklyPlanGenerateCaption(action, { mediaUrl, mediaType });
        } catch (error: any) {
            console.error('Weekly plan upload error:', error);
            updateWeeklyPlanCardState(action.cardKey, {
                isUploading: false,
                error: error?.message || 'Failed to upload media',
            });
            showToast?.('Failed to upload media', 'error');
        }
    };

    const handleWeeklyPlanSelectFromVault = (action: WeeklyPlanDayAction) => {
        setWeeklyPlanVaultTargetAction(action);
        setWeeklyPlanUploadMenuKey(null);
        setShowMediaVaultModal(true);
    };

    const handleWeeklyPlanGenerateCaption = async (
        action: WeeklyPlanDayAction,
        overrideMedia?: { mediaUrl: string; mediaType: 'image' | 'video' }
    ) => {
        const cardState = weeklyPlanCardState[action.cardKey];
        const mediaUrl = overrideMedia?.mediaUrl || cardState?.mediaUrl;
        if (!mediaUrl) {
            showToast?.('Upload media before generating captions.', 'error');
            return;
        }
        updateWeeklyPlanCardState(action.cardKey, { isGenerating: true, error: undefined });
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            const promptSeed = buildWeeklyPlanPrompt(action);
            const personalityContext = [
                aiPersonalitySetting ? `AI PERSONALITY & TRAINING:\n${aiPersonalitySetting}` : null,
                aiToneSetting ? `Default AI Tone: ${aiToneSetting}` : null,
                explicitnessLevelSetting !== null && explicitnessLevelSetting !== undefined
                    ? `Explicitness Level: ${explicitnessLevelSetting}/10`
                    : null,
                useCreatorPersonalityCaptions && creatorPersonality ? `CREATOR PERSONALITY:\n${creatorPersonality}` : null,
            ].filter(Boolean).join('\n');

            const finalTone = explicitnessLevelSetting >= 8
                ? 'Explicit'
                : explicitnessLevelSetting >= 6
                    ? captionTone === 'Explicit' ? 'Explicit' : captionTone
                    : captionTone;

            const emojiSettings = await loadEmojiSettings(user.id);
            const captionsUrl = new URL('/api/generateCaptions', window.location.origin);
            const response = await fetch(captionsUrl.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    mediaUrl,
                    tone: finalTone === 'Explicit' ? 'Sexy / Explicit' : finalTone,
                    goal: captionGoal,
                    platforms: [selectedPlatform],
                    promptText: `${promptSeed}${personalityContext ? `\n\n${personalityContext}` : ''}\n\n[CRITICAL - GENERATE FRESH CAPTIONS: Variety seed ${Date.now()}-${Math.random().toString(36).substr(2, 9)}] - Generate unique captions.`,
                    emojiEnabled: emojiSettings.enabled,
                    emojiIntensity: emojiSettings.intensity,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate captions');
            }

            const data = await response.json();
            let captions: string[] = [];
            if (Array.isArray(data)) {
                captions = data.map((item: any) => {
                    const caption = item.caption || '';
                    const hashtags = Array.isArray(item.hashtags) ? item.hashtags : [];
                    return hashtags.length > 0 ? `${caption} ${hashtags.join(' ')}` : caption;
                });
            } else if (data && typeof data === 'object' && Array.isArray(data.captions)) {
                captions = data.captions.map((item: any) => {
                    const caption = item.caption || '';
                    const hashtags = Array.isArray(item.hashtags) ? item.hashtags : [];
                    return hashtags.length > 0 ? `${caption} ${hashtags.join(' ')}` : caption;
                });
            }

            const bestCaption = captions.length > 0 ? captions[0] : '';
            const ctaPrompt = [
                `Write ONE short CTA for an adult creator post on ${selectedPlatform}.`,
                `Tone: ${finalTone}. Explicitness: ${explicitnessLevelSetting}/10.`,
                promptSeed ? `Post idea:\n${promptSeed}` : null,
                bestCaption ? `Caption:\n${bestCaption}` : null,
                'Keep it concise and action-focused. Return only the CTA sentence.',
            ].filter(Boolean).join('\n\n');
            const ctaResponse = await fetch('/api/generateText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    prompt: ctaPrompt,
                    context: { goal: 'CTA', tone: finalTone, platforms: [selectedPlatform] },
                }),
            });
            const ctaData = await ctaResponse.json().catch(() => ({}));
            const bestCta = (ctaData.text || ctaData.caption || '').trim();

            updateWeeklyPlanCardState(action.cardKey, {
                caption: bestCaption,
                cta: bestCta,
                isGenerating: false,
            });
        } catch (error: any) {
            console.error('Weekly plan caption error:', error);
            updateWeeklyPlanCardState(action.cardKey, {
                isGenerating: false,
                error: error?.message || 'Failed to generate captions',
            });
            showToast?.('Failed to generate captions', 'error');
        }
    };

    const handleWeeklyPlanAddToCalendar = async (action: WeeklyPlanDayAction) => {
        if (!user?.id) return;
        try {
            const cardState = weeklyPlanCardState[action.cardKey];
            if (!cardState?.mediaUrl) {
                showToast?.('Upload media before scheduling this drop.', 'error');
                return;
            }
            const plannedDate = resolveWeeklyPlanDate(
                action.weekIndex,
                action.day,
                action.dayIndex,
                cardState?.scheduleDate,
                cardState?.scheduleTime
            );
            const lower = `${action.postType} ${action.postIdea}`.toLowerCase();
            const contentType = lower.includes('custom')
                ? 'custom'
                : lower.includes('ppv') || lower.includes('paid') || lower.includes('bundle')
                    ? 'paid'
                    : 'free';
            const descriptionParts = [
                action.description,
                action.angle ? `Angle: ${action.angle}` : null,
                action.cta ? `CTA: ${action.cta}` : null,
                action.focus ? `Weekly focus: ${action.focus}` : null,
            ].filter(Boolean);
            const description = descriptionParts.length ? descriptionParts.join('\n') : undefined;
            const titleBase = action.postIdea || action.postType || 'Planned post';
            const title = titleBase.length > 80 ? `${titleBase.slice(0, 77)}...` : titleBase;
            const postId = Date.now().toString();
            const captionText = cardState?.caption || action.postIdea || '';
            const ctaText = cardState?.cta || '';
            const postContent = [captionText, ctaText].filter(Boolean).join('\n\n');

            await setDoc(doc(db, 'users', user.id, 'posts', postId), {
                id: postId,
                content: postContent || title,
                mediaUrl: cardState.mediaUrl,
                mediaType: cardState.mediaType || 'image',
                platforms: ['OnlyFans'],
                status: 'Scheduled',
                scheduledDate: plannedDate.toISOString(),
                timestamp: new Date().toISOString(),
                description,
                contentType,
            });
            updateWeeklyPlanCardState(action.cardKey, { used: true, showSchedulePicker: false });
            showToast?.('Added to your calendar as a scheduled drop.', 'success');
        } catch (error) {
            console.error('Error adding weekly plan to calendar:', error);
            showToast?.('Failed to add to calendar. Please try again.', 'error');
        }
    };

    const handleWeeklyPlanToggleSchedulePicker = (action: WeeklyPlanDayAction) => {
        const cardState = weeklyPlanCardState[action.cardKey];
        const nextOpen = !cardState?.showSchedulePicker;
        let scheduleDate = cardState?.scheduleDate;
        let scheduleTime = cardState?.scheduleTime;
        if (nextOpen && !scheduleDate) {
            const plannedDate = resolveWeeklyPlanDate(action.weekIndex, action.day, action.dayIndex);
            scheduleDate = plannedDate.toISOString().split('T')[0];
            scheduleTime = scheduleTime || plannedDate.toTimeString().slice(0, 5);
        }
        updateWeeklyPlanCardState(action.cardKey, {
            showSchedulePicker: nextOpen,
            scheduleDate,
            scheduleTime,
        });
    };

    const handleWeeklyPlanUpdateScheduleDate = (action: WeeklyPlanDayAction, value: string) => {
        updateWeeklyPlanCardState(action.cardKey, { scheduleDate: value });
    };

    const handleWeeklyPlanUpdateScheduleTime = (action: WeeklyPlanDayAction, value: string) => {
        updateWeeklyPlanCardState(action.cardKey, { scheduleTime: value });
    };

    const handleWeeklyPlanConfirmSchedule = async (action: WeeklyPlanDayAction) => {
        await handleWeeklyPlanAddToCalendar(action);
    };

    const handleWeeklyPlanCopyForExport = (action: WeeklyPlanDayAction) => {
        const text = buildWeeklyPlanPrompt(action);
        copyToClipboard(text);
    };

    const loadTrendsHistory = async () => {
        if (!user?.id) return;
        try {
            const historyRef = collection(db, 'users', user.id, 'onlyfans_trends_history');
            const q = query(historyRef, orderBy('createdAt', 'desc'), limit(10));
            const snapshot = await getDocs(q);
            const items: any[] = [];
            snapshot.forEach((doc) => {
                items.push({ id: doc.id, ...doc.data() });
            });
            setTrendsHistory(items);
        } catch (error: any) {
            if (error.code === 'failed-precondition' || error.message?.includes('index')) {
                try {
                    const fallbackRef = collection(db, 'users', user.id, 'onlyfans_trends_history');
                    const fallbackSnap = await getDocs(query(fallbackRef));
                    const items: any[] = [];
                    fallbackSnap.forEach((doc) => {
                        items.push({ id: doc.id, ...doc.data() });
                    });
                    items.sort((a, b) => {
                        const aTime = a.createdAt?.toDate?.()?.getTime() || new Date(a.createdAt || 0).getTime();
                        const bTime = b.createdAt?.toDate?.()?.getTime() || new Date(b.createdAt || 0).getTime();
                        return bTime - aTime;
                    });
                    setTrendsHistory(items.slice(0, 10));
                } catch (fallbackError) {
                    console.error('Error loading trends history (fallback):', fallbackError);
                }
            } else {
                console.error('Error loading trends history:', error);
            }
        }
    };

    const handleFindAdultTrends = async () => {
        if (!user?.id) {
            showToast?.('Please sign in to scan trends', 'error');
            return;
        }

        const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const hasStudioAccess = user.role === 'Admin' || ['Elite', 'Agency', 'OnlyFansStudio'].includes(user.plan || '');
        const limit = user.role === 'Admin' ? Infinity : (hasStudioAccess ? 10 : 0);
        const usedThisMonth = trendsUsageMonth === monthKey ? monthlyTrendsUsed : 0;

        if (limit === 0) {
            showToast?.('Upgrade to Creator Elite or Agency to unlock Monetized Trends', 'info');
            return;
        }
        if (isFinite(limit) && usedThisMonth >= limit) {
            showToast?.('Monthly trends limit reached. Upgrade or wait for next month.', 'info');
            return;
        }

        const nicheInput = trendsNiche.trim() || 'Adult Content Creator';
        setIsTrendsLoading(true);
        setTrendsError(null);
        try {
            const trends = await findAdultTrends(nicheInput);
            if (!trends || trends.length === 0) {
                setTrendResults([]);
                setTrendsError('No trends found. Try a different focus or check back later.');
                return;
            }
            setTrendResults(trends);
            setTrendsLastScanDate(new Date().toISOString());
            setMonthlyTrendsUsed(usedThisMonth + 1);
            setTrendsUsageMonth(monthKey);
            try {
                await setDoc(doc(db, 'users', user.id), {
                    monthlyMonetizedTrendsUsed: usedThisMonth + 1,
                    monetizedTrendsUsageMonth: monthKey,
                }, { merge: true });
            } catch (usageError) {
                console.warn('Failed to update trends usage counters:', usageError);
            }
            try {
                const historyRef = collection(db, 'users', user.id, 'onlyfans_trends_history');
                await addDoc(historyRef, {
                    query: nicheInput,
                    results: trends,
                    createdAt: Timestamp.now(),
                });
                const cleanupQuery = query(historyRef, orderBy('createdAt', 'desc'));
                const cleanupSnap = await getDocs(cleanupQuery);
                if (cleanupSnap.docs.length > 10) {
                    const toDelete = cleanupSnap.docs.slice(10);
                    for (const docToDelete of toDelete) {
                        await deleteDoc(docToDelete.ref);
                    }
                }
                loadTrendsHistory();
            } catch (saveError) {
                console.warn('Failed to save trends history:', saveError);
            }
            showToast?.(`Found ${trends.length} trends`, 'success');
        } catch (error: any) {
            console.error('Error finding adult trends:', error);
            setTrendsError(error.message || 'Failed to find trends. Please try again.');
        } finally {
            setIsTrendsLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showToast?.('Copied to clipboard!', 'success');
    };

    // Build analytics data object for API calls
    const buildAnalyticsData = () => {
        if (!showAnalytics) return undefined;
        
        const hasData = creatorAnalytics.subscriberCount || 
                       creatorAnalytics.engagementRate || 
                       creatorAnalytics.topContentTypes.length > 0 ||
                       creatorAnalytics.bestPostingTimes.length > 0 ||
                       creatorAnalytics.topTopics.length > 0 ||
                       creatorAnalytics.customInsights;
        
        if (!hasData) return undefined;

        return {
            subscriberCount: creatorAnalytics.subscriberCount || undefined,
            engagementRate: creatorAnalytics.engagementRate || undefined,
            topContentTypes: creatorAnalytics.topContentTypes.length > 0 ? creatorAnalytics.topContentTypes : undefined,
            bestPostingTimes: creatorAnalytics.bestPostingTimes.length > 0 ? creatorAnalytics.bestPostingTimes : undefined,
            topTopics: creatorAnalytics.topTopics.length > 0 ? creatorAnalytics.topTopics : undefined,
            customInsights: creatorAnalytics.customInsights || undefined
        };
    };

    // Fetch dynamic guides
    const fetchGuides = async () => {
        setGuidesLoading(true);
        setError(null);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const response = await fetch('/api/getOnlyFansGuides', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    audience: 'Subscribers',
                    goal: 'Engagement',
                    analyticsData: buildAnalyticsData()
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to fetch guides');
            }

            const data = await response.json();
            if (data.success && data.guides) {
                setGuides(data.guides);
                showToast?.('Guides updated with latest trends!', 'success');
            } else {
                throw new Error(data.error || 'Failed to fetch guides');
            }
        } catch (error: any) {
            console.error('Error fetching guides:', error);
            const errorMsg = error.message || 'Failed to fetch guides. Please try again.';
            showToast?.(errorMsg, 'error');
            setError(errorMsg);
        } finally {
            setGuidesLoading(false);
        }
    };

    // Reusable Analytics Input Component

    const handleGenerateMonetizationPlan = async () => {
        if (monetizationGoals.length === 0) {
            showToast?.('Please add at least one goal', 'error');
            return;
        }

        // Validate balance totals to 100
        const totalBalance = balanceEngagement + balanceUpsell + balanceRetention + balanceConversion;
        if (Math.abs(totalBalance - 100) > 1) {
            showToast?.('Balance percentages must total 100%', 'error');
            return;
        }

        setIsGenerating(true);
        setError(null);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            // Load emoji settings
            const emojiSettings = await loadEmojiSettings(user.id);
            
            const response = await fetch('/api/generateMonetizationPlan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    goals: monetizationGoals,
                    contentPreferences: `${monetizationPreferences}\n\n${buildMonetizedContext()}`.trim(),
                    subscriberCount: subscriberCount || undefined,
                    balance: {
                        engagement: balanceEngagement,
                        upsell: balanceUpsell,
                        retention: balanceRetention,
                        conversion: balanceConversion,
                    },
                    niche: user?.niche || 'Adult Content Creator',
                    analyticsData: buildAnalyticsData(),
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate monetization plan');
            }

            const data = await response.json();
            if (data.success && data.plan) {
                setGeneratedMonetizationPlan(data.plan);
                // Save to history
                await saveToHistory('monetization_plan', `Monetization Plan - ${new Date().toLocaleDateString()}`, {
                    ...data.plan,
                });
                showToast?.('Monetization plan generated successfully!', 'success');

                // Lightweight usage tracking (best-effort)
                try {
                    const { logUsageEvent } = await import('../src/services/usageEvents');
                    await logUsageEvent(user.id, 'of_generate_monetization_plan', {
                        goals: monetizationGoals,
                        balance: {
                            engagement: balanceEngagement,
                            upsell: balanceUpsell,
                            retention: balanceRetention,
                            conversion: balanceConversion,
                        },
                    });
                } catch {
                    // ignore
                }
            } else {
                throw new Error(data.error || 'Failed to generate monetization plan');
            }
        } catch (error: any) {
            console.error('Error generating monetization plan:', error);
            const errorMsg = error.message || 'Failed to generate monetization plan. Please try again.';
            showToast?.(errorMsg, 'error');
            setError(errorMsg);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerateSubscriberMessages = async () => {
        if (!user?.id) return;
        setIsGeneratingMessages(true);
        setError(null);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            // Load AI personality/training settings
            let aiPersonality = '';
            let aiTone = '';
            let creatorGender = '';
            let targetAudienceGender = '';
            try {
                const userDoc = await getDoc(doc(db, 'users', user.id));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    aiPersonality = userData?.aiPersonality || '';
                    aiTone = userData?.aiTone || '';
                    creatorGender = userData?.creatorGender || '';
                    targetAudienceGender = userData?.targetAudienceGender || '';
                }
            } catch (e) {
                console.error('Error loading AI personality settings:', e);
            }
            
            const personalization = buildMonetizedContext();
            let fanContextBlock = '';
            if (selectedFanId && fanPreferences) {
                const fanName = selectedFanName || 'this fan';
                const contextParts = [];
                const subscriptionTier = fanPreferences.subscriptionTier;
                const isVip = fanPreferences.isVIP === true;
                if (subscriptionTier) {
                    contextParts.push(`Subscription tier: ${subscriptionTier}`);
                    if (subscriptionTier === 'Paid') {
                        contextParts.push('CTA rule: Already a paid subscriber - DO NOT ask them to subscribe or upgrade. Focus on appreciation, retention, PPV unlocks, tips, customs, and VIP treatment if applicable.');
                    } else {
                        contextParts.push('CTA rule: Free plan - encourage them to upgrade to paid for full access. PPV unlocks are allowed for free fans.');
                    }
                }
                if (isVip) {
                    contextParts.push('VIP: Provide special treatment and priority responses.');
                }
                if (fanPreferences.preferredTone) contextParts.push(`Preferred tone: ${fanPreferences.preferredTone}`);
                if (fanPreferences.communicationStyle) contextParts.push(`Communication style: ${fanPreferences.communicationStyle}`);
                if (fanPreferences.favoriteSessionType) contextParts.push(`Favorite session type: ${fanPreferences.favoriteSessionType}`);
                if (fanPreferences.languagePreferences) contextParts.push(`Language preferences: ${fanPreferences.languagePreferences}`);
                if (fanPreferences.boundaries) contextParts.push(`Boundaries: ${fanPreferences.boundaries}`);
                if (fanPreferences.suggestedFlow) contextParts.push(`What works best: ${fanPreferences.suggestedFlow}`);
                if (fanPreferences.pastNotes) contextParts.push(`Past notes: ${fanPreferences.pastNotes}`);
                
                if (contextParts.length > 0) {
                    fanContextBlock = `
PERSONALIZE FOR FAN: ${fanName}
Fan Preferences:
${contextParts.map(p => `- ${p}`).join('\n')}

NATURAL PERSONALIZATION GUIDELINES:
- Write FROM YOUR PERSPECTIVE (first person: "I", "my", "me") - YOU are the creator sending these messages
- Write as if YOU are addressing ${fanName}, but make it sound NATURAL and CONVERSATIONAL
- Use ${fanName}'s name OCCASIONALLY and NATURALLY - not in every message, just when it feels right (like a real person would)
- Match ${fanPreferences.preferredTone || 'their preferred'} tone naturally - don't force it
- Use ${fanPreferences.communicationStyle || 'their preferred'} communication style organically
- Reference their preferences subtly - don't make it obvious you're following a checklist
- Write like a REAL PERSON, not AI - natural flow, varied sentence structure, authentic voice
- DO NOT overuse their name - use it sparingly, like you would in real conversation
- Make messages feel personal but NOT robotic or formulaic
- Consider their boundaries and what works best for them naturally
`;
                }
            } else if (selectedFanId && selectedFanName) {
                // Fan selected but preferences not loaded yet - still use their name
                fanContextBlock = `
PERSONALIZE FOR FAN: ${selectedFanName}
NATURAL PERSONALIZATION GUIDELINES:
- Write FROM YOUR PERSPECTIVE (first person: "I", "my", "me") - YOU are the creator sending these messages
- Write as if YOU are addressing ${selectedFanName}, but make it sound NATURAL and CONVERSATIONAL
- Use ${selectedFanName}'s name OCCASIONALLY and NATURALLY - not in every message, just when it feels right
- Write like a REAL PERSON, not AI - natural flow, varied sentence structure, authentic voice
- DO NOT overuse their name - use it sparingly, like you would in real conversation
- Make messages feel personal but NOT robotic or formulaic
`;
            }
            
            // Build AI personality context
            let personalityContext = '';
            if (aiPersonality) {
                personalityContext = `\n\nAI PERSONALITY & TRAINING:\n${aiPersonality}`;
            }
            if (aiTone && aiTone !== messageTone) {
                personalityContext += `\nDefault AI Tone: ${aiTone}`;
            }
            if (creatorGender) {
                personalityContext += `\nCreator Gender: ${creatorGender}`;
            }
            if (targetAudienceGender) {
                personalityContext += `\nTarget Audience: ${targetAudienceGender}`;
            }
            if (explicitnessLevelSetting !== null && explicitnessLevelSetting !== undefined) {
                personalityContext += `\nExplicitness Level: ${explicitnessLevelSetting}/10`;
            }
            if (useCreatorPersonalityMessaging && creatorPersonality) {
                personalityContext += `\n\nCREATOR PERSONALITY:\n${creatorPersonality}`;
            }

            const prompt = `
Create a subscriber messaging toolkit for a ${selectedPlatform} creator.

Type: ${messageType}
Tone: ${messageTone}
Context: ${messageContext || 'None provided'}
${personalityContext ? personalityContext : ''}
${fanContextBlock ? fanContextBlock : ''}

${personalization ? personalization : ''}

🚨 CRITICAL - PERSPECTIVE REQUIREMENT 🚨
- Write messages FROM THE CONTENT CREATOR'S PERSPECTIVE (first person: "I", "my", "me")
- The messages are what the CONTENT CREATOR is sending, NOT what fans/followers are saying
- Write as if YOU (the content creator) are sending these messages yourself
- DO NOT write from the audience's perspective
- DO NOT write as if fans are speaking to you
- Use first-person language from the creator's point of view
- The messages should be what the CREATOR is saying to fans, not what fans are saying to the creator

🎯 NATURAL CREATOR LANGUAGE & SLANG:
- Use abbreviations and slang that creators ACTUALLY use on ${selectedPlatform} naturally
- Common abbreviations: PPV, DM/DMs, sub/subs, custom/customs, unlock/unlocks, tip/tips, OF (OnlyFans)
- Use casual terms naturally: "babe", "love", "hun", "baby" when appropriate - but don't overuse
- Write like a REAL CREATOR would text/message - casual, authentic, human, NOT formal or corporate
- Mix full words and abbreviations naturally - don't force abbreviations, use them when they feel right
- Example natural: "Hey babe! New PPV in your DMs 💕 Unlock it to see the full set" (sounds human)
- Example forced: "Hello subscriber. Please unlock the Pay-Per-View content in your Direct Messages" (sounds AI)
- Vary your language - sometimes use "sub", sometimes "subscriber", sometimes "fan" - natural variation
- Sound like you're texting a friend, not writing a business email
- Use platform slang organically - it should feel natural, not like you're checking off a list

Rules:
- Manual posting only. Do not claim integrations or auto sending.
- Keep messages short and conversion-focused.
- Output should be ready to copy/paste.

Output format:
- If Welcome sequence: 3 messages (Day 0, Day 1, Day 3)
- If Renewal reminder: 3 messages (soft → direct)
- If PPV follow-up: 3 messages (soft nudge → last call)
- If Win-back: 3 messages (friendly → offer → last check-in)
`.trim();

            // Load emoji settings
            const emojiSettings = await loadEmojiSettings(user.id);
            
            const resp = await fetch('/api/generateText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    prompt,
                    context: {
                        goal: 'retention',
                        tone: messageTone,
                        platforms: [selectedPlatform],
                    },
                    emojiEnabled: emojiSettings.enabled,
                    emojiIntensity: emojiSettings.intensity,
                }),
            });

            const data = await resp.json().catch(() => ({}));
            const text = data?.text || data?.caption || '';
            if (!text || typeof text !== 'string') {
                throw new Error(data?.error || 'Failed to generate messages');
            }

            setGeneratedMessages(text);
            showToast?.('Messages generated!', 'success');

            // Usage tracking (best-effort)
            try {
                const { logUsageEvent } = await import('../src/services/usageEvents');
                await logUsageEvent(user.id, 'of_generate_subscriber_messages', { messageType, tone: messageTone });
            } catch {
                // ignore
            }
        } catch (e: any) {
            console.error('Subscriber messages generation failed:', e);
            showToast?.(e?.message || 'Failed to generate messages', 'error');
            setError(e?.message || 'Failed to generate messages');
        } finally {
            setIsGeneratingMessages(false);
        }
    };

    // History state
    const [history, setHistory] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [showHistoryTab, setShowHistoryTab] = useState(false);
    const [creatorPersonality, setCreatorPersonality] = useState('');
    const [aiPersonalitySetting, setAiPersonalitySetting] = useState('');
    const [aiToneSetting, setAiToneSetting] = useState('');
    const [explicitnessLevelSetting, setExplicitnessLevelSetting] = useState(7);
    // History state for captions tab (separate from main history tab)
    const [showCaptionsHistory, setShowCaptionsHistory] = useState(false);
    const [captionsPredictHistory, setCaptionsPredictHistory] = useState<any[]>([]);
    const [captionsRepurposeHistory, setCaptionsRepurposeHistory] = useState<any[]>([]);
    const [captionsGapAnalysisHistory, setCaptionsGapAnalysisHistory] = useState<any[]>([]);
    const [loadingCaptionsHistory, setLoadingCaptionsHistory] = useState(false);

    // Load history for captions tab (separate from main history tab)
    const loadCaptionsHistory = async () => {
        if (!user?.id) return;
        setLoadingCaptionsHistory(true);
        try {
            // Load predict history from OnlyFans-specific collection
            const predictItems: any[] = [];
            try {
                const predictRef = collection(db, 'users', user.id, 'onlyfans_predict_history');
                const predictQuery = query(predictRef, orderBy('createdAt', 'desc'), limit(15));
                const predictSnapshot = await getDocs(predictQuery);
                predictSnapshot.forEach((doc) => {
                    const data = doc.data();
                    predictItems.push({ id: doc.id, ...data });
                });
            } catch (error: any) {
                console.error('Error loading predict history:', error);
                // Fallback: try without orderBy if index is missing
                if (error.code === 'failed-precondition' || error.message?.includes('index')) {
                    try {
                        const predictRef = collection(db, 'users', user.id, 'onlyfans_predict_history');
                        const fallbackQuery = query(predictRef);
                        const fallbackSnapshot = await getDocs(fallbackQuery);
                        fallbackSnapshot.forEach((doc) => {
                            const data = doc.data();
                            predictItems.push({ id: doc.id, ...data });
                        });
                    } catch (fallbackError) {
                        console.error('Fallback query also failed for predict history:', fallbackError);
                    }
                }
            }
            setCaptionsPredictHistory(predictItems.slice(0, 10)); // Keep only last 10

            // Load repurpose history from OnlyFans-specific collection
            const repurposeItems: any[] = [];
            try {
                const repurposeRef = collection(db, 'users', user.id, 'onlyfans_repurpose_history');
                const repurposeQuery = query(repurposeRef, orderBy('createdAt', 'desc'), limit(15));
                const repurposeSnapshot = await getDocs(repurposeQuery);
                repurposeSnapshot.forEach((doc) => {
                    const data = doc.data();
                    repurposeItems.push({ id: doc.id, ...data });
                });
            } catch (error: any) {
                console.error('Error loading repurpose history:', error);
                // Fallback: try without orderBy if index is missing
                if (error.code === 'failed-precondition' || error.message?.includes('index')) {
                    try {
                        const repurposeRef = collection(db, 'users', user.id, 'onlyfans_repurpose_history');
                        const fallbackQuery = query(repurposeRef);
                        const fallbackSnapshot = await getDocs(fallbackQuery);
                        fallbackSnapshot.forEach((doc) => {
                            const data = doc.data();
                            repurposeItems.push({ id: doc.id, ...data });
                        });
                    } catch (fallbackError) {
                        console.error('Fallback query also failed for repurpose history:', fallbackError);
                    }
                }
            }
            setCaptionsRepurposeHistory(repurposeItems.slice(0, 10)); // Keep only last 10

            // Load gap analysis history from onlyfans_content_brain_history
            const gapAnalysisItems: any[] = [];
            try {
                const gapAnalysisRef = collection(db, 'users', user.id, 'onlyfans_content_brain_history');
                // Avoid composite index requirement (type + createdAt). Fetch by createdAt and filter by type in-memory.
                const gapAnalysisQuery = query(gapAnalysisRef, orderBy('createdAt', 'desc'), limit(15));
                const gapAnalysisSnapshot = await getDocs(gapAnalysisQuery);
                gapAnalysisSnapshot.forEach((doc) => {
                    const data = doc.data();
                    if (data?.type === 'gap_analysis') {
                        gapAnalysisItems.push({ id: doc.id, ...data });
                    }
                });
            } catch (error: any) {
                console.error('Error loading gap analysis history:', error);
                // Fallback: try without orderBy if index is missing
                if (error.code === 'failed-precondition' || error.message?.includes('index')) {
                    try {
                        const gapAnalysisRef = collection(db, 'users', user.id, 'onlyfans_content_brain_history');
                        const fallbackQuery = query(gapAnalysisRef);
                        const fallbackSnapshot = await getDocs(fallbackQuery);
                        fallbackSnapshot.forEach((doc) => {
                            const data = doc.data();
                            if (data?.type === 'gap_analysis') {
                                gapAnalysisItems.push({ id: doc.id, ...data });
                            }
                        });
                        // Sort manually by createdAt
                        gapAnalysisItems.sort((a, b) => {
                            const aTime = a.createdAt?.toDate?.()?.getTime() || a.createdAt || 0;
                            const bTime = b.createdAt?.toDate?.()?.getTime() || b.createdAt || 0;
                            return bTime - aTime;
                        });
                    } catch (fallbackError) {
                        console.error('Fallback query also failed for gap analysis history:', fallbackError);
                    }
                }
            }
            setCaptionsGapAnalysisHistory(gapAnalysisItems.slice(0, 10)); // Keep only last 10
        } catch (error: any) {
            console.error('Error loading captions history:', error);
        } finally {
            setLoadingCaptionsHistory(false);
        }
    };

    const loadHistory = async () => {
        if (!user?.id) return;
        setLoadingHistory(true);
        try {
            // Load from onlyfans_predict_history and onlyfans_repurpose_history (separate from compose page)
            const items: any[] = [];
            
            // Load predict history from OnlyFans-specific collection
            try {
                const predictRef = collection(db, 'users', user.id, 'onlyfans_predict_history');
                const predictQuery = query(predictRef, orderBy('createdAt', 'desc'), limit(15));
                const predictSnapshot = await getDocs(predictQuery);
                predictSnapshot.forEach((doc) => {
                    const data = doc.data();
                    items.push({ id: doc.id, type: 'predict', ...data });
                });
            } catch (error: any) {
                console.error('Error loading predict history:', error);
                // Fallback: try without orderBy if index is missing
                if (error.code === 'failed-precondition' || error.message?.includes('index')) {
                    console.warn('Predict history query failed due to missing index, using fallback query');
                    try {
                        const predictRef = collection(db, 'users', user.id, 'onlyfans_predict_history');
                        const fallbackQuery = query(predictRef);
                        const fallbackSnapshot = await getDocs(fallbackQuery);
                        fallbackSnapshot.forEach((doc) => {
                            const data = doc.data();
                            items.push({ id: doc.id, type: 'predict', ...data });
                        });
                    } catch (fallbackError) {
                        console.error('Fallback query also failed for predict history:', fallbackError);
                    }
                }
            }
            
            // Load repurpose history from OnlyFans-specific collection
            try {
                const repurposeRef = collection(db, 'users', user.id, 'onlyfans_repurpose_history');
                const repurposeQuery = query(repurposeRef, orderBy('createdAt', 'desc'), limit(15));
                const repurposeSnapshot = await getDocs(repurposeQuery);
                repurposeSnapshot.forEach((doc) => {
                    const data = doc.data();
                    items.push({ id: doc.id, type: 'repurpose', ...data });
                });
            } catch (error: any) {
                console.error('Error loading repurpose history:', error);
                // Fallback: try without orderBy if index is missing
                if (error.code === 'failed-precondition' || error.message?.includes('index')) {
                    console.warn('Repurpose history query failed due to missing index, using fallback query');
                    try {
                        const repurposeRef = collection(db, 'users', user.id, 'onlyfans_repurpose_history');
                        const fallbackQuery = query(repurposeRef);
                        const fallbackSnapshot = await getDocs(fallbackQuery);
                        fallbackSnapshot.forEach((doc) => {
                            const data = doc.data();
                            items.push({ id: doc.id, type: 'repurpose', ...data });
                        });
                    } catch (fallbackError) {
                        console.error('Fallback query also failed for repurpose history:', fallbackError);
                    }
                }
            }
            
            // Sort by createdAt descending
            items.sort((a, b) => {
                const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
                const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
                return bTime - aTime;
            });
            
            setHistory(items);
        } catch (error: any) {
            console.error('Error loading history:', error);
            showToast?.('Failed to load history', 'error');
        } finally {
            setLoadingHistory(false);
        }
    };

    // Save predict to history (OnlyFans-specific collection, separate from compose page)
    const savePredictToHistory = async (data: any) => {
        if (!user?.id) {
            console.error('Cannot save predict history: user ID is missing');
            showToast?.('Cannot save: User not logged in', 'error');
            return;
        }
        try {
            // Ensure media is included in the data - explicitly check and include
            const historyData = {
                ...data,
                mediaUrl: data.mediaUrl || null,
                mediaType: data.mediaType || 'image',
                originalCaption: data.originalCaption || '',
                prediction: data.prediction || {},
                factors: data.factors || {},
                improvements: data.improvements || [],
                ideas: data.ideas || data.postIdeas || data.nextPostIdeas || [],
                bestBet: data.bestBet || data.nextBestBet || '',
                weeklyMix: Array.isArray(data.weeklyMix) ? data.weeklyMix : [],
                summary: data.summary || '',
            };
            
            console.log('Saving predict to history with media:', {
                hasMediaUrl: !!historyData.mediaUrl,
                mediaType: historyData.mediaType,
                mediaUrl: historyData.mediaUrl?.substring(0, 50) + '...'
            });
            
            const historyRef = collection(db, 'users', user.id, 'onlyfans_predict_history');
            await addDoc(historyRef, {
                type: 'predict',
                data: historyData,
                createdAt: Timestamp.now(),
            });
            
            // Keep only last 10 - get all, delete oldest if > 10
            try {
                const q = query(historyRef, orderBy('createdAt', 'desc'), limit(15));
                const snapshot = await getDocs(q);
                if (snapshot.size > 10) {
                    const docs = snapshot.docs;
                    const toDelete = docs.slice(10);
                    for (const docToDelete of toDelete) {
                        await deleteDoc(docToDelete.ref);
                    }
                }
            } catch (cleanupError: any) {
                // If orderBy fails due to missing index, try fallback cleanup
                if (cleanupError.code === 'failed-precondition' || cleanupError.message?.includes('index')) {
                    console.warn('Cleanup query failed due to missing index, using fallback');
                    const fallbackQ = query(historyRef);
                    const fallbackSnapshot = await getDocs(fallbackQ);
                    if (fallbackSnapshot.size > 10) {
                        // Sort manually and delete oldest
                        const docs = fallbackSnapshot.docs.map(d => ({
                            id: d.id,
                            createdAt: d.data().createdAt,
                            ref: d.ref
                        })).sort((a, b) => {
                            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
                            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
                            return bTime - aTime;
                        });
                        const toDelete = docs.slice(10);
                        for (const docToDelete of toDelete) {
                            await deleteDoc(docToDelete.ref);
                        }
                    }
                } else {
                    throw cleanupError;
                }
            }
            
            // Reload captions history
            loadCaptionsHistory();
        } catch (error: any) {
            console.error('Error saving predict to history:', error);
            showToast?.('Failed to save prediction to history. Please try again.', 'error');
            throw error; // Re-throw so caller knows it failed
        }
    };

    // Save repurpose to history (OnlyFans-specific collection, separate from compose page)
    const saveRepurposeToHistory = async (data: any) => {
        if (!user?.id) {
            console.error('Cannot save repurpose history: user ID is missing');
            showToast?.('Cannot save: User not logged in', 'error');
            return;
        }
        try {
            // Ensure media is included in the data - explicitly check and include
            const historyData = {
                ...data,
                mediaUrl: data.mediaUrl || null,
                mediaType: data.mediaType || 'image',
                originalContent: data.originalContent || '',
                repurposedContent: data.repurposedContent || [],
                summary: data.summary || '',
            };
            
            console.log('Saving repurpose to history with media:', {
                hasMediaUrl: !!historyData.mediaUrl,
                mediaType: historyData.mediaType,
                mediaUrl: historyData.mediaUrl?.substring(0, 50) + '...'
            });
            
            const historyRef = collection(db, 'users', user.id, 'onlyfans_repurpose_history');
            await addDoc(historyRef, {
                type: 'repurpose',
                data: historyData,
                createdAt: Timestamp.now(),
            });
            
            // Keep only last 10 - get all, delete oldest if > 10
            try {
                const q = query(historyRef, orderBy('createdAt', 'desc'), limit(15));
                const snapshot = await getDocs(q);
                if (snapshot.size > 10) {
                    const docs = snapshot.docs;
                    const toDelete = docs.slice(10);
                    for (const docToDelete of toDelete) {
                        await deleteDoc(docToDelete.ref);
                    }
                }
            } catch (cleanupError: any) {
                // If orderBy fails due to missing index, try fallback cleanup
                if (cleanupError.code === 'failed-precondition' || cleanupError.message?.includes('index')) {
                    console.warn('Cleanup query failed due to missing index, using fallback');
                    const fallbackQ = query(historyRef);
                    const fallbackSnapshot = await getDocs(fallbackQ);
                    if (fallbackSnapshot.size > 10) {
                        // Sort manually and delete oldest
                        const docs = fallbackSnapshot.docs.map(d => ({
                            id: d.id,
                            createdAt: d.data().createdAt,
                            ref: d.ref
                        })).sort((a, b) => {
                            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
                            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
                            return bTime - aTime;
                        });
                        const toDelete = docs.slice(10);
                        for (const docToDelete of toDelete) {
                            await deleteDoc(docToDelete.ref);
                        }
                    }
                } else {
                    throw cleanupError;
                }
            }
            
            // Reload captions history
            loadCaptionsHistory();
        } catch (error: any) {
            console.error('Error saving repurpose to history:', error);
            showToast?.('Failed to save repurpose to history. Please try again.', 'error');
            throw error; // Re-throw so caller knows it failed
        }
    };

    const saveToHistory = async (type: 'optimize' | 'predict' | 'repurpose' | 'monetization_plan' | 'post_ideas' | 'shoot_concepts' | 'weekly_plan' | 'gap_analysis' | 'subscriber_messages', title: string, data: any) => {
        if (!user?.id) return;
        try {
            // Don't save predict and repurpose to content brain history - they have their own history
            if (type === 'predict' || type === 'repurpose') {
                return;
            }
            // Save OnlyFans Content Brain history (excluding predict and repurpose) to onlyfans_content_brain_history
            await addDoc(collection(db, 'users', user.id, 'onlyfans_content_brain_history'), {
                type,
                title,
                data,
                createdAt: Timestamp.now(),
            });
            // Reload captions history
            loadCaptionsHistory();
            // Reload saved items for the respective tab
            if (type === 'post_ideas' && activeTab === 'postIdeas') {
                loadSavedPostIdeas();
            } else if (type === 'shoot_concepts' && activeTab === 'shootConcepts') {
                loadSavedShootConcepts();
            } else if (type === 'weekly_plan' && activeTab === 'weeklyPlan') {
                loadSavedWeeklyPlans();
            } else if (type === 'monetization_plan' && activeTab === 'monetizationPlanner') {
                loadSavedMonetizationPlans();
            }
        } catch (error: any) {
            console.error('Error saving to history:', error);
        }
    };
    
    // Load saved post ideas
    const loadSavedPostIdeas = async () => {
        if (!user?.id) return;
        try {
            const historyRef = collection(db, 'users', user.id, 'onlyfans_content_brain_history');
            const q = query(historyRef, orderBy('createdAt', 'desc'), limit(15));
            const snapshot = await getDocs(q);
            const items: any[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                if (data.type === 'post_ideas') {
                    items.push({ id: doc.id, ...data });
                }
            });
            setSavedPostIdeas(items);
        } catch (error) {
            console.error('Error loading saved post ideas:', error);
        }
    };
    
    // Load saved shoot concepts
    const loadSavedShootConcepts = async () => {
        if (!user?.id) return;
        try {
            const historyRef = collection(db, 'users', user.id, 'onlyfans_content_brain_history');
            const q = query(historyRef, orderBy('createdAt', 'desc'), limit(15));
            const snapshot = await getDocs(q);
            const items: any[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                if (data.type === 'shoot_concepts') {
                    items.push({ id: doc.id, ...data });
                }
            });
            setSavedShootConcepts(items);
        } catch (error) {
            console.error('Error loading saved shoot concepts:', error);
        }
    };
    
    // Load saved weekly plans
    const loadSavedWeeklyPlans = async () => {
        if (!user?.id) return;
        try {
            const historyRef = collection(db, 'users', user.id, 'onlyfans_content_brain_history');
            const q = query(historyRef, orderBy('createdAt', 'desc'), limit(15));
            const snapshot = await getDocs(q);
            const items: any[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                if (data.type === 'weekly_plan') {
                    items.push({ id: doc.id, ...data });
                }
            });
            setSavedWeeklyPlans(items);
        } catch (error) {
            console.error('Error loading saved weekly plans:', error);
        }
    };
    
    // Load saved monetization plans
    const loadSavedMonetizationPlans = async () => {
        if (!user?.id) return;
        try {
            const historyRef = collection(db, 'users', user.id, 'onlyfans_content_brain_history');
            const q = query(historyRef, orderBy('createdAt', 'desc'), limit(15));
            const snapshot = await getDocs(q);
            const items: any[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                if (data.type === 'monetization_plan') {
                    items.push({ id: doc.id, ...data });
                }
            });
            setSavedMonetizationPlans(items);
        } catch (error) {
            console.error('Error loading saved monetization plans:', error);
        }
    };

    // Delete saved item
    const handleDeleteSavedItem = async (itemId: string, type: 'post_ideas' | 'shoot_concepts' | 'weekly_plan' | 'monetization_plan') => {
        if (!user?.id || !itemId) return;
        
        if (!confirm('Are you sure you want to delete this saved item? This action cannot be undone.')) {
            return;
        }

        try {
            const historyRef = doc(db, 'users', user.id, 'onlyfans_content_brain_history', itemId);
            await deleteDoc(historyRef);
            
            // Reload the appropriate list
            if (type === 'post_ideas' && activeTab === 'postIdeas') {
                loadSavedPostIdeas();
            } else if (type === 'shoot_concepts' && activeTab === 'shootConcepts') {
                loadSavedShootConcepts();
            } else if (type === 'weekly_plan' && activeTab === 'weeklyPlan') {
                loadSavedWeeklyPlans();
            } else if (type === 'monetization_plan' && activeTab === 'monetizationPlanner') {
                loadSavedMonetizationPlans();
            }
            
            showToast?.('Item deleted successfully', 'success');
        } catch (error) {
            console.error('Error deleting saved item:', error);
            showToast?.('Failed to delete item. Please try again.', 'error');
        }
    };

    // Delete handlers for predict, repurpose, and gap analysis history items
    const handleDeletePredictHistory = async (itemId: string) => {
        if (!user?.id || !itemId) return;
        
        if (!confirm('Are you sure you want to delete this prediction? This action cannot be undone.')) {
            return;
        }

        try {
            const historyRef = doc(db, 'users', user.id, 'onlyfans_predict_history', itemId);
            await deleteDoc(historyRef);
            loadCaptionsHistory();
            showToast?.('Prediction deleted successfully', 'success');
        } catch (error) {
            console.error('Error deleting prediction:', error);
            showToast?.('Failed to delete prediction. Please try again.', 'error');
        }
    };

    const handleDeleteRepurposeHistory = async (itemId: string) => {
        if (!user?.id || !itemId) return;
        
        if (!confirm('Are you sure you want to delete this repurpose? This action cannot be undone.')) {
            return;
        }

        try {
            const historyRef = doc(db, 'users', user.id, 'onlyfans_repurpose_history', itemId);
            await deleteDoc(historyRef);
            loadCaptionsHistory();
            showToast?.('Repurpose deleted successfully', 'success');
        } catch (error) {
            console.error('Error deleting repurpose:', error);
            showToast?.('Failed to delete repurpose. Please try again.', 'error');
        }
    };

    const handleDeleteGapAnalysisHistory = async (itemId: string) => {
        if (!user?.id || !itemId) return;
        
        if (!confirm('Are you sure you want to delete this content gap analysis? This action cannot be undone.')) {
            return;
        }

        try {
            const historyRef = doc(db, 'users', user.id, 'onlyfans_content_brain_history', itemId);
            await deleteDoc(historyRef);
            loadCaptionsHistory();
            showToast?.('Content gap analysis deleted successfully', 'success');
        } catch (error) {
            console.error('Error deleting gap analysis:', error);
            showToast?.('Failed to delete gap analysis. Please try again.', 'error');
        }
    };

    // Handle saving caption to OnlyFans calendar
    const handleSaveCaptionToOnlyFansCalendar = async (caption: string, hashtags: string[], status: 'Draft' | 'Scheduled') => {
        if (!user || !uploadedMediaUrl) {
            showToast?.('Please upload media first', 'error');
            return;
        }

        try {
            const postId = Date.now().toString();
            const draftDate = new Date();
            draftDate.setHours(12, 0, 0, 0);

            let scheduledDateISO: string | undefined;
            if (status === 'Scheduled' && scheduledDate) {
                scheduledDateISO = new Date(scheduledDate).toISOString();
            } else if (status === 'Draft') {
                // For drafts, use today's date at noon
                scheduledDateISO = draftDate.toISOString();
            }

            const fullCaption = hashtags && hashtags.length > 0 
                ? `${caption} ${hashtags.join(' ')}`
                : caption;

            // Only save as a post - do NOT create a reminder event for posts
            // Reminders are separate and should only be created manually
            const postData = {
                id: postId,
                content: fullCaption,
                mediaUrl: uploadedMediaUrl,
                mediaType: uploadedMediaType || 'image',
                platforms: ['OnlyFans'],
                status: status,
                scheduledDate: scheduledDateISO,
                timestamp: new Date().toISOString(),
            };
            await setDoc(doc(db, 'users', user.id, 'posts', postId), postData);
            
            if (status === 'Scheduled') {
                showToast?.('Added to OnlyFans Calendar!', 'success');
            } else {
                showToast?.('Saved to Drafts!', 'success');
            }
        } catch (error: any) {
            console.error('Error saving caption:', error);
            showToast?.('Failed to save. Please try again.', 'error');
        }
    };

    const handleGenerateMediaCaptions = async () => {
        if (!mediaFile) {
            showToast?.('Please upload an image or video', 'error');
            return;
        }

        // Check file size (more lenient since we're using Firebase Storage, not base64)
        const fileSizeMB = mediaFile.size / 1024 / 1024;
        const isVideo = mediaFile.type.startsWith('video/');
        const maxSizeMB = isVideo ? 100 : 10; // Firebase Storage can handle larger files

        if (fileSizeMB > maxSizeMB) {
            showToast?.(
                `File is too large (${fileSizeMB.toFixed(1)}MB). Maximum size: ${maxSizeMB}MB for ${isVideo ? 'videos' : 'images'}. Please compress or use a smaller file.`,
                'error'
            );
            return;
        }

        setIsGenerating(true);
        setError(null);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            if (!user?.id) {
                throw new Error('User not authenticated');
            }

            // Upload to Firebase Storage to avoid 413 errors
            let mediaUrl: string;
            try {
                const timestamp = Date.now();
                const fileExtension = mediaFile.name.split('.').pop() || (mediaFile.type.startsWith('video/') ? 'mp4' : 'jpg');
                const storagePath = `users/${user.id}/onlyfans-uploads/${timestamp}.${fileExtension}`;
                const storageRef = ref(storage, storagePath);

                await uploadBytes(storageRef, mediaFile, {
                    contentType: mediaFile.type,
                });

                mediaUrl = await getDownloadURL(storageRef);

                // Auto-save uploaded media to Media Vault (Premium Content Studio)
                try {
                    const fileType = mediaFile.type.startsWith('video/') ? 'video' : 'image';
                    const uniqueId = `${timestamp}_${Math.random().toString(36).substring(2, 9)}`;
                    const mediaItem = {
                        id: uniqueId,
                        userId: user.id,
                        url: mediaUrl,
                        name: mediaFile.name,
                        type: fileType,
                        mimeType: mediaFile.type,
                        size: mediaFile.size,
                        uploadedAt: new Date().toISOString(),
                        usedInPosts: [],
                        tags: [],
                        folderId: 'general', // Default folder
                    };
                    await setDoc(doc(db, 'users', user.id, 'onlyfans_media_library', mediaItem.id), mediaItem);
                } catch (vaultError) {
                    console.error('Error auto-saving to Media Vault:', vaultError);
                    // Don't block caption generation if vault save fails
                }
            } catch (uploadError: any) {
                console.error('Upload error:', uploadError);
                throw new Error(`Failed to upload media: ${uploadError.message || 'Please try again'}`);
            }
            
            // Load emoji settings
            const emojiSettings = await loadEmojiSettings(user.id);
            
            const captionsUrl = new URL('/api/generateCaptions', window.location.origin);
            const response = await fetch(captionsUrl.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    mediaUrl: mediaUrl, // Use Firebase Storage URL instead of base64
                    tone: mediaCaptionTone === 'Explicit' ? 'Sexy / Explicit' : mediaCaptionTone,
                    goal: mediaCaptionGoal,
                    platforms: [selectedPlatform],
                    promptText: `${mediaCaptionPrompt || `Create explicit captions tailored for ${selectedPlatform}. Mention ${selectedPlatform} naturally when it helps drive subs (e.g., "join me on ${selectedPlatform}") but only when it fits the line.`} [Variety seed: ${Date.now()}-${Math.random().toString(36).substr(2, 9)}] - Generate diverse, unique captions each time. Avoid repetition.`.trim(),
                    analyticsData: buildAnalyticsData(),
                    emojiEnabled: emojiSettings.enabled,
                    emojiIntensity: emojiSettings.intensity,
                }),
            });

            if (!response.ok) {
                if (response.status === 413) {
                    const errorData = await response.json().catch(() => ({}));
                    const errorMsg = errorData.note || errorData.error || 'File too large. Please use a smaller image/video (max 4MB for images, 20MB for videos).';
                    throw new Error(errorMsg);
                }
                const errorData = await response.json().catch(() => ({}));
                const errorMsg = errorData.error || errorData.message || 'Failed to generate captions';
                throw new Error(errorMsg);
            }

            const data = await response.json();
            // API returns array of {caption: string, hashtags: string[]}
            let captions: {caption: string; hashtags: string[]}[] = [];
            if (Array.isArray(data)) {
                captions = data.map((item: any) => ({
                    caption: item.caption || '',
                    hashtags: Array.isArray(item.hashtags) ? item.hashtags : [],
                }));
            } else if (data && typeof data === 'object' && Array.isArray(data.captions)) {
                captions = data.captions.map((item: any) => ({
                    caption: item.caption || '',
                    hashtags: Array.isArray(item.hashtags) ? item.hashtags : [],
                }));
            }
            setGeneratedMediaCaptions(Array.isArray(captions) ? captions : []);
            showToast?.('Captions generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating media captions:', error);
            const errorMsg = error.message || 'Failed to generate captions. Please try again.';
            showToast?.(errorMsg, 'error');
            setError(errorMsg);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleMediaFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setMediaFile(file);
        const previewUrl = URL.createObjectURL(file);
        setMediaPreview(previewUrl);
    };

    // Handle media upload for captions tab
    const handleUploadMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Clear old captions when uploading new media
        setGeneratedCaptions([]);
        setCurrentCaptionForAI('');
        setEditedCaptions(new Map());
        setUsedCaptions(new Set());
        setUsedCaptionsHash(new Set()); // Clear used captions hash for new media
        
        setUploadedMediaFile(file);
        const previewUrl = URL.createObjectURL(file);
        setUploadedMediaPreview(previewUrl);
        setUploadedMediaType(file.type.startsWith('video/') ? 'video' : 'image');
        
        // Upload to Firebase Storage
        try {
            if (!user?.id) return;
            const timestamp = Date.now();
            const fileExtension = file.name.split('.').pop() || (file.type.startsWith('video/') ? 'mp4' : 'jpg');
            const storagePath = `users/${user.id}/onlyfans-uploads/${timestamp}.${fileExtension}`;
            const storageRef = ref(storage, storagePath);
            await uploadBytes(storageRef, file, { contentType: file.type });
            const mediaUrl = await getDownloadURL(storageRef);
            setUploadedMediaUrl(mediaUrl);
            
            // Auto-save to Media Vault
            try {
                const fileType = file.type.startsWith('video/') ? 'video' : 'image';
                const uniqueId = `${timestamp}_${Math.random().toString(36).substring(2, 9)}`;
                const mediaItem = {
                    id: uniqueId,
                    userId: user.id,
                    url: mediaUrl,
                    name: file.name,
                    type: fileType,
                    mimeType: file.type,
                    size: file.size,
                    uploadedAt: new Date().toISOString(),
                    usedInPosts: [],
                    tags: [],
                    folderId: 'general', // Default to general folder
                };
                
                await setDoc(doc(db, 'users', user.id, 'onlyfans_media_library', mediaItem.id), mediaItem);
                // Refresh media vault items if modal is open
                if (showMediaVaultModal) {
                    loadMediaVault();
                }
            } catch (vaultError: any) {
                // Don't fail the upload if vault save fails, just log it
                console.error('Failed to save to media vault:', vaultError);
            }
        } catch (error: any) {
            console.error('Upload error:', error);
            showToast?.('Failed to upload media', 'error');
        }
    };

    // Load media vault items
    const loadMediaVault = async () => {
        if (!user?.id) return;
        try {
            const vaultRef = collection(db, 'users', user.id, 'onlyfans_media_library');
            const q = query(vaultRef, orderBy('uploadedAt', 'desc'));
            const snapshot = await getDocs(q);
            const items: any[] = [];
            snapshot.forEach((doc) => {
                items.push({ id: doc.id, ...doc.data() });
            });
            setMediaVaultItems(items);
        } catch (error) {
            console.error('Error loading media vault:', error);
        }
    };

    // Handle selecting media from vault
    const handleSelectFromVault = async (item: any) => {
        if (weeklyPlanVaultTargetAction) {
            const action = weeklyPlanVaultTargetAction;
            const mediaUrl = item.url;
            const mediaType = item.type === 'video' ? 'video' : 'image';
            setWeeklyPlanCardState((prev) => ({
                ...prev,
                [action.cardKey]: {
                    ...prev[action.cardKey],
                    mediaUrl,
                    mediaType,
                    error: undefined,
                },
            }));
            setWeeklyPlanVaultTargetAction(null);
            setWeeklyPlanUploadMenuKey(null);
            setShowMediaVaultModal(false);
            await handleWeeklyPlanGenerateCaption(action, { mediaUrl, mediaType });
            return;
        }

        // Clear old captions when selecting new media
        setGeneratedCaptions([]);
        setCurrentCaptionForAI('');
        setEditedCaptions(new Map());
        setUsedCaptions(new Set());
        setUsedCaptionsHash(new Set()); // Clear used captions hash for new media
        
        setUploadedMediaUrl(item.url);
        setUploadedMediaPreview(item.url);
        setUploadedMediaType(item.type === 'video' ? 'video' : 'image');
        setShowMediaVaultModal(false);
    };

    // Handle regenerate captions with media
    const handleRegenerateCaptionsWithMedia = async () => {
        if (!uploadedMediaUrl) {
            showToast?.('Please upload or select media first', 'error');
            return;
        }

        setIsGenerating(true);
        setError(null);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            if (!user?.id) {
                throw new Error('User not authenticated');
            }

            // Get user explicitness level
            let explicitnessLevel = 7; // Default
            try {
                const userDoc = await getDoc(doc(db, 'users', user.id));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    explicitnessLevel = userData?.explicitnessLevel ?? 7;
                }
            } catch (e) {
                console.error('Error loading explicitness level:', e);
            }

            // Determine tone based on explicitness level.
            // Important: do NOT downgrade the user's selected tone (e.g. Dominant/Erotic/etc.) to "Intimate".
            // Only escalate upward when explicitness is high enough.
            let finalTone = captionTone;
            if (explicitnessLevel >= 8) {
                finalTone = 'Explicit';
            } else if (explicitnessLevel >= 6) {
                finalTone = captionTone === 'Explicit' ? 'Explicit' : captionTone;
            }
            
            // Load emoji settings
            const emojiSettings = await loadEmojiSettings(user.id);
            
            const captionsUrl = new URL('/api/generateCaptions', window.location.origin);
            const response = await fetch(captionsUrl.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    mediaUrl: uploadedMediaUrl,
                    tone: finalTone === 'Explicit' ? 'Sexy / Explicit' : finalTone,
                    goal: captionGoal,
                    platforms: [selectedPlatform],
                    promptText: `${captionPrompt || `Analyze this image/video in detail and describe what you see. Create explicit ${selectedPlatform} captions based on the actual content shown. Be very descriptive and explicit about what is visually present. Mention ${selectedPlatform} naturally only when it helps drive subs.`} [Variety seed: ${Date.now()}-${Math.random().toString(36).substr(2, 9)}] - Generate diverse, unique captions each time. Avoid repetition.`.trim(),
                    emojiEnabled: emojiSettings.enabled,
                    emojiIntensity: emojiSettings.intensity,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMsg = errorData.error || errorData.message || 'Failed to generate captions';
                throw new Error(errorMsg);
            }

            const data = await response.json();
            let captions: {caption: string; hashtags: string[]}[] = [];
            if (Array.isArray(data)) {
                captions = data.map((item: any) => ({
                    caption: item.caption || '',
                    hashtags: Array.isArray(item.hashtags) ? item.hashtags : [],
                }));
            } else if (data && typeof data === 'object' && Array.isArray(data.captions)) {
                captions = data.captions.map((item: any) => ({
                    caption: item.caption || '',
                    hashtags: Array.isArray(item.hashtags) ? item.hashtags : [],
                }));
            }
            setGeneratedCaptions(captions.map(c => `${c.caption} ${(c.hashtags || []).join(' ')}`.trim()));
            showToast?.('Captions generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating media captions:', error);
            const errorMsg = error.message || 'Failed to generate captions. Please try again.';
            showToast?.(errorMsg, 'error');
            setError(errorMsg);
        } finally {
            setIsGenerating(false);
        }
    };

    // Handle what to post next
    const handlePredictPerformance = async () => {
        const recentContent = currentCaptionForAI.trim() || generatedCaptions[0] || '';
        const currentMediaUrl = uploadedMediaUrl;
        const currentMediaType = uploadedMediaType || 'image';

        setIsPredicting(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            const response = await fetch('/api/whatToPostNext', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    platform: selectedPlatform,
                    niche: user?.niche || 'Adult Content Creator',
                    tone: captionTone,
                    goal: captionGoal,
                    recentContent: recentContent || undefined,
                }),
            });

            if (!response.ok) throw new Error('Failed to generate what to post next');
            const data = await response.json();
            if (data.success) {
                const resultData = {
                    ...data,
                    originalCaption: recentContent,
                    mediaUrl: currentMediaUrl || null,
                    mediaType: currentMediaType,
                };
                
                try {
                    await savePredictToHistory({
                        ...resultData,
                        mediaUrl: currentMediaUrl || null,
                        mediaType: currentMediaType,
                    });
                    await loadCaptionsHistory();
                } catch (saveError: any) {
                    console.error('Failed to save what to post next to history:', saveError);
                }
                
                setPredictResult(resultData);
                setShowPredictModal(true);
                showToast?.('Ideas ready!', 'success');
            }
        } catch (error: any) {
            showToast?.(error.message || 'Failed to generate what to post next', 'error');
        } finally {
            setIsPredicting(false);
        }
    };

    // Handle repurpose content
    const handleRepurposeContent = async () => {
        if (!currentCaptionForAI.trim() && generatedCaptions.length === 0) {
            showToast?.('Please generate captions first or enter a caption', 'error');
            return;
        }

        const captionToRepurpose = currentCaptionForAI.trim() || generatedCaptions[0] || '';
        if (!captionToRepurpose) {
            showToast?.('Please enter or generate a caption first', 'error');
            return;
        }

        // Capture media URL and type at the time of repurpose
        const currentMediaUrl = uploadedMediaUrl;
        const currentMediaType = uploadedMediaType || 'image';

        setIsRepurposing(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            const response = await fetch('/api/repurposeContent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    originalContent: captionToRepurpose,
                    originalPlatform: selectedPlatform,
                    targetPlatforms: ['Instagram', 'TikTok', 'X', 'LinkedIn', 'Facebook', 'Threads', 'YouTube'],
                    niche: user?.niche || 'Adult Content Creator',
                    tone: captionTone,
                    goal: captionGoal,
                    mediaType: currentMediaType,
                }),
            });

            if (!response.ok) throw new Error('Failed to repurpose content');
            const data = await response.json();
            if (data.success && data.repurposedContent) {
                const resultData = {
                    ...data,
                    originalContent: captionToRepurpose,
                    mediaUrl: currentMediaUrl || null,
                    mediaType: currentMediaType,
                };
                
                // Save to history automatically - ensure media is included
                try {
                    await saveRepurposeToHistory({
                        ...resultData,
                        mediaUrl: currentMediaUrl || null,
                        mediaType: currentMediaType,
                    });
                    // Reload captions history
                    await loadCaptionsHistory();
                    showToast?.('Repurpose saved to history!', 'success');
                } catch (saveError: any) {
                    // Log error but don't block showing the result
                    console.error('Failed to save repurpose to history:', saveError);
                    showToast?.('Content repurposed but failed to save to history. Please try saving manually.', 'error');
                }
                
                setRepurposeResult(resultData);
                setShowRepurposeModal(true);
                showToast?.('Content repurposed!', 'success');
            }
        } catch (error: any) {
            showToast?.(error.message || 'Failed to repurpose content', 'error');
        } finally {
            setIsRepurposing(false);
        }
    };

    // Handle analyze content gaps using OnlyFans calendar data
    const handleAnalyzeContentGaps = async () => {
        if (!user?.id) {
            showToast?.('Please sign in to analyze content gaps', 'error');
            return;
        }

        setIsAnalyzingGaps(true);
        try {
            // Load OnlyFans calendar events
            const eventsRef = collection(db, 'users', user.id, 'onlyfans_calendar_events');
            const eventsQuery = query(eventsRef, orderBy('date', 'desc'));
            const eventsSnapshot = await getDocs(eventsQuery);
            const calendarEvents: OnlyFansCalendarEvent[] = [];
            eventsSnapshot.forEach((doc) => {
                calendarEvents.push({ id: doc.id, ...doc.data() } as OnlyFansCalendarEvent);
            });

            // Also get posts with OnlyFans platform
            const postsRef = collection(db, 'users', user.id, 'posts');
            const postsSnapshot = await getDocs(postsRef);
            const onlyfansPosts: any[] = [];
            postsSnapshot.forEach((doc) => {
                const post = doc.data();
                if (post.platforms && post.platforms.includes('OnlyFans')) {
                    onlyfansPosts.push({ id: doc.id, ...post });
                }
            });

            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const response = await fetch('/api/analyzeContentGaps', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    daysToAnalyze: 90,
                    niche: user.niche || 'Adult Content Creator',
                    platforms: ['OnlyFans'],
                    calendarEvents: calendarEvents.map(e => ({
                        date: e.date,
                        reminderType: e.reminderType,
                        contentType: e.contentType,
                        description: e.description,
                    })),
                    posts: onlyfansPosts.map(p => ({
                        content: p.content,
                        scheduledDate: p.scheduledDate,
                        status: p.status,
                    })),
                    useWeeklyTrends: true, // Use weekly tavily data
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to analyze content gaps');
            }

            const data = await response.json();
            if (data.success) {
                setContentGapAnalysis(data);
                setShowGapAnalysisModal(true);
                await saveToHistory('gap_analysis', `What's Missing - ${new Date().toLocaleDateString()}`, data);
                showToast?.('Content gap analysis complete!', 'success');
            }
        } catch (error: any) {
            console.error('Error analyzing content gaps:', error);
            showToast?.(error.message || 'Failed to analyze content gaps', 'error');
        } finally {
            setIsAnalyzingGaps(false);
        }
    };

    // Load media vault when modal opens
    useEffect(() => {
        if (showMediaVaultModal) {
            loadMediaVault();
        }
    }, [showMediaVaultModal]);

    const allTabs: { id: ContentType; label: string }[] = [
        { id: 'captions', label: 'Captions' },
        { id: 'mediaCaptions', label: 'Image/Video Captions' }, // Hidden but kept for stability
        { id: 'postIdeas', label: 'Content Ideas' },
        { id: 'trends', label: 'Find Trends' },
        { id: 'shootConcepts', label: 'Shoot Ideas' },
        { id: 'weeklyPlan', label: 'Plan My Week' },
        { id: 'monetizationPlanner', label: 'Drops & PPV' },
        { id: 'messaging', label: 'DM Sessions' },
        { id: 'guides', label: 'Playbooks' },
    ];
    // Filter out mediaCaptions and guides tabs (history is now in captions tab)
    const tabs = allTabs.filter(tab => tab.id !== 'mediaCaptions' && tab.id !== 'guides') as { id: ContentType; label: string }[];

    // Show loading state
    if (isLoading) {
        return (
            <div className="max-w-5xl mx-auto p-6">
                <div className="flex items-center justify-center min-h-[400px]">
                    <div className="text-center">
                        <RefreshIcon className="w-8 h-8 text-primary-600 dark:text-primary-400 animate-spin mx-auto mb-4" />
                        <p className="text-gray-600 dark:text-gray-400">Loading Content Ideas...</p>
                    </div>
                </div>
            </div>
        );
    }

    // Show error state
    if (error && !isGenerating) {
        return (
            <div className="max-w-5xl mx-auto p-6">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
                    <p className="text-red-600 dark:text-red-400 mb-2">Error loading Content Ideas</p>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">{error}</p>
                    <button 
                        onClick={() => {
                            setError(null);
                            setIsLoading(true);
                            window.location.reload();
                        }} 
                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                    >
                        Reload
                    </button>
                </div>
            </div>
        );
    }

    const PlatformTargetingCard = () => (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Platform</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Pick where you’re posting this week.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {platformOptions.map((platform) => (
                        <button
                            key={platform}
                            onClick={() => setSelectedPlatform(platform)}
                            className={`px-4 py-2 min-w-[120px] rounded-md text-sm border ${
                                selectedPlatform === platform
                                    ? 'border-primary-600 text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30'
                                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                        >
                            {platform}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <SparklesIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Content Ideas
                    </h1>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    Plan drops, write captions, and map the week in creator language.
                </p>
            </div>

            {/* Error banner (non-blocking) */}
            {error && (
                <div className="mb-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <p className="text-yellow-800 dark:text-yellow-200 text-sm">{error}</p>
                    <button 
                        onClick={() => setError(null)}
                        className="mt-2 text-sm text-yellow-700 dark:text-yellow-300 hover:underline"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto overflow-y-hidden">
                <div className="flex gap-2 min-w-max">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as ContentType)}
                            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                                activeTab === tab.id
                                    ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Captions Tab */}
            {activeTab === 'captions' && (
                <div className="space-y-6">
                    <PlatformTargetingCard />

                    {/* Predict & Repurpose History Section */}
                    {user?.plan !== 'Free' && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent: What's Missing, What To Post Next & Repurposes</h3>
                                <button
                                    onClick={() => {
                                        setShowCaptionsHistory(!showCaptionsHistory);
                                        if (!showCaptionsHistory) {
                                            loadCaptionsHistory();
                                        }
                                    }}
                                    className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2"
                                >
                                    {showCaptionsHistory ? 'Hide' : 'Show'} History
                                    {(captionsPredictHistory.length > 0 || captionsRepurposeHistory.length > 0 || captionsGapAnalysisHistory.length > 0) && (
                                        <span className="w-2 h-2 bg-red-500 rounded-full" title="History available"></span>
                                    )}
                                </button>
                            </div>
                            {showCaptionsHistory && (
                                <>
                                    {loadingCaptionsHistory ? (
                                        <div className="text-center py-8">
                                            <RefreshIcon className="w-6 h-6 animate-spin mx-auto text-primary-600 dark:text-primary-400" />
                                        </div>
                                    ) : (captionsPredictHistory.length === 0 && captionsRepurposeHistory.length === 0 && captionsGapAnalysisHistory.length === 0) ? (
                                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                            <p className="text-sm">No content gap checks, what to post next ideas, or repurposes yet.</p>
                                            <p className="text-xs mt-1">Use the What's Missing, What To Post Next, or Repurpose Content buttons above to see history here.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3 max-h-64 overflow-y-auto">
                                            {/* Predict History */}
                                            {captionsPredictHistory.map((item) => {
                                                const prediction = item.data?.prediction || {};
                                                const level = prediction.level || 'Medium';
                                                const score = prediction.score || 50;
                                                const mediaUrl = item.data?.mediaUrl;
                                                const mediaType = item.data?.mediaType || 'image';
                                                const ideas = item.data?.ideas || item.data?.postIdeas || item.data?.nextPostIdeas;
                                                const hasIdeas = Array.isArray(ideas) && ideas.length > 0;
                                                const ideaTitle = hasIdeas ? (ideas[0]?.title || 'Post idea') : '';
                                                const summary = item.data?.summary || '';
                                                return (
                                                    <div
                                                        key={item.id}
                                                        className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                                    >
                                                        <div className="flex items-start justify-between mb-2 gap-3">
                                                            {mediaUrl && (
                                                                <div className="flex-shrink-0">
                                                                    {mediaType === 'video' ? (
                                                                        <video src={mediaUrl} className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-600" controls={false} muted />
                                                                    ) : (
                                                                        <img src={mediaUrl} alt="Preview" className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-600" />
                                                                    )}
                                                                </div>
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">WHAT TO POST NEXT</span>
                                                                    {!hasIdeas && (
                                                                        <span className={`text-xs px-2 py-0.5 rounded ${
                                                                            level === 'High' ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300' :
                                                                            level === 'Medium' ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300' :
                                                                            'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                                                                        }`}>
                                                                            {level} ({score}/100)
                                                                        </span>
                                                                    )}
                                                                    {hasIdeas && (
                                                                        <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                                                                            {ideas.length} ideas
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {hasIdeas ? (
                                                                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                                                        {ideaTitle}{summary ? ` — ${summary}` : ''}
                                                                    </p>
                                                                ) : (
                                                                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                                                        {item.data?.originalCaption?.substring(0, 100)}...
                                                                    </p>
                                                                )}
                                                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                                                    {item.createdAt?.toDate ? new Date(item.createdAt.toDate()).toLocaleString() : (item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Recently')}
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                                                <button
                                                                    onClick={() => {
                                                                        setPredictResult(item.data);
                                                                        setShowPredictModal(true);
                                                                    }}
                                                                    className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                                                >
                                                                    View
                                                                </button>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeletePredictHistory(item.id);
                                                                    }}
                                                                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                                                                    title="Delete"
                                                                >
                                                                    <TrashIcon className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            
                                            {/* Repurpose History */}
                                            {captionsRepurposeHistory.map((item) => {
                                                const platforms = item.data?.repurposedContent?.length || 0;
                                                const mediaUrl = item.data?.mediaUrl;
                                                const mediaType = item.data?.mediaType || 'image';
                                                return (
                                                    <div
                                                        key={item.id}
                                                        className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                                    >
                                                        <div className="flex items-start justify-between mb-2 gap-3">
                                                            {mediaUrl && (
                                                                <div className="flex-shrink-0">
                                                                    {mediaType === 'video' ? (
                                                                        <video src={mediaUrl} className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-600" controls={false} muted />
                                                                    ) : (
                                                                        <img src={mediaUrl} alt="Preview" className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-600" />
                                                                    )}
                                                                </div>
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">REPURPOSE</span>
                                                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                                                        {platforms} platforms
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                                                    {item.data?.originalContent?.substring(0, 100)}...
                                                                </p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                                                    {item.createdAt?.toDate ? new Date(item.createdAt.toDate()).toLocaleString() : (item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Recently')}
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                                                <button
                                                                    onClick={() => {
                                                                        setRepurposeResult(item.data);
                                                                        setShowRepurposeModal(true);
                                                                    }}
                                                                    className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                                                >
                                                                    View
                                                                </button>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteRepurposeHistory(item.id);
                                                                    }}
                                                                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                                                                    title="Delete"
                                                                >
                                                                    <TrashIcon className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {/* Gap Analysis History */}
                                            {captionsGapAnalysisHistory.map((item) => {
                                                const summary = item.data?.summary || item.title || "What's Missing";
                                                return (
                                                    <div
                                                        key={item.id}
                                                        className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                                    >
                                                        <div className="flex items-start justify-between mb-2 gap-3">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">CONTENT GAP ANALYSIS</span>
                                                                </div>
                                                                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                                                    {summary.substring(0, 100)}...
                                                                </p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                                                    {item.createdAt?.toDate ? new Date(item.createdAt.toDate()).toLocaleString() : (item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Recently')}
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                                                <button
                                                                    onClick={() => {
                                                                        setContentGapAnalysis(item.data);
                                                                        setShowGapAnalysisModal(true);
                                                                    }}
                                                                    className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                                                >
                                                                    View
                                                                </button>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteGapAnalysisHistory(item.id);
                                                                    }}
                                                                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                                                                    title="Delete"
                                                                >
                                                                    <TrashIcon className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Generate AI Captions
                        </h2>
                        
                        <div className="space-y-4">
                            {/* Media Upload Section - Matching MediaBox Style */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Upload Image/Video:
                                </label>
                                {!uploadedMediaPreview ? (
                                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="flex gap-2 w-full">
                                                <input
                                                    type="file"
                                                    accept="image/*,video/*"
                                                    onChange={handleUploadMedia}
                                                    className="hidden"
                                                    id="media-upload-captions"
                                                />
                                                <label
                                                    htmlFor="media-upload-captions"
                                                    className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer text-center text-sm font-medium flex items-center justify-center gap-2"
                                                >
                                                    <UploadIcon className="w-5 h-5" />
                                                    Upload File
                                                </label>
                                                <button
                                                    onClick={() => setShowMediaVaultModal(true)}
                                                    className="flex-1 px-4 py-3 border border-primary-300 dark:border-primary-700 rounded-md bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/50 text-sm font-medium flex items-center justify-center gap-2"
                                                >
                                                    <ImageIcon className="w-5 h-5" />
                                                    From My Vault
                                                </button>
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                Drag and drop or click to upload. Images or Videos (max 20MB)
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="relative border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-700/50">
                                        {uploadedMediaType === 'video' ? (
                                            <video
                                                src={uploadedMediaPreview}
                                                controls
                                                className="w-full max-h-96 rounded-lg"
                                            />
                                        ) : (
                                            <img
                                                src={uploadedMediaPreview}
                                                alt="Preview"
                                                className="w-full max-h-96 object-contain rounded-lg"
                                            />
                                        )}
                                        <button
                                            onClick={() => {
                                                // Clear captions when removing media
                                                setGeneratedCaptions([]);
                                                setCurrentCaptionForAI('');
                                                setEditedCaptions(new Map());
                                                setUsedCaptions(new Set());
                                                setUploadedMediaFile(null);
                                                setUploadedMediaPreview(null);
                                                setUploadedMediaUrl(null);
                                                setUploadedMediaType(null);
                                            }}
                                            className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg"
                                            title="Remove media"
                                        >
                                            <XMarkIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="relative">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Additional Context (Optional):
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setAiHelpField(aiHelpField === 'captions' ? null : 'captions')}
                                        className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                                        title="AI Help"
                                    >
                                        <SparklesIcon className="w-4 h-4" />
                                    </button>
                                </div>
                                <textarea
                                    value={captionPrompt}
                                    onChange={(e) => setCaptionPrompt(e.target.value)}
                                    placeholder={uploadedMediaUrl 
                                        ? "Add specific details or focus you want for the caption (e.g., 'Focus on the lingerie details' or 'Emphasize the mood and lighting'). The AI will analyze the image/video in detail automatically."
                                        : "Describe your content or what you want the caption to focus on (e.g., 'A seductive photoset with lingerie and soft lighting' or 'Behind-the-scenes getting ready video')"}
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[100px]"
                                />
                                {uploadedMediaUrl && (
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                        The AI will automatically analyze your image/video in detail. Use this field to add specific focus or details.
                                    </p>
                                )}
                                {aiHelpField === 'captions' && (
                                    <div
                                        ref={aiHelpRef}
                                        className="absolute z-20 right-0 top-full mt-2 w-full md:w-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 border border-gray-200 dark:border-gray-600"
                                    >
                                        <div className="mb-2">
                                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">AI Help</h4>
                                            <p className="text-xs text-gray-600 dark:text-gray-400">
                                                Add instructions if needed, or leave blank to improve what you wrote.
                                            </p>
                                        </div>
                                        <textarea
                                            value={aiHelpPrompt}
                                            onChange={(e) => setAiHelpPrompt(e.target.value)}
                                            placeholder="e.g., make it more flirty, focus on PPV, add a tease"
                                            rows={3}
                                            className="w-full p-2 text-sm border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 resize-y mb-2"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => runAiHelp(
                                                    captionPrompt,
                                                    aiHelpPrompt,
                                                    { goal: captionGoal, tone: captionTone, platforms: [selectedPlatform] },
                                                    (text) => setCaptionPrompt(text),
                                                    'Additional Context',
                                                )}
                                                disabled={isAiHelpGenerating}
                                                className="flex-1 px-3 py-2 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                                            >
                                                {isAiHelpGenerating ? (
                                                    <>
                                                        <RefreshIcon className="w-3 h-3 animate-spin" />
                                                        Rewriting...
                                                    </>
                                                ) : (
                                                    <>
                                                        <SparklesIcon className="w-3 h-3" />
                                                        Rewrite
                                                    </>
                                                )}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setAiHelpField(null);
                                                    setAiHelpPrompt('');
                                                }}
                                                className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Fan Selector - Dropdown */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Personalize for Fan (Optional):
                                </label>
                                <FanSelector
                                    selectedFanId={selectedFanId}
                                    onSelectFan={(fanId, fanName) => {
                                        setSelectedFanId(fanId);
                                        setSelectedFanName(fanName);
                                        // Preferences will load automatically via useEffect
                                    }}
                                    allowNewFan={true}
                                    compact={true}
                                />
                            </div>

                            {/* Fan Context Card - Show when fan is selected */}
                            {selectedFanId && fanPreferences && (
                                <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-200">
                                            📋 Fan Context: {selectedFanName || 'Selected Fan'}
                                        </h3>
                                        <button
                                            onClick={() => {
                                                setSelectedFanId(null);
                                                setSelectedFanName(null);
                                                setFanPreferences(null);
                                            }}
                                            className="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 text-xs"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                        {fanPreferences.preferredTone && (
                                            <div>
                                                <span className="text-purple-700 dark:text-purple-300 font-medium">Tone:</span>
                                                <span className="ml-1 text-purple-900 dark:text-purple-100">{fanPreferences.preferredTone}</span>
                                            </div>
                                        )}
                                        {fanPreferences.communicationStyle && (
                                            <div>
                                                <span className="text-purple-700 dark:text-purple-300 font-medium">Style:</span>
                                                <span className="ml-1 text-purple-900 dark:text-purple-100">{fanPreferences.communicationStyle}</span>
                                            </div>
                                        )}
                                        {fanPreferences.favoriteSessionType && (
                                            <div>
                                                <span className="text-purple-700 dark:text-purple-300 font-medium">Fav Type:</span>
                                                <span className="ml-1 text-purple-900 dark:text-purple-100 truncate">{fanPreferences.favoriteSessionType.split(' ')[0]}</span>
                                            </div>
                                        )}
                                        {fanPreferences.spendingLevel > 0 && (
                                            <div>
                                                <span className="text-purple-700 dark:text-purple-300 font-medium">Spending:</span>
                                                <span className="ml-1 text-purple-900 dark:text-purple-100">{fanPreferences.spendingLevel}/5</span>
                                            </div>
                                        )}
                                    </div>
                                    {fanPreferences.suggestedFlow && (
                                        <div className="mt-2 text-xs text-purple-800 dark:text-purple-200">
                                            <span className="font-medium">💡 Tip: </span>{fanPreferences.suggestedFlow}
                                        </div>
                                    )}
                                    <p className="mt-2 text-xs text-purple-700 dark:text-purple-300 italic">
                                        Captions will be personalized for this fan's preferences
                                    </p>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Goal:
                                    </label>
                                    <select
                                        value={captionGoal}
                                        onChange={(e) => setCaptionGoal(e.target.value)}
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="engagement">Engagement</option>
                                        <option value="sales">Sales/Monetization</option>
                                        <option value="subscriber-retention">Subscriber Retention</option>
                                        <option value="ppv-promotion">PPV Promotion</option>
                                        <option value="tips-donations">Tips/Donations</option>
                                        <option value="content-upsell">Content Upsell</option>
                                        <option value="brand">Brand Awareness</option>
                                        <option value="followers">Increase Followers/Fans</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Tone:
                                    </label>
                                    <select
                                        value={captionTone}
                                        onChange={(e) => setCaptionTone(e.target.value as any)}
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="Playful">Playful</option>
                                        <option value="Flirty">Flirty</option>
                                        <option value="Confident">Confident</option>
                                        <option value="Teasing">Teasing</option>
                                        <option value="Intimate">Intimate</option>
                                        <option value="Seductive">Seductive</option>
                                        <option value="Erotic">Erotic</option>
                                        <option value="Raw/Uncensored">Raw/Uncensored</option>
                                        <option value="Provocative">Provocative</option>
                                        <option value="Dominant">Dominant</option>
                                        <option value="Submissive">Submissive</option>
                                        <option value="Explicit">Explicit</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setUseCreatorPersonalityCaptions(prev => !prev)}
                                    disabled={!creatorPersonality}
                                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                        useCreatorPersonalityCaptions
                                            ? 'bg-primary-600 text-white hover:bg-primary-700'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    } ${!creatorPersonality ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    title={!creatorPersonality ? 'Add a creator personality in Settings → AI Training to enable' : undefined}
                                >
                                    <SparklesIcon className="w-4 h-4" />
                                    Personality
                                </button>
                            </div>

                            {/* Date and Time Picker - In Main Content Container */}
                            {uploadedMediaUrl && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Schedule Date & Time (Optional):
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={scheduledDate}
                                        onChange={(e) => setScheduledDate(e.target.value)}
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        style={{ colorScheme: 'dark' }}
                                    />
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                        Set a date and time to schedule this post to OnlyFans calendar
                                    </p>
                                </div>
                            )}

                            {/* Generate Captions Button - Always Visible */}
                            <div className="flex gap-2">
                                <button
                                    onClick={handleGenerateCaptions}
                                    disabled={isGenerating}
                                    className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isGenerating ? (
                                        <>
                                            <RefreshIcon className="w-5 h-5 animate-spin" />
                                            Generating...
                                        </>
                                    ) : (
                                        <>
                                            <SparklesIcon className="w-5 h-5" />
                                            Generate Captions
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Generated Captions */}
                    {Array.isArray(generatedCaptions) && generatedCaptions.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Generated Captions
                            </h3>
                            <div className="space-y-3">
                                {generatedCaptions.map((caption, index) => {
                                    // Captions are already filtered out if used, so we don't need to check here
                                    // But we'll keep the check for safety in case a caption becomes used after generation
                                    const encoder = new TextEncoder();
                                    const data = encoder.encode(caption);
                                    const binaryString = Array.from(data, byte => String.fromCharCode(byte)).join('');
                                    const captionHash = btoa(binaryString).substring(0, 50);
                                    const isUsed = usedCaptions.has(index) || usedCaptionsHash.has(captionHash);
                                    
                                    // Don't render used captions at all
                                    if (isUsed) {
                                        return null;
                                    }
                                    
                                    return (
                                    <div
                                        key={index}
                                        className="p-4 rounded-lg border bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600"
                                    >
                                        <textarea
                                            value={editedCaptions.get(index) ?? caption}
                                            onChange={(e) => {
                                                const newEditedCaptions = new Map(editedCaptions);
                                                newEditedCaptions.set(index, e.target.value);
                                                setEditedCaptions(newEditedCaptions);
                                                setCurrentCaptionForAI(e.target.value);
                                            }}
                                            disabled={isUsed}
                                            className={`w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[80px] mb-2 ${
                                                isUsed ? 'opacity-50 cursor-not-allowed' : ''
                                            }`}
                                            placeholder="Edit caption here..."
                                        />
                                        {!isUsed && (
                                            <>
                                                <div className="mb-2">
                                                    <button
                                                        onClick={() => copyToClipboard(editedCaptions.get(index) ?? caption)}
                                                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                                                    >
                                                        <CopyIcon className="w-4 h-4" />
                                                        Copy Caption
                                                    </button>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {uploadedMediaUrl && (
                                                        <>
                                                            <button
                                                                onClick={async () => {
                                                                    // Save as Draft to OnlyFans calendar
                                                                    const captionToSave = editedCaptions.get(index) ?? caption;
                                                                    await handleSaveCaptionToOnlyFansCalendar(captionToSave, [], 'Draft');
                                                                    // Mark as used (persist to Firestore)
                                                                    await markCaptionAsUsed(captionToSave, index);
                                                                }}
                                                                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                                                            >
                                                                Save as Draft
                                                            </button>
                                                            <button
                                                                onClick={async () => {
                                                                    if (!scheduledDate) {
                                                                        showToast?.('Please set a date and time in the main content area above', 'error');
                                                                        return;
                                                                    }
                                                                    try {
                                                                        if (!user || !uploadedMediaUrl) {
                                                                            showToast?.('Please upload media first', 'error');
                                                                            return;
                                                                        }
                                                                        const postId = Date.now().toString();
                                                                        const fullCaption = editedCaptions.get(index) ?? caption;
                                                                        const scheduledDateISO = new Date(scheduledDate).toISOString();
                                                                        // Only save as a post - do NOT create a reminder event
                                                                        const postData = {
                                                                            id: postId,
                                                                            content: fullCaption,
                                                                            mediaUrl: uploadedMediaUrl,
                                                                            mediaType: uploadedMediaType || 'image',
                                                                            platforms: ['OnlyFans'],
                                                                            status: 'Scheduled',
                                                                            scheduledDate: scheduledDateISO,
                                                                            timestamp: new Date().toISOString(),
                                                                        };
                                                                        await setDoc(doc(db, 'users', user.id, 'posts', postId), postData);
                                                                        showToast?.('Added to OnlyFans Calendar!', 'success');
                                                                        setScheduledDate(''); // Clear after scheduling
                                                                        // Mark as used (persist to Firestore)
                                                                        await markCaptionAsUsed(fullCaption, index);
                                                                    } catch (error: any) {
                                                                        console.error('Error saving caption:', error);
                                                                        showToast?.('Failed to save. Please try again.', 'error');
                                                                    }
                                                                }}
                                                                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 px-3 py-1 border border-blue-300 dark:border-blue-600 rounded-md bg-white dark:bg-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                                            >
                                                                Schedule
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>

                            {/* Action Buttons - Always Visible */}
                            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    {/* What's Missing */}
                                    <button
                                        onClick={handleAnalyzeContentGaps}
                                        disabled={isAnalyzingGaps || isPredicting || isRepurposing}
                                        className="px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-all shadow-md hover:shadow-lg"
                                    >
                                        {isAnalyzingGaps ? (
                                            <>
                                                <RefreshIcon className="w-5 h-5 animate-spin" />
                                                Analyzing...
                                            </>
                                        ) : (
                                            <>
                                                <SparklesIcon className="w-5 h-5" />
                                                What's Missing
                                            </>
                                        )}
                                    </button>

                                    {/* What To Post Next */}
                                    <button
                                        onClick={handlePredictPerformance}
                                        disabled={isPredicting || isRepurposing || isAnalyzingGaps || user?.plan === 'Free'}
                                        className={`px-4 py-3 rounded-lg font-medium transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 ${
                                            user?.plan === 'Free'
                                                ? 'text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
                                                : 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed'
                                        }`}
                                    >
                                        {isPredicting ? (
                                            <>
                                                <RefreshIcon className="w-5 h-5 animate-spin" />
                                                Finding ideas...
                                            </>
                                        ) : (
                                            <>
                                                <SparklesIcon className="w-5 h-5" />
                                                What To Post Next
                                            </>
                                        )}
                                    </button>

                                    {/* Repurpose Content */}
                                    <button
                                        onClick={handleRepurposeContent}
                                        disabled={isRepurposing || isPredicting || isAnalyzingGaps || user?.plan === 'Free' || generatedCaptions.length === 0}
                                        className={`px-4 py-3 rounded-lg font-medium transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 ${
                                            user?.plan === 'Free' || generatedCaptions.length === 0
                                                ? 'text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
                                                : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed'
                                        }`}
                                    >
                                        {isRepurposing ? (
                                            <>
                                                <RefreshIcon className="w-5 h-5 animate-spin" />
                                                Repurposing...
                                            </>
                                        ) : (
                                            <>
                                                <SparklesIcon className="w-5 h-5" />
                                                Repurpose Content
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons - Always Visible (even when no captions) */}
                    {generatedCaptions.length === 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {/* What's Missing */}
                                <button
                                    onClick={handleAnalyzeContentGaps}
                                    disabled={isAnalyzingGaps || isPredicting || isRepurposing}
                                    className="px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-all shadow-md hover:shadow-lg"
                                >
                                    {isAnalyzingGaps ? (
                                        <>
                                            <RefreshIcon className="w-5 h-5 animate-spin" />
                                            Analyzing...
                                        </>
                                    ) : (
                                        <>
                                            <SparklesIcon className="w-5 h-5" />
                                            What's Missing
                                        </>
                                    )}
                                </button>

                                {/* What To Post Next */}
                                <button
                                    onClick={handlePredictPerformance}
                                    disabled={isPredicting || isRepurposing || isAnalyzingGaps || user?.plan === 'Free'}
                                    className={`px-4 py-3 rounded-lg font-medium transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 ${
                                        user?.plan === 'Free'
                                            ? 'text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
                                            : 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed'
                                    }`}
                                >
                                    {isPredicting ? (
                                        <>
                                            <RefreshIcon className="w-5 h-5 animate-spin" />
                                            Finding ideas...
                                        </>
                                    ) : (
                                        <>
                                            <SparklesIcon className="w-5 h-5" />
                                            What To Post Next
                                        </>
                                    )}
                                </button>

                                {/* Repurpose Content */}
                                <button
                                    onClick={handleRepurposeContent}
                                    disabled={isRepurposing || isPredicting || isAnalyzingGaps || user?.plan === 'Free' || generatedCaptions.length === 0}
                                    className={`px-4 py-3 rounded-lg font-medium transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 ${
                                        user?.plan === 'Free' || generatedCaptions.length === 0
                                            ? 'text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
                                            : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed'
                                    }`}
                                >
                                    {isRepurposing ? (
                                        <>
                                            <RefreshIcon className="w-5 h-5 animate-spin" />
                                            Repurposing...
                                        </>
                                    ) : (
                                        <>
                                            <SparklesIcon className="w-5 h-5" />
                                            Repurpose Content
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Media Captions Tab - Hidden but kept for stability */}
            {false && activeTab === 'mediaCaptions' && (
                <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Generate Captions from Image/Video
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Upload Image or Video:
                                </label>
                                {!mediaPreview ? (
                                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                                        <input
                                            type="file"
                                            accept="image/*,video/*"
                                            onChange={handleMediaFileChange}
                                            className="hidden"
                                            id="media-upload"
                                        />
                                        <label
                                            htmlFor="media-upload"
                                            className="cursor-pointer flex flex-col items-center gap-2"
                                        >
                                            <UploadIcon className="w-12 h-12 text-gray-400" />
                                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                                Click to upload or drag and drop
                                            </span>
                                            <span className="text-xs text-gray-500 dark:text-gray-500">
                                                Images or Videos (max 20MB)
                                            </span>
                                        </label>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        {mediaFile?.type.startsWith('video/') ? (
                                            <video
                                                src={mediaPreview || undefined}
                                                controls
                                                className="w-full max-h-96 rounded-lg"
                                            />
                                        ) : (
                                            <img
                                                src={mediaPreview || undefined}
                                                alt="Preview"
                                                className="w-full max-h-96 object-contain rounded-lg"
                                            />
                                        )}
                                        <button
                                            onClick={() => {
                                                setMediaFile(null);
                                                setMediaPreview(null);
                                            }}
                                            className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600"
                                        >
                                            <XMarkIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Additional Context (Optional):
                                </label>
                                <textarea
                                    value={mediaCaptionPrompt}
                                    onChange={(e) => setMediaCaptionPrompt(e.target.value)}
                                    placeholder="Add any specific details or focus you want for the caption..."
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[80px]"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Goal:
                                    </label>
                                    <select
                                        value={mediaCaptionGoal}
                                        onChange={(e) => setMediaCaptionGoal(e.target.value)}
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="engagement">Engagement</option>
                                        <option value="sales">Sales/Monetization</option>
                                        <option value="subscriber-retention">Subscriber Retention</option>
                                        <option value="ppv-promotion">PPV Promotion</option>
                                        <option value="tips-donations">Tips/Donations</option>
                                        <option value="content-upsell">Content Upsell</option>
                                        <option value="brand">Brand Awareness</option>
                                        <option value="followers">Increase Followers/Fans</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Tone:
                                    </label>
                                    <select
                                        value={mediaCaptionTone}
                                        onChange={(e) => setMediaCaptionTone(e.target.value as any)}
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="Playful">Playful</option>
                                        <option value="Flirty">Flirty</option>
                                        <option value="Confident">Confident</option>
                                        <option value="Teasing">Teasing</option>
                                        <option value="Intimate">Intimate</option>
                                        <option value="Seductive">Seductive</option>
                                        <option value="Erotic">Erotic</option>
                                        <option value="Raw/Uncensored">Raw/Uncensored</option>
                                        <option value="Provocative">Provocative</option>
                                        <option value="Dominant">Dominant</option>
                                        <option value="Submissive">Submissive</option>
                                        <option value="Explicit">Explicit</option>
                                    </select>
                                </div>
                            </div>

                            <button
                                onClick={handleGenerateMediaCaptions}
                                disabled={isGenerating || !mediaFile}
                                className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isGenerating ? (
                                    <>
                                        <RefreshIcon className="w-5 h-5 animate-spin" />
                                        Analyzing media and generating...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5" />
                                        Generate Captions
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Generated Media Captions */}
                    {Array.isArray(generatedMediaCaptions) && generatedMediaCaptions.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Generated Captions
                            </h3>
                            <div className="space-y-3">
                                {generatedMediaCaptions.map((result, index) => (
                                    <div
                                        key={index}
                                        className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                    >
                                        <p className="text-gray-900 dark:text-white mb-2">{result.caption}</p>
                                        {result.hashtags && result.hashtags.length > 0 && (
                                            <p className="text-primary-600 dark:text-primary-400 text-sm mb-3">
                                                {result.hashtags.join(' ')}
                                            </p>
                                        )}
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                onClick={() => copyToClipboard(`${result.caption} ${(result.hashtags || []).join(' ')}`.trim())}
                                                className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                            >
                                                Copy
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Post Ideas Tab */}
            {activeTab === 'postIdeas' && (
                <div className="space-y-6">
                    <PlatformTargetingCard />
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                Generate Post Ideas
                            </h2>
                            {savedPostIdeas.length > 0 && (
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                    {savedPostIdeas.length} saved
                                </span>
                            )}
                        </div>
                        
                        <div className="space-y-4">
                            <div className="relative">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        What kind of post ideas are you looking for?
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setAiHelpField(aiHelpField === 'postIdeas' ? null : 'postIdeas')}
                                        className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                                        title="AI Help"
                                    >
                                        <SparklesIcon className="w-4 h-4" />
                                    </button>
                                </div>
                                <textarea
                                    value={postIdeaPrompt}
                                    onChange={(e) => setPostIdeaPrompt(e.target.value)}
                                    placeholder="e.g., 'Interactive content to boost engagement' or 'Behind-the-scenes content ideas'"
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[100px]"
                                />
                                {aiHelpField === 'postIdeas' && (
                                    <div
                                        ref={aiHelpRef}
                                        className="absolute z-20 right-0 top-full mt-2 w-full md:w-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 border border-gray-200 dark:border-gray-600"
                                    >
                                        <div className="mb-2">
                                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">AI Help</h4>
                                            <p className="text-xs text-gray-600 dark:text-gray-400">
                                                Add instructions or leave blank to refine what you wrote.
                                            </p>
                                        </div>
                                        <textarea
                                            value={aiHelpPrompt}
                                            onChange={(e) => setAiHelpPrompt(e.target.value)}
                                            placeholder="e.g., more teaser-heavy, focus on PPV, add engagement"
                                            rows={3}
                                            className="w-full p-2 text-sm border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 resize-y mb-2"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => runAiHelp(
                                                    postIdeaPrompt,
                                                    aiHelpPrompt,
                                                    { goal: 'post ideas', tone: captionTone, platforms: [selectedPlatform] },
                                                    (text) => setPostIdeaPrompt(text),
                                                    'Post Ideas Prompt',
                                                )}
                                                disabled={isAiHelpGenerating}
                                                className="flex-1 px-3 py-2 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                                            >
                                                {isAiHelpGenerating ? (
                                                    <>
                                                        <RefreshIcon className="w-3 h-3 animate-spin" />
                                                        Rewriting...
                                                    </>
                                                ) : (
                                                    <>
                                                        <SparklesIcon className="w-3 h-3" />
                                                        Rewrite
                                                    </>
                                                )}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setAiHelpField(null);
                                                    setAiHelpPrompt('');
                                                }}
                                                className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setUseCreatorPersonalityPostIdeas(prev => !prev)}
                                    disabled={!creatorPersonality}
                                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                        useCreatorPersonalityPostIdeas
                                            ? 'bg-primary-600 text-white hover:bg-primary-700'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    } ${!creatorPersonality ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    title={!creatorPersonality ? 'Add a creator personality in Settings → AI Training to enable' : undefined}
                                >
                                    <SparklesIcon className="w-4 h-4" />
                                    Personality
                                </button>
                            </div>


                            <button
                                onClick={handleGeneratePostIdeas}
                                disabled={isGenerating}
                                className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isGenerating ? (
                                    <>
                                        <RefreshIcon className="w-5 h-5 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5" />
                                        Generate Post Ideas
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Saved Post Ideas ({savedPostIdeas.length})
                            </h3>
                        </div>
                        {savedPostIdeas.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">No saved post ideas yet.</p>
                        ) : (
                            <div className="space-y-3 max-h-64 overflow-y-auto">
                                {savedPostIdeas.map((saved, index) => {
                                    const mediaUrl = saved.data?.mediaUrl;
                                    const mediaType = saved.data?.mediaType || 'image';
                                    return (
                                        <div
                                            key={saved.id || index}
                                            className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                        >
                                            <div className="flex items-start justify-between mb-2 gap-3">
                                                {mediaUrl && (
                                                    <div className="flex-shrink-0">
                                                        {mediaType === 'video' ? (
                                                            <video src={mediaUrl} className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-600" />
                                                        ) : (
                                                            <img src={mediaUrl} alt="Preview" className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-600" />
                                                        )}
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                        {saved.title || `Saved ${new Date(saved.createdAt?.toDate?.() || saved.createdAt).toLocaleDateString()}`}
                                                    </p>
                                                    {saved.data?.ideas && Array.isArray(saved.data.ideas) && saved.data.ideas.length > 0 && (
                                                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                                            {saved.data.ideas[0]?.substring(0, 100)}...
                                                        </p>
                                                    )}
                                                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                                        {saved.createdAt?.toDate?.() ? new Date(saved.createdAt.toDate()).toLocaleString() : 'Recently'}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                                    <button
                                                        onClick={() => {
                                                            setViewingSavedItem(saved);
                                                            setShowSavedItemModal(true);
                                                        }}
                                                        className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                                    >
                                                        View
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteSavedItem(saved.id, 'post_ideas');
                                                        }}
                                                        className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                                                        title="Delete"
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Generated Post Ideas */}
                    {Array.isArray(generatedPostIdeas) && generatedPostIdeas.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Post Ideas
                            </h3>
                            <div className="space-y-3">
                                {generatedPostIdeas.map((idea, index) => (
                                    <div
                                        key={index}
                                        className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                    >
                                        <p className="text-gray-900 dark:text-white">{idea}</p>
                                        <button
                                            onClick={() => copyToClipboard(idea)}
                                            className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Trends Tab */}
            {activeTab === 'trends' && (
                <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                Find Trends
                            </h2>
                            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                                <span>Usage: {monthlyTrendsUsed}/10</span>
                                {trendsLastScanDate && (
                                    <span>Updated {new Date(trendsLastScanDate).toLocaleDateString()}</span>
                                )}
                                <button
                                    onClick={() => setShowTrendsHistory(!showTrendsHistory)}
                                    className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2"
                                >
                                    {showTrendsHistory ? 'Hide' : 'Show'} History
                                    {trendsHistory.length > 0 && (
                                        <span className="w-2 h-2 bg-red-500 rounded-full" title="History available"></span>
                                    )}
                                </button>
                            </div>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            Pulls adult creator trends (updated twice weekly) for OnlyFans, Fansly, and Fanvue.
                        </p>

                        <div className="flex flex-col md:flex-row gap-3">
                            <input
                                value={trendsNiche}
                                onChange={(e) => setTrendsNiche(e.target.value)}
                                placeholder="e.g., adult content, lingerie sets, girlfriend experience"
                                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <button
                                onClick={handleFindAdultTrends}
                                disabled={isTrendsLoading}
                                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isTrendsLoading ? (
                                    <>
                                        <RefreshIcon className="w-4 h-4 animate-spin" />
                                        Scanning...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-4 h-4" />
                                        Find Trends
                                    </>
                                )}
                            </button>
                        </div>

                        {trendsError && (
                            <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 rounded-lg">
                                <p className="text-sm text-red-600 dark:text-red-400">{trendsError}</p>
                            </div>
                        )}
                    </div>

                    {trendResults.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Top Trends</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Found {trendResults.length} opportunities for "{trendsNiche || 'adult content'}"
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <select
                                        value={trendFilterPlatform}
                                        onChange={(e) => setTrendFilterPlatform(e.target.value as typeof trendFilterPlatform)}
                                        className="px-3 py-2 text-xs border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                    >
                                        <option value="All">All Platforms</option>
                                        <option value="OnlyFans">OnlyFans</option>
                                        <option value="Fansly">Fansly</option>
                                        <option value="Fanvue">Fanvue</option>
                                    </select>
                                    <select
                                        value={trendFilterType}
                                        onChange={(e) => setTrendFilterType(e.target.value as typeof trendFilterType)}
                                        className="px-3 py-2 text-xs border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                    >
                                        <option value="All">All Types</option>
                                        <option value="Trending Theme">Trending Themes</option>
                                        <option value="PPV Angle">PPV Angles</option>
                                        <option value="Interactive Trend">Interactive Trends</option>
                                        <option value="Bundle/Offer">Bundle/Offer</option>
                                        <option value="Content Gap">Content Gaps</option>
                                    </select>
                                    <select
                                        value={trendSortBy}
                                        onChange={(e) => setTrendSortBy(e.target.value as typeof trendSortBy)}
                                        className="px-3 py-2 text-xs border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                    >
                                        <option value="engagement">Sort by Engagement</option>
                                        <option value="trending">Sort by Trending</option>
                                        <option value="relevance">Sort by Relevance</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {(() => {
                                    let filtered = trendResults.filter((opp) => {
                                        const platformMatch = trendFilterPlatform === 'All' || opp.platform === trendFilterPlatform;
                                        const typeMatch = trendFilterType === 'All' || opp.type === trendFilterType;
                                        return platformMatch && typeMatch;
                                    });

                                    filtered.sort((a, b) => {
                                        if (trendSortBy === 'engagement') {
                                            return (b.engagementPotential || 0) - (a.engagementPotential || 0);
                                        }
                                        if (trendSortBy === 'trending') {
                                            const velocityOrder: Record<string, number> = { Peak: 3, Rising: 2, Declining: 1 };
                                            return (velocityOrder[b.trendingVelocity || 'Rising'] || 0) - (velocityOrder[a.trendingVelocity || 'Rising'] || 0);
                                        }
                                        return 0;
                                    });

                                    const typeColors: Record<string, string> = {
                                        'Trending Theme': 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
                                        'PPV Angle': 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200',
                                        'Interactive Trend': 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
                                        'Bundle/Offer': 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200',
                                        'Content Gap': 'bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-200',
                                    };
                                    const velocityColors: Record<string, string> = {
                                        Rising: 'text-green-600 dark:text-green-400',
                                        Peak: 'text-red-600 dark:text-red-400',
                                        Declining: 'text-yellow-600 dark:text-yellow-400',
                                    };

                                    return filtered.map((result) => (
                                        <div key={result.id} className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                                            <div className="flex items-start justify-between gap-3 mb-2">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${typeColors[result.type] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}`}>
                                                        {result.type}
                                                    </span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">{result.platform}</span>
                                                    {result.trendingVelocity && (
                                                        <span className={`text-xs font-medium ${velocityColors[result.trendingVelocity] || ''}`}>
                                                            {result.trendingVelocity === 'Rising' && '📈'}
                                                            {result.trendingVelocity === 'Peak' && '🔥'}
                                                            {result.trendingVelocity === 'Declining' && '📉'}
                                                            {result.trendingVelocity}
                                                        </span>
                                                    )}
                                                </div>
                                                {result.engagementPotential && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                        Potential {result.engagementPotential}/10
                                                    </div>
                                                )}
                                            </div>
                                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{result.title}</h4>
                                            <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">{result.description}</p>
                                            {result.relatedHashtags && result.relatedHashtags.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mb-2">
                                                    {result.relatedHashtags.map((tag, idx) => (
                                                        <span key={`${tag}-${idx}`} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            {result.bestPractices && (
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    <span className="font-semibold">Tip:</span> {result.bestPractices}
                                                </p>
                                            )}
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>
                    )}

                    {showTrendsHistory && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">History</h3>
                            {trendsHistory.length === 0 ? (
                                <p className="text-sm text-gray-500 dark:text-gray-400">No scans yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {trendsHistory.map((item) => (
                                        <div key={item.id} className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 py-2">
                                            <span className="truncate max-w-[70%]">{item.query || 'Trend scan'}</span>
                                            <span className="text-gray-400 dark:text-gray-500">
                                                {item.createdAt?.toDate?.()?.toLocaleDateString?.() || new Date(item.createdAt || Date.now()).toLocaleDateString()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Shoot Concepts Tab */}
            {activeTab === 'shootConcepts' && (
                <div className="space-y-6">
                    <PlatformTargetingCard />
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                Generate Shoot Concepts
                            </h2>
                            {savedShootConcepts.length > 0 && (
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                    {savedShootConcepts.length} saved
                                </span>
                            )}
                        </div>
                        
                        <div className="space-y-4">
                            <div className="relative">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Describe the type of shoot concept you want:
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setAiHelpField(aiHelpField === 'shootConcepts' ? null : 'shootConcepts')}
                                        className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                                        title="AI Help"
                                    >
                                        <SparklesIcon className="w-4 h-4" />
                                    </button>
                                </div>
                                <textarea
                                    value={shootConceptPrompt}
                                    onChange={(e) => setShootConceptPrompt(e.target.value)}
                                    placeholder="e.g., 'Boudoir photoset with vintage vibes' or 'Intimate bedroom scene with natural lighting'"
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[100px]"
                                />
                                {aiHelpField === 'shootConcepts' && (
                                    <div
                                        ref={aiHelpRef}
                                        className="absolute z-20 right-0 top-full mt-2 w-full md:w-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 border border-gray-200 dark:border-gray-600"
                                    >
                                        <div className="mb-2">
                                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">AI Help</h4>
                                            <p className="text-xs text-gray-600 dark:text-gray-400">
                                                Add instructions or leave blank to refine what you wrote.
                                            </p>
                                        </div>
                                        <textarea
                                            value={aiHelpPrompt}
                                            onChange={(e) => setAiHelpPrompt(e.target.value)}
                                            placeholder="e.g., more cinematic, tease a PPV set, soft lighting"
                                            rows={3}
                                            className="w-full p-2 text-sm border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 resize-y mb-2"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => runAiHelp(
                                                    shootConceptPrompt,
                                                    aiHelpPrompt,
                                                    { goal: 'shoot concepts', tone: captionTone, platforms: [selectedPlatform] },
                                                    (text) => setShootConceptPrompt(text),
                                                    'Shoot Concepts Prompt',
                                                )}
                                                disabled={isAiHelpGenerating}
                                                className="flex-1 px-3 py-2 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                                            >
                                                {isAiHelpGenerating ? (
                                                    <>
                                                        <RefreshIcon className="w-3 h-3 animate-spin" />
                                                        Rewriting...
                                                    </>
                                                ) : (
                                                    <>
                                                        <SparklesIcon className="w-3 h-3" />
                                                        Rewrite
                                                    </>
                                                )}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setAiHelpField(null);
                                                    setAiHelpPrompt('');
                                                }}
                                                className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setUseCreatorPersonalityShootConcepts(prev => !prev)}
                                    disabled={!creatorPersonality}
                                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                        useCreatorPersonalityShootConcepts
                                            ? 'bg-primary-600 text-white hover:bg-primary-700'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    } ${!creatorPersonality ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    title={!creatorPersonality ? 'Add a creator personality in Settings → AI Training to enable' : undefined}
                                >
                                    <SparklesIcon className="w-4 h-4" />
                                    Personality
                                </button>
                            </div>


                            <button
                                onClick={handleGenerateShootConcepts}
                                disabled={isGenerating}
                                className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isGenerating ? (
                                    <>
                                        <RefreshIcon className="w-5 h-5 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5" />
                                        Generate Shoot Concepts
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Saved Shoot Concepts */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Saved Shoot Concepts ({savedShootConcepts.length})
                            </h3>
                        </div>
                        {savedShootConcepts.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">No saved shoot concepts yet.</p>
                        ) : (
                            <div className="space-y-3 max-h-64 overflow-y-auto">
                                {savedShootConcepts.map((saved, index) => {
                                    const mediaUrl = saved.data?.mediaUrl;
                                    const mediaType = saved.data?.mediaType || 'image';
                                    return (
                                        <div
                                            key={saved.id || index}
                                            className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                        >
                                            <div className="flex items-start justify-between mb-2 gap-3">
                                                {mediaUrl && (
                                                    <div className="flex-shrink-0">
                                                        {mediaType === 'video' ? (
                                                            <video src={mediaUrl} className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-600" />
                                                        ) : (
                                                            <img src={mediaUrl} alt="Preview" className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-600" />
                                                        )}
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                        {saved.title || `Saved ${new Date(saved.createdAt?.toDate?.() || saved.createdAt).toLocaleDateString()}`}
                                                    </p>
                                                    {saved.data?.concepts && Array.isArray(saved.data.concepts) && saved.data.concepts.length > 0 && (
                                                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                                            {saved.data.concepts[0]?.substring(0, 100)}...
                                                        </p>
                                                    )}
                                                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                                        {saved.createdAt?.toDate?.() ? new Date(saved.createdAt.toDate()).toLocaleString() : 'Recently'}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                                    <button
                                                        onClick={() => {
                                                            setViewingSavedItem(saved);
                                                            setShowSavedItemModal(true);
                                                        }}
                                                        className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                                    >
                                                        View
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteSavedItem(saved.id, 'shoot_concepts');
                                                        }}
                                                        className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                                                        title="Delete"
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Generated Shoot Concepts */}
                    {Array.isArray(generatedShootConcepts) && generatedShootConcepts.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Shoot Concepts
                            </h3>
                            <div className="space-y-4">
                                {generatedShootConcepts.map((concept, index) => (
                                    <div
                                        key={index}
                                        className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                    >
                                        <p className="text-gray-900 dark:text-white whitespace-pre-line">{concept}</p>
                                        <button
                                            onClick={() => copyToClipboard(concept)}
                                            className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Weekly Plan Tab */}
            {activeTab === 'weeklyPlan' && (
                <div className="space-y-6">
                    <PlatformTargetingCard />
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                Generate Weekly Content Plan
                            </h2>
                            {savedWeeklyPlans.length > 0 && (
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                    {savedWeeklyPlans.length} saved
                                </span>
                            )}
                        </div>
                        
                        <div className="space-y-4">
                            <div className="relative">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Your goals or preferences for the week:
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setAiHelpField(aiHelpField === 'weeklyPlan' ? null : 'weeklyPlan')}
                                        className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                                        title="AI Help"
                                    >
                                        <SparklesIcon className="w-4 h-4" />
                                    </button>
                                </div>
                                <textarea
                                    value={weeklyPlanPrompt}
                                    onChange={(e) => setWeeklyPlanPrompt(e.target.value)}
                                    placeholder="e.g., 'Focus on intimate content and behind-the-scenes this week' or 'Mix of photosets, videos, and interactive posts'"
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[100px]"
                                />
                                {aiHelpField === 'weeklyPlan' && (
                                    <div
                                        ref={aiHelpRef}
                                        className="absolute z-20 right-0 top-full mt-2 w-full md:w-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 border border-gray-200 dark:border-gray-600"
                                    >
                                        <div className="mb-2">
                                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">AI Help</h4>
                                            <p className="text-xs text-gray-600 dark:text-gray-400">
                                                Add instructions or leave blank to refine what you wrote.
                                            </p>
                                        </div>
                                        <textarea
                                            value={aiHelpPrompt}
                                            onChange={(e) => setAiHelpPrompt(e.target.value)}
                                            placeholder="e.g., 1 PPV drop, 2 teasers, 1 session, win-back focus"
                                            rows={3}
                                            className="w-full p-2 text-sm border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 resize-y mb-2"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => runAiHelp(
                                                    weeklyPlanPrompt,
                                                    aiHelpPrompt,
                                                    { goal: 'weekly plan', tone: captionTone, platforms: [selectedPlatform] },
                                                    (text) => setWeeklyPlanPrompt(text),
                                                    'Weekly Plan Goals',
                                                )}
                                                disabled={isAiHelpGenerating}
                                                className="flex-1 px-3 py-2 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                                            >
                                                {isAiHelpGenerating ? (
                                                    <>
                                                        <RefreshIcon className="w-3 h-3 animate-spin" />
                                                        Rewriting...
                                                    </>
                                                ) : (
                                                    <>
                                                        <SparklesIcon className="w-3 h-3" />
                                                        Rewrite
                                                    </>
                                                )}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setAiHelpField(null);
                                                    setAiHelpPrompt('');
                                                }}
                                                className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setUseCreatorPersonalityWeeklyPlan(prev => !prev)}
                                    disabled={!creatorPersonality}
                                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                        useCreatorPersonalityWeeklyPlan
                                            ? 'bg-primary-600 text-white hover:bg-primary-700'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    } ${!creatorPersonality ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    title={!creatorPersonality ? 'Add a creator personality in Settings → AI Training to enable' : undefined}
                                >
                                    <SparklesIcon className="w-4 h-4" />
                                    Personality
                                </button>
                            </div>


                            <button
                                onClick={handleGenerateWeeklyPlan}
                                disabled={isGenerating}
                                className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isGenerating ? (
                                    <>
                                        <RefreshIcon className="w-5 h-5 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5" />
                                        Generate Weekly Plan
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Saved Weekly Plans */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Saved Weekly Plans ({savedWeeklyPlans.length})
                            </h3>
                        </div>
                        {savedWeeklyPlans.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">No saved weekly plans yet.</p>
                        ) : (
                            <div className="space-y-3 max-h-64 overflow-y-auto">
                                {savedWeeklyPlans.map((saved, index) => {
                                    const mediaUrl = saved.data?.mediaUrl;
                                    const mediaType = saved.data?.mediaType || 'image';
                                    return (
                                        <div
                                            key={saved.id || index}
                                            className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                        >
                                            <div className="flex items-start justify-between mb-2 gap-3">
                                                {mediaUrl && (
                                                    <div className="flex-shrink-0">
                                                        {mediaType === 'video' ? (
                                                            <video src={mediaUrl} className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-600" />
                                                        ) : (
                                                            <img src={mediaUrl} alt="Preview" className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-600" />
                                                        )}
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                        {saved.title || `Saved ${new Date(saved.createdAt?.toDate?.() || saved.createdAt).toLocaleDateString()}`}
                                                    </p>
                                                    {saved.data?.plan && (
                                                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                                            {getWeeklyPlanSummary(saved.data.plan)}
                                                        </p>
                                                    )}
                                                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                                        {saved.createdAt?.toDate?.() ? new Date(saved.createdAt.toDate()).toLocaleString() : 'Recently'}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                                    <button
                                                        onClick={() => {
                                                            setViewingSavedItem(saved);
                                                            setShowSavedItemModal(true);
                                                        }}
                                                        className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                                    >
                                                        View
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteSavedItem(saved.id, 'weekly_plan');
                                                        }}
                                                        className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                                                        title="Delete"
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Generated Weekly Plan */}
                    {generatedWeeklyPlan && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Weekly Content Plan
                                </h3>
                                <button
                                    onClick={() => {
                                        const textToCopy = typeof generatedWeeklyPlan === 'string' 
                                            ? generatedWeeklyPlan 
                                            : JSON.stringify(generatedWeeklyPlan, null, 2);
                                        copyToClipboard(textToCopy);
                                    }}
                                    className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
                                >
                                    <DownloadIcon className="w-4 h-4" />
                                    Copy
                                </button>
                            </div>
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                <WeeklyPlanFormatter
                                    plan={generatedWeeklyPlan}
                                    uploadMenuKey={weeklyPlanUploadMenuKey}
                                    cardStateByKey={weeklyPlanCardState}
                                    onToggleUploadMenu={setWeeklyPlanUploadMenuKey}
                                    onUploadFile={handleWeeklyPlanUploadFile}
                                    onSelectFromVault={handleWeeklyPlanSelectFromVault}
                                    onGenerateCaption={handleWeeklyPlanGenerateCaption}
                                    onAddToCalendar={handleWeeklyPlanAddToCalendar}
                                    onToggleSchedulePicker={handleWeeklyPlanToggleSchedulePicker}
                                    onConfirmSchedule={handleWeeklyPlanConfirmSchedule}
                                    onUpdateScheduleDate={handleWeeklyPlanUpdateScheduleDate}
                                    onUpdateScheduleTime={handleWeeklyPlanUpdateScheduleTime}
                                    onCopyForExport={handleWeeklyPlanCopyForExport}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}


            {/* Monetization Planner Tab */}
            {activeTab === 'monetizationPlanner' && (
                <div className="space-y-6">
                    <PlatformTargetingCard />
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                AI Monetization Planner
                            </h2>
                            {savedMonetizationPlans.length > 0 && (
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                    {savedMonetizationPlans.length} saved
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                            Generate a balanced content strategy that labels each idea as Engagement, Upsell, Retention, or Conversion. 
                            Automatically balances your content mix to prevent over-selling.
                        </p>
                        
                        <div className="space-y-4">
                            {/* Goals Input */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Your Monetization Goals (add multiple):
                                </label>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {monetizationGoals.map((goal, index) => (
                                        <span
                                            key={index}
                                            className="px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-sm flex items-center gap-2"
                                        >
                                            {goal}
                                            <button
                                                onClick={() => setMonetizationGoals(monetizationGoals.filter((_, i) => i !== index))}
                                                className="text-primary-500 hover:text-primary-700 dark:hover:text-primary-200"
                                            >
                                                <XMarkIcon className="w-4 h-4" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="e.g., Increase paid subscribers, Retain existing fans, Upsell premium content"
                                        className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                                setMonetizationGoals([...monetizationGoals, e.currentTarget.value.trim()]);
                                                e.currentTarget.value = '';
                                            }
                                        }}
                                    />
                                    <button
                                        onClick={(e) => {
                                            const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                            if (input.value.trim()) {
                                                setMonetizationGoals([...monetizationGoals, input.value.trim()]);
                                                input.value = '';
                                            }
                                        }}
                                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>

                            {/* Content Preferences */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Content Preferences (Optional):
                                </label>
                                <textarea
                                    value={monetizationPreferences}
                                    onChange={(e) => setMonetizationPreferences(e.target.value)}
                                    placeholder="e.g., 'Intimate content', 'Behind-the-scenes', 'Interactive posts'"
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[80px]"
                                />
                            </div>

                            {/* Subscriber Count */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Current Subscriber Count (Optional):
                                </label>
                                <input
                                    type="number"
                                    value={subscriberCount}
                                    onChange={(e) => setSubscriberCount(e.target.value ? parseInt(e.target.value) : '')}
                                    placeholder="e.g., 500"
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>

                            {/* Balance Sliders */}
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                <div className="flex items-center justify-between mb-4">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Content Balance (%):
                                    </label>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                setBalanceEngagement(40);
                                                setBalanceUpsell(30);
                                                setBalanceRetention(20);
                                                setBalanceConversion(10);
                                            }}
                                            className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                                        >
                                            Reset to Default
                                        </button>
                                    </div>
                                </div>
                                <div className="mb-3 flex flex-wrap gap-2">
                                    <button
                                        onClick={() => {
                                            setBalanceEngagement(50);
                                            setBalanceUpsell(25);
                                            setBalanceRetention(20);
                                            setBalanceConversion(5);
                                        }}
                                        className="text-xs px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded hover:bg-primary-200 dark:hover:bg-primary-900/50"
                                    >
                                        Engagement Focus (50/25/20/5)
                                    </button>
                                    <button
                                        onClick={() => {
                                            setBalanceEngagement(35);
                                            setBalanceUpsell(35);
                                            setBalanceRetention(20);
                                            setBalanceConversion(10);
                                        }}
                                        className="text-xs px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded hover:bg-orange-200 dark:hover:bg-orange-900/50"
                                    >
                                        Balanced (35/35/20/10)
                                    </button>
                                    <button
                                        onClick={() => {
                                            setBalanceEngagement(30);
                                            setBalanceUpsell(30);
                                            setBalanceRetention(30);
                                            setBalanceConversion(10);
                                        }}
                                        className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50"
                                    >
                                        Retention Focus (30/30/30/10)
                                    </button>
                                </div>
                                <div className="space-y-4">
                                    {/* Engagement */}
                                    <div>
                                        <div className="flex justify-between mb-1">
                                            <span className="text-sm text-gray-700 dark:text-gray-300">Engagement (Free Content)</span>
                                            <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">{balanceEngagement}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={balanceEngagement}
                                            onChange={(e) => setBalanceEngagement(parseInt(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>
                                    {/* Upsell */}
                                    <div>
                                        <div className="flex justify-between mb-1">
                                            <span className="text-sm text-gray-700 dark:text-gray-300">Upsell (Tease Premium)</span>
                                            <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">{balanceUpsell}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={balanceUpsell}
                                            onChange={(e) => setBalanceUpsell(parseInt(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>
                                    {/* Retention */}
                                    <div>
                                        <div className="flex justify-between mb-1">
                                            <span className="text-sm text-gray-700 dark:text-gray-300">Retention (Keep Subscribers)</span>
                                            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{balanceRetention}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={balanceRetention}
                                            onChange={(e) => setBalanceRetention(parseInt(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>
                                    {/* Conversion */}
                                    <div>
                                        <div className="flex justify-between mb-1">
                                            <span className="text-sm text-gray-700 dark:text-gray-300">Conversion (Direct Sales)</span>
                                            <span className="text-sm font-semibold text-green-600 dark:text-green-400">{balanceConversion}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={balanceConversion}
                                            onChange={(e) => setBalanceConversion(parseInt(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-600 dark:text-gray-400">Total:</span>
                                        <span className={`text-sm font-bold ${Math.abs((balanceEngagement + balanceUpsell + balanceRetention + balanceConversion) - 100) <= 1 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                            {balanceEngagement + balanceUpsell + balanceRetention + balanceConversion}%
                                        </span>
                                    </div>
                                    {Math.abs((balanceEngagement + balanceUpsell + balanceRetention + balanceConversion) - 100) > 1 && (
                                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">Balance must total 100%</p>
                                    )}
                                </div>
                            </div>


                            <button
                                onClick={handleGenerateMonetizationPlan}
                                disabled={isGenerating || monetizationGoals.length === 0 || Math.abs((balanceEngagement + balanceUpsell + balanceRetention + balanceConversion) - 100) > 1}
                                className="w-full px-4 py-3 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-all shadow-md hover:shadow-lg"
                            >
                                {isGenerating ? (
                                    <>
                                        <RefreshIcon className="w-5 h-5 animate-spin" />
                                        Generating Monetization Plan...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5" />
                                        Generate Monetization Plan
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Saved Monetization Plans */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Saved Monetization Plans ({savedMonetizationPlans.length})
                            </h3>
                        </div>
                        {savedMonetizationPlans.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">No saved monetization plans yet.</p>
                        ) : (
                            <div className="space-y-3 max-h-64 overflow-y-auto">
                                {savedMonetizationPlans.map((saved, index) => {
                                    const mediaUrl = saved.data?.mediaUrl;
                                    const mediaType = saved.data?.mediaType || 'image';
                                    return (
                                        <div
                                            key={saved.id || index}
                                            className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                        >
                                            <div className="flex items-start justify-between mb-2 gap-3">
                                                {mediaUrl && (
                                                    <div className="flex-shrink-0">
                                                        {mediaType === 'video' ? (
                                                            <video src={mediaUrl} className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-600" />
                                                        ) : (
                                                            <img src={mediaUrl} alt="Preview" className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-600" />
                                                        )}
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                        {saved.title || `Saved ${new Date(saved.createdAt?.toDate?.() || saved.createdAt).toLocaleDateString()}`}
                                                    </p>
                                                    {saved.data?.summary && (
                                                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                                            {saved.data.summary.substring(0, 100)}...
                                                        </p>
                                                    )}
                                                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                                        {saved.createdAt?.toDate?.() ? new Date(saved.createdAt.toDate()).toLocaleString() : 'Recently'}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                                    <button
                                                        onClick={() => {
                                                            setViewingSavedItem(saved);
                                                            setShowSavedItemModal(true);
                                                        }}
                                                        className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                                    >
                                                        View
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteSavedItem(saved.id, 'monetization_plan');
                                                        }}
                                                        className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                                                        title="Delete"
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Generated Monetization Plan */}
                    {generatedMonetizationPlan && (
                        <MonetizationPlanFormatter plan={generatedMonetizationPlan} />
                    )}
                </div>
            )}

            {/* Messaging Tab */}
            {activeTab === 'messaging' && (
                <div className="space-y-6">
                    <PlatformTargetingCard />
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                Subscriber Messaging Toolkit
                            </h2>
                            <span className="text-xs text-gray-500 dark:text-gray-400">copy/paste templates</span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                            Generate short message sequences that improve retention and PPV conversions (manual sending).
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Message type</label>
                                <select
                                    value={messageType}
                                    onChange={(e) => setMessageType(e.target.value as any)}
                                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                    <option value="Welcome sequence">Welcome sequence</option>
                                    <option value="Renewal reminder">Renewal reminder</option>
                                    <option value="PPV follow-up">PPV follow-up</option>
                                    <option value="Win-back">Win-back</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Tone</label>
                                <select
                                    value={messageTone}
                                    onChange={(e) => setMessageTone(e.target.value as any)}
                                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                    <option value="Warm">Warm</option>
                                    <option value="Flirty">Flirty</option>
                                    <option value="Direct">Direct</option>
                                    <option value="Explicit">Explicit</option>
                                </select>
                            </div>
                            <div className="md:col-span-3 relative">
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">Additional context (optional)</label>
                                    <button
                                        type="button"
                                        onClick={() => setAiHelpField(aiHelpField === 'messaging' ? null : 'messaging')}
                                        className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                                        title="AI Help"
                                    >
                                        <SparklesIcon className="w-4 h-4" />
                                    </button>
                                </div>
                                <textarea
                                    value={messageContext}
                                    onChange={(e) => setMessageContext(e.target.value)}
                                    placeholder="e.g., promo ends tonight, new PPV drop, discount, theme"
                                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[70px]"
                                />
                                {aiHelpField === 'messaging' && (
                                    <div
                                        ref={aiHelpRef}
                                        className="absolute z-20 right-0 top-full mt-2 w-full md:w-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 border border-gray-200 dark:border-gray-600"
                                    >
                                        <div className="mb-2">
                                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">AI Help</h4>
                                            <p className="text-xs text-gray-600 dark:text-gray-400">
                                                Add instructions or leave blank to refine what you wrote.
                                            </p>
                                        </div>
                                        <textarea
                                            value={aiHelpPrompt}
                                            onChange={(e) => setAiHelpPrompt(e.target.value)}
                                            placeholder="e.g., win-back tone, tease a bundle, PPV follow-up"
                                            rows={3}
                                            className="w-full p-2 text-sm border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 resize-y mb-2"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => runAiHelp(
                                                    messageContext,
                                                    aiHelpPrompt,
                                                    { goal: messageType, tone: messageTone, platforms: [selectedPlatform] },
                                                    (text) => setMessageContext(text),
                                                    'Additional Context',
                                                )}
                                                disabled={isAiHelpGenerating}
                                                className="flex-1 px-3 py-2 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                                            >
                                                {isAiHelpGenerating ? (
                                                    <>
                                                        <RefreshIcon className="w-3 h-3 animate-spin" />
                                                        Rewriting...
                                                    </>
                                                ) : (
                                                    <>
                                                        <SparklesIcon className="w-3 h-3" />
                                                        Rewrite
                                                    </>
                                                )}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setAiHelpField(null);
                                                    setAiHelpPrompt('');
                                                }}
                                                className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-4">
                            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
                                Select fan (optional) to personalize messages
                            </label>
                            <FanSelector
                                selectedFanId={selectedFanId}
                                onSelectFan={(fanId, fanName) => {
                                    setSelectedFanId(fanId);
                                    setSelectedFanName(fanName);
                                }}
                                allowNewFan={true}
                                compact={true}
                            />
                            {selectedFanId && fanPreferences && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                    Using preferences for {selectedFanName || 'selected fan'} (tone: {fanPreferences.preferredTone || 'n/a'}).
                                </p>
                            )}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                            <button
                                onClick={() => setUseCreatorPersonalityMessaging(prev => !prev)}
                                disabled={!creatorPersonality}
                                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                    useCreatorPersonalityMessaging
                                        ? 'bg-primary-600 text-white hover:bg-primary-700'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                } ${!creatorPersonality ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title={!creatorPersonality ? 'Add a creator personality in Settings → AI Training to enable' : undefined}
                            >
                                <SparklesIcon className="w-4 h-4" />
                                Personality
                            </button>
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-3">
                            <button
                                onClick={handleGenerateSubscriberMessages}
                                disabled={isGeneratingMessages}
                                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-60"
                            >
                                {isGeneratingMessages ? 'Generating…' : 'Generate messages'}
                            </button>

                            {generatedMessages?.trim() && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => copyToClipboard(generatedMessages)}
                                        className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center gap-2"
                                        title="Copy all messages"
                                    >
                                        <CopyIcon className="w-4 h-4" />
                                        Copy All
                                    </button>
                                    <button
                                        onClick={() => saveToHistory('subscriber_messages', `Subscriber Messages - ${new Date().toLocaleDateString()}`, {
                                            messageType,
                                            tone: messageTone,
                                            context: messageContext,
                                            text: generatedMessages,
                                        })}
                                        className="px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                                    >
                                        Save
                                    </button>
                                </div>
                            )}
                        </div>

                        {generatedMessages?.trim() && (() => {
                            type ParsedMessage = { label: string; body: string };

                            const normalizeLabel = (raw: string) => raw.replace(/\s+/g, ' ').trim();
                            const sequenceHeaderRegex = /^(welcome sequence|renewal reminder|ppv follow-up|win-back)\s*:?\s*$/i;
                            const isSequenceHeader = (line: string) => sequenceHeaderRegex.test(line.trim());

                            const parseMessages = (text: string): ParsedMessage[] => {
                                const lines = text.split(/\r?\n/);
                                const results: ParsedMessage[] = [];
                                let currentLabel = '';
                                let currentLines: string[] = [];
                                let sawLabels = false;

                                const pushCurrent = () => {
                                    const body = currentLines.join('\n').trim();
                                    if (body) {
                                        const label = currentLabel || `Message ${results.length + 1}`;
                                        results.push({ label, body });
                                    }
                                    currentLabel = '';
                                    currentLines = [];
                                };

                                for (const rawLine of lines) {
                                    const trimmed = rawLine.trim();
                                    if (!trimmed) {
                                        if (currentLines.length > 0) currentLines.push('');
                                        continue;
                                    }

                                    if (isSequenceHeader(trimmed)) {
                                        continue;
                                    }

                                    const messageMatch = trimmed.match(/^Message\s*(\d+)\s*[:\-–]?\s*(.*)$/i);
                                    const dayMatch = trimmed.match(/^Day\s*(\d+)\s*[:\-–]?\s*(.*)$/i);
                                    const numberedMatch = trimmed.match(/^(\d+)\.\s*(.*)$/);

                                    if (messageMatch || dayMatch || numberedMatch) {
                                        sawLabels = true;
                                        if (currentLines.length > 0) pushCurrent();

                                        if (messageMatch) {
                                            currentLabel = `Message ${messageMatch[1]}`;
                                            const dayInMessage = trimmed.match(/Day\s*\d+/i);
                                            if (dayInMessage) {
                                                currentLabel = `${currentLabel} • ${normalizeLabel(dayInMessage[0])}`;
                                            }
                                            const remainder = (messageMatch[2] || '').trim();
                                            if (remainder && !isSequenceHeader(remainder)) {
                                                currentLines.push(remainder);
                                            }
                                            continue;
                                        }

                                        if (dayMatch) {
                                            currentLabel = `Day ${dayMatch[1]}`;
                                            const remainder = (dayMatch[2] || '').trim();
                                            if (remainder && !isSequenceHeader(remainder)) {
                                                currentLines.push(remainder);
                                            }
                                            continue;
                                        }

                                        if (numberedMatch) {
                                            currentLabel = `Message ${numberedMatch[1]}`;
                                            const remainder = (numberedMatch[2] || '').trim();
                                            if (remainder && !isSequenceHeader(remainder)) {
                                                currentLines.push(remainder);
                                            }
                                            continue;
                                        }
                                    }

                                    currentLines.push(trimmed);
                                }

                                if (currentLines.length > 0) pushCurrent();

                                if (!results.length && sawLabels === false) {
                                    const fallback = text.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
                                    return fallback.map((body, idx) => ({ label: `Message ${idx + 1}`, body }));
                                }

                                return results;
                            };

                            const messages = parseMessages(generatedMessages);

                            return (
                                <div className="mt-4 space-y-3">
                                    {messages.map((message, index) => (
                                        <div key={index} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                            <div className="flex items-start justify-between gap-3 mb-2">
                                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                                    {message.label}
                                                </span>
                                                <button
                                                    onClick={() => copyToClipboard(message.body)}
                                                    className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center gap-2 text-sm"
                                                    title="Copy this message"
                                                >
                                                    <CopyIcon className="w-4 h-4" />
                                                    Copy
                                                </button>
                                            </div>
                                            <pre className="whitespace-pre-wrap text-sm text-gray-900 dark:text-white font-sans">
                                                {message.body}
                                            </pre>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}


            {/* Media Vault Selection Modal */}
            {showMediaVaultModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Select from My Vault</h2>
                            <button
                                onClick={() => {
                                    setShowMediaVaultModal(false);
                                    setWeeklyPlanVaultTargetAction(null);
                                }}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">
                            {mediaVaultItems.length === 0 ? (
                                <div className="text-center py-8">
                                    <p className="text-gray-600 dark:text-gray-400">No media in vault yet.</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">Upload media to your vault first.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {mediaVaultItems.map((item) => (
                                        <button
                                            key={item.id}
                                            onClick={() => handleSelectFromVault(item)}
                                            className="relative aspect-square rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-400 transition-colors"
                                        >
                                            {item.type === 'video' ? (
                                                <video src={item.url} className="w-full h-full object-cover" />
                                            ) : (
                                                <img src={item.url} alt={item.name || 'Media'} className="w-full h-full object-cover" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                            <button
                                onClick={() => {
                                    setShowMediaVaultModal(false);
                                    setWeeklyPlanVaultTargetAction(null);
                                }}
                                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Predict Modal */}
            {showPredictModal && predictResult && (
                <PredictModal
                    result={predictResult}
                    onClose={() => setShowPredictModal(false)}
                    onCopy={(text: string) => {
                        copyToClipboard(text);
                        showToast?.('Copied to clipboard!', 'success');
                    }}
                    onSave={undefined}
                    showToast={showToast}
                />
            )}

            {/* Repurpose Modal */}
            {showRepurposeModal && repurposeResult && (
                <RepurposeModal
                    result={repurposeResult}
                    onClose={() => setShowRepurposeModal(false)}
                    onCopy={(text: string) => {
                        copyToClipboard(text);
                        showToast?.('Copied to clipboard!', 'success');
                    }}
                    onSave={async () => {
                        if (repurposeResult) {
                            try {
                                await saveRepurposeToHistory({
                                    ...repurposeResult,
                                    mediaUrl: uploadedMediaUrl,
                                    mediaType: uploadedMediaType || 'image',
                                });
                                showToast?.('Repurposed content saved to history!', 'success');
                            } catch (error) {
                                showToast?.('Failed to save to history', 'error');
                            }
                        }
                    }}
                    showToast={showToast}
                />
            )}

            {/* Content Gap Analysis Modal */}
            {showGapAnalysisModal && contentGapAnalysis && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">What's Missing</h2>
                            <button
                                onClick={() => setShowGapAnalysisModal(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {contentGapAnalysis.summary && (
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                    <p className="text-blue-900 dark:text-blue-200">{contentGapAnalysis.summary}</p>
                                </div>
                            )}
                            {contentGapAnalysis.gaps && contentGapAnalysis.gaps.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Identified Gaps</h3>
                                    <div className="space-y-3">
                                        {contentGapAnalysis.gaps.map((gap: any, idx: number) => (
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
                                                        {gap.severity?.toUpperCase() || 'LOW'}
                                                    </span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">{gap.type || 'Content Gap'}</span>
                                                </div>
                                                <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">{gap.description}</p>
                                                {gap.impact && <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{gap.impact}</p>}
                                                {gap.recommendation && <p className="text-xs text-gray-700 dark:text-gray-300">{gap.recommendation}</p>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {contentGapAnalysis.suggestions && contentGapAnalysis.suggestions.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Content Suggestions to Fill Gaps</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {contentGapAnalysis.suggestions.map((suggestion: any, idx: number) => (
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
                                                        {suggestion.priority?.toUpperCase() || 'MEDIUM'}
                                                    </span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">{suggestion.type || 'Suggestion'}</span>
                                                </div>
                                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{suggestion.title}</h4>
                                                {suggestion.captionOutline && <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{suggestion.captionOutline}</p>}
                                                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
                                                    {suggestion.platform && <span>{suggestion.platform}</span>}
                                                    {suggestion.format && (
                                                        <>
                                                            {suggestion.platform && <span>•</span>}
                                                            <span>{suggestion.format}</span>
                                                        </>
                                                    )}
                                                </div>
                                                {suggestion.whyThisFillsGap && <p className="text-xs text-gray-700 dark:text-gray-300 italic">{suggestion.whyThisFillsGap}</p>}
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
                        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                            <button
                                onClick={() => setShowGapAnalysisModal(false)}
                                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Saved Item Modal */}
            {showSavedItemModal && viewingSavedItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                                {viewingSavedItem.title || 'Saved Item'}
                            </h2>
                            <button
                                onClick={() => {
                                    setShowSavedItemModal(false);
                                    setViewingSavedItem(null);
                                }}
                                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                            >
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="space-y-4">
                                {/* Media Thumbnail */}
                                {viewingSavedItem.data?.mediaUrl && (
                                    <div className="mb-4">
                                        {viewingSavedItem.data?.mediaType === 'video' ? (
                                            <video 
                                                src={viewingSavedItem.data.mediaUrl} 
                                                className="w-full max-w-md mx-auto rounded-lg border border-gray-200 dark:border-gray-600"
                                                controls
                                            />
                                        ) : (
                                            <img 
                                                src={viewingSavedItem.data.mediaUrl} 
                                                alt="Content preview" 
                                                className="w-full max-w-md mx-auto rounded-lg border border-gray-200 dark:border-gray-600"
                                            />
                                        )}
                                    </div>
                                )}
                                
                                {/* Post Ideas */}
                                {viewingSavedItem.type === 'post_ideas' && viewingSavedItem.data?.ideas && Array.isArray(viewingSavedItem.data.ideas) && (
                                    <div className="space-y-3">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Post Ideas</h3>
                                        {viewingSavedItem.data.ideas.map((idea: string, idx: number) => (
                                            <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                                <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{idea}</p>
                                                <button
                                                    onClick={() => {
                                                        copyToClipboard(idea);
                                                    }}
                                                    className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                
                                {/* Shoot Concepts */}
                                {viewingSavedItem.type === 'shoot_concepts' && viewingSavedItem.data?.concepts && Array.isArray(viewingSavedItem.data.concepts) && (
                                    <div className="space-y-3">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Shoot Concepts</h3>
                                        {viewingSavedItem.data.concepts.map((concept: string, idx: number) => (
                                            <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                                <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{concept}</p>
                                                <button
                                                    onClick={() => {
                                                        copyToClipboard(concept);
                                                    }}
                                                    className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                
                                {/* Weekly Plan */}
                                {viewingSavedItem.type === 'weekly_plan' && viewingSavedItem.data?.plan && (
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Weekly Plan</h3>
                                            <button
                                                onClick={() => {
                                                    const planToCopy = typeof viewingSavedItem.data.plan === 'string' 
                                                        ? viewingSavedItem.data.plan 
                                                        : JSON.stringify(viewingSavedItem.data.plan, null, 2);
                                                    copyToClipboard(planToCopy);
                                                }}
                                                className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
                                            >
                                                <CopyIcon className="w-4 h-4" />
                                                Copy
                                            </button>
                                        </div>
                                        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                            <WeeklyPlanFormatter
                                                plan={viewingSavedItem.data.plan}
                                                uploadMenuKey={weeklyPlanUploadMenuKey}
                                                cardStateByKey={weeklyPlanCardState}
                                                onToggleUploadMenu={setWeeklyPlanUploadMenuKey}
                                                onUploadFile={handleWeeklyPlanUploadFile}
                                                onSelectFromVault={handleWeeklyPlanSelectFromVault}
                                                onGenerateCaption={handleWeeklyPlanGenerateCaption}
                                                onAddToCalendar={handleWeeklyPlanAddToCalendar}
                                                onToggleSchedulePicker={handleWeeklyPlanToggleSchedulePicker}
                                                onConfirmSchedule={handleWeeklyPlanConfirmSchedule}
                                                onUpdateScheduleDate={handleWeeklyPlanUpdateScheduleDate}
                                                onUpdateScheduleTime={handleWeeklyPlanUpdateScheduleTime}
                                                onCopyForExport={handleWeeklyPlanCopyForExport}
                                            />
                                        </div>
                                    </div>
                                )}
                                
                                {/* Monetization Plan */}
                                {viewingSavedItem.type === 'monetization_plan' && viewingSavedItem.data && (
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Monetization Plan</h3>
                                        {/* Use the same formatter as generated plans */}
                                        {/* When saved, we use ...data.plan which spreads the plan properties into data */}
                                        {/* So viewingSavedItem.data should already be the plan object */}
                                        <MonetizationPlanFormatter plan={viewingSavedItem.data} />
                                    </div>
                                )}
                                
                                {/* Date */}
                                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        Saved: {viewingSavedItem.createdAt?.toDate?.() 
                                            ? new Date(viewingSavedItem.createdAt.toDate()).toLocaleString() 
                                            : (viewingSavedItem.createdAt 
                                                ? new Date(viewingSavedItem.createdAt).toLocaleString() 
                                                : 'Recently')}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                            <button
                                onClick={() => {
                                    setShowSavedItemModal(false);
                                    setViewingSavedItem(null);
                                }}
                                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
