
import React, { useState, useRef } from 'react';
import { useAppContext } from './AppContext';
import { BioLink } from '../types';
import { TrashIcon, PlusIcon, UploadIcon, LinkIcon, CheckCircleIcon, MailIcon, CameraIcon, UserIcon } from './icons/UIIcons';

const BioPreview: React.FC<{ config: any }> = ({ config }) => {
    return (
        <div className="bg-black p-2.5 rounded-[2.5rem] shadow-2xl border-[6px] border-gray-800 w-[300px] h-[600px] relative overflow-hidden flex-shrink-0">
             <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-black rounded-b-lg z-20"></div>
             <div 
                className="w-full h-full bg-white overflow-y-auto rounded-[2rem] scrollbar-hide"
                style={{ backgroundColor: config.theme.backgroundColor }}
             >
                 <div className="p-4 flex flex-col items-center min-h-full text-center pt-8">
                     <img 
                        src={config.avatar || 'https://via.placeholder.com/100'} 
                        alt="Profile" 
                        className="w-20 h-20 rounded-full object-cover border-2 border-white shadow-md mb-3"
                    />
                    <h3 className="text-xl font-bold mb-1" style={{ color: config.theme.textColor }}>{config.displayName}</h3>
                    <p className="text-sm mb-6 px-4 opacity-90" style={{ color: config.theme.textColor }}>{config.bio}</p>

                    <div className="w-full space-y-3">
                        {config.links?.filter((l: any) => l.isActive).map((link: any) => (
                            <a 
                                key={link.id}
                                href="#"
                                onClick={(e) => e.preventDefault()}
                                className={`block w-full py-3 px-4 text-center font-medium transition-transform active:scale-95 ${config.theme.buttonStyle === 'rounded' ? 'rounded-lg' : config.theme.buttonStyle === 'pill' ? 'rounded-full' : 'rounded-none'}`}
                                style={{ 
                                    backgroundColor: config.theme.buttonColor, 
                                    color: config.theme.backgroundColor === '#ffffff' && config.theme.buttonColor === '#ffffff' ? '#000000' : config.theme.backgroundColor 
                                }}
                            >
                                {link.title}
                            </a>
                        ))}
                    </div>

                    {/* Email Capture Preview */}
                    {config.emailCapture?.enabled && (
                        <div className="w-full mt-8 p-4 rounded-xl bg-white shadow-lg border border-gray-100">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 mx-auto mb-2">
                                <MailIcon className="w-4 h-4" />
                            </div>
                            <h4 className="font-bold text-gray-800 text-sm mb-1">{config.emailCapture.title}</h4>
                            <div className="mt-2">
                                <input 
                                    type="email" 
                                    placeholder={config.emailCapture.placeholder} 
                                    disabled
                                    className="w-full p-2 text-xs border border-gray-300 rounded-md mb-2 bg-gray-50"
                                />
                                <button 
                                    className="w-full py-2 text-xs font-bold text-white bg-gray-900 rounded-md"
                                >
                                    {config.emailCapture.buttonText}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="mt-auto pt-8 pb-4">
                        <p className="text-[10px] font-bold opacity-50" style={{ color: config.theme.textColor }}>POWERED BY ENGAGESUITE.AI</p>
                    </div>
                 </div>
             </div>
        </div>
    );
};

export const BioPageBuilder: React.FC = () => {
    const { bioPage, setBioPage, showToast, saveBioPage } = useAppContext();
    const [newLinkTitle, setNewLinkTitle] = useState('');
    const [newLinkUrl, setNewLinkUrl] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleAddLink = () => {
        if (!newLinkTitle || !newLinkUrl) return;
        const newLink: BioLink = {
            id: Date.now().toString(),
            title: newLinkTitle,
            url: newLinkUrl,
            isActive: true,
            clicks: 0
        };
        // Use bioPage directly instead of prev state to safely handle initial null state
        setBioPage({ ...bioPage, links: [...(bioPage.links || []), newLink] });
        setNewLinkTitle('');
        setNewLinkUrl('');
    };

    const handleRemoveLink = (id: string) => {
        setBioPage({ ...bioPage, links: bioPage.links.filter(l => l.id !== id) });
    };

    const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    setBioPage({ ...bioPage, avatar: event.target.result as string });
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const updateTheme = (key: string, value: string) => {
        setBioPage({ ...bioPage, theme: { ...bioPage.theme, [key]: value } });
    };
    
    const updateEmailCapture = (key: string, value: any) => {
        setBioPage({ 
            ...bioPage, 
            emailCapture: { 
                ...bioPage.emailCapture, 
                [key]: value 
            } as any 
        });
    };

    const handlePublish = async () => {
        setIsSaving(true);
        try {
            await saveBioPage(bioPage);
            showToast('Bio page published successfully!', 'success');
        } catch (e) {
            showToast('Failed to publish bio page', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="min-h-[calc(100vh-8rem)] flex flex-col lg:flex-row gap-6">
            {/* Left Editor */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Link in Bio Builder</h2>
                    <button onClick={handlePublish} disabled={isSaving} className="px-6 py-2 bg-primary-600 text-white font-bold rounded-md hover:bg-primary-700 flex items-center gap-2 disabled:opacity-50">
                        <CheckCircleIcon className="w-5 h-5"/> {isSaving ? 'Saving...' : 'Publish'}
                    </button>
                </div>

                {/* Profile Section */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Profile</h3>
                    <div className="flex items-center gap-6">
                        <div className="relative group">
                            <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center">
                                {bioPage.avatar ? (
                                    <img src={bioPage.avatar} alt="Avatar" className="w-full h-full object-cover" />
                                ) : <UserIcon className="w-10 h-10 text-gray-400"/>}
                            </div>
                            <button 
                                onClick={() => fileInputRef.current?.click()} 
                                className="absolute bottom-0 right-0 p-2 bg-primary-600 text-white rounded-full hover:bg-primary-700 shadow-md transition-transform hover:scale-110"
                                title="Upload Profile Picture"
                            >
                                <CameraIcon className="w-4 h-4" />
                            </button>
                            <input type="file" ref={fileInputRef} onChange={handleAvatarUpload} className="hidden" accept="image/*" />
                        </div>
                        
                        <div className="flex-1 space-y-3">
                            <input 
                                type="text" 
                                value={bioPage.displayName} 
                                onChange={e => setBioPage({ ...bioPage, displayName: e.target.value })}
                                placeholder="Display Name"
                                className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                            />
                            <textarea 
                                value={bioPage.bio} 
                                onChange={e => setBioPage({ ...bioPage, bio: e.target.value })}
                                placeholder="Bio description"
                                rows={2}
                                className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                            />
                        </div>
                    </div>
                </div>

                {/* Links Section */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Links</h3>
                    <div className="space-y-4 mb-6">
                        {bioPage.links?.map(link => (
                            <div key={link.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                <div className="cursor-move text-gray-400">⋮⋮</div>
                                <div className="flex-1">
                                    <p className="font-semibold text-gray-900 dark:text-white">{link.title}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{link.url}</p>
                                </div>
                                <div className="text-xs font-bold text-gray-500 dark:text-gray-400">{link.clicks} clicks</div>
                                <button onClick={() => handleRemoveLink(link.id)} className="text-gray-400 hover:text-red-500">
                                    <TrashIcon />
                                </button>
                            </div>
                        ))}
                        {bioPage.links?.length === 0 && <p className="text-center text-gray-500 dark:text-gray-400 py-4">No links added yet.</p>}
                    </div>
                    
                    <div className="flex flex-col gap-2 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border-dashed border-2 border-gray-300 dark:border-gray-700">
                        <input 
                            type="text" 
                            value={newLinkTitle}
                            onChange={e => setNewLinkTitle(e.target.value)}
                            placeholder="Button Title (e.g. My Website)"
                            className="w-full p-2 border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 dark:text-white"
                        />
                        <input 
                            type="text" 
                            value={newLinkUrl}
                            onChange={e => setNewLinkUrl(e.target.value)}
                            placeholder="URL (https://...)"
                            className="w-full p-2 border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 dark:text-white"
                        />
                        <button onClick={handleAddLink} disabled={!newLinkTitle || !newLinkUrl} className="w-full py-2 bg-gray-900 dark:bg-white text-white dark:text-black font-semibold rounded-md hover:opacity-90 flex justify-center items-center gap-2 disabled:opacity-50">
                            <PlusIcon className="w-4 h-4" /> Add Link
                        </button>
                    </div>
                </div>
                
                {/* Email Capture Section */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <MailIcon className="text-primary-600 dark:text-primary-400" />
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Email Signup Form</h3>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={bioPage.emailCapture?.enabled} 
                                onChange={e => updateEmailCapture('enabled', e.target.checked)} 
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                        </label>
                    </div>
                    
                    {bioPage.emailCapture?.enabled && (
                        <div className="space-y-3 pl-2 border-l-2 border-primary-100 dark:border-primary-900">
                            <div>
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Form Title</label>
                                <input 
                                    type="text" 
                                    value={bioPage.emailCapture.title} 
                                    onChange={e => updateEmailCapture('title', e.target.value)}
                                    className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Placeholder Text</label>
                                    <input 
                                        type="text" 
                                        value={bioPage.emailCapture.placeholder} 
                                        onChange={e => updateEmailCapture('placeholder', e.target.value)}
                                        className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Button Text</label>
                                    <input 
                                        type="text" 
                                        value={bioPage.emailCapture.buttonText} 
                                        onChange={e => updateEmailCapture('buttonText', e.target.value)}
                                        className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Appearance Section */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Appearance</h3>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Background</label>
                            <div className="flex gap-2">
                                <input type="color" value={bioPage.theme.backgroundColor} onChange={e => updateTheme('backgroundColor', e.target.value)} className="h-10 w-20 rounded cursor-pointer bg-transparent" />
                            </div>
                        </div>
                         <div>
                            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Buttons</label>
                            <div className="flex gap-2">
                                <input type="color" value={bioPage.theme.buttonColor} onChange={e => updateTheme('buttonColor', e.target.value)} className="h-10 w-20 rounded cursor-pointer bg-transparent" />
                            </div>
                        </div>
                         <div>
                            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Text</label>
                            <div className="flex gap-2">
                                <input type="color" value={bioPage.theme.textColor} onChange={e => updateTheme('textColor', e.target.value)} className="h-10 w-20 rounded cursor-pointer bg-transparent" />
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-500 dark:text-gray-400 mb-2">Button Style</label>
                        <div className="flex gap-2">
                            {(['square', 'rounded', 'pill'] as const).map(style => (
                                <button 
                                    key={style}
                                    onClick={() => updateTheme('buttonStyle', style)}
                                    className={`flex-1 py-2 border-2 text-gray-800 dark:text-gray-200 ${bioPage.theme.buttonStyle === style ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-300 dark:border-gray-600'} ${style === 'rounded' ? 'rounded-lg' : style === 'pill' ? 'rounded-full' : 'rounded-none'}`}
                                >
                                    {style.charAt(0).toUpperCase() + style.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Preview */}
            <div className="hidden lg:flex items-start justify-center pt-4 px-6 pb-6 bg-gray-100 dark:bg-gray-900 rounded-2xl">
                 <BioPreview config={bioPage} />
            </div>
        </div>
    );
};
