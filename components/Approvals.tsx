
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

// Filter status columns based on plan - Agency gets 'In Review', others don't
const getStatusColumns = (userPlan?: string): ApprovalStatus[] => {
  const baseColumns: ApprovalStatus[] = ['Draft', 'Approved', 'Scheduled'];
  if (userPlan === 'Agency') {
    return ['Draft', 'In Review', 'Approved', 'Scheduled'];
  }
  return baseColumns;
};

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
    const { posts, user, setActivePage, showToast, addCalendarEvent, setPosts } = useAppContext();
    const [activePost, setActivePost] = useState<Post | null>(null);
    const [comment, setComment] = useState('');
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isGeneratingComment, setIsGeneratingComment] = useState(false);
    const [sourceFilter, setSourceFilter] = useState<'all' | 'automation' | 'manual'>('all');

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
                // Update local state immediately
                if (setPosts) {
                    setPosts(prev => prev.filter(p => p.id !== postId));
                }
                setActivePost(null);
                showToast('Post deleted', 'success');
            } catch (e) {
                showToast('Failed to delete', 'error');
                console.error('Delete error:', e);
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
        
        // Check if post is from Automation (workflowId indicates Automation)
        const isFromAutomation = !!(post as any).workflowId;
        
        // Manual posts have no workflowId
        const isManual = !isFromAutomation;
        
        if (sourceFilter === 'automation') return isFromAutomation;
        if (sourceFilter === 'manual') return isManual;
        
        return true;
    });

    const statusColumns = getStatusColumns(user?.plan);
    const columns = statusColumns.map(status => ({
        title: status,
        items: filteredPosts.filter(p => {
            // Match exact status or handle variations
            if (p.status === status) return true;
            // Handle status variations
            if (status === 'In Review' && (p.status === 'Pending Review' || p.status === 'Review')) return true;
            if (status === 'Draft' && p.status === 'Draft') return true;
            if (status === 'Approved' && p.status === 'Approved') return true;
            if (status === 'Scheduled' && p.status === 'Scheduled') return true;
            // Published posts should NOT appear in workflow - they're done
            return false;
        })
    }));
    
    // Debug: Log posts for troubleshooting
    if (process.env.NODE_ENV === 'development') {
        console.log('Approval Workflow Debug:', {
            totalPosts: posts.length,
            filteredPosts: filteredPosts.length,
            postsByStatus: filteredPosts.reduce((acc, p) => {
                acc[p.status] = (acc[p.status] || 0) + 1;
                return acc;
            }, {} as Record<string, number>),
            columns: columns.map(c => ({ status: c.title, count: c.items.length }))
        });
    }

    // Check if there are any posts at all
    const hasAnyPosts = filteredPosts.length > 0;
    
    return (
        <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full flex flex-col">
            <MobilePreviewModal 
                isOpen={isPreviewOpen} 
                onClose={() => setIsPreviewOpen(false)} 
                caption={activePost?.content || ''}
                media={activePost?.mediaUrl ? { previewUrl: activePost.mediaUrl, type: activePost.mediaType || 'image' } : null}
                user={activePost?.author ?? null}
            />

            <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                 <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Workflow</h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage content pipeline from draft to publication.</p>
                    {!hasAnyPosts && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Posts appear here when you save drafts or create content from Compose or Automation.</p>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {/* Source Filter */}
                    <div className="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-1">
                        <button
                            onClick={() => setSourceFilter('all')}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                                sourceFilter === 'all'
                                    ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-md'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setSourceFilter('automation')}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                                sourceFilter === 'automation'
                                    ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-md'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                        >
                            Automation
                        </button>
                        <button
                            onClick={() => setSourceFilter('manual')}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                                sourceFilter === 'manual'
                                    ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-md'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                        >
                            Manual
                        </button>
                    </div>
                    <button 
                        onClick={() => setActivePage('compose')} 
                        className="px-5 py-2.5 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-lg hover:from-primary-700 hover:to-primary-600 text-sm font-semibold flex items-center gap-2 shadow-md transition-all"
                    >
                        + Create Post
                    </button>
                </div>
            </div>

            {!hasAnyPosts ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center py-12">
                        <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                            <SparklesIcon className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No posts in workflow</h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-6">Create a draft from Compose or Automation to get started.</p>
                        <button 
                            onClick={() => setActivePage('compose')} 
                            className="px-5 py-2.5 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-lg hover:from-primary-700 hover:to-primary-600 text-sm font-semibold shadow-md transition-all"
                        >
                            Create Post
                        </button>
                    </div>
                </div>
            ) : (
            <div className="flex-1 overflow-x-auto overflow-y-hidden">
                <div className="flex h-full gap-6 min-w-[1000px] pb-4">
                    {columns.map(col => {
                        const columnStyles: Record<string, string> = {
                            'Draft': 'from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-800/50',
                            'In Review': 'from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20',
                            'Approved': 'from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20',
                            'Scheduled': 'from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20'
                        };
                        
                        const gradientClass = columnStyles[col.title] || 'from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-800/50';
                        
                        return (
                        <div key={col.title} className={`flex-1 flex flex-col min-w-[300px] bg-gradient-to-br ${gradientClass} rounded-xl shadow-sm border border-gray-200 dark:border-gray-700`}>
                            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-t-xl flex justify-between items-center">
                                <h3 className="font-bold text-gray-800 dark:text-gray-200 text-lg">{col.title}</h3>
                                <span className="bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-3 py-1 rounded-full text-xs font-bold shadow-sm border border-gray-200 dark:border-gray-600">{col.items.length}</span>
                            </div>
                            <div className="p-4 flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                                {col.items.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                                        No {col.title.toLowerCase()} posts
                                    </div>
                                ) : (
                                    col.items.map(post => (
                                    <div 
                                        key={post.id} 
                                        onClick={() => {
                                            // If Draft, navigate to Compose with preserved data
                                            if (post.status === 'Draft') {
                                                // Store post data in localStorage for Compose to load
                                                localStorage.setItem('draftPostToEdit', JSON.stringify({
                                                    id: post.id,
                                                    content: post.content,
                                                    mediaUrl: post.mediaUrl,
                                                    mediaType: post.mediaType,
                                                    platforms: post.platforms,
                                                    postGoal: (post as any).postGoal || 'engagement',
                                                    postTone: (post as any).postTone || 'friendly',
                                                }));
                                                setActivePage('compose');
                                                return;
                                            }
                                            setActivePost(post);
                                        }}
                                        className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all group"
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
                                                    const isFromAutomation = !!(post as any).workflowId;
                                                    
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
                                                <div className="w-20 h-20 flex-shrink-0 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden shadow-sm border border-gray-200 dark:border-gray-600">
                                                    {post.mediaType === 'video' ? (
                                                        <video src={post.mediaUrl} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <img src={post.mediaUrl} alt="preview" className="w-full h-full object-cover" />
                                                    )}
                                                </div>
                                            )}
                                            <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 flex-grow leading-relaxed">
                                                {post.content}
                                            </p>
                                        </div>
                                        
                                        <div className="mt-3 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <img src={post.author.avatar} alt={post.author.name} className="w-5 h-5 rounded-full" />
                                                <span className="text-xs text-gray-500 truncate max-w-[80px]">{post.author.name}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {post.comments.length > 0 && (
                                                    <div className="flex items-center gap-1 text-xs text-gray-400">
                                                        <ChatIcon className="w-3 h-3" /> {post.comments.length}
                                                    </div>
                                                )}
                                                {/* Delete button for Draft posts */}
                                                {post.status === 'Draft' && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation(); // Prevent card click
                                                            if (window.confirm('Delete this draft?')) {
                                                                handleDelete(post.id);
                                                            }
                                                        }}
                                                        className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                                        title="Delete draft"
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    ))
                                )}
                            </div>
                        </div>
                        );
                    })}
                </div>
            </div>
            )}

            {/* Detail Modal */}
            {activePost && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex overflow-hidden border border-gray-200 dark:border-gray-700">
                        {/* Close Button */}
                        <button 
                            onClick={() => setActivePost(null)} 
                            className="absolute top-4 right-4 p-2 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 z-10 transition-colors"
                            aria-label="Close details"
                        >
                            <XMarkIcon className="w-6 h-6" />
                        </button>

                        {/* Left: Preview & Content */}
                        <div className="w-1/2 p-6 border-r border-gray-200 dark:border-gray-700 overflow-y-auto custom-scrollbar bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
                             <div className="flex justify-between items-start mb-6 pr-8"> 
                                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Post Details</h3>
                            </div>
                            <div className="mb-6">
                                <span className={`px-4 py-2 rounded-full text-xs font-bold border shadow-sm ${statusColors[activePost.status]}`}>
                                    {activePost.status}
                                </span>
                            </div>

                            <div className="mb-6">
                                <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3 tracking-wider">Content</h4>
                                <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                     <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap mb-5 leading-relaxed">{activePost.content}</p>
                                     {activePost.mediaUrl && (
                                        <div className="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-900 max-h-80 flex justify-center border border-gray-200 dark:border-gray-700">
                                             {activePost.mediaType === 'video' ? (
                                                 <video src={activePost.mediaUrl} controls className="max-h-80 w-auto" />
                                             ) : (
                                                 <img src={activePost.mediaUrl} alt="Media" className="max-h-80 w-auto object-contain" />
                                             )}
                                        </div>
                                     )}
                                </div>
                            </div>
                            
                            <div className="flex justify-between gap-3">
                                <button 
                                    onClick={() => setIsPreviewOpen(true)} 
                                    className="flex-1 py-3 flex items-center justify-center gap-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold transition-all hover:border-primary-500 dark:hover:border-primary-500"
                                >
                                    <MobileIcon className="w-5 h-5" /> Mobile Preview
                                </button>
                                <button 
                                    onClick={() => handleDelete(activePost.id)} 
                                    className="py-3 px-5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg border-2 border-red-200 dark:border-red-900/50 transition-all hover:border-red-400 dark:hover:border-red-600" 
                                    title="Delete Post"
                                >
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Right: Actions & Comments */}
                        <div className="w-1/2 flex flex-col bg-white dark:bg-gray-800">
                             <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 pt-12">
                                <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-4 tracking-wider">Actions</h4>
                                <div className="flex flex-wrap gap-3">
                                    {activePost.status === 'Draft' && (
                                        <button 
                                            onClick={() => handleMoveStatus(activePost.id, 'In Review')} 
                                            className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-lg hover:from-blue-700 hover:to-blue-600 text-sm font-semibold shadow-md transition-all"
                                        >
                                            Submit for Review
                                        </button>
                                    )}
                                    {activePost.status === 'In Review' && (
                                        <>
                                            <button 
                                                onClick={() => handleMoveStatus(activePost.id, 'Draft')} 
                                                className="px-5 py-2.5 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 text-sm font-semibold transition-all"
                                            >
                                                Request Changes
                                            </button>
                                            <button 
                                                onClick={() => handleMoveStatus(activePost.id, 'Approved')} 
                                                className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-500 text-white rounded-lg hover:from-green-700 hover:to-emerald-600 text-sm font-semibold flex items-center gap-2 shadow-md transition-all"
                                            >
                                                <CheckCircleIcon className="w-5 h-5"/> Approve
                                            </button>
                                        </>
                                    )}
                                    {activePost.status === 'Approved' && (
                                        <>
                                            {user?.plan === 'Agency' && (
                                                <button 
                                                    onClick={() => handleMoveStatus(activePost.id, 'In Review')} 
                                                    className="px-5 py-2.5 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 text-sm font-semibold transition-all"
                                                >
                                                    Re-open Review
                                                </button>
                                            )}
                                            <button 
                                                onClick={async () => {
                                                    // Schedule the post
                                                    const scheduledDate = new Date();
                                                    scheduledDate.setDate(scheduledDate.getDate() + 1);
                                                    scheduledDate.setHours(12, 0, 0, 0);
                                                    const scheduledDateISO = scheduledDate.toISOString();
                                                    await updatePostInDb({ ...activePost, status: 'Scheduled', scheduledDate: scheduledDateISO });
                                                    
                                                    // Create calendar event
                                                    const calendarEvent = {
                                                        id: `cal-${activePost.id}`,
                                                        title: activePost.content.substring(0, 50) + (activePost.content.length > 50 ? '...' : ''),
                                                        date: scheduledDateISO,
                                                        type: activePost.mediaType === 'video' ? 'Reel' : 'Post',
                                                        platform: activePost.platforms[0] || 'Instagram',
                                                        status: 'Scheduled' as const,
                                                        thumbnail: activePost.mediaUrl || undefined,
                                                    };
                                                    await addCalendarEvent(calendarEvent);
                                                    
                                                    showToast('Post scheduled!', 'success');
                                                    setActivePost(null);
                                                }}
                                                className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-purple-500 text-white rounded-lg hover:from-purple-700 hover:to-purple-600 text-sm font-semibold shadow-md transition-all"
                                            >
                                                Schedule
                                            </button>
                                            <button 
                                                onClick={async () => {
                                                    // Publish immediately
                                                    const publishDate = new Date().toISOString();
                                                    await updatePostInDb({ ...activePost, status: 'Published', scheduledDate: activePost.scheduledDate || publishDate });
                                                    
                                                    // Create or update calendar event
                                                    const calendarEvent = {
                                                        id: `cal-${activePost.id}`,
                                                        title: activePost.content.substring(0, 50) + (activePost.content.length > 50 ? '...' : ''),
                                                        date: activePost.scheduledDate || publishDate,
                                                        type: activePost.mediaType === 'video' ? 'Reel' : 'Post',
                                                        platform: activePost.platforms[0] || 'Instagram',
                                                        status: 'Published' as const,
                                                        thumbnail: activePost.mediaUrl || undefined,
                                                    };
                                                    await addCalendarEvent(calendarEvent);
                                                    
                                                    showToast('Post published!', 'success');
                                                    setActivePost(null);
                                                }}
                                                className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-500 text-white rounded-lg hover:from-green-700 hover:to-emerald-600 text-sm font-semibold shadow-md transition-all"
                                            >
                                                Publish
                                            </button>
                                        </>
                                    )}
                                    {activePost.status === 'Scheduled' && (
                                        <>
                                            <button 
                                                onClick={async () => {
                                                    // Publish immediately
                                                    const updatedPost = { ...activePost, status: 'Published' as const, scheduledDate: activePost.scheduledDate || new Date().toISOString() };
                                                    await updatePostInDb(updatedPost);
                                                    
                                                    // Update local state immediately to remove from Scheduled column
                                                    if (setPosts) {
                                                        setPosts(prev => prev.map(p => p.id === activePost.id ? updatedPost : p));
                                                    }
                                                    
                                                    // Update calendar event status to Published
                                                    const calendarEvent = {
                                                        id: `cal-${activePost.id}`,
                                                        title: activePost.content.substring(0, 50) + (activePost.content.length > 50 ? '...' : ''),
                                                        date: activePost.scheduledDate || new Date().toISOString(),
                                                        type: activePost.mediaType === 'video' ? 'Reel' : 'Post',
                                                        platform: activePost.platforms[0] || 'Instagram',
                                                        status: 'Published' as const,
                                                        thumbnail: activePost.mediaUrl || undefined,
                                                    };
                                                    await addCalendarEvent(calendarEvent);
                                                    
                                                    showToast('Post published!', 'success');
                                                    setActivePost(null);
                                                }}
                                                className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-500 text-white rounded-lg hover:from-green-700 hover:to-emerald-600 text-sm font-semibold shadow-md transition-all"
                                            >
                                                Publish Now
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="flex-1 p-6 flex flex-col overflow-hidden">
                                <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-4 tracking-wider">Comments & History</h4>
                                <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 custom-scrollbar">
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
                                
                                <div className="flex gap-3">
                                    <div className="relative flex-grow">
                                        <input 
                                            type="text" 
                                            value={comment} 
                                            onChange={e => setComment(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                                            placeholder={isGeneratingComment ? "AI is thinking..." : "Add a comment..."}
                                            className="w-full p-3 pr-12 border-2 rounded-lg bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 disabled:opacity-50 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                                            disabled={isGeneratingComment}
                                        />
                                         <button 
                                            onClick={handleGenerateAIComment} 
                                            disabled={isGeneratingComment}
                                            className={`absolute top-1/2 right-3 -translate-y-1/2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-primary-600 dark:text-primary-400 transition-all ${isGeneratingComment ? 'animate-pulse' : ''}`}
                                            title="Generate AI Feedback"
                                        >
                                            <SparklesIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <button 
                                        onClick={handleAddComment} 
                                        disabled={!comment.trim()} 
                                        className="p-3 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-lg hover:from-primary-700 hover:to-primary-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all"
                                    >
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
