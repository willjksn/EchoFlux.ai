
import React, { useState } from 'react';
import { useAppContext } from './AppContext';
import { XMarkIcon, TagIcon, NoteIcon, ClockIcon, PlusIcon, TrashIcon, SparklesIcon } from './icons/UIIcons';
import { Platform } from '../types';
import { InstagramIcon, TikTokIcon, XIcon, ThreadsIcon, YouTubeIcon, LinkedInIcon, FacebookIcon } from './icons/PlatformIcons';
import { generateCRMSummary } from '../src/services/geminiService';

const platformIcons: Record<Platform, React.ReactNode> = {
  Instagram: <InstagramIcon />,
  TikTok: <TikTokIcon />,
  X: <XIcon />,
  Threads: <ThreadsIcon />,
  YouTube: <YouTubeIcon />,
  LinkedIn: <LinkedInIcon />,
  // FIX: Added missing Facebook icon to satisfy the 'Platform' type.
  Facebook: <FacebookIcon />,
};

export const CRMSidebar: React.FC = () => {
    const { isCRMOpen, activeCRMProfileId, crmStore, closeCRM, addCRMNote, addCRMTag, removeCRMTag, messages, updateCRMProfile, showToast } = useAppContext();
    const [newTag, setNewTag] = useState('');
    const [newNote, setNewNote] = useState('');
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

    if (!isCRMOpen || !activeCRMProfileId) return null;

    const profile = crmStore[activeCRMProfileId];
    if (!profile) return null;

    const userHistory = messages.filter(m => m.user.name === profile.name).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const handleAddTag = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && newTag.trim()) {
            addCRMTag(profile.id, newTag.trim());
            setNewTag('');
        }
    };

    const handleAddNote = () => {
        if (newNote.trim()) {
            addCRMNote(profile.id, newNote.trim());
            setNewNote('');
        }
    };
    
    const handleStageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        updateCRMProfile(profile.id, { lifecycleStage: e.target.value as any });
    }

    const handleGenerateSummary = async () => {
        setIsGeneratingSummary(true);
        try {
            const { summary, tags } = await generateCRMSummary(userHistory);
            await updateCRMProfile(profile.id, { aiSummary: summary });
            for (const tag of tags) {
                if (!profile.tags.includes(tag)) {
                    await addCRMTag(profile.id, tag);
                }
            }
            showToast("AI summary generated!", 'success');
        } catch (error) {
            showToast("Failed to generate summary.", 'error');
        } finally {
            setIsGeneratingSummary(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 z-40 bg-black bg-opacity-20 transition-opacity" onClick={closeCRM}></div>
            <aside className={`fixed top-0 right-0 z-50 w-96 h-full bg-white dark:bg-gray-800 shadow-2xl transform transition-transform duration-300 ease-in-out ${isCRMOpen ? 'translate-x-0' : 'translate-x-full'} overflow-y-auto`}>
                <div className="p-6">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-6">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">User Details</h2>
                        <button onClick={closeCRM} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                            <XMarkIcon className="w-6 h-6"/>
                        </button>
                    </div>

                    {/* Profile Header */}
                    <div className="flex items-center space-x-4 mb-6">
                        <img src={profile.avatar} alt={profile.name} className="w-16 h-16 rounded-full border-2 border-gray-200 dark:border-gray-700" />
                        <div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{profile.name}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">@{profile.name.replace(/\s+/g, '').toLowerCase()}</p>
                        </div>
                    </div>

                    {/* AI Summary Section */}
                    <div className="mb-6 p-4 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-900/30">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="font-bold text-sm text-primary-800 dark:text-primary-200">AI Summary</h4>
                            <button onClick={handleGenerateSummary} disabled={isGeneratingSummary} className="p-1 rounded-full hover:bg-primary-100 dark:hover:bg-primary-900/50 text-primary-600 disabled:opacity-50">
                                <SparklesIcon className={`w-4 h-4 ${isGeneratingSummary ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                        <p className="text-sm text-primary-700 dark:text-primary-300">
                            {profile.aiSummary || (isGeneratingSummary ? "Analyzing history..." : "Click the ✨ to generate a summary of this user.")}
                        </p>
                    </div>
                    
                    {/* Lifecycle Stage */}
                    <div className="mb-6">
                         <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Lifecycle Stage</label>
                         <select 
                            value={profile.lifecycleStage || 'Lead'} 
                            onChange={handleStageChange}
                            className="w-full p-2 text-sm border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                        >
                            <option value="Lead">Lead</option>
                            <option value="Customer">Customer</option>
                            <option value="Influencer">Influencer</option>
                            <option value="Churned">Churned</option>
                         </select>
                    </div>

                    {/* Tags */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase flex items-center gap-1"><TagIcon className="w-3 h-3"/> Tags</label>
                        </div>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {profile.tags.map(tag => (
                                <span key={tag} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
                                    {tag}
                                    <button onClick={() => removeCRMTag(profile.id, tag)} className="ml-1 text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-white">×</button>
                                </span>
                            ))}
                        </div>
                        <input
                            type="text"
                            value={newTag}
                            onChange={e => setNewTag(e.target.value)}
                            onKeyDown={handleAddTag}
                            placeholder="Add tag (Press Enter)..."
                            className="w-full p-2 text-sm border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                        />
                    </div>

                    {/* Notes */}
                    <div className="mb-6">
                        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase flex items-center gap-1 mb-2"><NoteIcon className="w-3 h-3"/> Notes</label>
                        <div className="space-y-3 mb-3 max-h-48 overflow-y-auto">
                            {profile.notes.map(note => (
                                <div key={note.id} className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-md border border-yellow-100 dark:border-yellow-900/30">
                                    <p className="text-sm text-gray-800 dark:text-gray-200">{note.content}</p>
                                    <div className="mt-2 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                                        <span>{note.author}</span>
                                        <span>{new Date(note.timestamp).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            ))}
                            {profile.notes.length === 0 && <p className="text-sm text-gray-400 italic">No notes yet.</p>}
                        </div>
                        <div className="flex gap-2">
                            <textarea
                                value={newNote}
                                onChange={e => setNewNote(e.target.value)}
                                rows={2}
                                placeholder="Add a note..."
                                className="flex-grow p-2 text-sm border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                            />
                            <button onClick={handleAddNote} disabled={!newNote.trim()} className="p-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 self-end">
                                <PlusIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Interaction History */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase flex items-center gap-1 mb-2"><ClockIcon className="w-3 h-3"/> History</label>
                        <div className="space-y-3">
                            {userHistory.map(msg => (
                                <div key={msg.id} className="border-l-2 border-gray-200 dark:border-gray-700 pl-3 py-1">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{msg.timestamp}</span>
                                        <span className="text-gray-400">{React.cloneElement(platformIcons[msg.platform] as React.ReactElement<{ className?: string }>, { className: "w-3 h-3" })}</span>
                                    </div>
                                    <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">"{msg.content}"</p>
                                </div>
                            ))}
                             {userHistory.length === 0 && <p className="text-sm text-gray-400 italic">No message history found.</p>}
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
};
