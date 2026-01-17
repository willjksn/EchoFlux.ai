import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from './AppContext';
import { SparklesIcon, RefreshIcon, CopyIcon, CheckIcon, XMarkIcon, UserIcon, ClockIcon, PlayIcon, PauseIcon, StopIcon, TrashIcon } from './icons/UIIcons';
import { FanSelector } from './FanSelector';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc, collection, addDoc, query, orderBy, limit, getDocs, Timestamp, updateDoc, setDoc } from 'firebase/firestore';

type SessionStatus = 'draft' | 'active' | 'paused' | 'ended';
type RoleplayType = 'GFE (Girlfriend Experience)' | 'Dominant / Submissive' | 'Teacher / Student' | 'Boss / Assistant' | 'Fitness Trainer' | 'Soft Mommy / Daddy' | 'Nurse / Patient' | 'Celebrity / Fan' | 'Custom';
type Tone = 'Soft' | 'Teasing' | 'Playful' | 'Explicit';

interface Message {
    id: string;
    role: 'creator' | 'fan' | 'system';
    content: string;
    timestamp: Date;
    aiSuggested?: boolean;
    used?: boolean;
}

interface AISuggestion {
    id: string;
    message: string;
    confidence: number;
    reasoning?: string;
}

interface Session {
    id: string;
    fanId?: string;
    fanName?: string;
    roleplayType: RoleplayType;
    tone: Tone;
    status: SessionStatus;
    messages: Message[];
    createdAt: Date;
    updatedAt: Date;
    duration?: number; // in minutes
}

interface Fan {
    id: string;
    name: string;
    preferences?: {
        favoriteSessionType?: string;
        preferredTone?: string;
        communicationStyle?: string;
        pastNotes?: string;
        totalSessions?: number;
    };
}

