import React, { useState, useEffect } from 'react';
import { BioPageConfig, SocialBioLink, BioLink } from '../types';
import { MailIcon } from './icons/UIIcons';
import { InstagramIcon, TikTokIcon, ThreadsIcon, XIcon, YouTubeIcon, LinkedInIcon, FacebookIcon, PinterestIcon, DiscordIcon, TelegramIcon, RedditIcon, FanvueIcon, OnlyFansIcon, Platform } from './icons/PlatformIcons';

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
    Discord: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>,
    Telegram: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#0088CC"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>,
    Reddit: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#FF4500"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>,
    Fanvue: <FanvueIcon className="w-5 h-5" />,
    OnlyFans: <OnlyFansIcon className="w-5 h-5" />,
};

export const BioPageView: React.FC = () => {
    // Extract username from URL path (e.g., /username, /u/username, or /link/username for backward compatibility)
    const pathname = window.location.pathname;
    // Try direct username first (e.g., /will), then fallback to /u/username or /link/username
    const directMatch = pathname.match(/^\/([^/]+)$/);
    const legacyMatch = pathname.match(/\/(?:u|link)\/([^/]+)/);
    const username = directMatch ? directMatch[1] : (legacyMatch ? legacyMatch[1] : null);
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
                // Query Firestore for user with matching username
                // Note: We'll need to create an index or query by username
                // For now, we'll fetch by user ID if username matches a pattern
                // Or we can create an API endpoint to fetch by username
                
                // Since we need to query by username, let's use an API endpoint
                const response = await fetch(`/api/getBioPage?username=${encodeURIComponent(username)}`);
                
                if (!response.ok) {
                    if (response.status === 404) {
                        setError('Bio page not found');
                    } else {
                        setError('Failed to load bio page');
                    }
                    setLoading(false);
                    return;
                }

                const data = await response.json();
                setBioPage(data.bioPage);
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
        // Track click if linkId is provided
        if (linkId && username) {
            try {
                await fetch('/api/trackBioLinkClick', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, linkId }),
                });
            } catch (err) {
                console.error('Error tracking click:', err);
            }
        }
        
        // Open link in new tab
        window.open(url, '_blank', 'noopener,noreferrer');
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

    // Ensure socialLinks and customLinks are always arrays
    const socialLinks = Array.isArray(bioPage.socialLinks) ? bioPage.socialLinks : [];
    const customLinks = Array.isArray(bioPage.customLinks) ? (bioPage.customLinks.length > 0 ? bioPage.customLinks : (Array.isArray(bioPage.links) ? bioPage.links : [])) : (Array.isArray(bioPage.links) ? bioPage.links : []);
    const theme = bioPage.theme || { backgroundColor: '#ffffff', buttonColor: '#000000', textColor: '#000000', buttonStyle: 'rounded' };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4" style={{ backgroundColor: theme.backgroundColor }}>
            <div className="w-full max-w-md">
                <div className="bg-white rounded-3xl shadow-2xl overflow-hidden" style={{ backgroundColor: theme.backgroundColor }}>
                    <div className="p-6 flex flex-col items-center text-center pt-8">
                        <img 
                            src={bioPage.avatar || 'https://via.placeholder.com/100'} 
                            alt="Profile" 
                            className="w-20 h-20 rounded-full object-cover border-2 border-white shadow-md mb-3"
                        />
                        <div className="mb-1">
                            <h1 className="text-xl font-bold inline" style={{ color: theme.textColor }}>
                                {bioPage.displayName || 'Display Name'}
                                {bioPage.verified && <span className="ml-1">✓</span>}
                            </h1>
                        </div>
                        {bioPage.username && (
                            <p className="text-sm mb-1 opacity-80" style={{ color: theme.textColor }}>
                                @{String(bioPage.username).replace('@', '')}
                            </p>
                        )}
                        {bioPage.totalFollowers && bioPage.totalFollowers > 0 && (
                            <p className="text-xs mb-3 opacity-70" style={{ color: theme.textColor }}>
                                {formatFollowerCount(bioPage.totalFollowers)} Total Followers
                            </p>
                        )}
                        <p className="text-sm mb-6 px-4 opacity-90" style={{ color: theme.textColor }}>
                            {bioPage.bio || 'Bio description'}
                        </p>

                        {/* Teaser Images */}
                        {bioPage.teaserImages && bioPage.teaserImages.length > 0 && (
                            <div className="w-full mb-6 px-4">
                                <div className="grid grid-cols-2 gap-2">
                                    {bioPage.teaserImages.map((imageUrl, index) => (
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
                                    href={link.url}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleLinkClick(link.url, link.id);
                                    }}
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
                                    href={link.url}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleLinkClick(link.url, link.id);
                                    }}
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

                        {/* Email Capture */}
                        {bioPage.emailCapture?.enabled && (
                            <div className="w-full mt-8 p-4 rounded-xl bg-white shadow-lg border border-gray-100">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 mx-auto mb-2">
                                    <MailIcon className="w-4 h-4" />
                                </div>
                                <h4 className="font-bold text-gray-800 text-sm mb-1">{bioPage.emailCapture.title}</h4>
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
                                            className="w-full p-2 text-xs border border-gray-300 rounded-md mb-2 bg-gray-50"
                                        />
                                        <button 
                                            type="submit"
                                            className="w-full py-2 text-xs font-bold text-white bg-gray-900 rounded-md hover:bg-gray-800"
                                        >
                                            {bioPage.emailCapture.buttonText}
                                        </button>
                                    </form>
                                )}
                            </div>
                        )}

                        <div className="mt-auto pt-8 pb-4">
                            <p className="text-[10px] font-bold opacity-50" style={{ color: theme.textColor }}>POWERED BY ENGAGESUITE.AI</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};