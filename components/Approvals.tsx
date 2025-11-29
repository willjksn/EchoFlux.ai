
import React, { useState } from 'react';
import { useAppContext } from './AppContext';
import { ApprovalStatus, Post, Platform } from '../types';
import { CheckCircleIcon, MobileIcon, SendIcon, TrashIcon, EditIcon, ChatIcon, UserIcon, XMarkIcon, SparklesIcon } from './icons/UIIcons';
import { InstagramIcon, TikTokIcon, XIcon, ThreadsIcon, YouTubeIcon, LinkedInIcon, FacebookIcon } from './icons/PlatformIcons';
import { MobilePreviewModal } from './MobilePreviewModal';
import { UpgradePrompt } from './UpgradePrompt';
import { generateCritique } from "../src/services/geminiService";
import { db } from '../firebaseConfig';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';

const statusColumns: ApprovalStatus[] = ['Draft', 'In Review', 'Approved', 'Scheduled'];

const platformIcons: Record<Platform, React.ReactElement<{ className?: string }>> = {
  Instagram: <InstagramIcon />,
  TikTok: <TikTokIcon />,
  X: <XIcon />,
  Threads: <ThreadsIcon />,
  YouTube: <YouTubeIcon />,
  LinkedIn: <LinkedInIcon />,
  Facebook: <FacebookIcon />,
};

const statusColors: Record<ApprovalStatus, string> = {
    Draft: 'bg-gray-100 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300',
    'In Review': 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-900/50 dark:text-yellow-200',
    Approved: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-900/50 dark:text-green-200',
    Scheduled: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-900/50 dark:text-blue-200',
    Published: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-900/50 dark:text-emerald-200',
    Rejected: 'bg-red-50 border-red-200 text-red-800',
};

