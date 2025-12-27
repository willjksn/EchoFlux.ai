import React, { useState, useEffect } from 'react';
import { BioPageConfig, SocialBioLink, BioLink } from '../types';
import { MailIcon } from './icons/UIIcons';
import { InstagramIcon, TikTokIcon, ThreadsIcon, XIcon, YouTubeIcon, LinkedInIcon, FacebookIcon, PinterestIcon, Platform } from './icons/PlatformIcons';

const formatFollowerCount = (count: number): string => {
    if (count >= 1000000) {
        return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
        return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
};

// Full-color platform icons with brand colors (same as BioPageBuilder)
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

export const BioPageView: React.FC = () => {
    // Extract username from URL path (e.g., /username, /u/username, or /link/username for backward compatibility)
    const pathname = window.location.pathname;
    // Try direct username first (e.g., /will), then fallback to /u/username or /link/username
    const directMatch = pathname.match(/^\/([^/]+)$/);
    const legacyMatch = pathname.match(/\/(?:u|link)\/([^/]+)/);
    let username = directMatch ? directMatch[1] : (legacyMatch ? legacyMatch[1] : null);
    
    // Normalize username (decode URL encoding, remove @, lowercase, trim) to match how it's stored
    if (username) {
        try {
            username = decodeURIComponent(username).replace('@', '').toLowerCase().trim();
        } catch (e) {
            // If decode fails, just normalize without decoding
            username = username.replace('@', '').toLowerCase().trim();
        }
    }
    const [bioPage, setBioPage] = useState<BioPageConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [emailSubmitted, setEmailSubmitted] = useState(false);

    useEffect(() => {
        const fetchBioPage = async () => {
            if (!username) {
                setError('Username is required');
                setLoading(false);
                return;
            }

            try {
                console.log('Fetching bio page for username:', username);
                // Query Firestore for user with matching username
                // Since we need to query by username, let's use an API endpoint
                // The username is already normalized, so we can use it directly
                const response = await fetch(`/api/getBioPage?username=${encodeURIComponent(username)}`);
                
                console.log('Bio page API response status:', response.status);
                
                if (!response.ok) {
                    if (response.status === 404) {
                        setError(`Bio page not found for username: ${username}`);
                        console.error('Bio page not found. Username searched:', username);
                    } else {
                        const errorData = await response.json().catch(() => ({}));
                        setError(`Failed to load bio page: ${errorData.error || response.statusText}`);
                        console.error('Failed to load bio page:', response.status, errorData);
                    }
                    setLoading(false);
                    return;
                }

                const data = await response.json();
                console.log('Bio page data received:', data);
                
                if (!data || !data.bioPage) {
                    setError('Invalid bio page data received');
                    setLoading(false);
                    return;
                }
                
                // Double-check that socialLinks and customLinks are arrays
                // Normalize socialLinks
                let normalizedSocialLinks: any[] = [];
                if (data.bioPage.socialLinks) {
                    if (Array.isArray(data.bioPage.socialLinks)) {
                        normalizedSocialLinks = data.bioPage.socialLinks;
                    } else if (typeof data.bioPage.socialLinks === 'object' && data.bioPage.socialLinks !== null) {
                        try {
                            normalizedSocialLinks = Object.values(data.bioPage.socialLinks).filter((item: any) => 
                                item && typeof item === 'object'
                            );
                        } catch (e) {
                            normalizedSocialLinks = [];
                        }
                    }
                }
                
                // Normalize customLinks
                let normalizedCustomLinks: any[] = [];
                if (data.bioPage.customLinks) {
                    if (Array.isArray(data.bioPage.customLinks)) {
                        normalizedCustomLinks = data.bioPage.customLinks;
                    } else if (typeof data.bioPage.customLinks === 'object' && data.bioPage.customLinks !== null) {
                        try {
                            normalizedCustomLinks = Object.values(data.bioPage.customLinks).filter((item: any) => 
                                item && typeof item === 'object'
                            );
                        } catch (e) {
                            normalizedCustomLinks = [];
                        }
                    }
                } else if (data.bioPage.links) {
                    if (Array.isArray(data.bioPage.links)) {
                        normalizedCustomLinks = data.bioPage.links;
                    } else if (typeof data.bioPage.links === 'object' && data.bioPage.links !== null) {
                        try {
                            normalizedCustomLinks = Object.values(data.bioPage.links).filter((item: any) => 
                                item && typeof item === 'object'
                            );
                        } catch (e) {
                            normalizedCustomLinks = [];
                        }
                    }
                }
                
                const bioPageData = {
                    ...data.bioPage,
                    socialLinks: normalizedSocialLinks,
                    customLinks: normalizedCustomLinks,
                };
                
                setBioPage(bioPageData);
            } catch (err) {
                console.error('Error fetching bio page:', err);
                setError('Failed to load bio page');
            } finally {
                setLoading(false);
            }
        };

        fetchBioPage();
    }, [username]);

    const handleEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !bioPage) return;

        try {
            const response = await fetch('/api/captureEmail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    email,
                    bioPageId: username,
                }),
            });

            if (response.ok) {
                setEmailSubmitted(true);
                setEmail('');
            }
        } catch (err) {
            console.error('Error submitting email:', err);
        }
    };

    const handleLinkClick = async (url: string, linkId?: string) => {
        // Track click if linkId is provided (don't wait for it to complete)
        if (linkId && username) {
            fetch('/api/trackBioLinkClick', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, linkId }),
            }).catch(err => {
                console.error('Error tracking click:', err);
            });
        }
        
        // Open link in new tab immediately
        // Ensure URL is valid - if it doesn't start with http:// or https://, add https://
        let finalUrl = url.trim();
        if (!finalUrl.match(/^https?:\/\//i)) {
            finalUrl = 'https://' + finalUrl;
        }
        window.open(finalUrl, '_blank', 'noopener,noreferrer');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Loading...</p>
                </div>
            </div>
        );
    }

    if (error || !bioPage) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Bio Page Not Found</h1>
                    <p className="text-gray-600 dark:text-gray-400">{error || 'The bio page you are looking for does not exist.'}</p>
                </div>
            </div>
        );
    }

    // Ensure socialLinks and customLinks are always arrays - be very defensive
    // First, ensure bioPage exists and has the expected structure
    if (!bioPage || typeof bioPage !== 'object') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Invalid Bio Page</h1>
                    <p className="text-gray-600 dark:text-gray-400">The bio page data is invalid.</p>
                </div>
            </div>
        );
    }

    let socialLinks: SocialBioLink[] = [];
    try {
        if (bioPage.socialLinks) {
            if (Array.isArray(bioPage.socialLinks)) {
                socialLinks = bioPage.socialLinks.filter((item: any): item is SocialBioLink => 
                    item && typeof item === 'object' && item !== null
                );
            } else if (typeof bioPage.socialLinks === 'object' && bioPage.socialLinks !== null) {
                // If it's an object, try to convert to array
                const values = Object.values(bioPage.socialLinks);
                socialLinks = values.filter((item): item is SocialBioLink => 
                    typeof item === 'object' && item !== null && 'id' in item
                );
            }
        }
    } catch (e) {
        console.error('Error normalizing socialLinks:', e);
        socialLinks = [];
    }
    
    // Final safety check - ensure it's an array
    if (!Array.isArray(socialLinks)) {
        console.warn('socialLinks is not an array, forcing to array:', socialLinks);
        socialLinks = [];
    }
    
    let customLinks: BioLink[] = [];
    try {
        if (bioPage.customLinks) {
            if (Array.isArray(bioPage.customLinks)) {
                customLinks = bioPage.customLinks.filter((item: any): item is BioLink => 
                    item && typeof item === 'object' && item !== null
                );
            } else if (typeof bioPage.customLinks === 'object' && bioPage.customLinks !== null) {
                const values = Object.values(bioPage.customLinks);
                customLinks = values.filter((item): item is BioLink => 
                    typeof item === 'object' && item !== null && 'id' in item
                );
            }
        } else if (bioPage.links) {
            if (Array.isArray(bioPage.links)) {
                customLinks = bioPage.links.filter((item: any): item is BioLink => 
                    item && typeof item === 'object' && item !== null
                );
            } else if (typeof bioPage.links === 'object' && bioPage.links !== null) {
                const values = Object.values(bioPage.links);
                customLinks = values.filter((item): item is BioLink => 
                    typeof item === 'object' && item !== null && 'id' in item
                );
            }
        }
    } catch (e) {
        console.error('Error normalizing customLinks:', e);
        customLinks = [];
    }
    
    // Final safety check - ensure it's an array
    if (!Array.isArray(customLinks)) {
        console.warn('customLinks is not an array, forcing to array:', customLinks);
        customLinks = [];
    }
    const theme = {
        backgroundColor: bioPage.theme?.backgroundColor || '#ffffff',
        pageBackgroundColor: bioPage.theme?.pageBackgroundColor || bioPage.theme?.backgroundColor || '#f5f7fb',
        cardBackgroundColor: bioPage.theme?.cardBackgroundColor || '#ffffff',
        buttonColor: bioPage.theme?.buttonColor || '#000000',
        // Legacy field - treat as button text if newer fields aren't present
        textColor: bioPage.theme?.textColor || '#ffffff',
        pageTextColor: bioPage.theme?.pageTextColor,
        buttonTextColor: bioPage.theme?.buttonTextColor,
        buttonStyle: bioPage.theme?.buttonStyle || 'rounded',
    };
    const pageTextColor = theme.pageTextColor || (theme.textColor === '#ffffff' ? '#2563eb' : theme.textColor) || '#2563eb';
    const buttonTextColor = theme.buttonTextColor || theme.textColor || '#ffffff';
    const emailTheme = {
        formBackgroundColor: bioPage.emailCapture?.formBackgroundColor || '#ffffff',
        titleColor: bioPage.emailCapture?.titleColor || pageTextColor,
        inputBackgroundColor: bioPage.emailCapture?.inputBackgroundColor || '#f9fafb',
        inputTextColor: bioPage.emailCapture?.inputTextColor || '#111827',
        buttonBackgroundColor: bioPage.emailCapture?.buttonBackgroundColor || theme.buttonColor,
        buttonTextColor: bioPage.emailCapture?.buttonTextColor || buttonTextColor,
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4" style={{ backgroundColor: theme.pageBackgroundColor }}>
            <div className="w-full max-w-md">
                <div className="bg-white rounded-3xl shadow-2xl overflow-hidden" style={{ backgroundColor: theme.cardBackgroundColor }}>
                    <div className="p-6 flex flex-col items-center text-center pt-8">
                        <img 
                            src={bioPage.avatar || 'https://via.placeholder.com/100'} 
                            alt="Profile" 
                            className="w-20 h-20 rounded-full object-cover border-2 border-white shadow-md mb-3"
                        />
                        <div className="mb-1">
                            <h1 className="text-xl font-bold inline" style={{ color: pageTextColor }}>
                                {bioPage.displayName || 'Display Name'}
                            </h1>
                        </div>
                        {bioPage.username && (
                            <p className="text-sm mb-1 opacity-80" style={{ color: pageTextColor }}>
                                @{String(bioPage.username).replace('@', '')}
                            </p>
                        )}
                        <p className="text-sm mb-6 px-4 opacity-90" style={{ color: pageTextColor }}>
                            {bioPage.bio || 'Bio description'}
                        </p>

                        {/* Teaser Images */}
                        {bioPage.teaserImages && bioPage.teaserImages.length > 0 && (
                            <div className="w-full mb-6 px-4">
                                <div className="grid grid-cols-2 gap-2">
                                    {bioPage.teaserImages.map((imageUrl, index) => (
                                        <div key={index} className="h-32 bg-gray-100 dark:bg-gray-700 rounded-lg border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden" style={{ width: 'auto', minWidth: 0 }}>
                                            <img
                                                src={imageUrl}
                                                alt={`Teaser ${index + 1}`}
                                                className="h-full w-auto max-w-full object-contain rounded-lg"
                                                style={{ maxHeight: '100%' }}
                                                onError={(e) => {
                                                    console.error('Public view: Failed to load teaser image:', imageUrl, e);
                                                }}
                                                onLoad={(e) => {
                                                    console.log('Public view: Teaser image loaded:', imageUrl);
                                                    // Adjust container width to match image width
                                                    const img = e.target as HTMLImageElement;
                                                    const container = img.parentElement;
                                                    if (container && img.naturalWidth > 0) {
                                                        const aspectRatio = img.naturalWidth / img.naturalHeight;
                                                        const displayHeight = 128; // h-32 = 128px
                                                        const displayWidth = displayHeight * aspectRatio;
                                                        container.style.width = `${Math.min(displayWidth, container.parentElement?.clientWidth || displayWidth)}px`;
                                                    }
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="w-full space-y-3">
                            {/* Social Links */}
                            {Array.isArray(socialLinks) && socialLinks.filter((l: SocialBioLink) => l?.isActive).map((link: SocialBioLink) => {
                                // Ensure URL is valid
                                let linkUrl = link.url?.trim() || '';
                                if (linkUrl && !linkUrl.match(/^https?:\/\//i)) {
                                    linkUrl = 'https://' + linkUrl;
                                }
                                
                                return (
                                    <a 
                                        key={link.id}
                                        href={linkUrl}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            handleLinkClick(linkUrl, link.id);
                                        }}
                                        className={`flex items-center justify-center gap-2 w-full py-3 px-4 text-center font-medium transition-transform active:scale-95 ${theme.buttonStyle === 'rounded' ? 'rounded-lg' : theme.buttonStyle === 'pill' ? 'rounded-full' : 'rounded-none'}`}
                                        style={{ 
                                            backgroundColor: theme.buttonColor, 
                                            color: buttonTextColor
                                        }}
                                    >
                                        <span className="flex-shrink-0">{platformIcons[link.platform] || <span>{link.platform}</span>}</span>
                                        <span>{link.platform}</span>
                                    </a>
                                );
                            })}
                            
                            {/* Custom Links */}
                            {customLinks.filter((l: BioLink) => l?.isActive).map((link: BioLink) => {
                                // Ensure URL is valid
                                let linkUrl = link.url?.trim() || '';
                                if (linkUrl && !linkUrl.match(/^https?:\/\//i)) {
                                    linkUrl = 'https://' + linkUrl;
                                }
                                
                                return (
                                    <a 
                                        key={link.id}
                                        href={linkUrl}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            handleLinkClick(linkUrl, link.id);
                                        }}
                                        className={`block w-full py-3 px-4 text-center font-medium transition-transform active:scale-95 ${theme.buttonStyle === 'rounded' ? 'rounded-lg' : theme.buttonStyle === 'pill' ? 'rounded-full' : 'rounded-none'}`}
                                        style={{ 
                                            backgroundColor: theme.buttonColor, 
                                            color: buttonTextColor
                                        }}
                                    >
                                        {link.title}
                                    </a>
                                );
                            })}
                        </div>

                        {/* Email Capture */}
                        {bioPage.emailCapture?.enabled && (
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
                                <h4 className="font-bold text-sm mb-1" style={{ color: emailTheme.titleColor }}>{bioPage.emailCapture.title}</h4>
                                {emailSubmitted ? (
                                    <p className="text-sm text-green-600 mt-2">{bioPage.emailCapture.successMessage || 'Thank you for subscribing!'}</p>
                                ) : (
                                    <form onSubmit={handleEmailSubmit} className="mt-2">
                                        <input 
                                            type="email" 
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder={bioPage.emailCapture.placeholder} 
                                            required
                                            className="w-full p-2 text-xs border rounded-md mb-2"
                                            style={{
                                                backgroundColor: emailTheme.inputBackgroundColor,
                                                color: emailTheme.inputTextColor,
                                                borderColor: 'rgba(0,0,0,0.08)',
                                            }}
                                        />
                                        <button 
                                            type="submit"
                                            className="w-full py-2 text-xs font-bold rounded-md hover:opacity-90"
                                            style={{
                                                backgroundColor: emailTheme.buttonBackgroundColor,
                                                color: emailTheme.buttonTextColor,
                                            }}
                                        >
                                            {bioPage.emailCapture.buttonText}
                                        </button>
                                    </form>
                                )}
                            </div>
                        )}

                        <div className="mt-auto pt-8 pb-4">
                            <p className="text-[10px] font-bold opacity-50" style={{ color: pageTextColor }}>POWERED BY ECHOFLUX.AI</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};