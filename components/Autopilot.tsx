import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { AutopilotCampaign, AutopilotStatus } from '../types';
import { RocketIcon, SparklesIcon, CheckCircleIcon, TargetIcon, BriefcaseIcon } from './icons/UIIcons';

const AutopilotUpgrade: React.FC = () => {
    const { openPaymentModal } = useAppContext();

    const handleActivate = () => {
        openPaymentModal({ name: 'Autopilot Add-on', price: 99, cycle: 'monthly' });
    };

    return (
        <div className="max-w-3xl mx-auto text-center bg-white dark:bg-gray-800 p-12 rounded-2xl shadow-2xl border-2 border-primary-500/50">
            <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 text-white mb-6 shadow-lg">
                <RocketIcon />
            </div>
            <h2 className="text-4xl font-extrabold text-gray-900 dark:text-white">Activate AI Autopilot</h2>
            <p className="mt-4 text-lg text-gray-500 dark:text-gray-400">
                Put your content strategy on cruise control. Define a goal, and our AI will generate a multi-week content plan, create all the posts with unique images and captions, and queue them up for your final approval.
            </p>
             <div className="my-8">
                <span className="text-5xl font-bold text-gray-900 dark:text-white">$99</span>
                <span className="text-lg font-medium text-gray-500 dark:text-gray-400">/mo</span>
             </div>
            <button
                onClick={handleActivate}
                className="px-10 py-4 bg-gradient-to-r from-primary-600 to-primary-500 text-white font-bold rounded-full shadow-lg hover:shadow-xl transform transition hover:-translate-y-1"
            >
                Activate Autopilot
            </button>
        </div>
    );
};


const Autopilot: React.FC = () => {
    const { user, autopilotCampaigns, addAutopilotCampaign } = useAppContext();
    const [goal, setGoal] = useState('');
    const [niche, setNiche] = useState('');
    const [audience, setAudience] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    if (!user) return null; // Should not happen if page is protected

    if (user.plan === 'Free' || !user.hasAutopilot) {
        return <AutopilotUpgrade />;
    }

    const handleLaunch = async () => {
        if (!goal || !niche || !audience) return;
        setIsLoading(true);
        try {
            await addAutopilotCampaign({ goal, niche, audience, status: 'Strategizing' });
            setGoal('');
            setNiche('');
            setAudience('');
        } catch (error) {
            console.error("Failed to launch campaign:", error);
        } finally {
            setIsLoading(false);
        }
    };
    
    const getStatusInfo = (status: AutopilotStatus): { color: string; text: string } => {
        switch (status) {
            case 'Strategizing': return { color: 'bg-blue-500', text: 'AI is building your content plan...' };
            case 'Generating Content': return { color: 'bg-purple-500', text: 'AI is creating posts...' };
            case 'Complete': return { color: 'bg-green-500', text: 'Campaign complete. Posts are in your Approval queue.' };
            case 'Failed': return { color: 'bg-red-500', text: 'Campaign failed. Please try again.' };
            default: return { color: 'bg-gray-400', text: 'Idle' };
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <div className="text-center">
                 <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 mb-4">
                    <RocketIcon />
                </div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">AI Autopilot</h2>
                <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">Define a high-level goal and let the AI handle the rest.</p>
            </div>

            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
                 <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Launch a New Campaign</h3>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Primary Goal</label>
                        <input type="text" value={goal} onChange={e => setGoal(e.target.value)} placeholder="e.g., Promote new product launch" className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Brand Niche</label>
                        <input type="text" value={niche} onChange={e => setNiche(e.target.value)} placeholder="e.g., Sustainable Fashion" className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Target Audience</label>
                        <input type="text" value={audience} onChange={e => setAudience(e.target.value)} placeholder="e.g., Eco-conscious millennials" className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600" />
                    </div>
                </div>
                 <div className="mt-8 flex justify-center">
                    <button onClick={handleLaunch} disabled={isLoading || !goal || !niche || !audience} className="px-8 py-3 bg-gradient-to-r from-primary-600 to-primary-500 text-white font-bold rounded-full shadow-lg hover:shadow-xl transform transition hover:-translate-y-1 disabled:opacity-50 flex items-center gap-2">
                        {isLoading ? (
                            <>
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                Launching...
                            </>
                        ) : (
                            <>
                                <RocketIcon /> Launch Campaign
                            </>
                        )}
                    </button>
                </div>
            </div>

            <div className="space-y-6">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Active Campaigns</h3>
                {autopilotCampaigns.length > 0 ? autopilotCampaigns.map(campaign => {
                    const statusInfo = getStatusInfo(campaign.status);
                    return (
                        <div key={campaign.id} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border-l-4 border-primary-500">
                            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                <div>
                                    <p className="font-bold text-lg text-gray-900 dark:text-white">{campaign.goal}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        Niche: <span className="font-medium text-gray-700 dark:text-gray-300">{campaign.niche}</span> | 
                                        Audience: <span className="font-medium text-gray-700 dark:text-gray-300">{campaign.audience}</span>
                                    </p>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                        Generated {campaign.generatedPosts} / {campaign.totalPosts} posts
                                    </span>
                                </div>
                            </div>
                            <div className="mt-4">
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                                    <div className={`${statusInfo.color} h-2.5 rounded-full transition-all duration-500`} style={{ width: `${campaign.progress}%` }}></div>
                                </div>
                                <p className="text-xs text-center mt-2 font-semibold text-gray-600 dark:text-gray-300 animate-pulse">{statusInfo.text}</p>
                            </div>
                        </div>
                    )
                }) : (
                     <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl shadow-md border-2 border-dashed border-gray-300 dark:border-gray-700">
                        <p className="text-gray-500 dark:text-gray-400">No active campaigns. Launch one to get started!</p>
                     </div>
                )}
            </div>
        </div>
    );
};

export default Autopilot;