import React, { useState } from 'react';
import { XMarkIcon, HeartIcon, ChatIcon, SendIcon, RefreshIcon, SunIcon, MoonIcon } from './icons/UIIcons';
import { InstagramIcon, XIcon, LinkedInIcon, TikTokIcon, YouTubeIcon, FacebookIcon } from './icons/PlatformIcons';

interface MobilePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    caption: string;
    media: { previewUrl: string, type: 'image' | 'video' } | null;
    user: { name: string; avatar: string } | null;
}

type ViewMode = 'Instagram' | 'X' | 'LinkedIn' | 'TikTok' | 'YouTube' | 'Facebook';

export const MobilePreviewModal: React.FC<MobilePreviewModalProps> = ({ isOpen, onClose, caption, media, user }) => {
    const [activeView, setActiveView] = useState<ViewMode>('Instagram');
    const [isDarkMode, setIsDarkMode] = useState(false);

    if (!isOpen) return null;

    const userName = user?.name || 'User Name';
    const userHandle = user?.name.replace(/\s+/g, '').toLowerCase() || 'username';
    const userAvatar = user?.avatar || 'https://via.placeholder.com/40';

    const renderContent = () => {
        const themeClasses = isDarkMode ? 'dark bg-black text-white' : 'bg-white text-black';
        const xThemeClasses = isDarkMode ? 'dark bg-black text-white' : 'bg-white text-black'; // X has its own dark mode
        const linkedInThemeClasses = isDarkMode ? 'dark bg-gray-800 text-white' : 'bg-[#f3f2ef] text-black';
        const facebookThemeClasses = isDarkMode ? 'dark bg-[#18191a] text-[#e4e6eb]' : 'bg-white text-black';

        switch (activeView) {
            case 'Instagram':
                return (
                    <div className={`${themeClasses} h-full flex flex-col font-sans pt-8`}>
                        {/* Header */}
                        <div className={`flex items-center justify-between p-3 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-100'} flex-shrink-0`}>
                            <div className="flex items-center gap-2">
                                <img src={userAvatar} alt="avatar" className="w-8 h-8 rounded-full object-cover" />
                                <span className="font-semibold text-sm">{userHandle}</span>
                            </div>
                            <span className="text-lg font-bold">...</span>
                        </div>
                        {/* Scrollable Content */}
                        <div className="flex-1 overflow-y-auto scrollbar-hide">
                            {/* Media */}
                            <div className="bg-black aspect-square flex items-center justify-center overflow-hidden relative">
                                {media ? (
                                    media.type === 'image' ? (
                                        <img src={media.previewUrl} alt="Post Media" className="w-full h-full object-cover" />
                                    ) : (
                                        <video src={media.previewUrl} className="w-full h-full object-cover" controls />
                                    )
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-sm">No Media</div>
                                )}
                            </div>
                            {/* Actions */}
                            <div className="p-3">
                                <div className="flex justify-between items-center mb-2">
                                    <div className="flex gap-4">
                                        <HeartIcon className="w-6 h-6" />
                                        <ChatIcon className="w-6 h-6" />
                                        <SendIcon className="w-6 h-6" />
                                    </div>
                                    <div className={`w-6 h-6 border-2 ${isDarkMode ? 'border-white' : 'border-black'} rounded-none`}></div> {/* Bookmark placeholder */}
                                </div>
                                <p className="font-semibold text-sm mb-1">1,234 likes</p>
                                <div className="text-sm">
                                    <span className="font-semibold mr-1">{userHandle}</span>
                                    <span className="whitespace-pre-wrap">{caption || "Your caption will appear here..."}</span>
                                </div>
                                <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>View all 12 comments</p>
                                <p className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'} mt-1 uppercase`}>2 HOURS AGO</p>
                            </div>
                        </div>
                    </div>
                );
            case 'X':
                return (
                    <div className={`${xThemeClasses} h-full flex flex-col p-4 pt-10 overflow-y-auto scrollbar-hide`}>
                        {/* Header */}
                        <div className="flex gap-3 mb-2">
                            <img src={userAvatar} alt="avatar" className="w-10 h-10 rounded-full object-cover" />
                            <div className="flex-1">
                                <div className="flex items-center gap-1">
                                    <span className="font-bold text-sm">{userName}</span>
                                    <span className="text-gray-500 text-sm">@{userHandle} · 2h</span>
                                </div>
                                {/* Text */}
                                <p className="text-sm mt-1 whitespace-pre-wrap">{caption || "Your tweet text will appear here..."}</p>
                                {/* Media */}
                                {media && (
                                    <div className={`mt-3 rounded-2xl overflow-hidden border ${isDarkMode ? 'border-gray-800' : 'border-gray-200'} max-h-64 flex items-center justify-center bg-gray-900`}>
                                         {media.type === 'image' ? (
                                            <img src={media.previewUrl} alt="Post Media" className="w-full h-full object-contain" />
                                        ) : (
                                            <video src={media.previewUrl} className="w-full h-full object-contain" controls />
                                        )}
                                    </div>
                                )}
                                {/* Actions */}
                                <div className="flex justify-between text-gray-500 mt-3 max-w-xs text-xs">
                                    <div className="flex items-center gap-1"><ChatIcon className="w-4 h-4" /> 12</div>
                                    <div className="flex items-center gap-1"><RefreshIcon className="w-4 h-4" /> 5</div>
                                    <div className="flex items-center gap-1"><HeartIcon className="w-4 h-4" /> 34</div>
                                    <div className="flex items-center gap-1"><SendIcon className="w-4 h-4" /></div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            case 'LinkedIn':
                 return (
                    <div className={`${linkedInThemeClasses} h-full flex flex-col overflow-y-auto scrollbar-hide pt-8`}>
                        {/* Card */}
                        <div className={`${isDarkMode ? 'bg-gray-900' : 'bg-white'} mb-2 pb-2`}>
                             {/* Header */}
                            <div className="flex items-center gap-3 p-3">
                                <img src={userAvatar} alt="avatar" className="w-10 h-10 rounded-full object-cover" />
                                <div>
                                    <div className="font-semibold text-sm">{userName}</div>
                                    <div className="text-xs text-gray-500">Social Media Manager</div>
                                    <div className="text-xs text-gray-500 flex items-center gap-1">2h • <span className="text-[10px]">🌐</span></div>
                                </div>
                            </div>
                            {/* Text */}
                            <div className="px-3 pb-2 text-sm whitespace-pre-wrap">
                                {caption || "Your post content..."}
                            </div>
                             {/* Media */}
                             {media && (
                                <div className={`w-full ${isDarkMode ? 'bg-black' : 'bg-gray-100'}`}>
                                     {media.type === 'image' ? (
                                        <img src={media.previewUrl} alt="Post Media" className="w-full object-cover" />
                                    ) : (
                                        <video src={media.previewUrl} className="w-full" controls />
                                    )}
                                </div>
                             )}
                             {/* Stats */}
                             <div className={`px-3 py-2 text-xs text-gray-500 flex items-center gap-1 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                                 <span>👍 ❤️ 48</span>
                                 <span className="ml-auto">5 comments</span>
                             </div>
                             {/* Actions */}
                             <div className="px-4 py-1 flex justify-between">
                                 {['Like', 'Comment', 'Repost', 'Send'].map(action => (
                                     <div key={action} className={`flex flex-col items-center gap-1 p-2 ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} rounded`}>
                                         <div className="w-4 h-4 text-gray-600 dark:text-gray-400">
                                            {action === 'Like' && <div className="w-4 h-4 border border-current rounded-sm"></div>}
                                            {action === 'Comment' && <ChatIcon className="w-4 h-4"/>}
                                            {action === 'Repost' && <RefreshIcon className="w-4 h-4"/>}
                                            {action === 'Send' && <SendIcon className="w-4 h-4"/>}
                                         </div>
                                         <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{action}</span>
                                     </div>
                                 ))}
                             </div>
                        </div>
                    </div>
                 );
            case 'TikTok':
                return (
                    <div className="bg-black h-full relative text-white overflow-hidden font-sans">
                        {/* Media Background */}
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                            {media ? (
                                media.type === 'image' ? (
                                    <img src={media.previewUrl} alt="Post Media" className="w-full h-full object-cover opacity-80" />
                                ) : (
                                    <video src={media.previewUrl} className="w-full h-full object-cover" controls={false} autoPlay loop muted playsInline />
                                )
                            ) : (
                                <div className="text-gray-500">No Media</div>
                            )}
                        </div>
                        
                        {/* Right Action Bar */}
                        <div className="absolute bottom-20 right-2 flex flex-col gap-6 items-center z-10">
                            <div className="relative">
                                <img src={userAvatar} className="w-10 h-10 rounded-full border border-white" alt="profile" />
                                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-red-500 rounded-full p-0.5 w-4 h-4 flex items-center justify-center text-[10px]">+</div>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                                <HeartIcon className="w-8 h-8 fill-white text-white drop-shadow-md" />
                                <span className="text-xs font-bold drop-shadow-md">12.5K</span>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                                <ChatIcon className="w-8 h-8 fill-white text-white drop-shadow-md" />
                                <span className="text-xs font-bold drop-shadow-md">482</span>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center transform -rotate-12">
                                   <span className="font-bold text-xs">...</span>
                                </div>
                                <span className="text-xs font-bold drop-shadow-md">More</span>
                            </div>
                             <div className="w-10 h-10 bg-gray-800 rounded-full border-4 border-gray-700 flex items-center justify-center animate-spin-slow">
                                <img src={userAvatar} className="w-5 h-5 rounded-full" alt="music" />
                            </div>
                        </div>

                        {/* Bottom Info Area */}
                        <div className="absolute bottom-0 left-0 w-full p-4 pt-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-10">
                            <div className="mb-2 font-bold text-shadow">@{userHandle}</div>
                            <div className="text-sm mb-3 line-clamp-2 text-shadow">{caption || "Your caption here... #fyp #viral"}</div>
                            <div className="flex items-center gap-2 text-sm opacity-90">
                                <span className="animate-pulse">🎵</span> 
                                <span className="truncate w-1/2">Original Sound - {userName}</span>
                            </div>
                        </div>
                    </div>
                );
             case 'YouTube':
                return (
                     <div className={`${themeClasses} h-full flex flex-col font-sans overflow-y-auto scrollbar-hide pt-8`}>
                        {/* Video Player Area */}
                        <div className="bg-black aspect-video flex items-center justify-center w-full flex-shrink-0 sticky top-0 z-10">
                             {media ? (
                                media.type === 'image' ? (
                                    <img src={media.previewUrl} alt="Post Media" className="w-full h-full object-contain" />
                                ) : (
                                    <video src={media.previewUrl} className="w-full h-full object-contain" controls />
                                )
                            ) : (
                                <div className="text-gray-500 text-sm">No Video</div>
                            )}
                        </div>
                        
                        {/* Content Body */}
                        <div className="p-3 flex-1">
                            <div className="font-semibold text-lg leading-snug line-clamp-2 mb-1">
                                {caption ? caption.split('\n')[0] : "Your Video Title Goes Here"}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 mb-4">
                                12K views · 5 hours ago
                            </div>
                            
                            {/* Actions Row */}
                             <div className="flex items-center justify-between px-2 mb-4">
                                 {['1.2K', 'Dislike', 'Share', 'Download'].map(action => (
                                     <div key={action} className="flex flex-col items-center gap-1">
                                         <div className={`p-2 rounded-full ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
                                            {action === '1.2K' && <HeartIcon className="w-5 h-5" />}
                                            {action === 'Dislike' && <div className="transform rotate-180"><HeartIcon className="w-5 h-5" /></div>}
                                            {action === 'Share' && <SendIcon className="w-5 h-5" />}
                                            {action === 'Download' && <div className="w-5 h-5 border-2 border-current rounded-sm text-xs flex items-center justify-center font-bold">↓</div>}
                                         </div>
                                         <span className="text-xs">{action}</span>
                                     </div>
                                 ))}
                             </div>
                             
                             <hr className={`${isDarkMode ? 'border-gray-700' : 'border-gray-200'} mb-4`} />
                             
                             {/* Channel Info */}
                             <div className="flex items-center justify-between mb-4">
                                 <div className="flex items-center gap-2">
                                     <img src={userAvatar} className="w-9 h-9 rounded-full bg-gray-200" alt="channel"/>
                                     <div>
                                         <div className="font-bold text-sm">{userName}</div>
                                         <div className="text-xs text-gray-500 dark:text-gray-400">105K subscribers</div>
                                     </div>
                                 </div>
                                 <button className={`${isDarkMode ? 'bg-white text-black' : 'bg-black text-white'} text-sm font-medium px-3 py-1.5 rounded-full`}>Subscribe</button>
                             </div>

                             {/* Comments Teaser */}
                             <div className={`${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg p-3 mb-4`}>
                                 <div className="flex items-center gap-1 mb-1">
                                     <span className="font-bold text-xs">Comments</span>
                                     <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>124</span>
                                 </div>
                                 <div className="flex items-center gap-2">
                                     <div className="w-5 h-5 rounded-full bg-purple-500 flex-shrink-0 text-[10px] flex items-center justify-center text-white">A</div>
                                     <div className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} truncate`}>Love this content! Can you make more about...</div>
                                 </div>
                             </div>
                        </div>
                    </div>
                );
            case 'Facebook':
                 return (
                    <div className={`${facebookThemeClasses} h-full flex flex-col font-sans overflow-y-auto scrollbar-hide pt-8`}>
                        <div className={`${isDarkMode ? 'bg-[#242526]' : 'bg-white'} rounded-lg`}>
                             {/* Header */}
                            <div className="flex items-center gap-3 p-3">
                                <img src={userAvatar} alt="avatar" className="w-10 h-10 rounded-full object-cover" />
                                <div>
                                    <div className="font-semibold text-sm">{userName}</div>
                                    <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} flex items-center gap-1`}>2h • 🌎</div>
                                </div>
                            </div>
                            {/* Text */}
                            <div className="px-4 pb-2 text-sm whitespace-pre-wrap">
                                {caption || "Your post content..."}
                            </div>
                             {/* Media */}
                             {media && (
                                <div className={`w-full ${isDarkMode ? 'bg-black' : 'bg-gray-100'}`}>
                                     {media.type === 'image' ? (
                                        <img src={media.previewUrl} alt="Post Media" className="w-full object-cover" />
                                    ) : (
                                        <video src={media.previewUrl} className="w-full" controls />
                                    )}
                                </div>
                             )}
                             {/* Stats */}
                             <div className={`px-4 py-2 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} flex items-center gap-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                                 <span>👍❤️😂 1.2K</span>
                                 <span>58 Comments</span>
                                 <span>101 Shares</span>
                             </div>
                             {/* Actions */}
                             <div className="px-2 py-1 grid grid-cols-3 gap-1">
                                 {['Like', 'Comment', 'Share'].map(action => (
                                     <div key={action} className={`flex items-center justify-center gap-2 p-2 ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} rounded`}>
                                         <div className={`w-5 h-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                            {action === 'Like' && <div className="w-5 h-5 border-2 border-current rounded-sm"></div>}
                                            {action === 'Comment' && <ChatIcon className="w-5 h-5"/>}
                                            {action === 'Share' && <SendIcon className="w-5 h-5"/>}
                                         </div>
                                         <span className={`text-sm font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{action}</span>
                                     </div>
                                 ))}
                             </div>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    }

    return (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm overflow-y-auto">
            <div className="min-h-full flex flex-col items-center justify-center p-4 py-12">
                {/* Close Button */}
                <button 
                    onClick={onClose} 
                    className="fixed top-4 right-4 z-[210] p-2 bg-white/10 rounded-full hover:bg-white/20 text-white transition-colors backdrop-blur-sm"
                    aria-label="Close Preview"
                >
                    <XMarkIcon className="w-8 h-8" />
                </button>

                {/* Platform & Theme Tabs */}
                <div className="flex flex-wrap justify-center items-center gap-2 mb-8 bg-gray-900/80 border border-gray-700 p-2 rounded-2xl shadow-2xl max-w-[95vw] scrollbar-hide backdrop-blur-md">
                    <div className="flex gap-1">
                        <button onClick={() => setActiveView('Instagram')} className={`px-3 py-1.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all whitespace-nowrap ${activeView === 'Instagram' ? 'bg-gradient-to-br from-purple-600 to-pink-500 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}><InstagramIcon className="w-4 h-4" /></button>
                        <button onClick={() => setActiveView('TikTok')} className={`px-3 py-1.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all whitespace-nowrap ${activeView === 'TikTok' ? 'bg-black text-white shadow-lg border border-gray-700' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}><TikTokIcon className="w-4 h-4" /></button>
                        <button onClick={() => setActiveView('YouTube')} className={`px-3 py-1.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all whitespace-nowrap ${activeView === 'YouTube' ? 'bg-red-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}><YouTubeIcon className="w-4 h-4" /></button>
                        <button onClick={() => setActiveView('X')} className={`px-3 py-1.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all whitespace-nowrap ${activeView === 'X' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}><XIcon className="w-4 h-4" /></button>
                        <button onClick={() => setActiveView('LinkedIn')} className={`px-3 py-1.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all whitespace-nowrap ${activeView === 'LinkedIn' ? 'bg-[#0a66c2] text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}><LinkedInIcon className="w-4 h-4" /></button>
                        <button onClick={() => setActiveView('Facebook')} className={`px-3 py-1.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all whitespace-nowrap ${activeView === 'Facebook' ? 'bg-[#1877f2] text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}><FacebookIcon className="w-4 h-4" /></button>
                    </div>
                     <div className="border-l border-gray-700 h-6 mx-2"></div>
                    <div className="flex gap-1 bg-gray-800 p-1 rounded-lg">
                        <button onClick={() => setIsDarkMode(false)} className={`p-1.5 rounded-md ${!isDarkMode ? 'bg-gray-600 text-white' : 'text-gray-400'}`}><SunIcon /></button>
                        <button onClick={() => setIsDarkMode(true)} className={`p-1.5 rounded-md ${isDarkMode ? 'bg-gray-600 text-white' : 'text-gray-400'}`}><MoonIcon /></button>
                    </div>
                </div>

                {/* Phone Frame */}
                <div className="relative w-[320px] h-[650px] bg-black rounded-[3rem] border-[8px] border-gray-800 shadow-2xl overflow-hidden flex-shrink-0 ring-4 ring-gray-900">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-black rounded-b-2xl z-20"></div>
                    <div className="w-full h-full bg-white overflow-hidden rounded-[2.5rem]">
                        {renderContent()}
                    </div>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-gray-500 rounded-full z-20 opacity-80"></div>
                </div>
            </div>
        </div>
    );
};