export const OnlyFansSextingSession: React.FC = () => {
    const { user, showToast } = useAppContext();
    const [activeSession, setActiveSession] = useState<Session | null>(null);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [fans, setFans] = useState<Fan[]>([]);
    const [selectedFan, setSelectedFan] = useState<Fan | null>(null);
    const [selectedFanId, setSelectedFanId] = useState<string | null>(null);
    const [selectedFanName, setSelectedFanName] = useState<string | null>(null);
    const [fanPreferences, setFanPreferences] = useState<any>(null);
    const [roleplayType, setRoleplayType] = useState<RoleplayType>('GFE (Girlfriend Experience)');
    const [customRoleplay, setCustomRoleplay] = useState('');
    const [tone, setTone] = useState<Tone>('Teasing');
    const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
    const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
    const [sessionLength, setSessionLength] = useState<10 | 20 | 30>(20);
    const [messageInput, setMessageInput] = useState('');
    const [isLoadingFans, setIsLoadingFans] = useState(false);
    const [creatorPersonality, setCreatorPersonality] = useState('');
    const [useCreatorPersonalitySexting, setUseCreatorPersonalitySexting] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const sessionStartTime = useRef<Date | null>(null);

    // Load fans
    useEffect(() => {
        loadFans();
    }, [user?.id]);

    useEffect(() => {
        const loadCreatorPersonality = async () => {
            if (!user?.id) return;
            try {
                const userDoc = await getDoc(doc(db, 'users', user.id));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    setCreatorPersonality(data.creatorPersonality || '');
                }
            } catch (error) {
                console.error('Error loading creator personality:', error);
            }
        };
        loadCreatorPersonality();
    }, [user?.id]);

    // Load fan preferences when fan is selected
    useEffect(() => {
        const loadFanPreferences = async () => {
            if (!user?.id || !selectedFanId) {
                setFanPreferences(null);
                return;
            }
            try {
                const fanDoc = await getDoc(doc(db, 'users', user.id, 'onlyfans_fan_preferences', selectedFanId));
                if (fanDoc.exists()) {
                    const data = fanDoc.data();
                    setFanPreferences(data);
                    // Auto-apply fan preferences
                    if (data.favoriteSessionType && !selectedFan) {
                        setRoleplayType(data.favoriteSessionType as RoleplayType || 'GFE (Girlfriend Experience)');
                    }
                    if (data.preferredTone) {
                        setTone(data.preferredTone as Tone || 'Teasing');
                    }
                } else {
                    setFanPreferences(null);
                }
            } catch (error) {
                console.error('Error loading fan preferences:', error);
                setFanPreferences(null);
            }
        };
        loadFanPreferences();
    }, [user?.id, selectedFanId]);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeSession?.messages, aiSuggestions]);

    const loadFans = async () => {
        if (!user?.id) return;
        setIsLoadingFans(true);
        try {
            const fansRef = collection(db, 'users', user.id, 'onlyfans_fan_preferences');
            const fansSnap = await getDocs(fansRef);
            const fansList: Fan[] = [];
            fansSnap.forEach((doc) => {
                const data = doc.data();
                fansList.push({
                    id: doc.id,
                    name: data.name || doc.id,
                    preferences: data,
                });
            });
            setFans(fansList);
        } catch (error) {
            console.error('Error loading fans:', error);
            showToast('Failed to load fans', 'error');
        } finally {
            setIsLoadingFans(false);
        }
    };

    const startNewSession = async () => {
        if (!user?.id) return;

        const selectedRoleplay = roleplayType === 'Custom' ? customRoleplay : roleplayType;
        if (!selectedRoleplay.trim()) {
            showToast('Please select or enter a roleplay type', 'error');
            return;
        }

        const newSession: Session = {
            id: `session-${Date.now()}`,
            fanId: selectedFanId || selectedFan?.id,
            fanName: selectedFanName || selectedFan?.name,
            roleplayType: selectedRoleplay as RoleplayType,
            tone,
            status: 'active',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            duration: sessionLength,
        };

        setActiveSession(newSession);
        sessionStartTime.current = new Date();
        showToast('Session started!', 'success');

        // Generate initial AI suggestions
        await generateAISuggestions(newSession, []);
    };

    const generateAISuggestions = async (session: Session, conversationHistory: Message[]) => {
        if (!user?.id) return;

        setIsGeneratingSuggestions(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;

            // Build comprehensive fan context if available
            let fanContext = '';
            const currentFanId = session.fanId;
            const currentFanName = session.fanName;
            const currentFanPrefs = fanPreferences || (currentFanId ? await (async () => {
                try {
                    const fanDoc = await getDoc(doc(db, 'users', user.id, 'onlyfans_fan_preferences', currentFanId));
                    return fanDoc.exists() ? fanDoc.data() : null;
                } catch (e) {
                    return null;
                }
            })() : null);

            // Load AI personality/training settings
            let aiPersonality = '';
            let aiTone = '';
            let creatorGender = '';
            let targetAudienceGender = '';
            let explicitnessLevel = 7;
            try {
                const userDoc = await getDoc(doc(db, 'users', user.id));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    aiPersonality = userData?.aiPersonality || '';
                    aiTone = userData?.aiTone || '';
                    creatorGender = userData?.creatorGender || '';
                    targetAudienceGender = userData?.targetAudienceGender || '';
                    explicitnessLevel = userData?.explicitnessLevel ?? 7;
                }
            } catch (e) {
                console.error('Error loading AI personality settings:', e);
            }
            
            if (currentFanId && currentFanPrefs) {
                const fanName = currentFanName || currentFanPrefs.name || 'this fan';
                const contextParts = [];
                const subscriptionTier = currentFanPrefs.subscriptionTier;
                const isVip = currentFanPrefs.isVIP === true;
                const isWhale = currentFanPrefs.isWhale === true;
                const isRegular = currentFanPrefs.isRegular === true;
                if (subscriptionTier) {
                    contextParts.push(`Subscription tier: ${subscriptionTier}`);
                    if (subscriptionTier === 'Paid') {
                        contextParts.push('CTA rule: Already a paid subscriber - DO NOT ask them to subscribe or upgrade. Focus on appreciation, retention, PPV unlocks, tips, customs, and VIP treatment if applicable.');
                    } else {
                        contextParts.push('CTA rule: Free plan - encourage them to upgrade to paid for full access. PPV unlocks are allowed for free fans.');
                    }
                }
                if (isVip) {
                    contextParts.push('VIP: Provide special treatment and priority responses.');
                }
                if (isWhale) {
                    contextParts.push('Whale: Prioritize high-ticket PPV drops, bundles, and upsells.');
                }
                if (isRegular) {
                    contextParts.push('Regular: Keep it warm, consistent, and focused on repeat buys.');
                }
                if (currentFanPrefs.preferredTone) contextParts.push(`Preferred tone: ${currentFanPrefs.preferredTone}`);
                if (currentFanPrefs.communicationStyle) contextParts.push(`Communication style: ${currentFanPrefs.communicationStyle}`);
                if (currentFanPrefs.favoriteSessionType) contextParts.push(`Favorite session type: ${currentFanPrefs.favoriteSessionType}`);
                if (currentFanPrefs.languagePreferences) contextParts.push(`Language preferences: ${currentFanPrefs.languagePreferences}`);
                if (currentFanPrefs.boundaries) contextParts.push(`Boundaries: ${currentFanPrefs.boundaries}`);
                if (currentFanPrefs.suggestedFlow) contextParts.push(`What works best: ${currentFanPrefs.suggestedFlow}`);
                if (currentFanPrefs.pastNotes) contextParts.push(`Past notes: ${currentFanPrefs.pastNotes}`);
                if (currentFanPrefs.totalSessions) contextParts.push(`Total sessions: ${currentFanPrefs.totalSessions}`);
                
                if (contextParts.length > 0) {
                    fanContext = `
PERSONALIZE FOR FAN: ${fanName}
Fan Preferences:
${contextParts.map(p => `- ${p}`).join('\n')}

NATURAL PERSONALIZATION GUIDELINES:
- Write FROM YOUR PERSPECTIVE (first person: "I", "my", "me") - YOU are the creator sending these messages
- Write as if YOU are addressing ${fanName}, but make it sound NATURAL and CONVERSATIONAL
- Use ${fanName}'s name OCCASIONALLY and NATURALLY - not in every message, just when it feels right (like a real person would)
- Match ${currentFanPrefs.preferredTone || 'their preferred'} tone naturally - don't force it
- Use ${currentFanPrefs.communicationStyle || 'their preferred'} communication style organically
- Reference their preferences subtly - don't make it obvious you're following a checklist
- Write like a REAL PERSON, not AI - natural flow, varied sentence structure, authentic voice
- DO NOT overuse their name - use it sparingly, like you would in real conversation
- Make suggestions feel personal but NOT robotic or formulaic
- Consider their boundaries and what works best for them naturally
`;
                }
            } else if (currentFanId && currentFanName) {
                // Fan selected but preferences not loaded yet - still use their name
                fanContext = `
PERSONALIZE FOR FAN: ${currentFanName}
NATURAL PERSONALIZATION GUIDELINES:
- Write FROM YOUR PERSPECTIVE (first person: "I", "my", "me") - YOU are the creator sending these messages
- Write as if YOU are addressing ${currentFanName}, but make it sound NATURAL and CONVERSATIONAL
- Use ${currentFanName}'s name OCCASIONALLY and NATURALLY - not in every message, just when it feels right
- Write like a REAL PERSON, not AI - natural flow, varied sentence structure, authentic voice
- DO NOT overuse their name - use it sparingly, like you would in real conversation
- Make suggestions feel personal but NOT robotic or formulaic
`;
            }
            
            // Build AI personality context
            let personalityContext = '';
            if (aiPersonality) {
                personalityContext = `\n\nAI PERSONALITY & TRAINING:\n${aiPersonality}`;
            }
            if (aiTone && aiTone !== session.tone) {
                personalityContext += `\nDefault AI Tone: ${aiTone}`;
            }
            if (creatorGender) {
                personalityContext += `\nCreator Gender: ${creatorGender}`;
            }
            if (targetAudienceGender) {
                personalityContext += `\nTarget Audience: ${targetAudienceGender}`;
            }
            if (explicitnessLevel !== null && explicitnessLevel !== undefined) {
                personalityContext += `\nExplicitness Level: ${explicitnessLevel}/10`;
                if (explicitnessLevel >= 9) {
                    personalityContext += `\nStyle: Go extremely explicit and erotic while staying within boundaries.`;
                }
            }
            if (useCreatorPersonalitySexting && creatorPersonality) {
                personalityContext += `\n\nCREATOR PERSONALITY:\n${creatorPersonality}`;
            }

            // Load emoji settings from user data
            let emojiEnabled = true;
            let emojiIntensity = 5;
            try {
                const userDoc = await getDoc(doc(db, 'users', user.id));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    emojiEnabled = userData.emojiEnabled !== false; // Default to true
                    emojiIntensity = userData.emojiIntensity ?? 5; // Default to 5
                }
            } catch (e) {
                console.warn('Failed to load emoji settings:', e);
            }

            // Build conversation context
            const conversationContext = conversationHistory
                .slice(-10) // Last 10 messages for context
                .map(msg => `${msg.role === 'creator' ? 'You' : msg.role === 'fan' ? 'Fan' : 'System'}: ${msg.content}`)
                .join('\n');

            const response = await fetch('/api/generateSextingSuggestion', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    sessionContext: {
                        roleplayType: session.roleplayType,
                        tone: session.tone,
                        fanName: session.fanName,
                        sessionLength: session.duration || sessionLength,
                        goal: 'Upsell PPV, keep them buying, and bring them back',
                    },
                    fanContext: fanContext || undefined,
                    personalityContext: personalityContext || undefined,
                    conversationHistory: conversationContext || undefined,
                    lastFanMessage: conversationHistory.filter(m => m.role === 'fan').slice(-1)[0]?.content || undefined,
                    emojiEnabled: emojiEnabled,
                    emojiIntensity: emojiIntensity,
                }),
            });

            // Handle non-200 responses
            if (!response.ok) {
                let errorData: any = {};
                try {
                    errorData = await response.json();
                } catch {
                    // If JSON parsing fails, use status text
                    errorData = { error: response.statusText || 'Unknown error' };
                }
                const errorMessage = errorData.note || errorData.error || `Failed to generate suggestions (${response.status})`;
                console.error('API error response:', { status: response.status, data: errorData });
                throw new Error(errorMessage);
            }

            const data = await response.json().catch(() => ({}));
            
            if (!data.success) {
                // Use the detailed error message from the API if available
                const errorMessage = data.note || data.error || 'Failed to generate suggestions';
                console.error('API error response:', { status: response.status, data });
                throw new Error(errorMessage);
            }

            // Handle both old format (suggestions array) and new format (plan object)
            let suggestions: string[] = [];
            if (data.suggestions && Array.isArray(data.suggestions)) {
                // Old format: array of suggestion strings
                suggestions = data.suggestions;
            } else if (data.plan && typeof data.plan === 'object') {
                // New format: plan object - convert to suggestions array
                const plan = data.plan;
                if (plan.opener) suggestions.push(plan.opener);
                if (Array.isArray(plan.messageFlow)) {
                    suggestions.push(...plan.messageFlow);
                }
                if (plan.paywallMoment) suggestions.push(plan.paywallMoment);
                if (plan.closeFollowUp) suggestions.push(plan.closeFollowUp);
            } else {
                throw new Error(data.note || data.error || 'Invalid response format from API');
            }

            if (suggestions.length === 0) {
                throw new Error(data.note || data.error || 'No suggestions generated');
            }

            setAiSuggestions(suggestions.map((s: string, idx: number) => ({
                id: `suggestion-${Date.now()}-${idx}`,
                message: s,
                confidence: 0.85,
            })));
        } catch (error: any) {
            console.error('Error generating suggestions:', error);
            const errorMessage = error.message || 'Failed to generate AI suggestions. Please try again.';
            showToast(errorMessage, 'error');
        } finally {
            setIsGeneratingSuggestions(false);
        }
    };

    const sendMessage = async (content: string, isAISuggestion: boolean = false) => {
        if (!activeSession || !content.trim()) return;

        const newMessage: Message = {
            id: `msg-${Date.now()}`,
            role: 'creator',
            content: content.trim(),
            timestamp: new Date(),
            aiSuggested: isAISuggestion,
            used: true,
        };

        const updatedSession: Session = {
            ...activeSession,
            messages: [...activeSession.messages, newMessage],
            updatedAt: new Date(),
        };

        setActiveSession(updatedSession);
        setMessageInput('');
        setAiSuggestions([]); // Clear suggestions after sending

        // Generate new suggestions after a short delay
        setTimeout(() => {
            generateAISuggestions(updatedSession, updatedSession.messages);
        }, 1000);
    };

    const useLine = (line: string) => {
        sendMessage(line, true);
    };

    const addFanMessage = (content: string) => {
        if (!activeSession) return;

        const fanMessage: Message = {
            id: `fan-msg-${Date.now()}`,
            role: 'fan',
            content: content.trim(),
            timestamp: new Date(),
        };

        const updatedSession: Session = {
            ...activeSession,
            messages: [...activeSession.messages, fanMessage],
            updatedAt: new Date(),
        };

        setActiveSession(updatedSession);

        // Generate new suggestions based on fan's message
        setTimeout(() => {
            generateAISuggestions(updatedSession, updatedSession.messages);
        }, 500);
    };

    const pauseSession = () => {
        if (!activeSession) return;
        setActiveSession({ ...activeSession, status: 'paused' });
        showToast('Session paused', 'success');
    };

    const resumeSession = () => {
        if (!activeSession) return;
        setActiveSession({ ...activeSession, status: 'active' });
        showToast('Session resumed', 'success');
    };

    const endSession = async () => {
        if (!activeSession || !user?.id) return;

        const duration = sessionStartTime.current
            ? Math.round((new Date().getTime() - sessionStartTime.current.getTime()) / 60000)
            : 0;

        const finalSession: Session = {
            ...activeSession,
            status: 'ended',
            duration,
            updatedAt: new Date(),
        };

        if (finalSession.fanId) {
            // Save session to history (fan-selected sessions only)
            try {
                await addDoc(collection(db, 'users', user.id, 'onlyfans_sexting_sessions'), {
                    ...finalSession,
                    createdAt: Timestamp.fromDate(finalSession.createdAt),
                    updatedAt: Timestamp.fromDate(finalSession.updatedAt),
                    messages: finalSession.messages.map(msg => ({
                        ...msg,
                        timestamp: Timestamp.fromDate(msg.timestamp),
                    })),
                });

                // Update fan stats if fan exists
                try {
                    const fanRef = doc(db, 'users', user.id, 'onlyfans_fan_preferences', finalSession.fanId);
                    const fanDoc = await getDoc(fanRef);
                    if (fanDoc.exists()) {
                        const fanData = fanDoc.data();
                        await updateDoc(fanRef, {
                            totalSessions: (fanData.totalSessions || 0) + 1,
                            lastSessionDate: Timestamp.now(),
                        });
                    }
                } catch (e) {
                    console.warn('Failed to update fan stats:', e);
                }
            } catch (error) {
                console.error('Error saving session:', error);
                showToast('Failed to save session', 'error');
            }
        }

        setActiveSession(null);
        sessionStartTime.current = null;
        showToast(finalSession.fanId ? 'Session ended and saved' : 'Session ended (not saved)', 'success');
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!', 'success');
    };

    if (activeSession) {
        return (
            <div className="max-w-6xl mx-auto">
                {/* Session Header */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                {activeSession.fanName ? `Session with ${activeSession.fanName}` : 'Active Session'}
                            </h2>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {activeSession.roleplayType} • {activeSession.tone} • {activeSession.status}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            {activeSession.status === 'active' ? (
                                <button
                                    onClick={pauseSession}
                                    className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 flex items-center gap-2"
                                >
                                    <PauseIcon className="w-4 h-4" />
                                    Pause
                                </button>
                            ) : (
                                <button
                                    onClick={resumeSession}
                                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
                                >
                                    <PlayIcon className="w-4 h-4" />
                                    Resume
                                </button>
                            )}
                            <button
                                onClick={endSession}
                                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center gap-2"
                            >
                                <StopIcon className="w-4 h-4" />
                                End Session
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Messages Panel */}
                    <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Conversation</h3>
                        <div className="space-y-4 mb-4 max-h-[500px] overflow-y-auto">
                            {activeSession.messages.length === 0 ? (
                                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                                    No messages yet. Start the conversation!
                                </p>
                            ) : (
                                activeSession.messages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={`flex ${msg.role === 'creator' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            className={`max-w-[80%] rounded-lg p-3 ${
                                                msg.role === 'creator'
                                                    ? 'bg-primary-600 text-white'
                                                    : msg.role === 'fan'
                                                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                                                    : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100'
                                            }`}
                                        >
                                            <p className="text-sm">{msg.content}</p>
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-xs opacity-75">
                                                    {msg.timestamp.toLocaleTimeString()}
                                                </span>
                                                {msg.aiSuggested && (
                                                    <span className="text-xs opacity-75 ml-2">✨ AI</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Add Fan Message (for testing) */}
                        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Add Fan Message (for testing):
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="What did the fan say?"
                                    className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                            addFanMessage(e.currentTarget.value);
                                            e.currentTarget.value = '';
                                        }
                                    }}
                                />
                                <button
                                    onClick={(e) => {
                                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                        if (input.value.trim()) {
                                            addFanMessage(input.value);
                                            input.value = '';
                                        }
                                    }}
                                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                                >
                                    Add
                                </button>
                            </div>
                        </div>

                        {/* Message Input */}
                        <div className="flex gap-2 mt-6 pt-2 border-t border-gray-200 dark:border-gray-700">
                            <input
                                type="text"
                                value={messageInput}
                                onChange={(e) => setMessageInput(e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' && messageInput.trim()) {
                                        sendMessage(messageInput);
                                    }
                                }}
                                placeholder="Type your message..."
                                className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                disabled={activeSession.status !== 'active'}
                            />
                            <button
                                onClick={() => sendMessage(messageInput)}
                                disabled={!messageInput.trim() || activeSession.status !== 'active'}
                                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Send
                            </button>
                        </div>
                    </div>

                    {/* AI Suggestions Panel */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">AI Suggestions</h3>
                            {isGeneratingSuggestions && (
                                <RefreshIcon className="w-5 h-5 animate-spin text-primary-600 dark:text-primary-400" />
                            )}
                        </div>
                        {isGeneratingSuggestions && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 mb-3">
                                <div className="h-4 w-4 border-2 border-gray-300 dark:border-gray-600 border-t-primary-600 dark:border-t-primary-400 rounded-full animate-spin"></div>
                                <span>Generating suggestions...</span>
                            </div>
                        )}
                        {aiSuggestions.length === 0 ? (
                            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                                {isGeneratingSuggestions ? 'Generating suggestions...' : 'No suggestions yet'}
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {aiSuggestions.map((suggestion) => (
                                    <div
                                        key={suggestion.id}
                                        className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                                    >
                                        <p className="text-sm text-gray-900 dark:text-white mb-2">{suggestion.message}</p>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                Confidence: {Math.round(suggestion.confidence * 100)}%
                                            </span>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => copyToClipboard(suggestion.message)}
                                                    className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                                >
                                                    Copy
                                                </button>
                                                <button
                                                    onClick={() => useLine(suggestion.message)}
                                                    disabled={activeSession.status !== 'active'}
                                                    className="text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 disabled:opacity-50"
                                                >
                                                    Use
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Session Setup View
    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <SparklesIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Chat/Sexting Session Assistant</h1>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    Start an AI-powered chatting/sexting session with real-time suggestions to reduce stress and improve engagement.
                </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 space-y-6">
                {/* Fan Selection */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Personalize for Fan (Optional):
                    </label>
                    <FanSelector
                        selectedFanId={selectedFanId}
                        onSelectFan={(fanId, fanName) => {
                            setSelectedFanId(fanId);
                            setSelectedFanName(fanName);
                            const fan = fans.find(f => f.id === fanId);
                            setSelectedFan(fan || null);
                            // Preferences will load automatically via useEffect
                        }}
                        allowNewFan={true}
                        compact={true}
                    />
                    {selectedFanId && fanPreferences && (
                        <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                            <div className="text-xs text-purple-700 dark:text-purple-300">
                                <p className="font-semibold mb-1">Fan Preferences Loaded:</p>
                                {fanPreferences.preferredTone && <p>• Tone: {fanPreferences.preferredTone}</p>}
                                {fanPreferences.communicationStyle && <p>• Style: {fanPreferences.communicationStyle}</p>}
                                {fanPreferences.favoriteSessionType && <p>• Favorite: {fanPreferences.favoriteSessionType}</p>}
                            </div>
                        </div>
                    )}
                </div>

                {/* Roleplay Type */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Roleplay Type:
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                        {(['GFE (Girlfriend Experience)', 'Dominant / Submissive', 'Teacher / Student', 'Boss / Assistant', 'Fitness Trainer', 'Soft Mommy / Daddy', 'Nurse / Patient', 'Celebrity / Fan'] as RoleplayType[]).map((type) => (
                            <button
                                key={type}
                                onClick={() => setRoleplayType(type)}
                                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                    roleplayType === type
                                        ? 'bg-primary-600 text-white'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                            >
                                {type.split(' ')[0]}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => setRoleplayType('Custom')}
                        className={`w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                            roleplayType === 'Custom'
                                ? 'bg-primary-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                        Custom
                    </button>
                    {roleplayType === 'Custom' && (
                        <input
                            type="text"
                            value={customRoleplay}
                            onChange={(e) => setCustomRoleplay(e.target.value)}
                            placeholder="Enter custom roleplay type..."
                            className="w-full mt-2 p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    )}
                </div>

            {/* Session length */}
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Session length
                </label>
                <div className="flex flex-wrap gap-2">
                    {([10, 20, 30] as const).map((minutes) => (
                        <button
                            key={minutes}
                            type="button"
                            onClick={() => setSessionLength(minutes)}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                sessionLength === minutes
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                        >
                            {minutes} min
                        </button>
                    ))}
                </div>
            </div>

                {/* Tone */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Tone:
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                        {(['Soft', 'Teasing', 'Playful', 'Explicit'] as Tone[]).map((t) => (
                            <button
                                key={t}
                                onClick={() => setTone(t)}
                                className={`px-3 py-2 rounded-md text-sm font-medium capitalize transition-colors ${
                                    tone === t
                                        ? 'bg-primary-600 text-white'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setUseCreatorPersonalitySexting(prev => !prev)}
                        disabled={!creatorPersonality}
                        className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                            useCreatorPersonalitySexting
                                ? 'bg-primary-600 text-white hover:bg-primary-700'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        } ${!creatorPersonality ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={!creatorPersonality ? 'Add a creator personality in Settings → AI Training to enable' : undefined}
                    >
                        <SparklesIcon className="w-4 h-4" />
                        Personality
                    </button>
                </div>

                {/* Start Session Button */}
                <button
                    onClick={startNewSession}
                    className="w-full px-4 py-3 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center justify-center gap-2 font-semibold"
                >
                    <PlayIcon className="w-5 h-5" />
                    Start Session
                </button>
            </div>
        </div>
    );
};

