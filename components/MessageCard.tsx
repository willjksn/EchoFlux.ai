
import React, { useState, useEffect, useRef, useMemo, useLayoutEffect, useCallback } from 'react';
import { Message, Settings, TeamMember } from '../types';
import { generateReply } from "../src/services/geminiService"
import { InstagramIcon, TikTokIcon, XIcon, ThreadsIcon, YouTubeIcon, LinkedInIcon, FacebookIcon, PinterestIcon } from './icons/PlatformIcons';
import { EditIcon, RedoIcon, CheckCircleIcon, VoiceIcon, FlagIcon, UserIcon, EmojiIcon, FaceSmileIcon, CatIcon, PizzaIcon, SoccerBallIcon, CarIcon, LightbulbIcon, HeartIcon, StarIcon, TrashIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { EMOJIS, EMOJI_CATEGORIES, Emoji } from './emojiData';

const platformIcons: { [key in Message['platform']]: React.ReactElement<{ className?: string }> } = {
  Instagram: <InstagramIcon />,
  TikTok: <TikTokIcon />,
  X: <XIcon />,
  Threads: <ThreadsIcon />,
  YouTube: <YouTubeIcon />,
  LinkedIn: <LinkedInIcon />,
  Facebook: <FacebookIcon />,
  Pinterest: <PinterestIcon />,
};

const categoryIcons: Record<string, React.ReactNode> = {
    FaceSmileIcon: <FaceSmileIcon className="w-5 h-5"/>,
    CatIcon: <CatIcon className="w-5 h-5"/>,
    PizzaIcon: <PizzaIcon className="w-5 h-5"/>,
    SoccerBallIcon: <SoccerBallIcon className="w-5 h-5"/>,
    CarIcon: <CarIcon className="w-5 h-5"/>,
    LightbulbIcon: <LightbulbIcon className="w-5 h-5"/>,
    HeartIcon: <HeartIcon className="w-5 h-5"/>,
};

interface MessageCardProps {
    message: Message;
    id?: string;
    isSelected: boolean;
    onSelect: (id: string, isSelected: boolean) => void;
    onToggleFlag: (id: string) => void;
    onToggleFavorite: (id: string) => void;
    onDelete: (id: string) => void;
}

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const isSpeechRecognitionSupported = !!SpeechRecognition;

export const MessageCard: React.FC<MessageCardProps> = ({ message, id, isSelected, onSelect, onToggleFlag, onToggleFavorite, onDelete }) => {
  const { settings, teamMembers, showToast, openCRM, ensureCRMProfile, user } = useAppContext();
  const [reply, setReply] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [isViewed, setIsViewed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignedTo, setAssignedTo] = useState<string | undefined>(message.assigneeId);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [emojiSearchTerm, setEmojiSearchTerm] = useState('');
  const [activeEmojiCategory, setActiveEmojiCategory] = useState<Emoji['category']>(EMOJI_CATEGORIES[0].name);
  const [popoverPositionClass, setPopoverPositionClass] = useState('bottom-full mb-2');
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (isEmojiPickerOpen && textareaRef.current) {
        const POPOVER_HEIGHT = 350; // Approximate height of the picker in pixels
        const rect = textareaRef.current.getBoundingClientRect();
        const spaceAbove = rect.top;

        if (spaceAbove < POPOVER_HEIGHT + 10) {
            // Not enough space above, open downwards
            setPopoverPositionClass('top-full mt-2');
        } else {
            // Default to opening upwards
            setPopoverPositionClass('bottom-full mb-2');
        }
    }
  }, [isEmojiPickerOpen]);

  const handleEmojiSelect = (emoji: string) => {
    if (textareaRef.current) {
      const { selectionStart, selectionEnd } = textareaRef.current;
      const newReply =
        reply.substring(0, selectionStart) +
        emoji +
        reply.substring(selectionEnd);
      setReply(newReply);
      setIsEditing(true);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newCursorPosition = selectionStart + emoji.length;
          textareaRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
        }
      }, 0);
    }
  };
  
  const filteredEmojis = useMemo(() => {
    const lowercasedTerm = emojiSearchTerm.toLowerCase();
    
    if (lowercasedTerm) {
        return EMOJIS.filter(e =>
            e.description.toLowerCase().includes(lowercasedTerm) ||
            e.aliases.some(a => a.includes(lowercasedTerm))
        );
    }
    
    return EMOJIS.filter(e => e.category === activeEmojiCategory);
  }, [emojiSearchTerm, activeEmojiCategory]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emojiPickerRef.current && 
        !emojiPickerRef.current.contains(event.target as Node) &&
        emojiButtonRef.current && 
        !emojiButtonRef.current.contains(event.target as Node)
      ) {
        setIsEmojiPickerOpen(false);
        setEmojiSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleGenerateReply = useCallback(async () => {
    // Only generate reply if auto-respond toggle is enabled
    if (!settings.autoRespond) {
      setError(null);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setReply('');
    try {
      const aiReply = await generateReply(message.content, message.type, message.platform, settings);
      setReply(aiReply);
      setIsEditing(false);
      if (settings.autoRespond) {
        setIsSent(true);
        showToast(`Auto-responded to ${message.user.name}`, 'success');
      }
    } catch (err: any) {
      // Only show error if auto-respond is enabled
      if (settings.autoReply || settings.autoRespond) {
        const errorMessage = err?.note || err?.message || 'Failed to generate reply. Please check your API key and try again.';
        setError(errorMessage);
      }
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [message.content, message.type, message.platform, settings, message.user.name, showToast]);
  
  useEffect(() => {
    // Clear error if auto-respond is disabled
    if (!settings.autoRespond) {
      setError(null);
      return;
    }
    
    // Only auto-generate reply if auto-respond toggle is enabled
    if (settings.autoRespond && !isSent) {
        handleGenerateReply();
    }
  }, [message.id, settings.autoRespond, isSent, handleGenerateReply]);

  useEffect(() => {
    if (!isSpeechRecognitionSupported) {
        console.warn("Speech recognition is not supported by this browser.");
        return;
    };

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setReply(prev => (prev ? prev + ' ' : '') + transcript);
        setIsEditing(true); // Ensure textarea is editable
        setIsListening(false);
    };

    recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        showToast(`Speech recognition error: ${event.error}`, 'error');
        setIsListening(false);
    };

    recognition.onend = () => {
        setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, [showToast]);

  const handleMicClick = () => {
    if (!isSpeechRecognitionSupported || !recognitionRef.current) return;
    
    if (isListening) {
        recognitionRef.current.stop();
    } else {
        startEditing(); // Ensure textarea is editable
        recognitionRef.current.start();
        setIsListening(true);
    }
  };


  const handleAssignmentChange = async (newAssigneeId: string | undefined) => {
    setAssignedTo(newAssigneeId);
    console.log(`Simulating assignment of message ${message.id} to ${newAssigneeId}`);
  };

  const handleSend = () => {
      if (reply.trim()) setIsSent(true);
  };

  const startEditing = () => {
    if (reply) setIsEditing(true);
  }

  const assignedMember = useMemo(() => teamMembers.find(m => m.id === assignedTo), [assignedTo, teamMembers]);

  // Mark as viewed when card is clicked/interacted with
  const handleCardInteraction = () => {
    if (!isViewed) {
      setIsViewed(true);
    }
  };

  // Messages stay visible until viewed - auto-replied messages remain until user views them
  // Only hide if explicitly deleted or archived, not just because they were auto-replied

  return (
    <div 
      id={id} 
      onClick={handleCardInteraction}
      className={`bg-white dark:bg-gray-800 rounded-xl shadow-md transition-all duration-300 ${isSent ? 'opacity-50 grayscale' : ''} ${message.isFlagged ? 'ring-2 ring-red-400' : ''} ${isSelected ? 'ring-2 ring-primary-500' : ''}`}
    >
      <div className="p-6">
        <div className="flex items-start space-x-4">
          <input 
            type="checkbox" 
            checked={isSelected} 
            onChange={(e) => {
              e.stopPropagation(); // Prevent card click when clicking checkbox
              onSelect(message.id, e.target.checked);
            }} 
            onClick={(e) => e.stopPropagation()} // Prevent card click when clicking checkbox
            className="mt-1 h-5 w-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500 cursor-pointer z-10" 
          />
          
          {/* User Avatar & Name Trigger CRM */}
          <div 
            onClick={async (e) => {
              e.stopPropagation();
              try {
                await ensureCRMProfile(message.user);
                openCRM(message.user);
              } catch (error) {
                console.error('Error ensuring CRM profile:', error);
                // Still open CRM even if ensure fails
                openCRM(message.user);
              }
            }}
            className="flex items-start space-x-4 cursor-pointer hover:opacity-80 transition-opacity flex-1"
            title="View User CRM Profile"
          >
            <div className="relative flex-shrink-0">
                <img className="h-10 w-10 rounded-full" src={message.user.avatar} alt={message.user.name} />
                <span className="absolute -bottom-1 -right-1 bg-white dark:bg-gray-800 p-0.5 rounded-full text-gray-600 dark:text-gray-300 shadow">
                    {React.cloneElement(platformIcons[message.platform], { className: "w-4 h-4" })}
                </span>
            </div>
            <div className="flex-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center space-x-2">
                    <span className="font-bold text-gray-900 dark:text-white hover:underline">{message.user.name}</span>
                    <span className="text-gray-500 dark:text-gray-400 text-sm">&middot; {message.timestamp}</span>
                </div>
                <div className="text-gray-500 dark:text-gray-400">
                    <span className="text-sm font-medium capitalize">{message.platform} &middot; {message.type}</span>
                </div>
                </div>
                <p className="mt-2 text-gray-700 dark:text-gray-300">{message.content}</p>
            </div>
          </div>

          <div className="flex flex-col gap-1 items-center">
            <button onClick={() => onToggleFavorite(message.id)} title="Favorite" className={`p-1.5 rounded-full transition-colors ${message.isFavorite ? 'text-yellow-400 bg-yellow-100 dark:bg-yellow-900/50' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                <StarIcon />
            </button>
            <button onClick={() => onToggleFlag(message.id)} title="Flag" className={`p-1.5 rounded-full transition-colors ${message.isFlagged ? 'text-red-500 bg-red-100 dark:bg-red-900/50' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
              <FlagIcon />
            </button>
            <button onClick={() => onDelete(message.id)} title="Delete" className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-red-500 transition-colors">
              <TrashIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (settings.autoReply || settings.autoRespond) && (
          <p className="mt-4 text-sm text-red-500">{error}</p>
        )}
        {!settings.autoReply && !settings.autoRespond && !isSent && (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Auto-respond is disabled. Enable it in settings to automatically generate replies.
          </p>
        )}
        
        {!isSent ? (
            <div className="mt-4 pl-14">
              <div className="relative">
                <textarea
                    ref={textareaRef}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={isLoading ? "EchoFlux.ai is thinking..." : "Write a reply, or click the mic to use your voice..."}
                    className={`w-full p-3 pr-24 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-primary-500 focus:border-primary-500 transition-colors ${!isEditing && reply ? 'text-gray-800 dark:text-gray-200 font-medium' : ''}`}
                    rows={3}
                    readOnly={!isEditing && !!reply}
                    onClick={startEditing}
                />
                 <div className="absolute top-2 right-2 flex items-center space-x-1">
                    {isSpeechRecognitionSupported && (
                        <button 
                            type="button" 
                            onClick={handleMicClick}
                            className={`p-1 rounded-full transition-colors ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                            aria-label="Use microphone"
                        >
                            <VoiceIcon className="w-5 h-5" />
                        </button>
                    )}
                    <button 
                        ref={emojiButtonRef}
                        type="button" 
                        onClick={() => setIsEmojiPickerOpen(prev => !prev)}
                        className="p-1 text-gray-500 rounded-full hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                        aria-label="Add emoji"
                    >
                        <EmojiIcon className="w-5 h-5" />
                    </button>
                </div>
                {isEmojiPickerOpen && (
                    <div 
                        ref={emojiPickerRef} 
                        className={`absolute z-10 right-0 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-2 flex flex-col border border-gray-200 dark:border-gray-600 ${popoverPositionClass}`}
                    >
                        <div className="px-1 pb-2">
                           <input
                            type="text"
                            placeholder="Search emojis..."
                            value={emojiSearchTerm}
                            onChange={e => setEmojiSearchTerm(e.target.value)}
                            className="w-full p-2 border rounded-md bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-sm"
                          />
                        </div>
                        <div className="grid grid-cols-8 gap-1 overflow-y-auto max-h-64 pr-1 scrollbar-thin">
                            {filteredEmojis.map(({ emoji, description }) => (
                                <button 
                                    key={description} 
                                    type="button"
                                    onClick={() => handleEmojiSelect(emoji)}
                                    className="text-2xl p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 flex justify-center items-center"
                                    title={description}
                                    aria-label={description}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                         <div className="pt-2 border-t border-gray-200 dark:border-gray-700 grid grid-cols-7 gap-1">
                             {EMOJI_CATEGORIES.map(({name, icon}) => (
                                <button 
                                    key={name}
                                    onClick={() => { setActiveEmojiCategory(name); setEmojiSearchTerm(''); }}
                                    className={`p-1.5 rounded-md ${activeEmojiCategory === name && !emojiSearchTerm ? 'bg-primary-100 dark:bg-primary-900/50' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                                    title={name}
                                >
                                    <span className={activeEmojiCategory === name && !emojiSearchTerm ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}>
                                        {categoryIcons[icon]}
                                    </span>
                                </button>
                             ))}
                        </div>
                    </div>
                )}
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-50/50 dark:bg-gray-700/50 rounded-md">
                         <svg className="animate-spin h-6 w-6 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    </div>
                )}
              </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                    {user?.plan === 'Agency' && (
                        <div className="flex items-center">
                            <label htmlFor={`assign-${message.id}`} className="text-sm font-medium mr-2 text-gray-600 dark:text-gray-400">Assign to:</label>
                            <select
                                id={`assign-${message.id}`}
                                value={assignedTo || ''}
                                onChange={e => handleAssignmentChange(e.target.value || undefined)}
                                className="text-sm rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:text-white"
                            >
                                <option value="">Unassigned</option>
                                {teamMembers.map(member => (
                                    <option key={member.id} value={member.id}>{member.name}</option>
                                ))}
                            </select>
                            {assignedMember && <img src={assignedMember.avatar} alt={assignedMember.name} className="w-6 h-6 rounded-full ml-2" title={`Assigned to ${assignedMember.name}`} />}
                        </div>
                    )}
                    <div className={`flex items-center justify-end gap-2 flex-wrap ${user?.plan === 'Agency' ? '' : 'ml-auto'}`}>
                        <button
                            onClick={handleGenerateReply}
                            disabled={isLoading}
                            className="flex items-center justify-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                        <RedoIcon />
                            Regenerate
                        </button>
                        <button 
                          onClick={startEditing}
                          className="flex items-center px-3 py-2 text-sm font-medium text-primary-700 dark:text-primary-300 bg-primary-100 dark:bg-primary-900/50 rounded-md hover:bg-primary-200 dark:hover:bg-primary-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          disabled={!reply.trim() || isLoading || isEditing}
                        >
                          <EditIcon />
                          Edit
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={!reply.trim() || isLoading}
                            className="flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:bg-primary-300 dark:disabled:bg-primary-800 disabled:cursor-not-allowed transition-colors"
                        >
                            <CheckCircleIcon className="w-5 h-5 mr-2" />
                            Approve & Send
                        </button>
                    </div>
                </div>
            </div>
        ) : (
            <div className="mt-4 p-3 pl-14 bg-green-50 dark:bg-green-900/50 rounded-md text-green-700 dark:text-green-300 flex items-start space-x-3">
                <CheckCircleIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>
                    <p className="font-medium text-sm">Reply Sent!</p>
                    <p className="text-sm italic mt-1 opacity-80">"{reply}"</p>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