export const Approvals: React.FC = () => {
    const { posts, user, setActivePage, showToast, autopilotCampaigns } = useAppContext();
    const [activePost, setActivePost] = useState<Post | null>(null);
    const [comment, setComment] = useState('');
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isGeneratingComment, setIsGeneratingComment] = useState(false);
    const [sourceFilter, setSourceFilter] = useState<'all' | 'autopilot' | 'automation' | 'manual'>('all');

    if (!['Elite', 'Agency'].includes(user?.plan || "") && user?.role !== 'Admin')
 {
         return <UpgradePrompt featureName="Approval Workflows" onUpgradeClick={() => setActivePage('pricing')} />;
    }

    const updatePostInDb = async (updatedPost: Post) => {
        if (!user) return;
        try {
            // Fix: Use v9 modular SDK
            // Ensure no undefined values are passed to Firestore
            const safePost = JSON.parse(JSON.stringify(updatedPost));
            await setDoc(doc(db, 'users', user.id, 'posts', updatedPost.id), safePost, { merge: true });
        } catch (e) {
            showToast('Failed to update post', 'error');
            console.error(e);
        }
    };

    const handleMoveStatus = async (postId: string, newStatus: ApprovalStatus) => {
        const post = posts.find(p => p.id === postId);
        if (post) {
            await updatePostInDb({ ...post, status: newStatus });
            if (activePost && activePost.id === postId) {
                setActivePost({ ...post, status: newStatus });
            }
        }
    };

    const handleDelete = async (postId: string) => {
        if(window.confirm("Delete this post?")) {
            if (!user) return;
            try {
                // Fix: Use v9 modular SDK
                await deleteDoc(doc(db, 'users', user.id, 'posts', postId));
                setActivePost(null);
                showToast('Post deleted', 'success');
            } catch (e) {
                showToast('Failed to delete', 'error');
            }
        }
    }

    const handleAddComment = async () => {
        if (!activePost || !comment.trim()) return;
        const newComment = {
            id: Date.now().toString(),
            user: user?.name ?? "Unknown User",

            text: comment,
            timestamp: new Date().toISOString()
        };
        
        const updatedPost = {
            ...activePost,
            comments: [...activePost.comments, newComment]
        };
        
        await updatePostInDb(updatedPost);
        setActivePost(updatedPost);
        setComment('');
    };
    
    const handleGenerateAIComment = async () => {
        if (!activePost) return;
        setIsGeneratingComment(true);
        try {
            const critique = await generateCritique(activePost.content);
            setComment(critique);
        } catch (e) {
            showToast('Failed to generate feedback.', 'error');
        } finally {
            setIsGeneratingComment(false);
        }
    };

    // Filter posts by source
    const filteredPosts = posts.filter(post => {
        if (sourceFilter === 'all') return true;
        
        // Check if post is from Autopilot
        const isFromAutopilot = post.id.includes('autopilot') || 
                               (post as any).campaignId ||
                               autopilotCampaigns.some(c => post.id.includes(c.id));
        
        // Check if post is from Automation (workflowId indicates Automation)
        const isFromAutomation = (post as any).workflowId && !isFromAutopilot;
        
        // Manual posts have no campaignId or workflowId
        const isManual = !isFromAutopilot && !isFromAutomation;
        
        if (sourceFilter === 'autopilot') return isFromAutopilot;
        if (sourceFilter === 'automation') return isFromAutomation;
        if (sourceFilter === 'manual') return isManual;
        
        return true;
    });

    const columns = statusColumns.map(status => ({
        title: status,
        items: filteredPosts.filter(p => p.status === status)
    }));

    return (
        <div className="h-[calc(100vh-8rem)] flex flex-col">
            <MobilePreviewModal 
                isOpen={isPreviewOpen} 
                onClose={() => setIsPreviewOpen(false)} 
                caption={activePost?.content || ''}
                media={activePost?.mediaUrl ? { previewUrl: activePost.mediaUrl, type: activePost.mediaType || 'image' } : null}
                user={activePost?.author ?? null}

            />

            <div className="flex justify-between items-center mb-6 px-2 flex-wrap gap-4">
                 <div>
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Approval Workflow</h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage content pipeline from draft to publication.</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Source Filter */}
                    <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                        <button
                            onClick={() => setSourceFilter('all')}
                            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                                sourceFilter === 'all'
                                    ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                            }`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setSourceFilter('autopilot')}
                            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                                sourceFilter === 'autopilot'
                                    ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                            }`}
                        >
                            Autopilot
                        </button>
                        <button
                            onClick={() => setSourceFilter('automation')}
                            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                                sourceFilter === 'automation'
                                    ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                            }`}
                        >
                            Automation
                        </button>
                        <button
                            onClick={() => setSourceFilter('manual')}
                            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                                sourceFilter === 'manual'
                                    ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                            }`}
                        >
                            Manual
                        </button>
                    </div>
                    <button onClick={() => setActivePage('compose')} className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700">
                        + Create Post
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-hidden">
                <div className="flex h-full gap-6 min-w-[1000px] pb-4 px-2">
                    {columns.map(col => (
                        <div key={col.title} className="flex-1 flex flex-col min-w-[300px] bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                                <h3 className="font-bold text-gray-700 dark:text-gray-200">{col.title}</h3>
                                <span className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full text-xs font-bold">{col.items.length}</span>
                            </div>
                            <div className="p-3 flex-1 overflow-y-auto space-y-3 scrollbar-thin">
                                {col.items.map(post => (
                                    <div 
                                        key={post.id} 
                                        onClick={() => setActivePost(post)}
                                        className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-md transition-shadow"
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex gap-1 items-center">
                                                {post.platforms.map(p => (
                                                    <span key={p} className="text-gray-500 dark:text-gray-400 w-4 h-4">
                                                        {platformIcons[p] ? React.cloneElement(platformIcons[p], { className: "w-4 h-4" }) : null}
                                                    </span>
                                                ))}
                                                {/* Source Badge */}
                                                {(() => {
                                                    const isFromAutopilot = post.id.includes('autopilot') || 
                                                                           (post as any).campaignId ||
                                                                           autopilotCampaigns.some(c => post.id.includes(c.id));
                                                    const isFromAutomation = (post as any).workflowId && !isFromAutopilot;
                                                    
                                                    if (isFromAutopilot) {
                                                        return (
                                                            <span className="ml-2 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full font-medium">
                                                                Autopilot
                                                            </span>
                                                        );
                                                    }
                                                    if (isFromAutomation) {
                                                        return (
                                                            <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                                                                Automation
                                                            </span>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </div>
                                            {post.mediaType && (
                                                <span className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 rounded text-gray-500 capitalize">{post.mediaType}</span>
                                            )}
                                        </div>
                                        
                                        <div className="flex gap-3">
                                            {post.mediaUrl && (
                                                <div className="w-16 h-16 flex-shrink-0 bg-gray-100 dark:bg-gray-700 rounded-md overflow-hidden">
                                                    {post.mediaType === 'video' ? (
                                                        <video src={post.mediaUrl} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <img src={post.mediaUrl} alt="preview" className="w-full h-full object-cover" />
                                                    )}
                                                </div>
                                            )}
                                            <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 flex-grow">
                                                {post.content}
                                            </p>
                                        </div>
                                        
                                        <div className="mt-3 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <img src={post.author.avatar} alt={post.author.name} className="w-5 h-5 rounded-full" />
                                                <span className="text-xs text-gray-500 truncate max-w-[80px]">{post.author.name}</span>
                                            </div>
                                            {post.comments.length > 0 && (
                                                <div className="flex items-center gap-1 text-xs text-gray-400">
                                                    <ChatIcon className="w-3 h-3" /> {post.comments.length}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Detail Modal */}
            {activePost && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
                    <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex overflow-hidden">
                        {/* Close Button */}
                        <button 
                            onClick={() => setActivePost(null)} 
                            className="absolute top-4 right-4 p-2 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 z-10 transition-colors"
                            aria-label="Close details"
                        >
                            <XMarkIcon className="w-6 h-6" />
                        </button>

                        {/* Left: Preview & Content */}
                        <div className="w-1/2 p-6 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
                             <div className="flex justify-between items-start mb-4 pr-8"> 
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Post Details</h3>
                            </div>
                            <div className="mb-4">
                                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${statusColors[activePost.status]}`}>
                                    {activePost.status}
                                </span>
                            </div>

                            <div className="mb-6">
                                <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Content</h4>
                                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                                     <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap mb-4">{activePost.content}</p>
                                     {activePost.mediaUrl && (
                                        <div className="rounded-lg overflow-hidden bg-black max-h-64 flex justify-center">
                                             {activePost.mediaType === 'video' ? (
                                                 <video src={activePost.mediaUrl} controls className="max-h-64 w-auto" />
                                             ) : (
                                                 <img src={activePost.mediaUrl} alt="Media" className="max-h-64 w-auto object-contain" />
                                             )}
                                        </div>
                                     )}
                                </div>
                            </div>
                            
                            <div className="flex justify-between gap-3">
                                <button onClick={() => setIsPreviewOpen(true)} className="flex-1 py-2 flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
                                    <MobileIcon className="w-4 h-4" /> Mobile Preview
                                </button>
                                <button onClick={() => handleDelete(activePost.id)} className="py-2 px-4 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md" title="Delete Post">
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Right: Actions & Comments */}
                        <div className="w-1/2 flex flex-col">
                             <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 pt-12">
                                <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3">Actions</h4>
                                <div className="flex flex-wrap gap-2">
                                    {activePost.status === 'Draft' && (
                                        <button onClick={() => handleMoveStatus(activePost.id, 'In Review')} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium">Submit for Review</button>
                                    )}
                                    {activePost.status === 'In Review' && (
                                        <>
                                            <button onClick={() => handleMoveStatus(activePost.id, 'Draft')} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 text-sm font-medium">Request Changes</button>
                                            <button onClick={() => handleMoveStatus(activePost.id, 'Approved')} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium flex items-center gap-2"><CheckCircleIcon className="w-4 h-4"/> Approve</button>
                                        </>
                                    )}
                                    {activePost.status === 'Approved' && (
                                        <>
                                            <button onClick={() => handleMoveStatus(activePost.id, 'In Review')} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 text-sm font-medium">Re-open Review</button>
                                            <button onClick={() => handleMoveStatus(activePost.id, 'Scheduled')} className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm font-medium">Schedule Post</button>
                                        </>
                                    )}
                                    {activePost.status === 'Scheduled' && (
                                         <button onClick={() => showToast('Already scheduled!', 'success')} disabled className="px-4 py-2 bg-gray-100 text-gray-400 rounded-md cursor-not-allowed text-sm font-medium">Scheduled</button>
                                    )}
                                </div>
                            </div>

                            <div className="flex-1 p-6 flex flex-col overflow-hidden">
                                <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3">Comments & History</h4>
                                <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
                                    {activePost.comments.length > 0 ? activePost.comments.map(c => (
                                        <div key={c.id} className="flex gap-3">
                                            <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center text-primary-700 dark:text-primary-300 text-xs font-bold">
                                                {c.user.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="flex items-baseline gap-2">
                                                    <span className="font-semibold text-sm text-gray-900 dark:text-white">{c.user}</span>
                                                    <span className="text-xs text-gray-400">{new Date(c.timestamp).toLocaleDateString()}</span>
                                                </div>
                                                <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{c.text}</p>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="text-center py-8 text-gray-400 text-sm italic">No comments yet. Start the discussion.</div>
                                    )}
                                </div>
                                
                                <div className="flex gap-2">
                                    <div className="relative flex-grow">
                                        <input 
                                            type="text" 
                                            value={comment} 
                                            onChange={e => setComment(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                                            placeholder={isGeneratingComment ? "AI is thinking..." : "Add a comment..."}
                                            className="w-full p-2 pr-10 border rounded-md bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 disabled:opacity-50"
                                            disabled={isGeneratingComment}
                                        />
                                         <button 
                                            onClick={handleGenerateAIComment} 
                                            disabled={isGeneratingComment}
                                            className={`absolute top-1/2 right-2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-primary-600 dark:text-primary-400 transition-colors ${isGeneratingComment ? 'animate-pulse' : ''}`}
                                            title="Generate AI Feedback"
                                        >
                                            <SparklesIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <button onClick={handleAddComment} disabled={!comment.trim()} className="p-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50">
                                        <SendIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
