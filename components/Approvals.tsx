
import React, { useState } from 'react';
import { useAppContext } from './AppContext';
import { ApprovalStatus, Post, Platform } from '../types';
import { CheckCircleIcon, MobileIcon, SendIcon, TrashIcon, EditIcon, ChatIcon, UserIcon, XMarkIcon, SparklesIcon, ClipboardCheckIcon, CalendarIcon } from './icons/UIIcons';
import { InstagramIcon, TikTokIcon, XIcon, ThreadsIcon, YouTubeIcon, LinkedInIcon, FacebookIcon, PinterestIcon } from './icons/PlatformIcons';
import { MobilePreviewModal } from './MobilePreviewModal';
import { UpgradePrompt } from './UpgradePrompt';
import { generateCritique, generateCaptions } from "../src/services/geminiService";
import { db } from '../firebaseConfig';
import { doc, setDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { OFFLINE_MODE } from '../constants';

// Filter status columns - Only show Draft column
const getStatusColumns = (userPlan?: string): ApprovalStatus[] => {
  return ['Draft'];
};

const platformIcons: Record<Platform, React.ReactElement<{ className?: string }>> = {
  Instagram: <InstagramIcon />,
  TikTok: <TikTokIcon />,
  X: <XIcon />,
  Threads: <ThreadsIcon />,
  YouTube: <YouTubeIcon />,
  LinkedIn: <LinkedInIcon />,
  Facebook: <FacebookIcon />,
  Pinterest: <PinterestIcon />,
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
    const [selectedApprovedIds, setSelectedApprovedIds] = useState<Set<string>>(new Set());
    const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());
    const [exportPreviewPosts, setExportPreviewPosts] = useState<Post[] | null>(null);
    
    // Draft edit modal state
    const [editingDraft, setEditingDraft] = useState<Post | null>(null);
    const [draftContent, setDraftContent] = useState('');
    const [draftGoal, setDraftGoal] = useState('engagement');
    const [draftTone, setDraftTone] = useState('friendly');
    const [draftScheduleDate, setDraftScheduleDate] = useState('');
    const [draftScheduleTime, setDraftScheduleTime] = useState('');
    const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
    const [isRegeneratingCaption, setIsRegeneratingCaption] = useState<boolean>(false);
    const [platformCaption, setPlatformCaption] = useState<string>('');

    // Safety check for user
    if (!user) {
        return <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full flex items-center justify-center"><p className="text-gray-500 dark:text-gray-400">Loading...</p></div>;
    }

    if (!['Elite', 'Agency'].includes(user?.plan || "") && user?.role !== 'Admin') {
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

    // Filter posts by source and exclude Published posts and OnlyFans posts
    // OnlyFans drafts should only appear in OnlyFans Studio calendar, not in main approvals workflow
    const filteredPosts = (posts || []).filter(post => {
        // Exclude Published posts - they're done and shouldn't appear in workflow
        if (post.status === 'Published') {
            return false;
        }
        
        // Exclude OnlyFans posts - they should only appear in OnlyFans Studio calendar
        if (post.platforms && (post.platforms as any[]).includes('OnlyFans')) {
            return false;
        }
        
        if (sourceFilter === 'all') return true;
        
        // Check if post is from Automation (workflowId indicates Automation)
        const isFromAutomation = !!(post as any).workflowId;
        
        // Manual posts have no workflowId
        const isManual = !isFromAutomation;
        
        if (sourceFilter === 'automation') return isFromAutomation;
        if (sourceFilter === 'manual') return isManual;
        
        return true;
    });

    const statusColumns = getStatusColumns();
    const columns = statusColumns.map(status => ({
        title: status,
        items: filteredPosts.filter(p => {
            // Match exact status
            if (p.status === status) return true;
            
            // Handle status variations
            if (status === 'In Review' && (p.status === 'Pending Review' || p.status === 'Review')) return true;
            
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

    const toggleApprovedSelection = (postId: string, checked: boolean) => {
        setSelectedApprovedIds(prev => {
            const next = new Set(prev);
            if (checked) {
                next.add(postId);
            } else {
                next.delete(postId);
            }
            return next;
        });
    };

    const toggleDraftSelection = (postId: string, checked: boolean) => {
        setSelectedDraftIds(prev => {
            const next = new Set(prev);
            if (checked) {
                next.add(postId);
            } else {
                next.delete(postId);
            }
            return next;
        });
    };

    const toggleSelectAllDrafts = (checked: boolean) => {
        if (checked) {
            // Select all draft posts
            const draftColumn = columns.find(col => col.title === 'Draft');
            if (draftColumn) {
                const allDraftIds = new Set(draftColumn.items.map(post => post.id));
                setSelectedDraftIds(allDraftIds);
            }
        } else {
            // Deselect all
            setSelectedDraftIds(new Set());
        }
    };

    const handleBulkDeleteDrafts = async () => {
        if (selectedDraftIds.size === 0) {
            showToast('Select at least one draft to delete.', 'error');
            return;
        }

        if (!window.confirm(`Delete ${selectedDraftIds.size} draft post(s)?`)) {
            return;
        }

        if (!user) return;

        let deletedCount = 0;
        let failedCount = 0;

        for (const postId of selectedDraftIds) {
            try {
                await deleteDoc(doc(db, 'users', user.id, 'posts', postId));
                deletedCount++;
            } catch (e) {
                console.error(`Failed to delete post ${postId}:`, e);
                failedCount++;
            }
        }

        // Update local state
        if (setPosts) {
            setPosts(prev => prev.filter(p => !selectedDraftIds.has(p.id)));
        }

        // Clear selection
        setSelectedDraftIds(new Set());

        if (failedCount === 0) {
            showToast(`Deleted ${deletedCount} draft post(s)`, 'success');
        } else {
            showToast(`Deleted ${deletedCount} post(s), ${failedCount} failed`, 'warning');
        }

        // Close active post if it was deleted
        if (activePost && selectedDraftIds.has(activePost.id)) {
            setActivePost(null);
        }
    };

    const handleExportApproved = async () => {
        const approvedPosts = filteredPosts.filter(
            p => p.status === 'Approved' && selectedApprovedIds.has(p.id)
        );

        if (approvedPosts.length === 0) {
            showToast('Select at least one approved post to export.', 'error');
            return;
        }

        // Build a human-readable content pack for manual posting
        const lines: string[] = [];

        for (let idx = 0; idx < approvedPosts.length; idx++) {
            const p = approvedPosts[idx];
            const num = idx + 1;
            const platforms = (p.platforms || []).join(', ') || 'No platforms set';
            const scheduled = p.scheduledDate
                ? new Date(p.scheduledDate).toLocaleString()
                : 'No planned date';
            const mediaUrl = p.mediaUrl || 'No media URL (text-only post)';

            lines.push(
`Post ${num}
Platforms: ${platforms}
Planned Date/Time: ${scheduled}
Media: ${mediaUrl}

Caption:
${p.content}

----------------------------------------`
            );

            // Mark media as "exported" in the Media Library (move to an Export folder and record usage)
            if (user && p.mediaUrl) {
                try {
                    // Ensure an "Export" folder exists
                    const exportFolderId = 'export';
                    const exportFolderRef = doc(db, 'users', user.id, 'media_folders', exportFolderId);
                    await setDoc(
                        exportFolderRef,
                        {
                            id: exportFolderId,
                            userId: user.id,
                            name: 'Exported / Used',
                            createdAt: new Date().toISOString(),
                        },
                        { merge: true }
                    );

                    // Find any media library items that match this mediaUrl
                    const mediaRef = collection(db, 'users', user.id, 'media_library');
                    const q = query(mediaRef, where('url', '==', p.mediaUrl));
                    const snapshot = await getDocs(q);

                    for (const docSnap of snapshot.docs) {
                        const data = docSnap.data() as MediaLibraryItem;
                        const usedInPosts = Array.isArray(data.usedInPosts) ? data.usedInPosts : [];
                        if (!usedInPosts.includes(p.id)) {
                            usedInPosts.push(p.id);
                        }

                        await setDoc(
                            docSnap.ref,
                            {
                                folderId: exportFolderId,
                                usedInPosts,
                            },
                            { merge: true }
                        );
                    }
                } catch (err) {
                    console.error('Failed to mark media as exported:', err);
                }
            }
        }

        // Also show an in-app "content pack" preview so mobile users can easily copy captions and save media
        setExportPreviewPosts(approvedPosts);

        const blob = new Blob([lines.join('\n')], {
            type: 'text/plain',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `approved-posts-export-${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('Exported approved posts as a ready-to-use content pack.', 'success');
    };
    
    return (
        <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full flex flex-col">
            <MobilePreviewModal 
                isOpen={isPreviewOpen} 
                onClose={() => setIsPreviewOpen(false)} 
                caption={activePost?.content || ''}
                media={activePost?.mediaUrl ? { previewUrl: activePost.mediaUrl, type: activePost.mediaType || 'image' } : null}
                user={activePost?.author ?? null}
            />

            {/* Export Preview Modal: shows selected approved posts as easy-to-use cards */}
            {exportPreviewPosts && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Exported Content Pack</h2>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    On mobile: long‑press an image to save it, then tap and hold to copy the caption below.
                                </p>
                            </div>
                            <button
                                onClick={() => setExportPreviewPosts(null)}
                                className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                aria-label="Close export preview"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                            {exportPreviewPosts.map((p, idx) => {
                                const platforms = (p.platforms || []).join(', ') || 'No platforms set';
                                const scheduled = p.scheduledDate
                                    ? new Date(p.scheduledDate).toLocaleString()
                                    : 'No planned date';
                                return (
                                    <div
                                        key={p.id}
                                        className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col md:flex-row gap-4"
                                    >
                                        <div className="w-full md:w-40 flex-shrink-0">
                                            {p.mediaUrl ? (
                                                <div className="w-full aspect-square rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700">
                                                    {p.mediaType === 'video' ? (
                                                        <video
                                                            src={p.mediaUrl}
                                                            className="w-full h-full object-cover"
                                                            controls
                                                        />
                                                    ) : (
                                                        <img
                                                            src={p.mediaUrl}
                                                            alt={`Post ${idx + 1}`}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="w-full aspect-square rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs text-gray-500 dark:text-gray-400">
                                                    No media
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 flex flex-col gap-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
                                                    Post {idx + 1}
                                                </span>
                                                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                                    {scheduled}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-600 dark:text-gray-400">
                                                <span className="font-semibold">Platforms:</span> {platforms}
                                            </p>
                                            <div className="mt-1 w-full">
                                                <div className="flex items-center justify-between mb-1">
                                                    <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                                                        Caption
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            try {
                                                                await navigator.clipboard.writeText(p.content || '');
                                                                showToast('Caption copied to clipboard.', 'success');
                                                            } catch {
                                                                showToast('Unable to copy. Please select and copy the text manually.', 'error');
                                                            }
                                                        }}
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30"
                                                    >
                                                        <ClipboardCheckIcon className="w-3 h-3" />
                                                        Copy
                                                    </button>
                                                </div>
                                                <div className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                                                    {p.content}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Drafts</h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage your content pipeline from draft to “ready to post” content packs.</p>
                    {!hasAnyPosts && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Posts appear here when you save drafts or create content from Compose or Automation.</p>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {/* Source Filter - Hidden in offline creator mode */}
                    {false && (
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
                    )}
                    {hasAnyPosts && (
                        <button 
                            onClick={() => {
                                const pack = filteredPosts
                                  .map((p, idx) => {
                                      const date = p.scheduledDate
                                        ? new Date(p.scheduledDate).toLocaleString()
                                        : 'No planned date';
                                      const platforms = p.platforms.join(', ');
                                      return `#${idx + 1} [${platforms}] – ${date}\n${p.content}\n`;
                                  })
                                  .join('\n-------------------------\n\n');
                                navigator.clipboard.writeText(pack).catch(() => {});
                                showToast('Copied current workflow captions to clipboard.', 'success');
                            }} 
                            className="px-5 py-2.5 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-lg hover:from-primary-700 hover:to-primary-600 text-sm font-semibold flex items-center gap-2 shadow-md transition-all"
                        >
                            <ClipboardCheckIcon className="w-4 h-4" />
                            Copy all captions
                        </button>
                    )}
                    {/* Create Post button - Hidden in offline creator mode */}
                    {false && (
                        <button 
                            onClick={() => setActivePage('compose')} 
                            className="px-5 py-2.5 bg-gradient-to-r from-gray-800 to-gray-700 text-white rounded-lg hover:from-gray-900 hover:to-gray-800 text-sm font-semibold flex items-center gap-2 shadow-md transition-all"
                        >
                            + Create Post
                        </button>
                    )}
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
                        {false && (
                            <button 
                                onClick={() => setActivePage('compose')} 
                                className="px-5 py-2.5 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-lg hover:from-primary-700 hover:to-primary-600 text-sm font-semibold shadow-md transition-all"
                            >
                                Create Post
                            </button>
                        )}
                    </div>
                </div>
            ) : (
            <div className="flex-1 overflow-x-auto overflow-y-hidden">
                <div className="flex h-full gap-6 justify-start sm:justify-center pb-4 px-4">
                    {columns.map(col => {
                        const columnStyles: Record<string, string> = {
                            'Draft': 'from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-800/50',
                            'In Review': 'from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20',
                            'Approved': 'from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20',
                            'Scheduled': 'from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20'
                        };
                        
                        const gradientClass = columnStyles[col.title] || 'from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-800/50';
                        
                        const isApprovedColumn = col.title === 'Approved';
                        const isDraftColumn = col.title === 'Draft';
                        const allDraftsSelected = isDraftColumn && col.items.length > 0 && selectedDraftIds.size === col.items.length;
                        const someDraftsSelected = isDraftColumn && selectedDraftIds.size > 0 && selectedDraftIds.size < col.items.length;
                        return (
                        <div key={col.title} className={`flex flex-col min-w-[400px] max-w-[600px] bg-gradient-to-br ${gradientClass} rounded-xl shadow-sm border border-gray-200 dark:border-gray-700`}>
                            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-t-xl flex justify-between items-center gap-3">
                                <div className="flex items-center gap-2">
                                    {isDraftColumn && col.items.length > 0 && (
                                        <>
                                            <input
                                                type="checkbox"
                                                checked={allDraftsSelected}
                                                ref={(input) => {
                                                    if (input) {
                                                        input.indeterminate = someDraftsSelected;
                                                    }
                                                }}
                                                onChange={(e) => {
                                                    toggleSelectAllDrafts(e.target.checked);
                                                }}
                                                className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                                                title={allDraftsSelected ? "Deselect all" : someDraftsSelected ? "Some selected" : "Select all"}
                                            />
                                            <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">Select All</span>
                                        </>
                                    )}
                                    <h3 className="font-bold text-gray-800 dark:text-gray-200 text-lg">{col.title}</h3>
                                    <span className="bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-3 py-1 rounded-full text-xs font-bold shadow-sm border border-gray-200 dark:border-gray-600">{col.items.length}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isApprovedColumn && col.items.length > 0 && (
                                        <button
                                            onClick={handleExportApproved}
                                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-primary-600 to-primary-500 text-white hover:from-primary-700 hover:to-primary-600 shadow-sm"
                                        >
                                            Export selected
                                        </button>
                                    )}
                                    {isDraftColumn && col.items.length > 0 && selectedDraftIds.size > 0 && (
                                        <button
                                            onClick={handleBulkDeleteDrafts}
                                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-red-600 to-red-500 text-white hover:from-red-700 hover:to-red-600 shadow-sm flex items-center gap-1"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                            Delete ({selectedDraftIds.size})
                                        </button>
                                    )}
                                </div>
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
                                            // If Draft, open edit modal instead of navigating
                                            if (post.status === 'Draft') {
                                                setEditingDraft(post);
                                                setDraftContent(post.content || '');
                                                setDraftGoal((post as any).postGoal || 'engagement');
                                                setDraftTone((post as any).postTone || 'friendly');
                                                // Set first platform as selected (single select)
                                                setSelectedPlatform(post.platforms && post.platforms.length > 0 ? post.platforms[0] : null);
                                                // Initialize platform caption with current content
                                                setPlatformCaption(post.content || '');
                                                
                                                // Set schedule date/time if exists
                                                if (post.scheduledDate) {
                                                    const date = new Date(post.scheduledDate);
                                                    setDraftScheduleDate(date.toISOString().slice(0, 10));
                                                    setDraftScheduleTime(date.toTimeString().slice(0, 5));
                                                } else {
                                                    setDraftScheduleDate('');
                                                    setDraftScheduleTime('');
                                                }
                                                return;
                                            }
                                            setActivePost(post);
                                        }}
                                        className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all group"
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex gap-2 items-center">
                                                {(isApprovedColumn || isDraftColumn) && (
                                                    <input
                                                        type="checkbox"
                                                        checked={isApprovedColumn ? selectedApprovedIds.has(post.id) : selectedDraftIds.has(post.id)}
                                                        onChange={e => {
                                                            e.stopPropagation();
                                                            if (isApprovedColumn) {
                                                                toggleApprovedSelection(post.id, e.target.checked);
                                                            } else {
                                                                toggleDraftSelection(post.id, e.target.checked);
                                                            }
                                                        }}
                                                        onClick={e => e.stopPropagation()}
                                                        className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                                                    />
                                                )}
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
                                            </div>
                                            {post.mediaType && (
                                                <span className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 rounded text-gray-500 capitalize">{post.mediaType}</span>
                                            )}
                                        </div>
                                        
                                        <div className="flex gap-3">
                                            {post.mediaUrl && (
                                                <div className="w-20 h-20 flex-shrink-0 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden shadow-sm border border-gray-200 dark:border-gray-600">
                                                    {post.mediaType === 'video' ? (
                                                        <video src={post.mediaUrl} className="w-full h-full object-cover" controls muted={false} />
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
                                                {/* Delete button for Draft posts - always visible */}
                                                {post.status === 'Draft' && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation(); // Prevent card click
                                                            handleDelete(post.id);
                                                        }}
                                                        className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors opacity-100"
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
                                            {!OFFLINE_MODE && (
                                                <>
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
                                                            const updatedPost = { ...activePost, status: 'Published' as const, scheduledDate: activePost.scheduledDate || publishDate };
                                                            await updatePostInDb(updatedPost);
                                                            
                                                            // Update local state immediately to remove from workflow
                                                            if (setPosts) {
                                                                setPosts(prev => prev.map(p => p.id === activePost.id ? updatedPost : p));
                                                            }
                                                            
                                                            // Don't create calendar event manually - Calendar component auto-creates from posts
                                                            
                                                            showToast('Post published!', 'success');
                                                            setActivePost(null);
                                                        }}
                                                        className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-500 text-white rounded-lg hover:from-green-700 hover:to-emerald-600 text-sm font-semibold shadow-md transition-all"
                                                    >
                                                        Publish
                                                    </button>
                                                </>
                                            )}
                                        </>
                                    )}
                                    {activePost.status === 'Scheduled' && !OFFLINE_MODE && (
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
                                                    
                                                    // Don't create calendar event manually - Calendar component auto-creates from posts
                                                    
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

            {/* Draft Edit Modal */}
            {editingDraft && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700">
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Edit Draft</h2>
                            <button
                                onClick={() => {
                                    setEditingDraft(null);
                                    setDraftContent('');
                                    setPlatformCaption('');
                                    setSelectedPlatform(null);
                                }}
                                className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                            {/* Media Preview */}
                            {editingDraft.mediaUrl && (
                                <div className="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-900 max-h-64 flex justify-center border border-gray-200 dark:border-gray-700">
                                    {editingDraft.mediaType === 'video' ? (
                                        <video src={editingDraft.mediaUrl} controls className="max-h-64 w-auto" />
                                    ) : (
                                        <img src={editingDraft.mediaUrl} alt="Media" className="max-h-64 w-auto object-contain" />
                                    )}
                                </div>
                            )}

                            {/* Goal and Tone Dropdowns */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Goal
                                    </label>
                                    <select
                                        value={draftGoal}
                                        onChange={(e) => setDraftGoal(e.target.value)}
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    >
                                        <option value="engagement">Increase Engagement</option>
                                        <option value="sales">Drive Sales</option>
                                        <option value="awareness">Build Awareness</option>
                                        {(!user?.userType || user.userType !== 'Business' || user.plan === 'Agency') && (
                                            <option value="followers">Increase Followers/Fans</option>
                                        )}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Tone
                                    </label>
                                    <select
                                        value={draftTone}
                                        onChange={(e) => setDraftTone(e.target.value)}
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    >
                                        <option value="friendly">Friendly</option>
                                        <option value="witty">Witty</option>
                                        <option value="inspirational">Inspirational</option>
                                        <option value="professional">Professional</option>
                                        {(!user?.userType || user.userType !== 'Business' || user.plan === 'Agency') && (
                                            <>
                                                <option value="sexy-bold">Sexy / Bold</option>
                                                <option value="sexy-explicit">Sexy / Explicit</option>
                                            </>
                                        )}
                                    </select>
                                </div>
                            </div>

                            {/* Platform Selection - Single Select */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Select Platform
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {(Object.keys(platformIcons) as Platform[]).map(platform => {
                                        const isSelected = selectedPlatform === platform;
                                        return (
                                            <button
                                                key={platform}
                                                onClick={() => {
                                                    setSelectedPlatform(platform);
                                                    // If switching platforms, update caption to current content
                                                    if (!platformCaption && draftContent) {
                                                        setPlatformCaption(draftContent);
                                                    }
                                                }}
                                                className={`flex items-center justify-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${
                                                    isSelected
                                                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
                                                        : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                                                }`}
                                            >
                                                <span className="w-3 h-3 flex items-center justify-center flex-shrink-0">{platformIcons[platform]}</span>
                                                <span className="hidden sm:inline">{platform}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                {!selectedPlatform && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Please select a platform to generate platform-optimized captions</p>
                                )}
                            </div>

                            {/* Platform Caption */}
                            {selectedPlatform ? (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {platformIcons[selectedPlatform] && React.cloneElement(platformIcons[selectedPlatform], { className: "w-5 h-5" })}
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedPlatform} Caption</h3>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                if (!editingDraft.mediaUrl) {
                                                    showToast('Media is required to generate captions', 'error');
                                                    return;
                                                }
                                                if (!selectedPlatform) {
                                                    showToast('Please select a platform first', 'error');
                                                    return;
                                                }
                                                setIsRegeneratingCaption(true);
                                                try {
                                                    const result = await generateCaptions({
                                                        mediaUrl: editingDraft.mediaUrl,
                                                        goal: draftGoal,
                                                        tone: draftTone,
                                                        promptText: undefined,
                                                        platforms: [selectedPlatform] // Single platform for optimization
                                                    });
                                                    if (result && result.length > 0) {
                                                        const newCaption = result[0].caption || '';
                                                        setPlatformCaption(newCaption);
                                                        setDraftContent(newCaption);
                                                        showToast(`Caption regenerated for ${selectedPlatform}`, 'success');
                                                    }
                                                } catch (error) {
                                                    console.error('Failed to regenerate caption:', error);
                                                    showToast('Failed to regenerate caption', 'error');
                                                } finally {
                                                    setIsRegeneratingCaption(false);
                                                }
                                            }}
                                            disabled={isRegeneratingCaption || !editingDraft.mediaUrl || !selectedPlatform}
                                            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                                        >
                                            {isRegeneratingCaption ? (
                                                <>
                                                    <SparklesIcon className="w-4 h-4 animate-spin" />
                                                    Generating...
                                                </>
                                            ) : (
                                                <>
                                                    <SparklesIcon className="w-4 h-4" />
                                                    Regenerate
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <textarea
                                        value={platformCaption || draftContent}
                                        onChange={(e) => {
                                            setPlatformCaption(e.target.value);
                                            setDraftContent(e.target.value);
                                        }}
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-y min-h-[100px]"
                                        placeholder={`Enter caption optimized for ${selectedPlatform}...`}
                                    />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Select a platform above to generate and edit captions</p>
                                </div>
                            )}

                            {/* Schedule Date & Time */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Schedule Date
                                    </label>
                                    <input
                                        type="date"
                                        value={draftScheduleDate}
                                        onChange={(e) => setDraftScheduleDate(e.target.value)}
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Schedule Time
                                    </label>
                                    <input
                                        type="time"
                                        value={draftScheduleTime}
                                        onChange={(e) => setDraftScheduleTime(e.target.value)}
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4">
                            <button
                                onClick={() => {
                                    setEditingDraft(null);
                                    setDraftContent('');
                                    setPlatformCaption('');
                                    setSelectedPlatform(null);
                                }}
                                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={async () => {
                                        if (!editingDraft || !user) return;
                                        
                                        // Combine date and time for scheduledDate
                                        let scheduledDateISO: string | undefined = undefined;
                                        if (draftScheduleDate && draftScheduleTime) {
                                            const dateTime = new Date(`${draftScheduleDate}T${draftScheduleTime}`);
                                            scheduledDateISO = dateTime.toISOString();
                                        } else if (draftScheduleDate) {
                                            const dateTime = new Date(`${draftScheduleDate}T12:00`);
                                            scheduledDateISO = dateTime.toISOString();
                                        }

                                        if (!selectedPlatform) {
                                            showToast('Please select a platform', 'error');
                                            return;
                                        }

                                        const updatedPost: Post = {
                                            ...editingDraft,
                                            content: platformCaption || draftContent,
                                            platforms: [selectedPlatform],
                                            scheduledDate: scheduledDateISO,
                                            postGoal: draftGoal as any,
                                            postTone: draftTone as any,
                                        };

                                        try {
                                            const safePost = JSON.parse(JSON.stringify(updatedPost));
                                            await setDoc(doc(db, 'users', user.id, 'posts', editingDraft.id), safePost, { merge: true });
                                            
                                            // Update local state
                                            if (setPosts) {
                                                setPosts(prev => prev.map(p => p.id === editingDraft.id ? updatedPost : p));
                                            }

                                            // Create/update calendar event if scheduled
                                            if (scheduledDateISO) {
                                                const calendarEventId = `post-${editingDraft.id}-${selectedPlatform}-0`;
                                                await addCalendarEvent({
                                                    id: calendarEventId,
                                                    title: (platformCaption || draftContent).substring(0, 30) + '...',
                                                    date: scheduledDateISO,
                                                    type: editingDraft.mediaType === 'video' ? 'Reel' : 'Post',
                                                    platform: selectedPlatform,
                                                    status: 'Draft',
                                                    thumbnail: editingDraft.mediaUrl || undefined
                                                } as any);
                                            }

                                            showToast('Draft updated successfully!', 'success');
                                            setEditingDraft(null);
                                            setDraftContent('');
                                            setPlatformCaption('');
                                            setSelectedPlatform(null);
                                        } catch (error) {
                                            console.error('Failed to update draft:', error);
                                            showToast('Failed to update draft', 'error');
                                        }
                                    }}
                                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
                                >
                                    <EditIcon className="w-4 h-4" />
                                    Save Changes
                                </button>
                                {draftScheduleDate && draftScheduleTime && (
                                    <button
                                        onClick={async () => {
                                            if (!editingDraft || !user) return;
                                            
                                            const dateTime = new Date(`${draftScheduleDate}T${draftScheduleTime}`);
                                            const scheduledDateISO = dateTime.toISOString();

                                            if (!selectedPlatform) {
                                                showToast('Please select a platform', 'error');
                                                return;
                                            }

                                            const updatedPost: Post = {
                                                ...editingDraft,
                                                content: platformCaption || draftContent,
                                                platforms: [selectedPlatform],
                                                status: 'Scheduled',
                                                scheduledDate: scheduledDateISO,
                                                postGoal: draftGoal as any,
                                                postTone: draftTone as any,
                                            };

                                            try {
                                                const safePost = JSON.parse(JSON.stringify(updatedPost));
                                                await setDoc(doc(db, 'users', user.id, 'posts', editingDraft.id), safePost, { merge: true });
                                                
                                                // Update local state
                                                if (setPosts) {
                                                    setPosts(prev => prev.map(p => p.id === editingDraft.id ? updatedPost : p));
                                                }

                                                // Update calendar event (draft already exists on calendar, just update status)
                                                const calendarEventId = `post-${editingDraft.id}-${selectedPlatform}-0`;
                                                await addCalendarEvent({
                                                    id: calendarEventId,
                                                    title: (platformCaption || draftContent).substring(0, 30) + '...',
                                                    date: scheduledDateISO,
                                                    type: editingDraft.mediaType === 'video' ? 'Reel' : 'Post',
                                                    platform: selectedPlatform,
                                                    status: 'Scheduled',
                                                    thumbnail: editingDraft.mediaUrl || undefined
                                                } as any);

                                                showToast('Draft saved to calendar as Scheduled!', 'success');
                                                setEditingDraft(null);
                                                setDraftContent('');
                                                setPlatformCaption('');
                                                setSelectedPlatform(null);
                                            } catch (error) {
                                                console.error('Failed to save draft to calendar:', error);
                                                showToast('Failed to save draft to calendar', 'error');
                                            }
                                        }}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                                    >
                                        <CalendarIcon className="w-4 h-4" />
                                        Save to Calendar
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
