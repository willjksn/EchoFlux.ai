import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { DownloadIcon, XMarkIcon, PlusIcon, ClockIcon, FileIcon, ImageIcon, VideoIcon, SparklesIcon, FolderIcon } from './icons/UIIcons';
import { auth, db } from '../firebaseConfig';
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, Timestamp } from 'firebase/firestore';

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
    const [teaserCaptions, setTeaserCaptions] = useState<{ platform: string; caption: string }[]>([]);
    const [isGeneratingTeasers, setIsGeneratingTeasers] = useState(false);
    const [exportPackages, setExportPackages] = useState<ExportPackage[]>([]);
    const [showMediaVault, setShowMediaVault] = useState(false);
    const [mediaVaultItems, setMediaVaultItems] = useState<MediaItem[]>([]);
    const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());

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
            const packageData = {
                caption,
                mediaUrls: mediaUrls.length > 0 ? mediaUrls : mediaFiles.map(f => URL.createObjectURL(f)),
                mediaNames: mediaNames.length > 0 ? mediaNames : mediaFiles.map(f => f.name),
                suggestedTime: suggestedTime || new Date().toLocaleString(),
                teaserCaptions,
                createdAt: Timestamp.now(),
            };

            await addDoc(collection(db, 'users', user.id, 'onlyfans_export_packages'), packageData);
            
            // Reset form
            setCaption('');
            setMediaFiles([]);
            setMediaUrls([]);
            setMediaNames([]);
            setSuggestedTime('');
            setTeaserCaptions([]);
            
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
            
            showToast('Export package saved!', 'success');
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
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Download media files from URLs
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
                        document.body.removeChild(mediaLink);
                        URL.revokeObjectURL(downloadUrl);
                        // Small delay between downloads
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } catch (error) {
                        console.error(`Error downloading ${fileName}:`, error);
                    }
                }
            }

            showToast('Export package downloaded!', 'success');
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
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <DownloadIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Export Hub
                    </h1>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    Create ready-to-upload content packages with captions, media, and checklists for manual upload to OnlyFans.
                </p>
            </div>

            {/* Create New Package */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                    Create Export Package
                </h2>

                <div className="space-y-4">
                    {/* Caption */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Caption:
                        </label>
                        <textarea
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            placeholder="Enter your OnlyFans caption here..."
                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[120px]"
                        />
                    </div>

                    {/* Media Files */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Media Files:
                        </label>
                        <div className="flex gap-2 mb-2">
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
                                className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                            >
                                <PlusIcon className="w-4 h-4" />
                                Upload Files
                            </label>
                            <button
                                onClick={() => setShowMediaVault(!showMediaVault)}
                                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                            >
                                <FolderIcon className="w-4 h-4" />
                                From Media Vault
                            </button>
                        </div>

                        {/* Media Vault Selection */}
                        {showMediaVault && (
                            <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-600 max-h-64 overflow-y-auto">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Select media from Media Vault ({selectedMediaIds.size} selected)
                                    </span>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleAddFromVault}
                                            disabled={selectedMediaIds.size === 0}
                                            className="px-3 py-1 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
                                        >
                                            Add Selected
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowMediaVault(false);
                                                setSelectedMediaIds(new Set());
                                            }}
                                            className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
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

                    {/* Suggested Post Time */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            <ClockIcon className="w-4 h-4 inline mr-2" />
                            Suggested Post Time:
                        </label>
                        <input
                            type="text"
                            value={suggestedTime}
                            onChange={(e) => setSuggestedTime(e.target.value)}
                            placeholder="e.g., Today 8:00 PM or Tomorrow 12:00 PM"
                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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

                    {/* Save Package Button */}
                    <button
                        onClick={handleSavePackage}
                        disabled={!caption.trim()}
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                        Save Export Package
                    </button>
                </div>
            </div>

            {/* Saved Packages */}
            {exportPackages.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        Saved Export Packages
                    </h2>
                    <div className="space-y-4">
                        {exportPackages.map((pkg) => (
                            <div
                                key={pkg.id}
                                className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-600"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <FileIcon className="w-5 h-5 text-gray-500" />
                                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                                Created: {pkg.createdAt instanceof Timestamp 
                                                    ? pkg.createdAt.toDate().toLocaleString() 
                                                    : (pkg.createdAt instanceof Date ? pkg.createdAt.toLocaleString() : 'Recently')}
                                            </span>
                                        </div>
                                        {pkg.suggestedTime && (
                                            <div className="flex items-center gap-2 mb-2">
                                                <ClockIcon className="w-4 h-4 text-gray-500" />
                                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                                    Suggested: {pkg.suggestedTime}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleDeletePackage(pkg.id)}
                                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                    >
                                        <XMarkIcon className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="mb-3">
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Caption:</p>
                                    <p className="text-sm text-gray-900 dark:text-white mb-2">{pkg.caption}</p>
                                    <button
                                        onClick={() => copyToClipboard(pkg.caption)}
                                        className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                    >
                                        Copy Caption
                                    </button>
                                </div>

                                {pkg.mediaUrls && pkg.mediaUrls.length > 0 && (
                                    <div className="mb-3">
                                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Media Files ({pkg.mediaUrls.length}):
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {pkg.mediaUrls.map((url, index) => {
                                                const name = pkg.mediaNames?.[index] || `Media ${index + 1}`;
                                                const isImage = url.includes('image') || name.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                                                return (
                                                    <span
                                                        key={index}
                                                        className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded text-gray-700 dark:text-gray-300"
                                                    >
                                                        {isImage ? '🖼️' : '🎥'} {name}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {pkg.teaserCaptions.length > 0 && (
                                    <div className="mb-3">
                                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Teaser Captions ({pkg.teaserCaptions.length}):
                                        </p>
                                        <div className="space-y-1">
                                            {pkg.teaserCaptions.map((teaser, index) => (
                                                <div key={index} className="text-xs text-gray-600 dark:text-gray-400">
                                                    <strong>{teaser.platform}:</strong> {teaser.caption.substring(0, 60)}...
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={() => handleExportPackage(pkg)}
                                    className="w-full mt-3 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors font-medium flex items-center justify-center gap-2"
                                >
                                    <DownloadIcon className="w-5 h-5" />
                                    Export Package
                                </button>
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
