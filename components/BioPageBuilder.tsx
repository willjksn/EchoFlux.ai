
import React, { useState, useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { useAppContext } from './AppContext';
import { BioLink, SocialBioLink, Platform } from '../types';
import { TrashIcon, PlusIcon, UploadIcon, LinkIcon, CheckCircleIcon, MailIcon, CameraIcon, UserIcon, EmojiIcon, FaceSmileIcon, CatIcon, PizzaIcon, SoccerBallIcon, CarIcon, LightbulbIcon, HeartIcon, EditIcon } from './icons/UIIcons';
import { EMOJIS, EMOJI_CATEGORIES, Emoji } from './emojiData';
import { storage } from '../firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { InstagramIcon, TikTokIcon, ThreadsIcon, XIcon, YouTubeIcon, LinkedInIcon, FacebookIcon, PinterestIcon } from './icons/PlatformIcons';

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
    // Normalize socialLinks to always be an array
    let socialLinks: SocialBioLink[] = [];
    if (config?.socialLinks) {
        if (Array.isArray(config.socialLinks)) {
            socialLinks = config.socialLinks;
        } else if (typeof config.socialLinks === 'object' && config.socialLinks !== null) {
            try {
                const values = Object.values(config.socialLinks);
                socialLinks = values.filter((item): item is SocialBioLink => 
                    typeof item === 'object' && item !== null && 'id' in item
                );
            } catch (e) {
                socialLinks = [];
            }
        }
    }
    
    // Normalize customLinks to always be an array
    let customLinks: BioLink[] = [];
    if (config?.customLinks) {
        if (Array.isArray(config.customLinks)) {
            customLinks = config.customLinks;
        } else if (typeof config.customLinks === 'object' && config.customLinks !== null) {
            try {
                const values = Object.values(config.customLinks);
                customLinks = values.filter((item): item is BioLink => 
                    typeof item === 'object' && item !== null && 'id' in item
                );
            } catch (e) {
                customLinks = [];
            }
        }
    } else if (config?.links) {
        if (Array.isArray(config.links)) {
            customLinks = config.links;
        } else if (typeof config.links === 'object' && config.links !== null) {
            try {
                const values = Object.values(config.links);
                customLinks = values.filter((item): item is BioLink => 
                    typeof item === 'object' && item !== null && 'id' in item
                );
            } catch (e) {
                customLinks = [];
            }
        }
    }
    
    const theme = {
        backgroundColor: config?.theme?.backgroundColor || '#ffffff',
        pageBackgroundColor: config?.theme?.pageBackgroundColor || config?.theme?.backgroundColor || '#f5f7fb',
        cardBackgroundColor: config?.theme?.cardBackgroundColor || '#ffffff',
        buttonColor: config?.theme?.buttonColor || '#000000',
        textColor: config?.theme?.textColor || '#000000',
        buttonStyle: config?.theme?.buttonStyle || 'rounded',
    };
    const emailTheme = {
        formBackgroundColor: config?.emailCapture?.formBackgroundColor || '#ffffff',
        titleColor: config?.emailCapture?.titleColor || theme.textColor,
        inputBackgroundColor: config?.emailCapture?.inputBackgroundColor || '#f9fafb',
        inputTextColor: config?.emailCapture?.inputTextColor || '#111827',
        buttonBackgroundColor: config?.emailCapture?.buttonBackgroundColor || theme.buttonColor,
        buttonTextColor: config?.emailCapture?.buttonTextColor || theme.textColor,
    };
    
    return (
        <div className="bg-black p-2.5 rounded-[2.5rem] shadow-2xl border-[6px] border-gray-800 w-[300px] h-[600px] relative overflow-hidden flex-shrink-0" style={{ backgroundColor: theme.pageBackgroundColor }}>
             <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-black rounded-b-lg z-20"></div>
             <div 
                className="w-full h-full bg-white rounded-[2rem] overflow-y-auto"
                style={{ backgroundColor: theme.cardBackgroundColor }}
             >
                 <div className="p-4 flex flex-col items-center text-center pt-8">
                     <img 
                        src={config?.avatar || 'https://via.placeholder.com/100'} 
                        alt="Profile" 
                        className="w-20 h-20 rounded-full object-cover border-2 border-white shadow-md mb-3"
                    />
                    <div className="mb-1">
                        <h3 className="text-xl font-bold inline" style={{ color: theme.textColor }}>
                            {config?.displayName || 'Display Name'}
                        </h3>
                    </div>
                    {config?.username && (
                        <p className="text-sm mb-1 opacity-80" style={{ color: theme.textColor }}>
                            @{String(config.username).replace('@', '')}
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
                                        onError={(e) => {
                                            console.error('Preview: Failed to load teaser image:', imageUrl, e);
                                        }}
                                        onLoad={() => {
                                            console.log('Preview: Teaser image loaded:', imageUrl);
                                        }}
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
                                    color: theme.textColor 
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
                                    color: theme.textColor 
                                }}
                            >
                                {link.title}
                            </a>
                        ))}
                    </div>

                    {/* Email Capture Preview */}
                    {config.emailCapture?.enabled && (
                        <div
                            className="w-full mt-8 p-4 rounded-xl shadow-lg border"
                            style={{
                                backgroundColor: emailTheme.formBackgroundColor,
                                borderColor: 'rgba(0,0,0,0.06)',
                            }}
                        >
                            <div className="flex items-center justify-center w-8 h-8 rounded-full mx-auto mb-2" style={{ backgroundColor: emailTheme.buttonBackgroundColor + '22', color: emailTheme.buttonBackgroundColor }}>
                                <MailIcon className="w-4 h-4" />
                            </div>
                            <h4 className="font-bold text-sm mb-1" style={{ color: emailTheme.titleColor }}>{config.emailCapture.title}</h4>
                            <div className="mt-2">
                                <input 
                                    type="email" 
                                    placeholder={config.emailCapture.placeholder} 
                                    disabled
                                    className="w-full p-2 text-xs border rounded-md mb-2"
                                    style={{
                                        backgroundColor: emailTheme.inputBackgroundColor,
                                        color: emailTheme.inputTextColor,
                                        borderColor: 'rgba(0,0,0,0.08)',
                                    }}
                                />
                                <button 
                                    className="w-full py-2 text-xs font-bold rounded-md"
                                    style={{
                                        backgroundColor: emailTheme.buttonBackgroundColor,
                                        color: emailTheme.buttonTextColor,
                                    }}
                                >
                                    {config.emailCapture.buttonText}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="mt-auto pt-8 pb-4">
                        <p className="text-[10px] font-bold opacity-50" style={{ color: theme.textColor }}>POWERED BY ECHOFLUX.AI</p>
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
    const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
    const [editingSocialLinkId, setEditingSocialLinkId] = useState<string | null>(null);
    const [editLinkTitle, setEditLinkTitle] = useState('');
    const [editLinkUrl, setEditLinkUrl] = useState('');
    const [editSocialLinkUrl, setEditSocialLinkUrl] = useState('');
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
        
        // Check link limit based on plan
        const customLinksCount = (bioPage.customLinks || bioPage.links || []).length;
        const socialLinksCount = (bioPage.socialLinks || []).length;
        const totalLinks = customLinksCount + socialLinksCount;
        
        // Get plan limits
        let linkLimit: number | null = null;
        if (user?.plan === 'Free') linkLimit = 1;
        else if (user?.plan === 'Pro') linkLimit = 5;
        else if (user?.plan === 'Elite' || user?.plan === 'Agency') linkLimit = null; // Unlimited
        
        if (linkLimit !== null && totalLinks >= linkLimit) {
            showToast(`Link limit reached. ${user?.plan === 'Free' ? 'Upgrade to Pro for 5 links or Elite for unlimited.' : 'Upgrade to Elite for unlimited links.'}`, 'error');
            return;
        }
        
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
        
        // Check link limit based on plan
        const customLinksCount = (bioPage.customLinks || bioPage.links || []).length;
        const socialLinksCount = (bioPage.socialLinks || []).length;
        const totalLinks = customLinksCount + socialLinksCount;
        
        // Get plan limits
        let linkLimit: number | null = null;
        if (user?.plan === 'Free') linkLimit = 1;
        else if (user?.plan === 'Pro') linkLimit = 5;
        else if (user?.plan === 'Elite' || user?.plan === 'Agency') linkLimit = null; // Unlimited
        
        const newSocialLinks: SocialBioLink[] = [];
        
        Object.entries(socialAccounts).forEach(([platform, account]) => {
            if (account?.connected && account?.accountUsername) {
                const username = account.accountUsername;
                const url = getPlatformUrl(platform as Platform, username);
                
                // Check if this social link already exists
                const existingLinks = bioPage.socialLinks || [];
                if (!existingLinks.find(l => l.platform === platform)) {
                    // Check limit before adding
                    if (linkLimit === null || (totalLinks + newSocialLinks.length) < linkLimit) {
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
            }
        });

        if (newSocialLinks.length > 0) {
            setBioPage({ 
                ...bioPage, 
                socialLinks: [...(bioPage.socialLinks || []), ...newSocialLinks] 
            });
            showToast(`Added ${newSocialLinks.length} social link(s)!`, 'success');
        } else if (linkLimit !== null && totalLinks >= linkLimit) {
            showToast(`Link limit reached. ${user?.plan === 'Free' ? 'Upgrade to Pro for 5 links or Elite for unlimited.' : 'Upgrade to Elite for unlimited links.'}`, 'error');
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
        e.target.value = '';
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
        console.log('=== handleTeaserImagesUpload START ===');
        console.log('Event:', e);
        console.log('Files:', e.target.files);
        console.log('User:', user?.id);
        console.log('Storage:', storage ? 'available' : 'MISSING');
        
        const fileList = e.target.files;
        
        if (!fileList || fileList.length === 0) {
            console.log('No files selected - aborting');
            e.target.value = '';
            return;
        }
        
        if (!user) {
            console.log('No user found - aborting');
            showToast('Please log in to upload images', 'error');
            e.target.value = '';
            return;
        }
        
        if (!storage) {
            console.error('Firebase Storage is not initialized!');
            showToast('Storage service unavailable. Please refresh the page.', 'error');
            e.target.value = '';
            return;
        }
        
        // Reset input value after getting files (but keep files in memory)
        const filesToUpload: File[] = [];
        for (let i = 0; i < fileList.length; i++) {
            const file = fileList.item(i);
            if (file) {
                filesToUpload.push(file);
            }
        }
        e.target.value = '';
        
        if (filesToUpload.length === 0) {
            console.log('No valid files after extraction');
            showToast('No valid files selected', 'error');
            return;
        }
        
        console.log(`Processing ${filesToUpload.length} file(s):`, filesToUpload.map(f => ({ name: f.name, type: f.type, size: f.size })));
        showToast(`Uploading ${filesToUpload.length} image(s)...`, 'info');
        
        try {
            const uploadedUrls: string[] = [];
            
            // Upload all files to Firebase Storage
            for (let i = 0; i < filesToUpload.length; i++) {
                const file = filesToUpload[i];
                try {
                    const timestamp = Date.now();
                    const randomId = Math.random().toString(36).substring(2, 9);
                    const extension = file.type.split('/')[1] || (file.name.split('.').pop() || 'jpg');
                    const storagePath = `users/${user.id}/bio_teasers/${timestamp}-${randomId}.${extension}`;
                    const storageRef = ref(storage, storagePath);
                    
                    console.log(`[${i + 1}/${filesToUpload.length}] Uploading:`, { name: file.name, path: storagePath });
                    await uploadBytes(storageRef, file, { contentType: file.type });
                    const downloadURL = await getDownloadURL(storageRef);
                    console.log(`[${i + 1}/${filesToUpload.length}] Upload successful:`, downloadURL);
                    uploadedUrls.push(downloadURL);
                } catch (fileError: any) {
                    console.error(`[${i + 1}/${filesToUpload.length}] Upload failed:`, fileError);
                    console.error('File error details:', { message: fileError?.message, code: fileError?.code, stack: fileError?.stack });
                    showToast(`Failed to upload ${file.name}: ${fileError?.message || 'Unknown error'}`, 'error');
                }
            }
            
            if (uploadedUrls.length === 0) {
                console.error('All uploads failed');
                showToast('Failed to upload any images. Check console for details.', 'error');
                return;
            }
            
            console.log(`Successfully uploaded ${uploadedUrls.length}/${filesToUpload.length} files:`, uploadedUrls);
            
            // Update bio page with new teaser images
            // Ensure existingImages is always an array
            let existingImages: string[] = [];
            if (bioPage.teaserImages) {
                if (Array.isArray(bioPage.teaserImages)) {
                    existingImages = bioPage.teaserImages;
                } else {
                    console.warn('teaserImages is not an array, converting:', bioPage.teaserImages);
                    existingImages = [];
                }
            }
            
            const updatedBioPage = { 
                ...bioPage, 
                teaserImages: [...existingImages, ...uploadedUrls] 
            };
            console.log('Updated bio page:', { existingCount: existingImages.length, newCount: uploadedUrls.length, total: updatedBioPage.teaserImages.length });
            setBioPage(updatedBioPage);
            
            // Auto-save to Firestore
            console.log('Saving to Firestore...');
            await saveBioPage(updatedBioPage);
            console.log('=== handleTeaserImagesUpload SUCCESS ===');
            showToast(`${uploadedUrls.length} teaser image(s) uploaded and saved!`, 'success');
        } catch (error: any) {
            console.error('=== handleTeaserImagesUpload ERROR ===');
            console.error('Error:', error);
            console.error('Error details:', { 
                message: error?.message, 
                name: error?.name,
                code: error?.code,
                stack: error?.stack?.split('\n').slice(0, 10) 
            });
            showToast(`Failed to upload teaser images: ${error?.message || 'Unknown error'}`, 'error');
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
            // Normalize username before saving (remove @, lowercase, trim)
            const normalizedUsername = bioPage.username.replace('@', '').toLowerCase().trim();
            const normalizedBioPage = {
                ...bioPage,
                username: normalizedUsername,
            };
            
            await saveBioPage(normalizedBioPage);
            const bioPageUrl = `${window.location.origin}/${normalizedUsername}`;
            
            // Copy URL to clipboard
            try {
                await navigator.clipboard.writeText(bioPageUrl);
                showToast(`Bio page published! URL copied to clipboard: ${bioPageUrl}`, 'success');
            } catch {
                showToast(`Bio page published! Your URL: ${bioPageUrl}`, 'success');
            }
        } catch (e) {
            console.error('Error publishing bio page:', e);
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
                            </div>
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
                                            onError={(e) => {
                                                console.error('Failed to load teaser image:', imageUrl, e);
                                                showToast(`Failed to load image ${index + 1}`, 'error');
                                            }}
                                            onLoad={() => {
                                                console.log('Teaser image loaded successfully:', imageUrl);
                                            }}
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
                        onClick={(e) => {
                            // Reset value on click to allow re-selecting same file
                            (e.target as HTMLInputElement).value = '';
                        }}
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
                        </div>
                        <div className="space-y-2 mb-4">
                            {(bioPage.socialLinks || []).filter((l: SocialBioLink) => l.isActive).map((link: SocialBioLink) => (
                                editingSocialLinkId === link.id ? (
                                    <div key={link.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                        <div>{platformIcons[link.platform]}</div>
                                        <div className="flex-1">
                                            <p className="font-semibold text-gray-900 dark:text-white mb-2">{link.platform}</p>
                                            <input
                                                type="text"
                                                value={editSocialLinkUrl}
                                                onChange={e => setEditSocialLinkUrl(e.target.value)}
                                                placeholder="URL"
                                                className="w-full p-2 border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 dark:text-white text-sm"
                                            />
                                        </div>
                                        <button onClick={handleSaveEditSocialLink} className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700">
                                            Save
                                        </button>
                                        <button onClick={() => { setEditingSocialLinkId(null); setEditSocialLinkUrl(''); }} className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600">
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <div key={link.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                        <div>{platformIcons[link.platform]}</div>
                                        <div className="flex-1">
                                            <p className="font-semibold text-gray-900 dark:text-white">{link.platform}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">{link.url}</p>
                                        </div>
                                        <div className="text-xs font-bold text-gray-500 dark:text-gray-400">{link.clicks} clicks</div>
                                        <button onClick={() => handleEditSocialLink(link)} className="text-gray-400 hover:text-primary-500">
                                            <EditIcon className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleRemoveSocialLink(link.id)} className="text-gray-400 hover:text-red-500">
                                            <TrashIcon />
                                        </button>
                                    </div>
                                )
                            ))}
                            {(!bioPage.socialLinks || bioPage.socialLinks.length === 0) && (
                                <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-2">No social links added yet.</p>
                            )}
                        </div>
                    </div>

                    {/* Custom Links Section */}
                    <div className="mb-6">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Custom Links</h4>
                        <div className="space-y-2 mb-4">
                            {(bioPage.customLinks || bioPage.links || []).filter((l: BioLink) => l.isActive).map((link: BioLink) => (
                                editingLinkId === link.id ? (
                                    <div key={link.id} className="flex flex-col gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                        <input
                                            type="text"
                                            value={editLinkTitle}
                                            onChange={e => setEditLinkTitle(e.target.value)}
                                            placeholder="Link Title"
                                            className="w-full p-2 border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 dark:text-white text-sm"
                                        />
                                        <input
                                            type="text"
                                            value={editLinkUrl}
                                            onChange={e => setEditLinkUrl(e.target.value)}
                                            placeholder="URL"
                                            className="w-full p-2 border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 dark:text-white text-sm"
                                        />
                                        <div className="flex gap-2">
                                            <button onClick={handleSaveEditLink} className="flex-1 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700">
                                                Save
                                            </button>
                                            <button onClick={() => { setEditingLinkId(null); setEditLinkTitle(''); setEditLinkUrl(''); }} className="flex-1 px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600">
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div key={link.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                        <div className="cursor-move text-gray-400">⋮⋮</div>
                                        <div className="flex-1">
                                            <p className="font-semibold text-gray-900 dark:text-white">{link.title}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">{link.url}</p>
                                        </div>
                                        <div className="text-xs font-bold text-gray-500 dark:text-gray-400">{link.clicks} clicks</div>
                                        <button onClick={() => handleEditLink(link)} className="text-gray-400 hover:text-primary-500">
                                            <EditIcon className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleRemoveLink(link.id)} className="text-gray-400 hover:text-red-500">
                                            <TrashIcon />
                                        </button>
                                    </div>
                                )
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

                {/* Appearance Section */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Appearance</h3>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Page Background</label>
                            <input 
                                type="color" 
                                value={bioPage.theme.pageBackgroundColor || bioPage.theme.backgroundColor} 
                                onChange={e => {
                                    updateTheme('pageBackgroundColor', e.target.value);
                                    if (!bioPage.theme.backgroundColor) updateTheme('backgroundColor', e.target.value);
                                }} 
                                className="h-10 w-full rounded cursor-pointer bg-transparent" 
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Card Background</label>
                            <input 
                                type="color" 
                                value={bioPage.theme.cardBackgroundColor || '#ffffff'} 
                                onChange={e => updateTheme('cardBackgroundColor', e.target.value)} 
                                className="h-10 w-full rounded cursor-pointer bg-transparent" 
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Buttons</label>
                            <input type="color" value={bioPage.theme.buttonColor} onChange={e => updateTheme('buttonColor', e.target.value)} className="h-10 w-full rounded cursor-pointer bg-transparent" />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Text</label>
                            <input type="color" value={bioPage.theme.textColor} onChange={e => updateTheme('textColor', e.target.value)} className="h-10 w-full rounded cursor-pointer bg-transparent" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">Button Style</label>
                        <div className="flex gap-2">
                            {(['square', 'rounded', 'pill'] as const).map(style => (
                                <button 
                                    key={style}
                                    onClick={() => updateTheme('buttonStyle', style)}
                                    className={`flex-1 py-2 border-2 text-white dark:text-white ${bioPage.theme.buttonStyle === style ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700'} ${style === 'rounded' ? 'rounded-lg' : style === 'pill' ? 'rounded-full' : 'rounded-none'}`}
                                >
                                    {style.charAt(0).toUpperCase() + style.slice(1)}
                                </button>
                            ))}
                        </div>
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
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Form Background</label>
                                    <input type="color" value={bioPage.emailCapture.formBackgroundColor || '#ffffff'} onChange={e => updateEmailCapture('formBackgroundColor', e.target.value)} className="h-10 w-full rounded cursor-pointer bg-transparent" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Title Color</label>
                                    <input type="color" value={bioPage.emailCapture.titleColor || '#111827'} onChange={e => updateEmailCapture('titleColor', e.target.value)} className="h-10 w-full rounded cursor-pointer bg-transparent" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Input Background</label>
                                    <input type="color" value={bioPage.emailCapture.inputBackgroundColor || '#f9fafb'} onChange={e => updateEmailCapture('inputBackgroundColor', e.target.value)} className="h-10 w-full rounded cursor-pointer bg-transparent" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Input Text</label>
                                    <input type="color" value={bioPage.emailCapture.inputTextColor || '#111827'} onChange={e => updateEmailCapture('inputTextColor', e.target.value)} className="h-10 w-full rounded cursor-pointer bg-transparent" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Button Background</label>
                                    <input type="color" value={bioPage.emailCapture.buttonBackgroundColor || bioPage.theme.buttonColor} onChange={e => updateEmailCapture('buttonBackgroundColor', e.target.value)} className="h-10 w-full rounded cursor-pointer bg-transparent" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Button Text</label>
                                    <input type="color" value={bioPage.emailCapture.buttonTextColor || bioPage.theme.textColor} onChange={e => updateEmailCapture('buttonTextColor', e.target.value)} className="h-10 w-full rounded cursor-pointer bg-transparent" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Preview */}
            <div className="hidden lg:flex items-start justify-center pt-4 px-6 pb-6 bg-gray-100 dark:bg-gray-900 rounded-2xl sticky top-4 self-start">
                 <BioPreview config={bioPage} />
            </div>
        </div>
    );
};
