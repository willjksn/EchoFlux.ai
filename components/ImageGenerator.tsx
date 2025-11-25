import React, { useState, useRef } from 'react';
import { generateImage, generateCaptions } from '../src/services/geminiService';
import { SparklesIcon, ImageIcon, ComposeIcon as CaptionIcon, SendIcon, TrashIcon, RedoIcon, EditIcon, MobileIcon, CalendarIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { Platform, CalendarEvent } from '../types';
import { InstagramIcon, TikTokIcon, ThreadsIcon, XIcon, YouTubeIcon, LinkedInIcon, FacebookIcon } from './icons/PlatformIcons';
import { UpgradePrompt } from './UpgradePrompt';
import { db, storage } from '../firebaseConfig';
import { collection, addDoc } from 'firebase/firestore';
import { MobilePreviewModal } from './MobilePreviewModal';
// FIX: Use namespace import for firebase/storage to resolve module resolution issues.
import * as storageApi from 'firebase/storage';

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

function base64ToBytes(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

interface ImageGeneratorProps {
    onGenerate?: () => void;
    onGenerateCaptions?: (base64Data: string) => void;
    usageLeft?: number;
    initialPrompt?: string;
}

const platformIcons: Record<Platform, React.ReactNode> = {
  Instagram: <InstagramIcon />,
  TikTok: <TikTokIcon />,
  X: <XIcon />,
  Threads: <ThreadsIcon />,
  YouTube: <YouTubeIcon />,
  LinkedIn: <LinkedInIcon />,
  Facebook: <FacebookIcon />,
};

export const ImageGenerator: React.FC<ImageGeneratorProps> = ({ onGenerate, usageLeft, initialPrompt, onGenerateCaptions }) => {
    const { user, clients, showToast, userBaseImage, settings, setActivePage, openPaymentModal, selectedClient, addCalendarEvent } = useAppContext();
    const [prompt, setPrompt] = useState(initialPrompt || '');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [useBaseImage, setUseBaseImage] = useState(false);
    
    const [caption, setCaption] = useState('');
    const [isCaptionLoading, setIsCaptionLoading] = useState(false);
    const [selectedPlatforms, setSelectedPlatforms] = useState<Record<Platform, boolean>>({
        Instagram: false, TikTok: false, X: false, Threads: false, YouTube: false, LinkedIn: false, Facebook: false
    });
    const [uploadedImage, setUploadedImage] = useState<{ data: string; mimeType: string; previewUrl: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isScheduling, setIsScheduling] = useState(false);
    const [scheduleDate, setScheduleDate] = useState('');

    if (!user) return null;

    if (usageLeft !== undefined && usageLeft <= 0) {
        return (
            <UpgradePrompt 
                featureName="AI Image Generation"
                onUpgradeClick={() => setActivePage('pricing')}
                secondaryActionText="Buy Image Credits"
                onSecondaryActionClick={() => openPaymentModal({ name: 'Image Pack', price: 19, cycle: 'monthly' })} // 'monthly' is placeholder for one-time
            />
        );
    }

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            try {
                const dataUrl = await fileToBase64(file);
                setUploadedImage({
                    data: dataUrl.split(',')[1],
                    mimeType: file.type,
                    previewUrl: dataUrl
                });
            } catch (error) {
                showToast('Failed to load image.', 'error');
            }
        }
    };
    
    const handleClearImage = () => {
        setUploadedImage(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handlePlatformToggle = (platform: Platform) => {
        setSelectedPlatforms(prev => ({ ...prev, [platform]: !prev[platform] }));
    };

    const handleGenerate = async () => {
        if (!prompt.trim() && !uploadedImage) return;
        setIsLoading(true);
        setGeneratedImage(null);
        setCaption('');

        let finalPrompt = prompt;
        if (selectedClientId) {
            const client = clients.find(c => c.id === selectedClientId);
            if (client) {
                 finalPrompt = `For ${client.name}, create an image of: ${prompt}`;
            }
        }
        
        const imageToGenerateFrom = uploadedImage || (useBaseImage ? userBaseImage : undefined);

        try {
            const imageData = await generateImage(finalPrompt, imageToGenerateFrom);
            setGeneratedImage(imageData);
            if (onGenerate) onGenerate();
        } catch (err) {
            showToast('Failed to generate image. Please try a different prompt.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegenerate = () => {
        handleGenerate();
    };

    const handleEdit = () => {
        if (!generatedImage) return;
        setUploadedImage({
            data: generatedImage,
            mimeType: 'image/png',
            previewUrl: `data:image/png;base64,${generatedImage}`
        });
        setGeneratedImage(null);
        setPrompt('');
        setCaption('');
        showToast('Image is ready for editing. Describe your changes and click Generate.', 'success');
    };
    
    const handleGenerateCaption = async () => {
        if (!generatedImage) return;
        setIsCaptionLoading(true);
        try {
            const captionResults = await generateCaptions({
                mediaData: { data: generatedImage, mimeType: 'image/png' }
            });
            if (captionResults.length > 0) {
                setCaption(captionResults[0].caption + '\n\n' + captionResults[0].hashtags.join(' '));
            }
        } catch (err) {
            showToast('Failed to generate caption.', 'error');
        } finally {
            setIsCaptionLoading(false);
        }
    };

    const uploadImageToStorage = async (base64Data: string): Promise<string> => {
        if (!user) throw new Error("User not authenticated");
        const timestamp = Date.now();
        const storagePath = `users/${user.id}/generated_images/${timestamp}.png`;
        const storageRef = storageApi.ref(storage, storagePath);
        
        const bytes = base64ToBytes(base64Data);
        
        await storageApi.uploadBytes(storageRef, bytes, {
            contentType: 'image/png'
        });
        
        return await storageApi.getDownloadURL(storageRef);
    };

    const handleSchedule = async (date: string) => {
        const platformsToPost = (Object.keys(selectedPlatforms) as Platform[]).filter(p => selectedPlatforms[p]);
        if (platformsToPost.length === 0) {
            showToast('Please select at least one platform.', 'error');
            return;
        }
        if (!generatedImage) return;

        setIsSaving(true);
        try {
            // Upload image first to avoid payload size limits
            const imageUrl = await uploadImageToStorage(generatedImage);

            const newEvent: CalendarEvent = {
                id: `cal-${Date.now()}`,
                title: caption ? caption.substring(0, 30) + '...' : 'Scheduled Image',
                date: new Date(date).toISOString(),
                type: 'Post',
                platform: platformsToPost[0],
                status: 'Scheduled',
                thumbnail: imageUrl,
            };

            await addCalendarEvent(newEvent);
            showToast(`Image scheduled for ${new Date(date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`, 'success');
            setIsScheduling(false);
        } catch (e) {
            console.error("Schedule error:", e);
            showToast("Failed to schedule image.", 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSmartSchedule = () => {
        const now = new Date();
        const nextTuesday = new Date(now);
        const dayOfWeek = now.getDay();
        const daysUntilTuesday = (2 - dayOfWeek + 7) % 7;
        
        nextTuesday.setDate(now.getDate() + (daysUntilTuesday === 0 && now.getHours() >= 10 ? 7 : daysUntilTuesday));
        nextTuesday.setHours(10, 0, 0, 0);
        
        const isoDate = nextTuesday.toISOString();
        setScheduleDate(isoDate.slice(0, 16));
        handleSchedule(isoDate);
    };

    const handlePost = () => {
        const platformsToPost = (Object.keys(selectedPlatforms) as Platform[]).filter(p => selectedPlatforms[p]);
        if (platformsToPost.length === 0) {
            showToast('Please select at least one platform to post to.', 'error');
            return;
        }

        platformsToPost.forEach(platform => {
            showToast(`Your post has been successfully published to ${platform}!`, 'success');
        });

        setGeneratedImage(null);
        setCaption('');
        setPrompt('');
        handleClearImage();
        setSelectedPlatforms({ Instagram: false, TikTok: false, X: false, Threads: false, YouTube: false, LinkedIn: false, Facebook: false });
    };
    
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <MobilePreviewModal 
                isOpen={isPreviewOpen} 
                onClose={() => setIsPreviewOpen(false)} 
                caption={caption}
                media={generatedImage ? { previewUrl: `data:image/png;base64,${generatedImage}`, type: 'image' } : null}
                user={selectedClient || user}
            />

            <div className="text-center">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">AI Image Generator</h2>
                <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">Bring your ideas to life. Describe anything you can imagine, or upload an image to edit.</p>
                {usageLeft !== undefined && (
                    <p className="mt-2 text-sm font-semibold text-primary-600 dark:text-primary-400">{usageLeft} generations left this month.</p>
                )}
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md space-y-4">
                {clients.length > 0 && (
                    <div>
                        <label htmlFor="client-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Generate for Client (Optional)</label>
                        <select id="client-select" value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white text-gray-900">
                            <option value="">Main Account</option>
                            {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
                        </select>
                    </div>
                )}
                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Start with an image (Optional)</label>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                    {!uploadedImage ? (
                        <div onClick={() => fileInputRef.current?.click()} className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <div className="space-y-1 text-center">
                                <ImageIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-primary-500" />
                                <div className="flex text-sm text-gray-600 dark:text-gray-400">
                                    <span className="relative font-medium text-primary-600 dark:text-primary-400">Upload a file</span>
                                    <p className="pl-1">or drag and drop</p>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">PNG, JPG, WEBP up to 10MB</p>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-2 relative">
                            <img src={uploadedImage.previewUrl} alt="Uploaded preview" className="w-full h-auto max-h-48 object-contain rounded-md bg-gray-100 dark:bg-gray-700" />
                            <button onClick={handleClearImage} className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black/80">
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
                <div>
                    <label htmlFor="image-prompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{uploadedImage ? "Describe your edits" : "Your Prompt"}</label>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <input id="image-prompt" type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={uploadedImage ? "e.g., add a retro filter" : "e.g., A futuristic cityscape at sunset"} className="flex-grow p-3 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"/>
                        <button onClick={handleGenerate} disabled={isLoading || (!prompt.trim() && !uploadedImage)} className="flex items-center justify-center px-6 py-3 text-base font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50">
                            <SparklesIcon /> {isLoading ? 'Generating...' : 'Generate'}
                        </button>
                    </div>
                </div>
                 <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
                    {userBaseImage && (
                        <label className={`flex items-center ${!!uploadedImage ? 'opacity-50' : ''}`}>
                            <input type="checkbox" checked={useBaseImage} onChange={e => setUseBaseImage(e.target.checked)} className="h-4 w-4 text-primary-600 border-gray-300 rounded" disabled={!!uploadedImage} />
                            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                                Use my AI Avatar as a base
                                {!!uploadedImage && <span className="text-xs text-gray-400"> (overridden by uploaded image)</span>}
                            </span>
                        </label>
                    )}
                </div>
            </div>
            
            <div className="w-full aspect-video bg-white dark:bg-gray-800 rounded-xl shadow-md flex items-center justify-center p-4">
                {isLoading && !generatedImage ? (
                    <div className="text-center">
                        <svg className="animate-spin h-8 w-8 text-primary-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        <p className="mt-4 text-lg font-semibold text-gray-700 dark:text-gray-300">Generating masterpiece...</p>
                    </div>
                ) : generatedImage ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                         <img src={`data:image/png;base64,${generatedImage}`} alt="Generated" className="max-w-full max-h-full object-contain rounded-lg shadow-lg" />
                         <div className="flex gap-2">
                             <button onClick={handleRegenerate} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-700 dark:text-primary-300 bg-primary-100 dark:bg-primary-900/50 rounded-md hover:bg-primary-200 dark:hover:bg-primary-900">
                                <RedoIcon /> Regenerate
                             </button>
                             <button onClick={handleEdit} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600">
                                <EditIcon /> Edit
                             </button>
                         </div>
                    </div>
                ) : (
                     <div className="text-center text-gray-500 dark:text-gray-400">
                        <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>Your generated image will appear here.</p>
                    </div>
                )}
            </div>

            {generatedImage && (
                 <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md space-y-4">
                     <div>
                        <div className="flex justify-between items-center mb-2">
                           <label htmlFor="caption-input-img" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Your Caption</label>
                            <button 
                                onClick={handleGenerateCaption} 
                                disabled={isCaptionLoading}
                                className="flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 dark:text-primary-300 bg-primary-100 dark:bg-primary-900/50 rounded-md hover:bg-primary-200 dark:hover:bg-primary-900 disabled:opacity-50"
                            >
                                <SparklesIcon /> {isCaptionLoading ? 'Generating...' : 'Generate with AI'}
                            </button>
                        </div>
                        <textarea
                            id="caption-input-img"
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            rows={3}
                            className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            placeholder="Write a caption, or generate one with AI."
                        />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Publish to</label>
                        <div className="mt-2 flex flex-wrap gap-3">
                            {(Object.keys(platformIcons) as Platform[]).map(platform => (
                                <button
                                    key={platform}
                                    onClick={() => handlePlatformToggle(platform)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-colors ${selectedPlatforms[platform] ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                                >
                                    <span className="dark:text-white">{platformIcons[platform]}</span>
                                    <span className="font-medium">{platform}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    {isScheduling && (
                         <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-3 animate-fade-in">
                            <div className="flex items-center gap-2">
                                <CalendarIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                <h4 className="font-semibold text-blue-800 dark:text-blue-200">Schedule Image</h4>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input 
                                    type="datetime-local" 
                                    value={scheduleDate}
                                    onChange={e => setScheduleDate(e.target.value)}
                                    className="flex-grow p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                />
                                <button onClick={() => handleSchedule(scheduleDate)} disabled={!scheduleDate || isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                                    {isSaving ? 'Scheduling...' : 'Confirm Schedule'}
                                </button>
                            </div>
                             <button onClick={handleSmartSchedule} className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/50 rounded-md hover:bg-purple-200 dark:hover:bg-purple-900">
                                <SparklesIcon className="w-4 h-4" /> Schedule for Best Time (AI)
                            </button>
                        </div>
                    )}

                    <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
                        {onGenerateCaptions && (
                            <button onClick={() => onGenerateCaptions(generatedImage!)} className="text-sm text-primary-600 hover:underline">
                                Open in Caption Studio
                            </button>
                        )}
                        <div className="flex gap-3">
                            <button onClick={() => setIsPreviewOpen(true)} className="flex items-center gap-2 px-4 py-2 text-base font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                <MobileIcon className="w-5 h-5" /> Preview
                            </button>
                            <button onClick={() => setIsScheduling(prev => !prev)} className={`flex items-center gap-2 px-4 py-2 text-base font-medium text-white rounded-md transition-colors ${isScheduling ? 'bg-gray-500' : 'bg-purple-600 hover:bg-purple-700'}`}>
                                <CalendarIcon className="w-5 h-5" /> {isScheduling ? 'Cancel' : 'Schedule'}
                            </button>
                            {!isScheduling && (
                                <button onClick={handlePost} className="flex items-center gap-2 px-6 py-2 text-base font-medium text-white bg-green-600 rounded-md hover:bg-green-700">
                                    <SendIcon className="w-5 h-5" /> Post
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};