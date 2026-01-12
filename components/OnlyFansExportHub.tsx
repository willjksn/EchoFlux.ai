import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { DownloadIcon, XMarkIcon, PlusIcon, ClockIcon, FileIcon, ImageIcon, VideoIcon, SparklesIcon, FolderIcon, CopyIcon, CheckCircleIcon } from './icons/UIIcons';
import { auth, db } from '../firebaseConfig';
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, Timestamp, setDoc } from 'firebase/firestore';
import { OnlyFansCalendarEvent } from './OnlyFansCalendar';
import { FanSelector } from './FanSelector';

interface ExportPackage {
    id?: string;
    caption: string;
    mediaUrls: string[]; // Changed from File[] to URLs for Firestore persistence
    mediaNames?: string[]; // Store file names for reference
    suggestedTime: string;
    teaserCaptions: { platform: string; caption: string }[];
    createdAt: Date | Timestamp;
}

interface MediaItem {
    id: string;
    url: string;
    name: string;
    type: string;
}

export const OnlyFansExportHub: React.FC = () => {
    const { user, showToast } = useAppContext();
    const [caption, setCaption] = useState('');
    const [mediaFiles, setMediaFiles] = useState<File[]>([]);
    const [mediaUrls, setMediaUrls] = useState<string[]>([]);
    const [mediaNames, setMediaNames] = useState<string[]>([]);
    const [suggestedTime, setSuggestedTime] = useState('');
    const [scheduledDate, setScheduledDate] = useState(''); // ISO date string for calendar
    const [scheduledTime, setScheduledTime] = useState(''); // Time string (HH:mm)
    const [addToCalendar, setAddToCalendar] = useState(true); // Auto-add to calendar
    const [teaserCaptions, setTeaserCaptions] = useState<{ platform: string; caption: string }[]>([]);
    const [isGeneratingTeasers, setIsGeneratingTeasers] = useState(false);
    const [exportPackages, setExportPackages] = useState<ExportPackage[]>([]);
    const [showMediaVault, setShowMediaVault] = useState(false);
    const [mediaVaultItems, setMediaVaultItems] = useState<MediaItem[]>([]);
    const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());
    const [copiedItem, setCopiedItem] = useState<string | null>(null); // Track what was copied
    const [selectedFanId, setSelectedFanId] = useState<string | null>(null);
    const [selectedFanName, setSelectedFanName] = useState<string | null>(null);

    // Load media from Media Vault
    useEffect(() => {
        const loadMediaVault = async () => {
            if (!user?.id) return;
            try {
                const mediaRef = collection(db, 'users', user.id, 'onlyfans_media_library');
                const q = query(mediaRef, orderBy('uploadedAt', 'desc'));
                const snapshot = await getDocs(q);
                
                const items: MediaItem[] = [];
                snapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    items.push({
                        id: docSnap.id,
                        url: data.url,
                        name: data.name || 'Untitled',
                        type: data.type || 'image',
                    });
                });
                setMediaVaultItems(items);
            } catch (error) {
                console.error('Error loading media vault:', error);
            }
        };
        loadMediaVault();
    }, [user?.id]);

    // Load saved packages from Firestore
    useEffect(() => {
        const loadPackages = async () => {
            if (!user?.id) return;
            try {
                const packagesSnap = await getDocs(query(collection(db, 'users', user.id, 'onlyfans_export_packages'), orderBy('createdAt', 'desc')));
                const packages: ExportPackage[] = [];
                packagesSnap.forEach((docSnap) => {
                    const data = docSnap.data();
                    packages.push({
                        id: docSnap.id,
                        caption: data.caption || '',
                        mediaUrls: data.mediaUrls || [],
                        mediaNames: data.mediaNames || [],
                        suggestedTime: data.suggestedTime || '',
                        teaserCaptions: data.teaserCaptions || [],
                        createdAt: data.createdAt || Timestamp.now(),
                    });
                });
                setExportPackages(packages);
            } catch (error) {
                console.error('Error loading packages:', error);
            }
        };
        loadPackages();
    }, [user?.id]);

    const handleAddMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        // Only add to mediaUrls/mediaNames - don't duplicate in mediaFiles
        // mediaFiles is kept for backwards compatibility but not displayed
        files.forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (typeof reader.result === 'string') {
                    setMediaUrls(prev => [...prev, reader.result as string]);
                    setMediaNames(prev => [...prev, file.name]);
                }
            };
            reader.readAsDataURL(file);
        });
        // Clear the input so same file can be selected again if needed
        e.target.value = '';
    };

    const handleAddFromVault = () => {
        const selected = mediaVaultItems.filter(item => selectedMediaIds.has(item.id));
        const newUrls = selected.map(item => item.url);
        const newNames = selected.map(item => item.name);
        setMediaUrls(prev => [...prev, ...newUrls]);
        setMediaNames(prev => [...prev, ...newNames]);
        setSelectedMediaIds(new Set());
        setShowMediaVault(false);
        showToast(`Added ${selected.length} item(s) from Media Vault`, 'success');
    };

    const handleRemoveMedia = (index: number) => {
        // Only remove from mediaUrls/mediaNames since that's what we display
        // mediaFiles is kept for backwards compatibility but not actively used
        setMediaUrls(prev => prev.filter((_, i) => i !== index));
        setMediaNames(prev => prev.filter((_, i) => i !== index));
        // Also remove from mediaFiles if it exists at that index
        if (index < mediaFiles.length) {
            setMediaFiles(prev => prev.filter((_, i) => i !== index));
        }
    };

    const handleToggleMediaSelection = (id: string) => {
        setSelectedMediaIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const handleGenerateTeasers = async () => {
        if (!caption.trim()) {
            showToast('Please add a caption first to generate teaser captions', 'error');
            return;
        }

        setIsGeneratingTeasers(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const platforms = ['Instagram', 'X (Twitter)', 'TikTok'];
            const generated: { platform: string; caption: string }[] = [];

            for (const platform of platforms) {
                try {
                    const response = await fetch('/api/generateText', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                        body: JSON.stringify({
                            prompt: `Generate a safe, teaser caption for ${platform} based on this OnlyFans caption. Make it appropriate for mainstream social media - remove explicit content, keep it suggestive but safe. Include a clear CTA like "Link in bio" or "Check my page". Original caption: ${caption}`,
                            context: {
                                goal: 'teaser-generation',
                                tone: 'Playful',
                                platforms: [platform],
                            },
                        }),
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const teaserCaption = data.text || data.caption || '';
                        if (teaserCaption) {
                            generated.push({ platform, caption: teaserCaption });
                        }
                    }
                } catch (error) {
                    console.error(`Error generating teaser for ${platform}:`, error);
                }
            }

            setTeaserCaptions(generated);
            if (generated.length > 0) {
                showToast(`Generated ${generated.length} teaser captions!`, 'success');
            } else {
                showToast('Failed to generate teaser captions. Please try again.', 'error');
            }
        } catch (error: any) {
            console.error('Error generating teasers:', error);
            showToast(error.message || 'Failed to generate teaser captions. Please try again.', 'error');
        } finally {
            setIsGeneratingTeasers(false);
        }
    };

    const handleSavePackage = async () => {
        if (!caption.trim()) {
            showToast('Please add a caption', 'error');
            return;
        }

        if (!user?.id) {
            showToast('You must be logged in to save packages', 'error');
            return;
        }

        try {
            // Parse scheduled date/time if provided
            let finalScheduledDate: string | undefined;
            if (scheduledDate && scheduledTime) {
                const dateTime = new Date(`${scheduledDate}T${scheduledTime}`);
                if (!isNaN(dateTime.getTime())) {
                    finalScheduledDate = dateTime.toISOString();
                }
            } else if (scheduledDate) {
                // If only date, use today's time or default to 6 PM
                const dateTime = new Date(scheduledDate);
                dateTime.setHours(18, 0, 0, 0);
                finalScheduledDate = dateTime.toISOString();
            }

            const packageData = {
                caption,
                mediaUrls: mediaUrls.length > 0 ? mediaUrls : mediaFiles.map(f => URL.createObjectURL(f)),
                mediaNames: mediaNames.length > 0 ? mediaNames : mediaFiles.map(f => f.name),
                suggestedTime: suggestedTime || (finalScheduledDate ? new Date(finalScheduledDate).toLocaleString() : new Date().toLocaleString()),
                scheduledDate: finalScheduledDate,
                teaserCaptions,
                ...(selectedFanId ? { fanId: selectedFanId, fanName: selectedFanName } : {}),
                createdAt: Timestamp.now(),
            };

            const packageRef = await addDoc(collection(db, 'users', user.id, 'onlyfans_export_packages'), packageData);
            const packageId = packageRef.id;
            
            // Auto-create OnlyFans calendar event if enabled
            if (addToCalendar && finalScheduledDate) {
                try {
                    // Create OnlyFans calendar event (saves to onlyfans_calendar_events collection)
                    const onlyFansEventId = `export-${packageId}`;
                    const onlyFansEvent: Omit<OnlyFansCalendarEvent, 'id'> & { fanId?: string | null; fanName?: string | null } = {
                        title: caption.substring(0, 50) + (caption.length > 50 ? '...' : ''),
                        date: finalScheduledDate,
                        reminderType: 'post', // Export packages are post reminders
                        contentType: 'free', // Default to free, user can change in calendar
                        description: `Export package with ${mediaUrls.length || 0} media file(s). ${teaserCaptions.length > 0 ? `Includes ${teaserCaptions.length} teaser captions.` : ''}`,
                        reminderTime: scheduledTime || undefined,
                        createdAt: new Date().toISOString(),
                        userId: user.id,
                        ...(selectedFanId ? { fanId: selectedFanId, fanName: selectedFanName } : {}),
                    };
                    await setDoc(doc(db, 'users', user.id, 'onlyfans_calendar_events', onlyFansEventId), onlyFansEvent);
                } catch (calendarError) {
                    console.error('Failed to create OnlyFans calendar event:', calendarError);
                    // Don't fail the whole operation if calendar fails
                }
            }
            
            // Reset form
            setCaption('');
            setMediaFiles([]);
            setMediaUrls([]);
            setMediaNames([]);
            setSuggestedTime('');
            setScheduledDate('');
            setScheduledTime('');
            setTeaserCaptions([]);
            setSelectedFanId(null);
            setSelectedFanName(null);
            
            // Reload packages
            const packagesSnap = await getDocs(query(collection(db, 'users', user.id, 'onlyfans_export_packages'), orderBy('createdAt', 'desc')));
            const packages: ExportPackage[] = [];
            packagesSnap.forEach((docSnap) => {
                const data = docSnap.data();
                packages.push({
                    id: docSnap.id,
                    caption: data.caption || '',
                    mediaUrls: data.mediaUrls || [],
                    mediaNames: data.mediaNames || [],
                    suggestedTime: data.suggestedTime || '',
                    teaserCaptions: data.teaserCaptions || [],
                    createdAt: data.createdAt || Timestamp.now(),
                });
            });
            setExportPackages(packages);
            
            const successMsg = addToCalendar && finalScheduledDate 
                ? 'Package saved and added to calendar!'
                : 'Export package saved!';
            showToast(successMsg, 'success');
        } catch (error) {
            console.error('Error saving package:', error);
            showToast('Failed to save package', 'error');
        }
    };

    const handleExportPackage = async (pkg: ExportPackage) => {
        try {
            // Create a comprehensive export file
            const createdAt = pkg.createdAt instanceof Timestamp 
                ? pkg.createdAt.toDate().toLocaleString() 
                : (pkg.createdAt instanceof Date ? pkg.createdAt.toLocaleString() : new Date().toLocaleString());
            
            let exportContent = `ONLYFANS EXPORT PACKAGE\n`;
            exportContent += `Generated: ${createdAt}\n`;
            exportContent += `\n${'='.repeat(50)}\n\n`;
            
            exportContent += `PRIMARY CAPTION:\n${pkg.caption}\n\n`;
            
            if (pkg.suggestedTime) {
                exportContent += `SUGGESTED POST TIME:\n${pkg.suggestedTime}\n\n`;
            }
            
            if (pkg.teaserCaptions.length > 0) {
                exportContent += `TEASER CAPTIONS FOR OTHER PLATFORMS:\n\n`;
                pkg.teaserCaptions.forEach(({ platform, caption }) => {
                    exportContent += `${platform}:\n${caption}\n\n`;
                });
            }
            
            exportContent += `${'='.repeat(50)}\n\n`;
            exportContent += `UPLOAD CHECKLIST:\n`;
            exportContent += `□ Review caption and ensure it meets OnlyFans guidelines\n`;
            exportContent += `□ Upload ${pkg.mediaUrls?.length || 0} media file(s)\n`;
            exportContent += `□ Paste the caption\n`;
            exportContent += `□ Set post time to: ${pkg.suggestedTime || 'Your preferred time'}\n`;
            exportContent += `□ Select post type (Free/Paid)\n`;
            exportContent += `□ Preview post before publishing\n`;
            exportContent += `□ Publish post\n`;
            exportContent += `□ Share teaser captions on other platforms as planned\n\n`;
            
            exportContent += `MEDIA FILES:\n`;
            if (pkg.mediaUrls && pkg.mediaUrls.length > 0) {
                pkg.mediaUrls.forEach((url, index) => {
                    const name = pkg.mediaNames?.[index] || `Media ${index + 1}`;
                    exportContent += `${index + 1}. ${name}\n`;
                    exportContent += `   URL: ${url}\n\n`;
                });
            }

            // Create and download the export file
            const blob = new Blob([exportContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `onlyfans-export-${pkg.id || Date.now()}.txt`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            // On mobile, show a message instead of auto-downloading all media files
            // User can tap individual media items to download
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            
            if (isMobile) {
                showToast('Export file downloaded! Tap media items below to download individually.', 'success');
            } else {
                // Desktop: Auto-download all media files
                if (pkg.mediaUrls && pkg.mediaUrls.length > 0) {
                    for (let i = 0; i < pkg.mediaUrls.length; i++) {
                        const mediaUrl = pkg.mediaUrls[i];
                        const fileName = pkg.mediaNames?.[i] || `media-${i + 1}`;
                        try {
                            const response = await fetch(mediaUrl);
                            const blob = await response.blob();
                            const downloadUrl = URL.createObjectURL(blob);
                            const mediaLink = document.createElement('a');
                            mediaLink.href = downloadUrl;
                            mediaLink.download = fileName;
                            document.body.appendChild(mediaLink);
                            mediaLink.click();
                            mediaLink.remove();
                            URL.revokeObjectURL(downloadUrl);
                            // Small delay between downloads
                            await new Promise(resolve => setTimeout(resolve, 100));
                        } catch (error) {
                            console.error(`Error downloading ${fileName}:`, error);
                        }
                    }
                    showToast('Export package downloaded!', 'success');
                } else {
                    showToast('Export package downloaded!', 'success');
                }
            }
        } catch (error: any) {
            console.error('Error exporting package:', error);
            showToast('Failed to export package. Please try again.', 'error');
        }
    };

    const handleDeletePackage = async (id: string) => {
        if (!user?.id || !id) return;
        try {
            await deleteDoc(doc(db, 'users', user.id, 'onlyfans_export_packages', id));
            setExportPackages(prev => prev.filter(pkg => pkg.id !== id));
            showToast('Package deleted', 'success');
        } catch (error) {
            console.error('Error deleting package:', error);
            showToast('Failed to delete package', 'error');
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!', 'success');
    };

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
            {/* Header - Mobile Optimized */}
            <div className="mb-4 sm:mb-6">
                <div className="flex items-center gap-2 sm:gap-3 mb-2">
                    <DownloadIcon className="w-6 h-6 sm:w-8 sm:h-8 text-primary-600 dark:text-primary-400" />
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                        Export Hub
                    </h1>
                </div>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                    Create ready-to-upload content packages with captions, media, and checklists for manual upload to OnlyFans, Fansly, or Fanvue.
                </p>
            </div>

            {/* Create New Package - Mobile Optimized */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6 mb-4 sm:mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                    Create Export Package
                </h2>

                <div className="space-y-4">
                    {/* Caption - Mobile Optimized */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Caption:
                        </label>
                        <textarea
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            placeholder="Enter your premium platform caption here (OnlyFans, Fansly, Fanvue)..."
                            className="w-full p-3 sm:p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[120px] text-base sm:text-sm"
                        />
                    </div>

                    {/* Media Files */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Media Files:
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2 mb-2">
                            <input
                                type="file"
                                multiple
                                accept="image/*,video/*"
                                onChange={handleAddMedia}
                                className="hidden"
                                id="media-upload"
                            />
                            <label
                                htmlFor="media-upload"
                                className="cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-all active:scale-95 font-medium"
                            >
                                <PlusIcon className="w-5 h-5" />
                                <span>Upload Files</span>
                            </label>
                            <button
                                onClick={() => setShowMediaVault(!showMediaVault)}
                                className="inline-flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-all active:scale-95 font-medium"
                            >
                                <FolderIcon className="w-5 h-5" />
                                <span>From Media Vault</span>
                            </button>
                        </div>

                        {/* Media Vault Selection */}
                        {showMediaVault && (
                            <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-600 max-h-64 overflow-y-auto">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Select media from Media Vault ({selectedMediaIds.size} selected)
                                    </span>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleAddFromVault}
                                            disabled={selectedMediaIds.size === 0}
                                            className="flex-1 sm:flex-none px-4 py-2.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium transition-all active:scale-95"
                                        >
                                            Add Selected
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowMediaVault(false);
                                                setSelectedMediaIds(new Set());
                                            }}
                                            className="flex-1 sm:flex-none px-4 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 font-medium transition-all active:scale-95"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                    {mediaVaultItems.map((item) => (
                                        <div
                                            key={item.id}
                                            onClick={() => handleToggleMediaSelection(item.id)}
                                            className={`cursor-pointer p-2 rounded-md border-2 transition-colors ${
                                                selectedMediaIds.has(item.id)
                                                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                                                    : 'border-gray-200 dark:border-gray-600 hover:border-primary-300'
                                            }`}
                                        >
                                            {item.type === 'image' ? (
                                                <img src={item.url} alt={item.name} className="w-full h-24 object-cover rounded mb-1" />
                                            ) : (
                                                <video src={item.url} className="w-full h-24 object-cover rounded mb-1" />
                                            )}
                                            <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{item.name}</p>
                                        </div>
                                    ))}
                                </div>
                                {mediaVaultItems.length === 0 && (
                                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                                        No media in your Media Vault. Upload files first.
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Selected Media Display */}
                        {mediaUrls.length > 0 && (
                            <div className="mt-3 space-y-2">
                                {mediaUrls.map((url, index) => {
                                    const name = mediaNames[index] || `Media ${index + 1}`;
                                    // Detect if it's an image or video from URL or name
                                    const isImage = url.startsWith('data:image/') || 
                                                   name.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i) ||
                                                   (!url.startsWith('data:video/') && !name.match(/\.(mp4|mov|avi|wmv|flv|webm|mkv|m4v)$/i));
                                    return (
                                        <div
                                            key={`url-${index}`}
                                            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-600"
                                        >
                                            <div className="flex items-center gap-2">
                                                {isImage ? (
                                                    <ImageIcon className="w-5 h-5 text-gray-500" />
                                                ) : (
                                                    <VideoIcon className="w-5 h-5 text-gray-500" />
                                                )}
                                                <span className="text-sm text-gray-900 dark:text-white">
                                                    {name}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => handleRemoveMedia(index)}
                                                className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                            >
                                                <XMarkIcon className="w-5 h-5" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Schedule for Calendar */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="add-to-calendar"
                                checked={addToCalendar}
                                onChange={(e) => setAddToCalendar(e.target.checked)}
                                className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                            />
                            <label htmlFor="add-to-calendar" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                                Add to Calendar
                            </label>
                        </div>
                        
                        {addToCalendar && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                        Date
                                    </label>
                                    <input
                                        type="date"
                                        value={scheduledDate}
                                        onChange={(e) => setScheduledDate(e.target.value)}
                                        min={new Date().toISOString().split('T')[0]}
                                        className="w-full p-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                        Time
                                    </label>
                                    <input
                                        type="time"
                                        value={scheduledTime}
                                        onChange={(e) => setScheduledTime(e.target.value)}
                                        className="w-full p-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                            </div>
                        )}
                        
                        {/* Optional text field for manual time entry */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                <ClockIcon className="w-4 h-4 inline mr-2" />
                                Suggested Time (Optional):
                            </label>
                            <input
                                type="text"
                                value={suggestedTime}
                                onChange={(e) => setSuggestedTime(e.target.value)}
                                placeholder="e.g., Today 8:00 PM or Tomorrow 12:00 PM"
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>

                        {/* Fan Selector */}
                        <FanSelector
                            selectedFanId={selectedFanId}
                            onSelectFan={(fanId, fanName) => {
                                setSelectedFanId(fanId);
                                setSelectedFanName(fanName);
                            }}
                            allowNewFan={true}
                            compact={true}
                        />
                    </div>

                    {/* Teaser Captions */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Teaser Captions for Other Platforms:
                            </label>
                            <button
                                onClick={handleGenerateTeasers}
                                disabled={isGeneratingTeasers || !caption.trim()}
                                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                            >
                                <SparklesIcon className="w-4 h-4" />
                                {isGeneratingTeasers ? 'Generating...' : 'Generate Teasers'}
                            </button>
                        </div>

                        {teaserCaptions.length > 0 && (
                            <div className="mt-3 space-y-3">
                                {teaserCaptions.map((teaser, index) => (
                                    <div
                                        key={index}
                                        className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-600"
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                {teaser.platform}
                                            </span>
                                            <button
                                                onClick={() => copyToClipboard(teaser.caption)}
                                                className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                            >
                                                Copy
                                            </button>
                                        </div>
                                        <p className="text-sm text-gray-900 dark:text-white">{teaser.caption}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Save Package Button - Mobile Optimized */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            onClick={handleSavePackage}
                            disabled={!caption.trim()}
                            className="flex-1 px-6 py-3.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-base shadow-md transition-all active:scale-95"
                        >
                            {addToCalendar && (scheduledDate || scheduledTime) ? 'Save & Add to Calendar' : 'Save Package'}
                        </button>
                        {caption.trim() && (
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(caption);
                                    setCopiedItem('caption');
                                    setTimeout(() => setCopiedItem(null), 2000);
                                    showToast('Caption copied!', 'success');
                                }}
                                className="px-4 py-3.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 font-medium flex items-center justify-center gap-2 transition-all active:scale-95"
                            >
                                {copiedItem === 'caption' ? (
                                    <>
                                        <CheckCircleIcon className="w-5 h-5 text-green-600" />
                                        <span className="text-green-600">Copied!</span>
                                    </>
                                ) : (
                                    <>
                                        <CopyIcon className="w-5 h-5" />
                                        <span className="hidden sm:inline">Copy Caption</span>
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Saved Packages - Mobile Optimized */}
            {exportPackages.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6">
                    <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        Saved Export Packages
                    </h2>
                    <div className="space-y-3 sm:space-y-4">
                        {exportPackages.map((pkg) => (
                            <div
                                key={pkg.id}
                                className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <FileIcon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 flex-shrink-0" />
                                            <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">
                                                {pkg.createdAt instanceof Timestamp 
                                                    ? pkg.createdAt.toDate().toLocaleDateString()
                                                    : (pkg.createdAt instanceof Date ? pkg.createdAt.toLocaleDateString() : 'Recently')}
                                            </span>
                                        </div>
                                        {pkg.suggestedTime && (
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <ClockIcon className="w-3 h-3 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                                                <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">
                                                    {pkg.suggestedTime}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (window.confirm('Delete this export package?')) {
                                                handleDeletePackage(pkg.id!);
                                            }
                                        }}
                                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-1 flex-shrink-0"
                                    >
                                        <XMarkIcon className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="mb-3">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Caption:</p>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(pkg.caption);
                                                setCopiedItem(`caption-${pkg.id}`);
                                                setTimeout(() => setCopiedItem(null), 2000);
                                                showToast('Caption copied!', 'success');
                                            }}
                                            className="text-xs px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-all active:scale-95 flex items-center gap-1"
                                        >
                                            {copiedItem === `caption-${pkg.id}` ? (
                                                <>
                                                    <CheckCircleIcon className="w-3 h-3" />
                                                    <span>Copied!</span>
                                                </>
                                            ) : (
                                                <>
                                                    <CopyIcon className="w-3 h-3" />
                                                    <span>Copy</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <p className="text-xs sm:text-sm text-gray-900 dark:text-white line-clamp-2 mb-2">{pkg.caption}</p>
                                </div>

                                {pkg.mediaUrls && pkg.mediaUrls.length > 0 && (
                                    <div className="mb-3">
                                        <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Media ({pkg.mediaUrls.length}):
                                        </p>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {pkg.mediaUrls.map((url, index) => {
                                                const name = pkg.mediaNames?.[index] || `Media ${index + 1}`;
                                                const isImage = url.includes('image') || name.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                                                return (
                                                    <button
                                                        key={index}
                                                        onClick={async () => {
                                                            try {
                                                                const response = await fetch(url);
                                                                const blob = await response.blob();
                                                                const downloadUrl = URL.createObjectURL(blob);
                                                                const mediaLink = document.createElement('a');
                                                                mediaLink.href = downloadUrl;
                                                                mediaLink.download = name;
                                                                document.body.appendChild(mediaLink);
                                                                mediaLink.click();
                                                                mediaLink.remove();
                                                                URL.revokeObjectURL(downloadUrl);
                                                                showToast(`Downloaded ${name}`, 'success');
                                                            } catch (error) {
                                                                console.error(`Error downloading ${name}:`, error);
                                                                showToast(`Failed to download ${name}`, 'error');
                                                            }
                                                        }}
                                                        className="p-2 bg-gray-100 dark:bg-gray-600 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-500 transition-all active:scale-95 flex items-center gap-1.5 text-left"
                                                    >
                                                        {isImage ? (
                                                            <ImageIcon className="w-4 h-4 text-gray-600 dark:text-gray-300 flex-shrink-0" />
                                                        ) : (
                                                            <VideoIcon className="w-4 h-4 text-gray-600 dark:text-gray-300 flex-shrink-0" />
                                                        )}
                                                        <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">
                                                            {name}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {pkg.teaserCaptions.length > 0 && (
                                    <div className="mb-3">
                                        <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Teasers ({pkg.teaserCaptions.length}):
                                        </p>
                                        <div className="space-y-1.5">
                                            {pkg.teaserCaptions.map((teaser, index) => (
                                                <div key={index} className="flex items-start justify-between gap-2 p-2 bg-gray-100 dark:bg-gray-600/50 rounded">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                                                            {teaser.platform}
                                                        </div>
                                                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                                            {teaser.caption}
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(teaser.caption);
                                                            setCopiedItem(`teaser-${pkg.id}-${index}`);
                                                            setTimeout(() => setCopiedItem(null), 2000);
                                                            showToast(`Copied ${teaser.platform} caption!`, 'success');
                                                        }}
                                                        className="p-1.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-all active:scale-95 flex-shrink-0"
                                                    >
                                                        {copiedItem === `teaser-${pkg.id}-${index}` ? (
                                                            <CheckCircleIcon className="w-3 h-3" />
                                                        ) : (
                                                            <CopyIcon className="w-3 h-3" />
                                                        )}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Quick Actions - Mobile Optimized */}
                                <div className="flex flex-col sm:flex-row gap-2 mt-3">
                                    <button
                                        onClick={() => handleExportPackage(pkg)}
                                        className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-all font-medium flex items-center justify-center gap-2 active:scale-95"
                                    >
                                        <DownloadIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                                        <span>Export All</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(pkg.caption);
                                            setCopiedItem(`quick-caption-${pkg.id}`);
                                            setTimeout(() => setCopiedItem(null), 2000);
                                            showToast('Caption copied!', 'success');
                                        }}
                                        className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-all font-medium flex items-center justify-center gap-2 active:scale-95"
                                    >
                                        {copiedItem === `quick-caption-${pkg.id}` ? (
                                            <>
                                                <CheckCircleIcon className="w-4 h-4 text-green-600" />
                                                <span className="text-green-600">Copied!</span>
                                            </>
                                        ) : (
                                            <>
                                                <CopyIcon className="w-4 h-4" />
                                                <span>Copy</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {exportPackages.length === 0 && (
                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-8 text-center">
                    <FileIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-600 dark:text-gray-400">
                        No export packages yet. Create your first package above!
                    </p>
                </div>
            )}
        </div>
    );
};
