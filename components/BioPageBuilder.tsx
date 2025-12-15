
import React, { useState, useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { useAppContext } from './AppContext';
import { BioLink, SocialBioLink, Platform } from '../types';
import { TrashIcon, PlusIcon, UploadIcon, LinkIcon, CheckCircleIcon, MailIcon, CameraIcon, UserIcon, EmojiIcon, FaceSmileIcon, CatIcon, PizzaIcon, SoccerBallIcon, CarIcon, LightbulbIcon, HeartIcon } from './icons/UIIcons';
import { EMOJIS, EMOJI_CATEGORIES, Emoji } from './emojiData';
import { storage } from '../firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { InstagramIcon, TikTokIcon, ThreadsIcon, XIcon, YouTubeIcon, LinkedInIcon, FacebookIcon, PinterestIcon, DiscordIcon, TelegramIcon, RedditIcon, FanvueIcon, OnlyFansIcon } from './icons/PlatformIcons';

const categoryIcons: Record<string, React.ReactNode> = {
    FaceSmileIcon: <FaceSmileIcon className="w-5 h-5"/>,
    CatIcon: <CatIcon className="w-5 h-5"/>,
    PizzaIcon: <PizzaIcon className="w-5 h-5"/>,
    SoccerBallIcon: <SoccerBallIcon className="w-5 h-5"/>,
    CarIcon: <CarIcon className="w-5 h-5"/>,
    LightbulbIcon: <LightbulbIcon className="w-5 h-5"/>,
    HeartIcon: <HeartIcon className="w-5 h-5"/>,
};

// Full-color platform icons with brand colors
const platformIcons: Record<Platform, React.ReactNode> = {
    Instagram: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="url(#instagram-gradient)"><defs><linearGradient id="instagram-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#833AB4"/><stop offset="50%" stopColor="#FD1D1D"/><stop offset="100%" stopColor="#FCAF45"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="url(#instagram-gradient)"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" fill="white"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" stroke="white" strokeWidth="2" strokeLinecap="round"></line></svg>,
    TikTok: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#000000"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.1 1.58-2.81 2.34-4.64 2.34-1.29 0-2.57-.31-3.69-1.01-.83-.5-1.5-1.17-2.06-1.95-1.2-1.63-1.62-3.6-1.39-5.42.17-1.39.73-2.73 1.52-3.88.8-1.16 1.94-1.93 3.23-2.31.25-.08.5-.14.75-.21.02-3.12.02-6.24.01-9.36.24-.28.48-.56.73-.82 1.02-1.06 2.36-1.57 3.82-1.57Z" /></svg>,
    X: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#000000"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>,
    Threads: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#000000"><path d="M12 2.25c-5.46 0-9.75 4.5-9.75 9.75s4.29 9.75 9.75 9.75c5.46 0 9.75-4.5 9.75-9.75S17.46 2.25 12 2.25ZM9.63 16.14c-.66 0-1.2-.54-1.2-1.2s.54-1.2 1.2-1.2c.66 0 1.2.54 1.2 1.2s-.54 1.2-1.2 1.2Zm4.74 0c-.66 0-1.2-.54-1.2-1.2s.54-1.2 1.2-1.2c.66 0 1.2.54 1.2 1.2s-.54 1.2-1.2 1.2Zm1.68-4.26c-.27-.08-1.83-.55-3.36-.55-1.56 0-3.15.48-3.45.57-.3.09-.57-.15-.57-.45 0-.06 0-.12.03-.18.17-.42.99-2.28 3.99-2.28 2.97 0 3.78 1.83 3.96 2.25.05.12.06.24.06.36 0 .3-.24.54-.51.45Z"/></svg>,
    YouTube: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#FF0000"><path d="M21.582,6.186c-0.23-0.86-0.908-1.538-1.768-1.768C18.254,4,12,4,12,4S5.746,4,4.186,4.418 c-0.86,0.23-1.538,0.908-1.768,1.768C2,7.746,2,12,2,12s0,4.254,0.418,5.814c0.23,0.86,0.908,1.538,1.768,1.768 C5.746,20,12,20,12,20s6.254,0,7.814-0.418c0.861-0.23,1.538-0.908,1.768-1.768C22,16.254,22,12,22,12S22,7.746,21.582,6.186z M10,15.464V8.536L16,12L10,15.464z" /></svg>,
    LinkedIn: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#0077B5"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>,
    Facebook: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
    Pinterest: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#BD081C"><path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.619 11.174-.105-.949-.2-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.402.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.357-.629-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>,
    Discord: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>,
    Telegram: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#0088CC"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>,
    Reddit: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#FF4500"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>,
    Fanvue: <FanvueIcon className="w-5 h-5" />,
    OnlyFans: <OnlyFansIcon className="w-5 h-5" />,
};

const getPlatformUrl = (platform: Platform, username: string): string => {
    const urlMap: Record<Platform, string> = {
        Instagram: `https://instagram.com/${username}`,
        TikTok: `https://tiktok.com/@${username}`,
        X: `https://x.com/${username}`,
        Threads: `https://threads.net/@${username}`,
        YouTube: `https://youtube.com/@${username}`,
        LinkedIn: `https://linkedin.com/in/${username}`,
        Facebook: `https://facebook.com/${username}`,
        Pinterest: `https://pinterest.com/${username}`,
        Discord: `https://discord.gg/${username}`, // May need custom handling
        Telegram: `https://t.me/${username}`,
        Reddit: `https://reddit.com/user/${username}`,
        Fanvue: `https://fanvue.com/${username}`,
        OnlyFans: `https://onlyfans.com/${username}`,
    };
    
    return urlMap[platform] || `https://${platform.toLowerCase()}.com/${username}`;
};

const formatFollowerCount = (count: number): string => {
    if (count >= 1000000) {
        return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
        return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
};

const BioPreview: React.FC<{ config: any }> = ({ config }) => {
    const socialLinks = config?.socialLinks || [];
    const customLinks = config?.customLinks || config?.links || [];
    const theme = config?.theme || { backgroundColor: '#ffffff', buttonColor: '#000000', textColor: '#000000', buttonStyle: 'rounded' };
    
    return (
        <div className="bg-black p-2.5 rounded-[2.5rem] shadow-2xl border-[6px] border-gray-800 w-[300px] h-[600px] relative overflow-hidden flex-shrink-0">
             <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-black rounded-b-lg z-20"></div>
             <div 
                className="w-full h-full bg-white overflow-y-auto rounded-[2rem] scrollbar-hide"
                style={{ backgroundColor: theme.backgroundColor }}
             >
                 <div className="p-4 flex flex-col items-center min-h-full text-center pt-8">
                     <img 
                        src={config?.avatar || 'https://via.placeholder.com/100'} 
                        alt="Profile" 
                        className="w-20 h-20 rounded-full object-cover border-2 border-white shadow-md mb-3"
                    />
                    <div className="mb-1">
                        <h3 className="text-xl font-bold inline" style={{ color: theme.textColor }}>
                            {config?.displayName || 'Display Name'}
                            {config?.verified && <span className="ml-1">✓</span>}
                        </h3>
                    </div>
                    {config?.username && (
                        <p className="text-sm mb-1 opacity-80" style={{ color: theme.textColor }}>
                            @{String(config.username).replace('@', '')}
                        </p>
                    )}
                    {config?.totalFollowers && config.totalFollowers > 0 && (
                        <p className="text-xs mb-3 opacity-70" style={{ color: theme.textColor }}>
                            {formatFollowerCount(config.totalFollowers)} Total Followers
                        </p>
                    )}
                    <p className="text-sm mb-6 px-4 opacity-90" style={{ color: theme.textColor }}>{config?.bio || 'Bio description'}</p>

                    {/* Teaser Images */}
                    {config?.teaserImages && config.teaserImages.length > 0 && (
                        <div className="w-full mb-6 px-4">
                            <div className="grid grid-cols-2 gap-2">
                                {config.teaserImages.map((imageUrl, index) => (
                                    <img
                                        key={index}
                                        src={imageUrl}
                                        alt={`Teaser ${index + 1}`}
                                        className="w-full h-32 object-cover rounded-lg"
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="w-full space-y-3">
                        {/* Social Links */}
                        {socialLinks.filter((l: SocialBioLink) => l?.isActive).map((link: SocialBioLink) => (
                            <a 
                                key={link.id}
                                href="#"
                                onClick={(e) => e.preventDefault()}
                                className={`flex items-center justify-center gap-2 w-full py-3 px-4 text-center font-medium transition-transform active:scale-95 ${theme.buttonStyle === 'rounded' ? 'rounded-lg' : theme.buttonStyle === 'pill' ? 'rounded-full' : 'rounded-none'}`}
                                style={{ 
                                    backgroundColor: theme.buttonColor, 
                                    color: theme.backgroundColor === '#ffffff' && theme.buttonColor === '#ffffff' ? '#000000' : theme.backgroundColor 
                                }}
                            >
                                <span className="flex-shrink-0">{platformIcons[link.platform] || <span>{link.platform}</span>}</span>
                                <span>{link.platform}</span>
                            </a>
                        ))}
                        
                        {/* Custom Links */}
                        {customLinks.filter((l: BioLink) => l?.isActive).map((link: BioLink) => (
                            <a 
                                key={link.id}
                                href="#"
                                onClick={(e) => e.preventDefault()}
                                className={`block w-full py-3 px-4 text-center font-medium transition-transform active:scale-95 ${theme.buttonStyle === 'rounded' ? 'rounded-lg' : theme.buttonStyle === 'pill' ? 'rounded-full' : 'rounded-none'}`}
                                style={{ 
                                    backgroundColor: theme.buttonColor, 
                                    color: theme.backgroundColor === '#ffffff' && theme.buttonColor === '#ffffff' ? '#000000' : theme.backgroundColor 
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
                        <p className="text-[10px] font-bold opacity-50" style={{ color: theme.textColor }}>POWERED BY ENGAGESUITE.AI</p>
                    </div>
                 </div>
             </div>
        </div>
    );
};

export const BioPageBuilder: React.FC = () => {
    const { bioPage, setBioPage, showToast, saveBioPage, user, socialAccounts } = useAppContext();
    const [newLinkTitle, setNewLinkTitle] = useState('');
    const [newLinkUrl, setNewLinkUrl] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const teaserImagesInputRef = useRef<HTMLInputElement>(null);
    
    // Emoji picker state for display name input
    const [isNameEmojiPickerOpen, setIsNameEmojiPickerOpen] = useState(false);
    const [nameEmojiSearchTerm, setNameEmojiSearchTerm] = useState('');
    const [nameActiveEmojiCategory, setNameActiveEmojiCategory] = useState<Emoji['category']>(EMOJI_CATEGORIES[0].name);
    const [namePopoverPositionClass, setNamePopoverPositionClass] = useState('bottom-full mb-2');
    const nameInputRef = useRef<HTMLInputElement>(null);
    const nameEmojiPickerRef = useRef<HTMLDivElement>(null);
    const nameEmojiButtonRef = useRef<HTMLButtonElement>(null);
    
    // Emoji picker state for bio textarea
    const [isBioEmojiPickerOpen, setIsBioEmojiPickerOpen] = useState(false);
    const [bioEmojiSearchTerm, setBioEmojiSearchTerm] = useState('');
    const [bioActiveEmojiCategory, setBioActiveEmojiCategory] = useState<Emoji['category']>(EMOJI_CATEGORIES[0].name);
    const [bioPopoverPositionClass, setBioPopoverPositionClass] = useState('bottom-full mb-2');
    const bioTextareaRef = useRef<HTMLTextAreaElement>(null);
    const bioEmojiPickerRef = useRef<HTMLDivElement>(null);
    const bioEmojiButtonRef = useRef<HTMLButtonElement>(null);
    
    const nameFilteredEmojis = useMemo(() => {
        const lowercasedTerm = nameEmojiSearchTerm.toLowerCase();
        
        if (lowercasedTerm) {
            return EMOJIS.filter(e =>
                e.description.toLowerCase().includes(lowercasedTerm) ||
                e.aliases.some(a => a.includes(lowercasedTerm))
            );
        }
        
        return EMOJIS.filter(e => e.category === nameActiveEmojiCategory);
    }, [nameEmojiSearchTerm, nameActiveEmojiCategory]);
    
    const bioFilteredEmojis = useMemo(() => {
        const lowercasedTerm = bioEmojiSearchTerm.toLowerCase();
        
        if (lowercasedTerm) {
            return EMOJIS.filter(e =>
                e.description.toLowerCase().includes(lowercasedTerm) ||
                e.aliases.some(a => a.includes(lowercasedTerm))
            );
        }
        
        return EMOJIS.filter(e => e.category === bioActiveEmojiCategory);
    }, [bioEmojiSearchTerm, bioActiveEmojiCategory]);
    
    useLayoutEffect(() => {
        if (isNameEmojiPickerOpen && nameInputRef.current) {
            const POPOVER_HEIGHT = 350;
            const rect = nameInputRef.current.getBoundingClientRect();
            const spaceAbove = rect.top;
            
            if (spaceAbove < POPOVER_HEIGHT + 10) {
                setNamePopoverPositionClass('top-full mt-2');
            } else {
                setNamePopoverPositionClass('bottom-full mb-2');
            }
        }
    }, [isNameEmojiPickerOpen]);
    
    useLayoutEffect(() => {
        if (isBioEmojiPickerOpen && bioTextareaRef.current) {
            const POPOVER_HEIGHT = 350;
            const rect = bioTextareaRef.current.getBoundingClientRect();
            const spaceAbove = rect.top;
            
            if (spaceAbove < POPOVER_HEIGHT + 10) {
                setBioPopoverPositionClass('top-full mt-2');
            } else {
                setBioPopoverPositionClass('bottom-full mb-2');
            }
        }
    }, [isBioEmojiPickerOpen]);
    
    const handleNameEmojiSelect = (emoji: string) => {
        if (nameInputRef.current) {
            const { selectionStart, selectionEnd } = nameInputRef.current;
            const currentName = bioPage.displayName || '';
            const newName =
                currentName.substring(0, selectionStart) +
                emoji +
                currentName.substring(selectionEnd);
            setBioPage({ ...bioPage, displayName: newName });
            
            setTimeout(() => {
                if (nameInputRef.current) {
                    nameInputRef.current.focus();
                    const newCursorPosition = selectionStart + emoji.length;
                    nameInputRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
                }
            }, 0);
        }
    };
    
    const handleBioEmojiSelect = (emoji: string) => {
        if (bioTextareaRef.current) {
            const { selectionStart, selectionEnd } = bioTextareaRef.current;
            const currentBio = bioPage.bio || '';
            const newBio =
                currentBio.substring(0, selectionStart) +
                emoji +
                currentBio.substring(selectionEnd);
            setBioPage({ ...bioPage, bio: newBio });
            
            setTimeout(() => {
                if (bioTextareaRef.current) {
                    bioTextareaRef.current.focus();
                    const newCursorPosition = selectionStart + emoji.length;
                    bioTextareaRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
                }
            }, 0);
        }
    };
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                (nameEmojiPickerRef.current && 
                !nameEmojiPickerRef.current.contains(event.target as Node) &&
                nameEmojiButtonRef.current && 
                !nameEmojiButtonRef.current.contains(event.target as Node)) ||
                (bioEmojiPickerRef.current && 
                !bioEmojiPickerRef.current.contains(event.target as Node) &&
                bioEmojiButtonRef.current && 
                !bioEmojiButtonRef.current.contains(event.target as Node))
            ) {
                setIsNameEmojiPickerOpen(false);
                setNameEmojiSearchTerm('');
                setIsBioEmojiPickerOpen(false);
                setBioEmojiSearchTerm('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleAddLink = () => {
        if (!newLinkTitle || !newLinkUrl) return;
        const newLink: BioLink = {
            id: Date.now().toString(),
            title: newLinkTitle,
            url: newLinkUrl,
            isActive: true,
            clicks: 0
        };
        // Add to customLinks (or legacy links if customLinks doesn't exist)
        if (bioPage.customLinks !== undefined) {
            setBioPage({ ...bioPage, customLinks: [...bioPage.customLinks, newLink] });
        } else {
            setBioPage({ ...bioPage, links: [...(bioPage.links || []), newLink] });
        }
        setNewLinkTitle('');
        setNewLinkUrl('');
    };

    const handleRemoveLink = (id: string) => {
        // Support both legacy links and new customLinks structure
        if (bioPage.customLinks) {
            setBioPage({ ...bioPage, customLinks: bioPage.customLinks.filter(l => l.id !== id) });
        } else {
            setBioPage({ ...bioPage, links: (bioPage.links || []).filter(l => l.id !== id) });
        }
    };

    const handleRemoveSocialLink = (id: string) => {
        setBioPage({ ...bioPage, socialLinks: (bioPage.socialLinks || []).filter(l => l.id !== id) });
    };

    const autoPopulateSocialLinks = () => {
        if (!socialAccounts) return;
        
        const newSocialLinks: SocialBioLink[] = [];
        
        Object.entries(socialAccounts).forEach(([platform, account]) => {
            if (account?.connected && account?.accountUsername) {
                const username = account.accountUsername;
                const url = getPlatformUrl(platform as Platform, username);
                
                // Check if this social link already exists
                const existingLinks = bioPage.socialLinks || [];
                if (!existingLinks.find(l => l.platform === platform)) {
                    newSocialLinks.push({
                        id: `social-${platform}-${Date.now()}`,
                        platform: platform as Platform,
                        url,
                        username,
                        isActive: true,
                        clicks: 0,
                        autoGenerated: true,
                    });
                }
            }
        });

        if (newSocialLinks.length > 0) {
            setBioPage({ 
                ...bioPage, 
                socialLinks: [...(bioPage.socialLinks || []), ...newSocialLinks] 
            });
            showToast(`Added ${newSocialLinks.length} social link(s)!`, 'success');
        } else {
            showToast('No new social accounts to add. Connect accounts in Settings.', 'info');
        }
    };

    const calculateTotalFollowers = (): number => {
        if (!socialAccounts) return 0;
        
        let total = 0;
        Object.values(socialAccounts).forEach(account => {
            if (account?.connected && account?.followers) {
                total += account.followers;
            }
        });
        return total;
    };

    // Initialize bioPage with default values if needed
    useEffect(() => {
        if (bioPage && !bioPage.verified && bioPage.verified !== false) {
            setBioPage({ ...bioPage, verified: false });
        }
        if (bioPage && !bioPage.username) {
            setBioPage({ ...bioPage, username: '' });
        }
        if (bioPage && !bioPage.socialLinks) {
            setBioPage({ ...bioPage, socialLinks: [] });
        }
        if (bioPage && !bioPage.customLinks && bioPage.links) {
            // Migrate legacy links to customLinks
            setBioPage({ ...bioPage, customLinks: bioPage.links, links: undefined });
        } else if (bioPage && !bioPage.customLinks) {
            setBioPage({ ...bioPage, customLinks: [] });
        }
    }, []);

    // Calculate and update follower count when social accounts change
    useEffect(() => {
        if (bioPage && socialAccounts) {
            const totalFollowers = calculateTotalFollowers();
            if (bioPage.totalFollowers !== totalFollowers) {
                setBioPage({ ...bioPage, totalFollowers });
            }
        }
    }, [socialAccounts]);

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && user) {
            try {
                // Upload to Firebase Storage
                const timestamp = Date.now();
                const extension = file.type.split('/')[1] || 'jpg';
                const storagePath = `users/${user.id}/bio_avatar/${timestamp}.${extension}`;
                const storageRef = ref(storage, storagePath);
                
                await uploadBytes(storageRef, file, { contentType: file.type });
                const downloadURL = await getDownloadURL(storageRef);
                
                // Update bio page with Firebase URL (persists across sessions)
                const updatedBioPage = { ...bioPage, avatar: downloadURL };
                setBioPage(updatedBioPage);
                
                // Auto-save to Firestore
                await saveBioPage(updatedBioPage);
                showToast('Profile picture uploaded and saved!', 'success');
            } catch (error) {
                console.error('Failed to upload avatar:', error);
                showToast('Failed to upload profile picture', 'error');
            }
        }
    };

    const handleTeaserImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0 && user) {
            try {
                const uploadedUrls: string[] = [];
                
                // Upload all files to Firebase Storage
                for (const file of files) {
                    const timestamp = Date.now();
                    const randomId = Math.random().toString(36).substring(2, 9);
                    const extension = file.type.split('/')[1] || 'jpg';
                    const storagePath = `users/${user.id}/bio_teasers/${timestamp}-${randomId}.${extension}`;
                    const storageRef = ref(storage, storagePath);
                    
                    await uploadBytes(storageRef, file, { contentType: file.type });
                    const downloadURL = await getDownloadURL(storageRef);
                    uploadedUrls.push(downloadURL);
                }
                
                // Update bio page with new teaser images
                const existingImages = bioPage.teaserImages || [];
                const updatedBioPage = { ...bioPage, teaserImages: [...existingImages, ...uploadedUrls] };
                setBioPage(updatedBioPage);
                
                // Auto-save to Firestore
                await saveBioPage(updatedBioPage);
                showToast(`${uploadedUrls.length} teaser image(s) uploaded and saved!`, 'success');
            } catch (error) {
                console.error('Failed to upload teaser images:', error);
                showToast('Failed to upload teaser images', 'error');
            }
        }
    };

    const handleRemoveTeaserImage = async (index: number) => {
        const teaserImages = bioPage.teaserImages || [];
        const updatedImages = teaserImages.filter((_, i) => i !== index);
        const updatedBioPage = { ...bioPage, teaserImages: updatedImages };
        setBioPage(updatedBioPage);
        await saveBioPage(updatedBioPage);
        showToast('Teaser image removed', 'success');
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
        if (!bioPage.username || !bioPage.username.trim()) {
            showToast('Please set a username before publishing', 'error');
            return;
        }
        
        setIsSaving(true);
        try {
            await saveBioPage(bioPage);
            const username = bioPage.username.replace('@', '');
            const bioPageUrl = `${window.location.origin}/${username}`;
            
            // Copy URL to clipboard
            try {
                await navigator.clipboard.writeText(bioPageUrl);
                showToast(`Bio page published! URL copied to clipboard: ${bioPageUrl}`, 'success');
            } catch {
                showToast(`Bio page published! Your URL: ${bioPageUrl}`, 'success');
            }
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
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Link in Bio Builder</h2>
                        {bioPage.username && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                Your bio page: <span className="font-mono text-primary-600 dark:text-primary-400">{window.location.origin}/{bioPage.username.replace('@', '')}</span>
                            </p>
                        )}
                    </div>
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
                            <div className="relative">
                                <input 
                                    ref={nameInputRef}
                                    type="text" 
                                    value={bioPage.displayName || ''} 
                                    onChange={e => setBioPage({ ...bioPage, displayName: e.target.value })}
                                    placeholder="Display Name"
                                    className="w-full p-2 pr-8 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                />
                                <button
                                    ref={nameEmojiButtonRef}
                                    type="button"
                                    onClick={() => setIsNameEmojiPickerOpen(prev => !prev)}
                                    className="absolute right-2 top-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    title="Add emoji"
                                >
                                    <EmojiIcon className="w-5 h-5" />
                                </button>
                                {isNameEmojiPickerOpen && (
                                    <div
                                        ref={nameEmojiPickerRef}
                                        className={`absolute z-10 right-0 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-2 flex flex-col border border-gray-200 dark:border-gray-600 ${namePopoverPositionClass}`}
                                    >
                                        <div className="px-1 pb-2">
                                            <input
                                                type="text"
                                                placeholder="Search emojis..."
                                                value={nameEmojiSearchTerm}
                                                onChange={e => setNameEmojiSearchTerm(e.target.value)}
                                                className="w-full p-2 border rounded-md bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-sm"
                                            />
                                        </div>
                                        <div className="grid grid-cols-8 gap-1 overflow-y-auto max-h-64 pr-1 scrollbar-thin min-h-[200px]">
                                            {nameFilteredEmojis.map(({ emoji, description }) => (
                                                <button
                                                    key={description}
                                                    type="button"
                                                    onClick={() => handleNameEmojiSelect(emoji)}
                                                    className="text-2xl p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 flex justify-center items-center"
                                                    title={description}
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="pt-2 border-t border-gray-200 dark:border-gray-700 grid grid-cols-7 gap-1">
                                            {EMOJI_CATEGORIES.map(({name, icon}) => (
                                                <button 
                                                    key={name}
                                                    onClick={() => { setNameActiveEmojiCategory(name); setNameEmojiSearchTerm(''); }}
                                                    className={`p-1.5 rounded-md ${nameActiveEmojiCategory === name && !nameEmojiSearchTerm ? 'bg-primary-100 dark:bg-primary-900/50' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                                                    title={name}
                                                >
                                                    <span className={nameActiveEmojiCategory === name && !nameEmojiSearchTerm ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}>
                                                        {categoryIcons[icon]}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1 relative">
                                    <input 
                                        type="text" 
                                        value={bioPage.username || ''} 
                                        onChange={e => setBioPage({ ...bioPage, username: e.target.value })}
                                        placeholder="@username"
                                        className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                    />
                                </div>
                                <label className="flex items-center gap-2 px-3 py-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={bioPage.verified || false} 
                                        onChange={e => setBioPage({ ...bioPage, verified: e.target.checked })} 
                                        className="w-4 h-4 text-primary-600 rounded"
                                    />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">Verified</span>
                                </label>
                            </div>
                            {bioPage.totalFollowers !== undefined && bioPage.totalFollowers > 0 && (
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                    {formatFollowerCount(bioPage.totalFollowers)} Total Followers
                                </div>
                            )}
                            <div className="relative">
                                <textarea 
                                    ref={bioTextareaRef}
                                    value={bioPage.bio || ''} 
                                    onChange={e => setBioPage({ ...bioPage, bio: e.target.value })}
                                    placeholder="Bio description"
                                    rows={2}
                                    className="w-full p-2 pr-8 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                />
                                <button
                                    ref={bioEmojiButtonRef}
                                    type="button"
                                    onClick={() => setIsBioEmojiPickerOpen(prev => !prev)}
                                    className="absolute right-2 top-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    title="Add emoji"
                                >
                                    <EmojiIcon className="w-5 h-5" />
                                </button>
                                {isBioEmojiPickerOpen && (
                                    <div
                                        ref={bioEmojiPickerRef}
                                        className={`absolute z-10 right-0 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-2 flex flex-col border border-gray-200 dark:border-gray-600 ${bioPopoverPositionClass}`}
                                    >
                                        <div className="px-1 pb-2">
                                            <input
                                                type="text"
                                                placeholder="Search emojis..."
                                                value={bioEmojiSearchTerm}
                                                onChange={e => setBioEmojiSearchTerm(e.target.value)}
                                                className="w-full p-2 border rounded-md bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-sm"
                                            />
                                        </div>
                                        <div className="grid grid-cols-8 gap-1 overflow-y-auto max-h-64 pr-1 scrollbar-thin">
                                            {bioFilteredEmojis.map(({ emoji, description }) => (
                                                <button
                                                    key={description}
                                                    type="button"
                                                    onClick={() => handleBioEmojiSelect(emoji)}
                                                    className="text-2xl p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 flex justify-center items-center"
                                                    title={description}
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="pt-2 border-t border-gray-200 dark:border-gray-700 grid grid-cols-7 gap-1">
                                            {EMOJI_CATEGORIES.map(({name, icon}) => (
                                                <button 
                                                    key={name}
                                                    onClick={() => { setBioActiveEmojiCategory(name); setBioEmojiSearchTerm(''); }}
                                                    className={`p-1.5 rounded-md ${bioActiveEmojiCategory === name && !bioEmojiSearchTerm ? 'bg-primary-100 dark:bg-primary-900/50' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                                                    title={name}
                                                >
                                                    <span className={bioActiveEmojiCategory === name && !bioEmojiSearchTerm ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}>
                                                        {categoryIcons[icon]}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Teaser Images Section */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Teaser Images</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Upload multiple images to showcase your content</p>
                    
                    {/* Existing Teaser Images */}
                    {(bioPage.teaserImages && bioPage.teaserImages.length > 0) && (
                        <div className="grid grid-cols-3 gap-3 mb-4">
                            {bioPage.teaserImages.map((imageUrl, index) => (
                                <div key={index} className="relative group">
                                    <div className="w-full h-32 bg-gray-100 dark:bg-gray-700 rounded-lg border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden">
                                        <img
                                            src={imageUrl}
                                            alt={`Teaser ${index + 1}`}
                                            className="w-full h-full object-contain rounded-lg"
                                        />
                                    </div>
                                    <button
                                        onClick={() => handleRemoveTeaserImage(index)}
                                        className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                        title="Remove image"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {/* Upload Button */}
                    <button
                        onClick={() => teaserImagesInputRef.current?.click()}
                        className="w-full py-3 px-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 dark:hover:border-primary-500 transition-colors flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                    >
                        <UploadIcon className="w-5 h-5" />
                        <span>Add Teaser Images</span>
                    </button>
                    <input
                        type="file"
                        ref={teaserImagesInputRef}
                        onChange={handleTeaserImagesUpload}
                        className="hidden"
                        accept="image/*"
                        multiple
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">You can upload multiple images at once</p>
                </div>

                {/* Links Section */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Links</h3>
                    
                    {/* Social Links Section */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Social Links</h4>
                            <button 
                                onClick={autoPopulateSocialLinks}
                                className="px-3 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-md hover:bg-primary-100 dark:hover:bg-primary-900/50"
                            >
                                Auto-add from Connected Accounts
                            </button>
                        </div>
                        <div className="space-y-2 mb-4">
                            {(bioPage.socialLinks || []).filter((l: SocialBioLink) => l.isActive).map((link: SocialBioLink) => (
                                <div key={link.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                    <div>{platformIcons[link.platform]}</div>
                                    <div className="flex-1">
                                        <p className="font-semibold text-gray-900 dark:text-white">{link.platform}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{link.url}</p>
                                    </div>
                                    <div className="text-xs font-bold text-gray-500 dark:text-gray-400">{link.clicks} clicks</div>
                                    <button onClick={() => handleRemoveSocialLink(link.id)} className="text-gray-400 hover:text-red-500">
                                        <TrashIcon />
                                    </button>
                                </div>
                            ))}
                            {(!bioPage.socialLinks || bioPage.socialLinks.length === 0) && (
                                <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-2">No social links. Click "Auto-add" to populate from connected accounts.</p>
                            )}
                        </div>
                    </div>

                    {/* Custom Links Section */}
                    <div className="mb-6">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Custom Links</h4>
                        <div className="space-y-2 mb-4">
                            {(bioPage.customLinks || bioPage.links || []).filter((l: BioLink) => l.isActive).map((link: BioLink) => (
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
                            {(!bioPage.customLinks || bioPage.customLinks.length === 0) && (!bioPage.links || bioPage.links.length === 0) && (
                                <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-2">No custom links added yet.</p>
                            )}
                        </div>
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
                            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Background Color</label>
                            <div className="flex gap-2 items-center">
                                <input 
                                    type="color" 
                                    value={bioPage.theme.backgroundColor} 
                                    onChange={e => updateTheme('backgroundColor', e.target.value)} 
                                    className="h-10 w-20 rounded cursor-pointer border border-gray-300 dark:border-gray-600" 
                                />
                                <input
                                    type="text"
                                    value={bioPage.theme.backgroundColor}
                                    onChange={e => updateTheme('backgroundColor', e.target.value)}
                                    placeholder="#ffffff"
                                    className="flex-1 p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white text-sm"
                                />
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
