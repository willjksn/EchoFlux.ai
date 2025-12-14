import React, { useState } from 'react';
import { useAppContext } from './AppContext';
import { DownloadIcon, XMarkIcon, PlusIcon, ClockIcon, FileIcon, ImageIcon, VideoIcon, SparklesIcon } from './icons/UIIcons';
import { auth } from '../firebaseConfig';

interface ExportPackage {
    id: string;
    caption: string;
    mediaFiles: File[];
    suggestedTime: string;
    teaserCaptions: { platform: string; caption: string }[];
    createdAt: Date;
}

export const OnlyFansExportHub: React.FC = () => {
    const { showToast } = useAppContext();
    const [caption, setCaption] = useState('');
    const [mediaFiles, setMediaFiles] = useState<File[]>([]);
    const [suggestedTime, setSuggestedTime] = useState('');
    const [teaserCaptions, setTeaserCaptions] = useState<{ platform: string; caption: string }[]>([]);
    const [isGeneratingTeasers, setIsGeneratingTeasers] = useState(false);
    const [exportPackages, setExportPackages] = useState<ExportPackage[]>([]);

    const handleAddMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        setMediaFiles(prev => [...prev, ...files]);
    };

    const handleRemoveMedia = (index: number) => {
        setMediaFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleGenerateTeasers = async () => {
        if (!caption.trim()) {
            showToast('Please add a caption first to generate teaser captions', 'error');
            return;
        }

        setIsGeneratingTeasers(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const platforms = ['Instagram', 'X (Twitter)', 'Reddit', 'TikTok'];
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

    const handleSavePackage = () => {
        if (!caption.trim()) {
            showToast('Please add a caption', 'error');
            return;
        }

        const newPackage: ExportPackage = {
            id: Date.now().toString(),
            caption,
            mediaFiles: [...mediaFiles],
            suggestedTime: suggestedTime || new Date().toLocaleString(),
            teaserCaptions: [...teaserCaptions],
            createdAt: new Date(),
        };

        setExportPackages(prev => [...prev, newPackage]);
        
        // Reset form
        setCaption('');
        setMediaFiles([]);
        setSuggestedTime('');
        setTeaserCaptions([]);
        
        showToast('Export package saved!', 'success');
    };

    const handleExportPackage = async (pkg: ExportPackage) => {
        try {
            // Create a comprehensive export file
            let exportContent = `ONLYFANS EXPORT PACKAGE\n`;
            exportContent += `Generated: ${pkg.createdAt.toLocaleString()}\n`;
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
            exportContent += `□ Upload ${pkg.mediaFiles.length} media file(s)\n`;
            exportContent += `□ Paste the caption\n`;
            exportContent += `□ Set post time to: ${pkg.suggestedTime || 'Your preferred time'}\n`;
            exportContent += `□ Select post type (Free/Paid)\n`;
            exportContent += `□ Preview post before publishing\n`;
            exportContent += `□ Publish post\n`;
            exportContent += `□ Share teaser captions on other platforms as planned\n\n`;
            
            exportContent += `MEDIA FILES:\n`;
            pkg.mediaFiles.forEach((file, index) => {
                exportContent += `${index + 1}. ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)\n`;
            });

            // Create and download the export file
            const blob = new Blob([exportContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `onlyfans-export-${pkg.id}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Download media files individually
            if (pkg.mediaFiles.length > 0) {
                for (const file of pkg.mediaFiles) {
                    const mediaUrl = URL.createObjectURL(file);
                    const mediaLink = document.createElement('a');
                    mediaLink.href = mediaUrl;
                    mediaLink.download = file.name;
                    document.body.appendChild(mediaLink);
                    mediaLink.click();
                    document.body.removeChild(mediaLink);
                    URL.revokeObjectURL(mediaUrl);
                }
            }

            showToast('Export package downloaded!', 'success');
        } catch (error: any) {
            console.error('Error exporting package:', error);
            showToast('Failed to export package. Please try again.', 'error');
        }
    };

    const handleDeletePackage = (id: string) => {
        setExportPackages(prev => prev.filter(pkg => pkg.id !== id));
        showToast('Package deleted', 'success');
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
                            Add Media
                        </label>

                        {mediaFiles.length > 0 && (
                            <div className="mt-3 space-y-2">
                                {mediaFiles.map((file, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-600"
                                    >
                                        <div className="flex items-center gap-2">
                                            {file.type.startsWith('image/') ? (
                                                <ImageIcon className="w-5 h-5 text-gray-500" />
                                            ) : (
                                                <VideoIcon className="w-5 h-5 text-gray-500" />
                                            )}
                                            <span className="text-sm text-gray-900 dark:text-white">
                                                {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleRemoveMedia(index)}
                                            className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                        >
                                            <XMarkIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                ))}
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
                                                Created: {pkg.createdAt.toLocaleString()}
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

                                {pkg.mediaFiles.length > 0 && (
                                    <div className="mb-3">
                                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Media Files ({pkg.mediaFiles.length}):
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {pkg.mediaFiles.map((file, index) => (
                                                <span
                                                    key={index}
                                                    className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded text-gray-700 dark:text-gray-300"
                                                >
                                                    {file.type.startsWith('image/') ? '🖼️' : '🎥'} {file.name}
                                                </span>
                                            ))}
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
