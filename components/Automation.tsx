
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AutomationWorkflow, ApprovalItem, CustomVoice, Platform } from '../types';
import { useAppContext } from './AppContext';
import { CheckCircleIcon, ComposeIcon as CaptionIcon, ImageIcon, SparklesIcon, TrashIcon, VideoIcon, UploadIcon, UserIcon, VoiceIcon } from './icons/UIIcons';
import { InstagramIcon, TikTokIcon, ThreadsIcon, XIcon, YouTubeIcon, LinkedInIcon, FacebookIcon } from './icons/PlatformIcons';

const fileToBase64 = (file: File): Promise<{ data: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            resolve({ data: result.split(',')[1], mimeType: file.type });
        };
        reader.onerror = error => reject(error);
    });
};

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const isSpeechRecognitionSupported = !!SpeechRecognition;

const platformIcons: Record<Platform, React.ReactElement<{ className?: string }>> = {
  Instagram: <InstagramIcon />,
  TikTok: <TikTokIcon />,
  X: <XIcon />,
  Threads: <ThreadsIcon />,
  YouTube: <YouTubeIcon />,
  LinkedIn: <LinkedInIcon />,
  Facebook: <FacebookIcon />,
};

const WorkflowModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (workflow: Omit<AutomationWorkflow, 'id' | 'lastRun' | 'nextRun'>) => void;
}> = ({ isOpen, onClose, onSave }) => {
    const { user, userBaseImage, userCustomVoices, setUserCustomVoices, showToast, settings } = useAppContext();
    
    // Filter options for Business Starter/Growth plans
    const isBusiness = user?.userType === 'Business';
    const isAgencyPlan = user?.plan === 'Agency';
    const showAdvancedOptions = !isBusiness || isAgencyPlan; // Hide for Business Starter/Growth, show for Agency and all Creators
    const [type, setType] = useState<AutomationWorkflow['type']>('Image');
    const [prompt, setPrompt] = useState('');
    const [frequencyType, setFrequencyType] = useState<AutomationWorkflow['frequency']['type']>('Daily');
    const [frequencyCount, setFrequencyCount] = useState(1);
    const [approvalType, setApprovalType] = useState<AutomationWorkflow['approvalType']>('Manual');
    const [generateCaptions, setGenerateCaptions] = useState(false);
    const [useBaseImage, setUseBaseImage] = useState(false);
    const [postGoal, setPostGoal] = useState('engagement');
    const [postTone, setPostTone] = useState('friendly');
    const [generateVoiceOver, setGenerateVoiceOver] = useState(false);
    const [voiceOverScript, setVoiceOverScript] = useState('');
    const [selectedVoice, setSelectedVoice] = useState('Zephyr');
    const [isListening, setIsListening] = useState(false);
    const [targetPlatforms, setTargetPlatforms] = useState<Platform[]>([]);
    const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
    
    const recognitionRef = useRef<any>(null);
    const voiceFileRef = useRef<HTMLInputElement>(null);

     const voiceLimit = useMemo(() => {
       switch (user?.plan) {
            case 'Pro': return 1;
            case 'Elite': return 3;
            case 'Agency': return Infinity;
            default: return 0;
        }
    }, [user?.plan]);

    useEffect(() => {
        if (!isSpeechRecognitionSupported) return;

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setPrompt(prev => prev ? `${prev} ${transcript}` : transcript);
            setIsListening(false);
        };

        recognition.onerror = (event: any) => {
            console.error('Speech recognition error:', event.error);
            showToast('Speech recognition failed.', 'error');
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognitionRef.current = recognition;
    }, [showToast]);

    if (!isOpen) return null;

    const handlePlatformToggle = (platform: Platform) => {
        setTargetPlatforms(prev => 
            prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
        );
    };

    const handleMicClick = () => {
        if (!isSpeechRecognitionSupported || !recognitionRef.current) return;
        
        if (isListening) {
            recognitionRef.current.stop();
        } else {
            recognitionRef.current.start();
            setIsListening(true);
        }
    };

    const handleVoiceFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (userCustomVoices.length >= voiceLimit) {
            showToast('Voice limit reached for your plan. Upgrade or remove a voice.', 'error');
            return;
        }
        const file = event.target.files?.[0];
        if (file) {
            try {
                const { data, mimeType } = await fileToBase64(file);
                const newVoice: CustomVoice = { id: Date.now().toString(), name: file.name, data, mimeType };
                setUserCustomVoices(prev => [...prev, newVoice]);
                showToast('Custom voice uploaded successfully!', 'success');
            } catch (error) {
                showToast('Failed to upload voice file.', 'error');
            }
        }
    };

    const handleDeleteVoice = (id: string) => {
        setUserCustomVoices(prev => prev.filter(voice => voice.id !== id));
    };

    const handleSave = () => {
        onSave({ 
            type, 
            prompt, 
            frequency: { type: frequencyType, count: frequencyCount }, 
            approvalType, 
            isActive: true,
            generateCaptions: ['Image', 'Video'].includes(type) ? generateCaptions : undefined,
            useBaseImage: ['Image', 'Video'].includes(type) ? useBaseImage : undefined,
            goal: postGoal,
            tone: postTone,
            generateVoiceOver: type === 'Video' ? generateVoiceOver : undefined,
            voiceOverScript: type === 'Video' && generateVoiceOver ? voiceOverScript : undefined,
            voice: type === 'Video' && generateVoiceOver ? selectedVoice : undefined,
            targetPlatforms,
            aspectRatio: type === 'Video' ? aspectRatio : undefined,
        });
        onClose();
    };

    const dailyOptions = [1, 2, 3];
    const weeklyOptions = [1, 2, 3, 4, 5, 6, 7];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 overflow-y-auto p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full m-4">
                <div className="p-6">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Create New Workflow</h3>
                    <div className="mt-4 space-y-4 max-h-[80vh] overflow-y-auto pr-2">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Content Type</label>
                            <div className="mt-2 grid grid-cols-3 gap-2">
                                {(['Caption', 'Image', 'Video'] as const).map(t => (
                                    <button key={t} onClick={() => setType(t)} className={`p-3 rounded-lg border-2 ${type === t ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30' : 'border-gray-300 dark:border-gray-600'}`}>{t}</button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Content Prompt / Topic</label>
                            <div className="relative mt-1">
                                <textarea id="prompt" value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} className="w-full p-2 pr-10 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600" placeholder="e.g., A futuristic cityscape at sunset..."></textarea>
                                {isSpeechRecognitionSupported && (
                                    <button type="button" onClick={handleMicClick} className={`absolute top-2 right-2 p-1 rounded-full transition-colors ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                                        <VoiceIcon className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="goal" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Goal of the post</label>
                                <select id="goal" value={postGoal} onChange={e => setPostGoal(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm dark:bg-gray-700 dark:border-gray-600">
                                    <option value="engagement">Increase Engagement</option>
                                    <option value="sales">Drive Sales</option>
                                    <option value="awareness">Build Awareness</option>
                                    {showAdvancedOptions && <option value="followers">Increase Followers/Fans</option>}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="tone" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tone of voice</label>
                                <select id="tone" value={postTone} onChange={e => setPostTone(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm dark:bg-gray-700 dark:border-gray-600">
                                    <option value="friendly">Friendly</option>
                                    <option value="witty">Witty</option>
                                    <option value="inspirational">Inspirational</option>
                                    <option value="professional">Professional</option>
                                    {showAdvancedOptions && (
                                        <>
                                    <option value="sexy-bold">Sexy / Bold</option>
                                    <option value="sexy-explicit">Sexy / Explicit</option>
                                        </>
                                    )}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Target Platforms</label>
                            <div className="mt-2 grid grid-cols-2 gap-3">
                                {(Object.keys(platformIcons) as Platform[]).map(platform => {
                                    const isConnected = settings.connectedAccounts[platform];
                                    return (
                                        <button
                                            key={platform}
                                            onClick={() => isConnected && handlePlatformToggle(platform)}
                                            title={!isConnected ? "Connect this account in Settings to target it in workflows." : ""}
                                            disabled={!isConnected}
                                            className={`flex items-center p-3 rounded-lg border-2 transition-colors ${
                                                isConnected
                                                    ? (targetPlatforms.includes(platform) ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700')
                                                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 opacity-60 cursor-not-allowed'
                                            }`}
                                        >
                                            {platformIcons[platform]}
                                            <span className="ml-3 font-semibold">{platform}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label htmlFor="frequency" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Frequency</label>
                                <div className="flex gap-2">
                                    <select id="frequency" value={frequencyType} onChange={e => setFrequencyType(e.target.value as any)} className="mt-1 w-1/2 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600">
                                        <option>Daily</option>
                                        <option>Weekly</option>
                                    </select>
                                    <select value={frequencyCount} onChange={e => setFrequencyCount(Number(e.target.value))} className="mt-1 w-1/2 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600">
                                        {(frequencyType === 'Daily' ? dailyOptions : weeklyOptions).map(n => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label htmlFor="approval" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Approval</label>
                                <select id="approval" value={approvalType} onChange={e => setApprovalType(e.target.value as any)} className="mt-1 w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600">
                                    <option>Manual</option>
                                    <option>Automatic</option>
                                </select>
                            </div>
                        </div>

                        {['Image', 'Video'].includes(type) && (
                            <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                                <label className="flex items-center">
                                    <input type="checkbox" checked={generateCaptions} onChange={e => setGenerateCaptions(e.target.checked)} className="h-4 w-4 text-primary-600 border-gray-300 rounded"/>
                                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Also generate AI captions</span>
                                </label>
                                {userBaseImage && (
                                    <label className="flex items-center">
                                        <input type="checkbox" checked={useBaseImage} onChange={e => setUseBaseImage(e.target.checked)} className="h-4 w-4 text-primary-600 border-gray-300 rounded"/>
                                        <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Use my AI Avatar as a base</span>
                                    </label>
                                )}
                                {type === 'Video' && (
                                    <>
                                        <div className="space-y-2">
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Aspect Ratio</label>
                                            <div className="flex gap-2 rounded-lg p-1 bg-gray-100 dark:bg-gray-900 w-full sm:w-auto">
                                                <button onClick={() => setAspectRatio('16:9')} className={`px-4 py-2 text-sm font-semibold rounded-md flex-1 transition-colors ${aspectRatio === '16:9' ? 'bg-white dark:bg-gray-700 shadow text-primary-600' : 'text-gray-600 dark:text-gray-300'}`}>16:9 Landscape</button>
                                                <button onClick={() => setAspectRatio('9:16')} className={`px-4 py-2 text-sm font-semibold rounded-md flex-1 transition-colors ${aspectRatio === '9:16' ? 'bg-white dark:bg-gray-700 shadow text-primary-600' : 'text-gray-600 dark:text-gray-300'}`}>9:16 Portrait</button>
                                            </div>
                                        </div>
                                        <label className="flex items-center">
                                            <input type="checkbox" checked={generateVoiceOver} onChange={e => setGenerateVoiceOver(e.target.checked)} className="h-4 w-4 text-primary-600 border-gray-300 rounded"/>
                                            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Generate AI Voice-over</span>
                                        </label>
                                        {generateVoiceOver && (
                                            <div className="pl-6 space-y-2">
                                                <textarea
                                                    value={voiceOverScript}
                                                    onChange={(e) => setVoiceOverScript(e.target.value)}
                                                    rows={3}
                                                    className="mt-1 w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                                                    placeholder="Enter the script for the voice-over..."
                                                />
                                                <div className="flex gap-2 items-center">
                                                    <select value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)} className="flex-grow w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600">
                                                        {userCustomVoices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                                        <option value="Zephyr">Zephyr (Pre-built)</option>
                                                        <option value="Kore">Kore (Pre-built)</option>
                                                    </select>
                                                    <input type="file" ref={voiceFileRef} onChange={handleVoiceFileChange} className="hidden" accept="audio/*" />
                                                    <button type="button" onClick={() => voiceFileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 whitespace-nowrap">
                                                        <UploadIcon /> Upload
                                                    </button>
                                                </div>
                                                 {userCustomVoices.length > 0 && (
                                                    <div className="mt-2 space-y-2">
                                                        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400">Your Voices ({userCustomVoices.length}/{voiceLimit === Infinity ? '∞' : voiceLimit})</h4>
                                                        <ul className="space-y-1 max-h-24 overflow-y-auto">
                                                            {userCustomVoices.map(voice => (
                                                                <li key={voice.id} className="flex justify-between items-center text-sm p-1.5 bg-gray-100 dark:bg-gray-900 rounded-md">
                                                                    <span className="truncate pr-2">{voice.name}</span>
                                                                    <button onClick={() => handleDeleteVoice(voice.id)} className="p-1 text-gray-500 hover:text-red-500"><TrashIcon /></button>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="mt-6 flex justify-end space-x-3">
                        <button onClick={onClose} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500">Cancel</button>
                        <button onClick={handleSave} disabled={!prompt.trim()} className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50">Create</button>
                    </div>
                </div>
            </div>
        </div>
    );
};


export const Automation: React.FC = () => {
    const { user, showToast, userBaseImage, setUserBaseImage } = useAppContext();
    const [workflows, setWorkflows] = useState<AutomationWorkflow[]>([]);
    const [approvalQueue, setApprovalQueue] = useState<ApprovalItem[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            try {
                const { data, mimeType } = await fileToBase64(file);
                setUserBaseImage({ data, mimeType });
                showToast('AI Avatar image updated!', 'success');
            } catch (error) {
                showToast('Failed to upload image.', 'error');
            }
        }
    };
    
    const handleSaveWorkflow = (newWorkflowData: Omit<AutomationWorkflow, 'id' | 'lastRun' | 'nextRun'>) => {
        const workflow: AutomationWorkflow = {
            ...newWorkflowData,
            id: Date.now().toString(),
            lastRun: 'N/A',
            nextRun: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }
        setWorkflows(prev => [...prev, workflow]);
    };
    
    const toggleWorkflow = (id: string) => {
        setWorkflows(prev => prev.map(w => w.id === id ? { ...w, isActive: !w.isActive } : w));
    };

    const handleApprove = (id: string) => {
        const item = approvalQueue.find(i => i.id === id);
        const workflow = workflows.find(w => w.id === item?.workflowId);
        setApprovalQueue(prev => prev.filter(item => item.id !== id));
        
        const platforms = workflow?.targetPlatforms?.join(', ') || 'configured platforms';
        showToast(`Approved and posted to ${platforms}!`, 'success');
    };

    const handleDiscard = (id: string) => {
        setApprovalQueue(prev => prev.filter(item => item.id !== id));
    };

    const typeIcons = {
        Caption: <CaptionIcon />,
        Image: <ImageIcon />,
        Video: <VideoIcon />,
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <WorkflowModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveWorkflow} />
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Content Automation</h2>
                <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors">
                    <SparklesIcon />
                    Create Workflow
                </button>
            </div>
            
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Your AI Avatar</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Upload a base image of yourself. The AI can use this as a reference to generate new images and videos of you in different styles or scenarios.</p>
                <div className="flex items-center gap-4">
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                    {userBaseImage ? (
                        <img src={`data:${userBaseImage.mimeType};base64,${userBaseImage.data}`} className="w-20 h-20 rounded-full object-cover" alt="AI Avatar Preview"/>
                    ) : (
                        <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-400">
                            <UserIcon />
                        </div>
                    )}
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500">
                        <UploadIcon />
                        {userBaseImage ? 'Change Image' : 'Upload Image'}
                    </button>
                </div>
            </div>

            {/* Workflows Section */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Your Workflows</h3>
                {workflows.length > 0 ? (
                    <div className="space-y-4">
                        {workflows.map(w => (
                            <div key={w.id} className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-full ${w.isActive ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400' : 'bg-gray-200 dark:bg-gray-600 text-gray-500'}`}>
                                        {typeIcons[w.type]}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                        <p className="font-semibold text-gray-900 dark:text-white">{w.type} Generation</p>
                                        {w.generateCaptions && <span title="Captions Enabled" className="text-gray-400"><CaptionIcon /></span>}
                                        {w.useBaseImage && <span title="Uses AI Avatar" className="text-gray-400"><UserIcon /></span>}
                                        {w.generateVoiceOver && <span title="Voice-over Enabled" className="text-gray-400"><VoiceIcon className="w-5 h-5" /></span>}
                                        </div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">"{w.prompt}"</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            {w.goal && <span className="text-xs font-semibold capitalize px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">{w.goal}</span>}
                                            {w.tone && <span className="text-xs font-semibold capitalize px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">{w.tone}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {w.targetPlatforms?.map(p => (
                                        <div key={p} className="p-1.5 bg-gray-200 dark:bg-gray-600 rounded-full text-gray-600 dark:text-gray-300" title={p}>
                                            {React.cloneElement(platformIcons[p], { className: "w-4 h-4" })}
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-center gap-6 text-sm">
                                    <div>
                                        <span className="font-medium text-gray-500 dark:text-gray-400">Frequency:</span>
                                        <span className="font-semibold text-gray-800 dark:text-gray-200 ml-1">{w.frequency.type} ({w.frequency.count}/{w.frequency.type === 'Daily' ? 'day' : 'week'})</span>
                                    </div>
                                    <div>
                                        <span className="font-medium text-gray-500 dark:text-gray-400">Approval:</span>
                                        <span className="font-semibold text-gray-800 dark:text-gray-200 ml-1">{w.approvalType}</span>
                                    </div>
                                    {w.type === 'Video' && w.aspectRatio && (
                                        <div>
                                            <span className="font-medium text-gray-500 dark:text-gray-400">Ratio:</span>
                                            <span className="font-semibold text-gray-800 dark:text-gray-200 ml-1">{w.aspectRatio}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => toggleWorkflow(w.id)} className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${w.isActive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>{w.isActive ? 'Active' : 'Paused'}</button>
                                    <button className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"><TrashIcon /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-500 dark:text-gray-400 text-center py-8">No workflows created yet. Click "Create Workflow" to get started.</p>
                )}
            </div>

            {/* Approval Queue Section */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Manual Approval Queue ({approvalQueue.length})</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {approvalQueue.length > 0 ? approvalQueue.map(item => (
                        <div key={item.id} className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 flex flex-col">
                            <div className="aspect-square bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                                {item.content.imageUrl && <img src={item.content.imageUrl} alt="Generated content" className="w-full h-full object-cover" />}
                            </div>
                            <div className="p-4 flex-grow flex flex-col">
                                <p className="text-xs text-gray-500 dark:text-gray-400">Generated {new Date(item.generatedAt).toLocaleString()}</p>
                                <div className="mt-auto pt-4 flex justify-end gap-2">
                                    <button onClick={() => handleDiscard(item.id)} className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500">Discard</button>
                                    <button onClick={() => handleApprove(item.id)} className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700">
                                        <CheckCircleIcon className="w-4 h-4" /> Approve & Post
                                    </button>
                                </div>
                            </div>
                        </div>
                    )) : (
                        <p className="text-gray-500 dark:text-gray-400 md:col-span-3 text-center py-8">The approval queue is empty.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Automation;
