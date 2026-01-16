import React, { useState } from 'react';
import { useAppContext } from './AppContext';
import { SparklesIcon, RefreshIcon } from './icons/UIIcons';
import { OnlyFansSextingSession } from './OnlyFansSextingSession';
import { auth } from '../firebaseConfig';

type RoleplayType = 'GFE' | 'Dom/Sub' | 'Teacher/Student' | 'Boss/Assistant' | 'Fitness Trainer' | 'Soft Mommy/Daddy' | 'Custom';
type Tone = 'soft' | 'teasing' | 'explicit' | 'playful';
type SessionLength = 'short' | 'long';

interface RoleplayScenario {
    premise: string;
    openingMessage: string;
    escalationPrompts: string[];
    endingCTA: string;
}

export const OnlyFansRoleplayIdeas: React.FC = () => {
    const { showToast } = useAppContext();
    const [activeTab, setActiveTab] = useState<'roleplay' | 'persona' | 'interactive' | 'ratings' | 'sexting'>('roleplay');
    const [isGenerating, setIsGenerating] = useState(false);

    // Roleplay Scenario state
    const [roleplayType, setRoleplayType] = useState<RoleplayType>('GFE');
    const [customRoleplay, setCustomRoleplay] = useState('');
    const [roleplayContext, setRoleplayContext] = useState('');
    const [roleplayTone, setRoleplayTone] = useState<Tone>('teasing');
    const [sessionLength, setSessionLength] = useState<SessionLength>('short');
    const [generatedRoleplay, setGeneratedRoleplay] = useState<RoleplayScenario | null>(null);

    // Persona Builder state
    const [personaPrompt, setPersonaPrompt] = useState('');
    const [generatedPersona, setGeneratedPersona] = useState<string>('');

    // Interactive Post Ideas state
    const [interactivePrompt, setInteractivePrompt] = useState('');
    const [generatedInteractive, setGeneratedInteractive] = useState<string[]>([]);

    // Body Rating Prompts state
    const [ratingPrompt, setRatingPrompt] = useState('');
    const [generatedRatings, setGeneratedRatings] = useState<string[]>([]);

    const handleGenerateRoleplay = async () => {
        const selectedType = roleplayType === 'Custom' ? customRoleplay : roleplayType;
        if (!selectedType.trim()) {
            showToast('Please select or enter a roleplay type', 'error');
            return;
        }

        setIsGenerating(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const response = await fetch('/api/generateText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    prompt: `Generate ${sessionLength === 'short' ? '5-7' : '8-12'} direct first-person messages for OnlyFans ${selectedType} content.

Roleplay Type: ${selectedType}
Tone: ${roleplayTone}
Session Length: ${sessionLength === 'short' ? 'Short session (15-30 minutes, 5-7 messages)' : 'Extended session (1-2 hours, 8-12 messages)'}
${roleplayContext.trim() ? `\n\nIMPORTANT - CONTEXT/SITUATION:\n${roleplayContext}\n\nCRITICAL: The scenario MUST match this context. If the user specifies a time of day (morning, night, etc.), situation (just woke up, getting ready for bed, at work, etc.), or specific scenario details, the generated content MUST align with that context. Do NOT generate scenarios that contradict the provided context.` : ''}

${selectedType.toLowerCase().includes('gfe') || selectedType.toLowerCase().includes('girlfriend experience') ? `
🔹 GFE (GIRLFRIEND EXPERIENCE) - CRITICAL INSTRUCTIONS:

GFE messages are written in FIRST-PERSON as if the creator is texting the fan directly.
The creator is acting like the fan's girlfriend sending casual, intimate text messages.

✅ CORRECT FORMAT (what you MUST generate):
"I just finished my coffee and I'm still half wrapped up in my hoodie. It's one of those quiet mornings where everything feels slow and soft. I kept thinking about you while I was getting ready. Did you sleep okay?"

❌ WRONG FORMAT (DO NOT generate this):
"Scenario: You're relaxing after a long day when you receive a message from your girlfriend..."

THE 4-PART GFE MESSAGE STRUCTURE:
Every GFE message should follow this structure:
1. Moment – something relatable (e.g., "I just finished my coffee...")
2. Emotion – how it feels (e.g., "...everything feels slow and soft")
3. Connection – why it involves them (e.g., "I kept thinking about you...")
4. Invitation – a question or soft CTA (e.g., "Did you sleep okay?")

GFE MESSAGE TYPES (use variety):
A. Daily Life GFE - Morning/casual check-ins
   Example: "I just finished my coffee and I'm still half wrapped up in my hoodie. It's one of those quiet mornings where everything feels slow and soft. I kept thinking about you while I was getting ready. Did you sleep okay?"

B. Emotional Connection GFE - Making them feel chosen
   Example: "Today's been a little busy, but you crossed my mind more than once. It's funny how some people just stick with you even when you're distracted. I like that feeling. Tell me what your day's been like."

C. Evening/Wind-Down GFE - Comfort + closeness
   Example: "I finally slowed down for the night. Lights are low, phone's in my hand, and I'm just letting the day fade out. These are my favorite moments — when things feel simple. What's the last thing that made you smile today?"

D. Flirty But Safe GFE - Playfulness without being explicit
   Example: "I caught myself smiling at my screen earlier and had to laugh. You have that effect sometimes. I'll let you decide if that's dangerous or cute. What do you think?"

E. "I Miss You" Style GFE - Re-engaging
   Example: "It's been a minute, hasn't it? Some days just move fast, but I still notice when someone's not around. I hope you've been okay. Come talk to me."

CRITICAL REQUIREMENTS:
- Write in FIRST-PERSON as the creator texting the fan
- NO third-person descriptions or scenario setups
- Each message should feel like a real text from a girlfriend
- Messages should feel natural, not scripted
- Include relatable moments, emotions, and gentle invitations
- Tone: ${roleplayTone}
- Create emotional closeness and encourage responses

` : `
🔹 ${selectedType.toUpperCase()} ROLEPLAY - CRITICAL INSTRUCTIONS:

Generate FIRST-PERSON messages as if the creator is directly texting/messaging the fan IN CHARACTER.
The creator IS the character - they send messages AS that character to the fan.

✅ CORRECT FORMAT (what you MUST generate):
Direct messages from the character's perspective that the creator sends to fans.

❌ WRONG FORMAT (DO NOT generate):
"Scenario: You're in a classroom when..."
"She sends you a message saying..."
Any third-person descriptions.

ROLEPLAY-SPECIFIC EXAMPLES:

${selectedType.toLowerCase().includes('dom') || selectedType.toLowerCase().includes('sub') ? `
DOM/SUB:
- Soft: "You've been such a good one for me today. I think you deserve something special..."
- Explicit: "Get on your knees. Now. I've been thinking about using you all day..."
` : ''}
${selectedType.toLowerCase().includes('teacher') || selectedType.toLowerCase().includes('student') ? `
TEACHER/STUDENT:
- Soft: "I noticed you staying late. My office hours are always open for you..."
- Explicit: "Lock the door. I think it's time for a very private lesson..."
` : ''}
${selectedType.toLowerCase().includes('boss') || selectedType.toLowerCase().includes('assistant') ? `
BOSS/ASSISTANT:
- Soft: "You've been working so hard. Come to my office, I have something for you..."
- Explicit: "My office. Now. Lock the door. I've been watching you all day..."
` : ''}
${selectedType.toLowerCase().includes('fitness') || selectedType.toLowerCase().includes('trainer') ? `
FITNESS TRAINER:
- Soft: "Great workout today. Ready for a special stretching session?"
- Explicit: "Get on the mat. I'm going to stretch you out like never before..."
` : ''}
${selectedType.toLowerCase().includes('mommy') || selectedType.toLowerCase().includes('daddy') ? `
SOFT MOMMY/DADDY:
- Soft: "Come here baby, let me take care of you..."
- Explicit: "Come to mommy/daddy. I'm going to take such good care of you tonight..."
` : ''}

REQUIREMENTS:
- Write in FIRST-PERSON as the character (I, me, my)
- The creator IS the character - messaging the fan directly
- Each message should be ready to copy and send to a fan
- Tone: ${roleplayTone} - ${roleplayTone === 'explicit' ? 'USE EXPLICIT, UNCENSORED, RAW SEXUAL LANGUAGE' : roleplayTone === 'teasing' ? 'be suggestive and build anticipation' : roleplayTone === 'playful' ? 'be fun and flirty' : 'be warm and inviting'}
- Include natural conversation hooks
`}

Generate a JSON object with these fields:
1. "premise": A 1-sentence description of the message flow theme/vibe (for creator's reference only)
2. "openingMessage": The first message to send
3. "escalationPrompts": Array of ${sessionLength === 'short' ? '5-7' : '8-12'} follow-up messages that progress the conversation naturally
4. "endingCTA": Final message with a soft call-to-action for unlocking content or continuing

CRITICAL - ALL MESSAGES MUST BE:
- Written in FIRST-PERSON (I, me, my)
- Direct messages the creator can copy and send
- Natural, conversational, and authentic
- NOT descriptions or scenarios
- Ready to send as-is to fans

Format as JSON: {"premise": "...", "openingMessage": "...", "escalationPrompts": ["message 1", "message 2", ...], "endingCTA": "..."}

🚨 CRITICAL - UNIQUENESS REQUIREMENT 🚨
- Each message MUST be UNIQUE and DIFFERENT from any previous messages you've generated
- Creators use these repeatedly - NEVER repeat the same messages
- Vary the moments, emotions, and conversation hooks
- Use different themes and vibes each time
- Make each set feel fresh and authentic`,
                    context: {
                        goal: 'roleplay-content',
                        tone: 'Explicit/Adult Content',
                        platforms: ['OnlyFans'],
                    },
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate roleplay scenario');
            }

            const data = await response.json();
            const text = data.text || data.caption || '';
            
            // Try to parse JSON, fallback to structured text parsing
            let scenario: RoleplayScenario;
            try {
                scenario = JSON.parse(text);
            } catch {
                // Fallback: parse structured text
                const lines = text.split('\n').filter(l => l.trim());
                scenario = {
                    premise: lines.find(l => l.toLowerCase().includes('premise'))?.replace(/^.*premise[:\-]?\s*/i, '') || 'Roleplay scenario',
                    openingMessage: lines.find(l => l.toLowerCase().includes('opening'))?.replace(/^.*opening[:\-]?\s*/i, '') || '',
                    escalationPrompts: lines.filter(l => l.match(/^\d+[\.\)]/) || l.includes('prompt')).map(l => l.replace(/^\d+[\.\)]\s*/, '')),
                    endingCTA: lines.find(l => l.toLowerCase().includes('ending') || l.toLowerCase().includes('cta'))?.replace(/^.*(?:ending|cta)[:\-]?\s*/i, '') || '',
                };
            }

            setGeneratedRoleplay(scenario);
            showToast('Roleplay scenario generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating roleplay:', error);
            showToast(error.message || 'Failed to generate roleplay scenario. Please try again.', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGeneratePersona = async () => {
        if (!personaPrompt.trim()) {
            showToast('Please describe the persona you want to create', 'error');
            return;
        }

        setIsGenerating(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const response = await fetch('/api/generateText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    prompt: `Create a detailed persona profile for OnlyFans content creation based on: ${personaPrompt}

The persona should include:
- Character name and background
- Personality traits and quirks
- Communication style (how they talk, respond)
- Content themes and interests
- Unique selling points
- Fan interaction approach
- Content style preferences

Make it detailed, creative, and tailored for adult content platforms. Format as a well-structured persona profile.

🚨 CRITICAL - UNIQUENESS REQUIREMENT 🚨
- This persona MUST be UNIQUE and DIFFERENT from any previous personas you've generated
- Creators use personas repeatedly - NEVER repeat the same persona details
- Vary the personality traits, communication style, and content themes
- Use different characteristics, quirks, and selling points each time
- Make each persona feel fresh, unique, and distinct`,
                    context: {
                        goal: 'persona-creation',
                        tone: 'Explicit/Adult Content',
                        platforms: ['OnlyFans'],
                    },
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate persona');
            }

            const data = await response.json();
            const text = data.text || data.caption || '';
            setGeneratedPersona(text);
            showToast('Persona generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating persona:', error);
            showToast(error.message || 'Failed to generate persona. Please try again.', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerateInteractive = async () => {
        if (!interactivePrompt.trim()) {
            showToast('Please describe what kind of interactive posts you want', 'error');
            return;
        }

        setIsGenerating(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const response = await fetch('/api/generateText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    prompt: `Generate 10 creative interactive post ideas for OnlyFans based on: ${interactivePrompt}

Each idea should encourage audience participation, engagement, and interaction. Examples:
- Polls and voting
- "Pick what I post next"
- Rating games
- Fan choice content
- Q&A sessions
- Fan request themes

Format as a numbered list with brief descriptions. Make them engaging and monetization-friendly.

🚨 CRITICAL - UNIQUENESS REQUIREMENT 🚨
- Each post idea MUST be UNIQUE and DIFFERENT from any previous ideas you've generated
- Creators use these ideas repeatedly with the same fans - NEVER repeat the same post idea
- Vary the concepts, engagement strategies, and captions each time
- Use different angles, hooks, and monetization approaches
- Make each idea feel fresh, creative, and unique`,
                    context: {
                        goal: 'interactive-content',
                        tone: 'Explicit/Adult Content',
                        platforms: ['OnlyFans'],
                    },
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate interactive ideas');
            }

            const data = await response.json();
            const text = data.text || data.caption || '';
            const ideas = text.split(/\d+\./).filter(item => item.trim()).map(item => item.trim());
            setGeneratedInteractive(ideas.length > 0 ? ideas : [text]);
            showToast('Interactive post ideas generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating interactive ideas:', error);
            showToast(error.message || 'Failed to generate interactive ideas. Please try again.', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerateRatings = async () => {
        if (!ratingPrompt.trim()) {
            showToast('Please describe what kind of body rating prompts you want', 'error');
            return;
        }

        setIsGenerating(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const response = await fetch('/api/generateText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    prompt: `Generate EXACTLY 12 body rating prompt ideas for OnlyFans.

🚨 CRITICAL - GENERATE ONLY WHAT IS REQUESTED 🚨
USER REQUEST: ${ratingPrompt}

MANDATORY REQUIREMENT - READ CAREFULLY:
- You MUST generate prompts ONLY about: ${ratingPrompt}
- ALL 12 prompts must be about EXACTLY what the user requested
- DO NOT generate prompts for different body parts, themes, or topics
- DO NOT create variety or mix different subjects
- If user asks for "big black dick" prompts, ALL prompts must be about rating big black dicks
- If user asks for "tits" prompts, ALL prompts must be about rating tits
- If user asks for "feet" prompts, ALL prompts must be about rating feet
- DO NOT generate "Titty Talk Tuesdays" or "Leg Day Love" or "Feet Fetish Friday" unless the user specifically requests those themes
- Focus ONLY on the exact body part/theme the user specified: ${ratingPrompt}
- Each prompt should be a variation of rating the SAME thing the user requested
- Generate 12 DIFFERENT ways to ask for/offer ratings of: ${ratingPrompt}

🚨 CRITICAL - EXPLICIT CONTENT PLATFORM 🚨
- This is for OnlyFans, an EXPLICIT adult content creator platform
- Prompts MUST be EXPLICIT, UNCENSORED, RAW, and BOLD
- Use EXPLICIT, DIRECT sexual language - NO CENSORSHIP
- Use BOLD, DIRECT, EXPLICIT language - not suggestive or implied

Each prompt should be:
- About rating: ${ratingPrompt} (ONLY this, nothing else)
- Engaging, playful, and EXPLICIT
- Encourage audience interaction
- Suitable for EXPLICIT adult content platforms
- Include clear instructions for rating
- Reference the specific body part/theme using explicit terminology: ${ratingPrompt}
- Use BOLD, DIRECT, EXPLICIT language
- Variations of asking for/offering ratings of: ${ratingPrompt}

REMINDER - CRITICAL:
- ALL prompts must be about: ${ratingPrompt}
- DO NOT generate prompts for other body parts or themes
- DO NOT create variety - focus ONLY on what the user requested
- Generate 12 different ways to ask for/offer ratings of: ${ratingPrompt}

Format as a numbered list (1-12) with complete prompt text. Make them creative, varied in approach, but ALL about: ${ratingPrompt}.

🚨 CRITICAL - UNIQUENESS REQUIREMENT 🚨
- Each prompt MUST be UNIQUE and DIFFERENT from any previous prompts you've generated
- Creators use these prompts repeatedly with the same fans - NEVER repeat the same prompt
- Vary the wording, approach, and style of each prompt
- Use different angles, hooks, and CTAs
- Make each prompt feel fresh, creative, and unique`,
                    context: {
                        goal: 'rating-content',
                        tone: 'Explicit/Adult Content',
                        platforms: ['OnlyFans'],
                    },
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate rating prompts');
            }

            const data = await response.json();
            const text = data.text || data.caption || '';
            const ratings = text.split(/\d+\./).filter(item => item.trim()).map(item => item.trim());
            setGeneratedRatings(ratings.length > 0 ? ratings : [text]);
            showToast('Body rating prompts generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating rating prompts:', error);
            showToast(error.message || 'Failed to generate rating prompts. Please try again.', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!', 'success');
    };

    const tabs: { id: typeof activeTab; label: string }[] = [
        { id: 'roleplay', label: 'Roleplay Scripts' },
        { id: 'sexting', label: 'DM Session Planner' },
        { id: 'persona', label: 'Persona Builder' },
        { id: 'interactive', label: 'Interactive Prompts' },
        { id: 'ratings', label: 'Rating Prompts' },
    ];

    return (
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <SparklesIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Scripts & Roleplay
                    </h1>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    Pick a vibe and get scripts, prompts, and scenes ready to use.
                </p>
            </div>

            {/* Important Notice */}
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <strong>Note:</strong> These tools generate creative ideas and scripts for content creation. 
                    They do not send messages automatically. You remain in control of all interactions.
                </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                            activeTab === tab.id
                                ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Roleplay Scenarios Tab */}
            {activeTab === 'roleplay' && (
                <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Generate Roleplay Scenario
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Roleplay Type:
                                </label>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                                    {(['GFE', 'Dom/Sub', 'Teacher/Student', 'Boss/Assistant', 'Fitness Trainer', 'Soft Mommy/Daddy'] as RoleplayType[]).map((type) => (
                                        <button
                                            key={type}
                                            onClick={() => setRoleplayType(type)}
                                            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                                roleplayType === type
                                                    ? 'bg-primary-600 text-white'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                            }`}
                                        >
                                            {type}
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
                            </div>

                            {roleplayType === 'Custom' && (
                                <div>
                                    <input
                                        type="text"
                                        value={customRoleplay}
                                        onChange={(e) => setCustomRoleplay(e.target.value)}
                                        placeholder="Enter custom roleplay type..."
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Context / Situation (Optional):
                                </label>
                                <textarea
                                    value={roleplayContext}
                                    onChange={(e) => setRoleplayContext(e.target.value)}
                                    placeholder="e.g., 'It's morning, I just woke up and want to send a good morning message' or 'It's late at night, I'm getting ready for bed' or 'I'm at work and want to send a teasing message'"
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[80px]"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Add context about the time of day, situation, or specific scenario you need. This helps generate more relevant content.
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Tone:
                                </label>
                                <div className="grid grid-cols-4 gap-2">
                                    {(['soft', 'teasing', 'explicit', 'playful'] as Tone[]).map((tone) => (
                                        <button
                                            key={tone}
                                            onClick={() => setRoleplayTone(tone)}
                                            className={`px-3 py-2 rounded-md text-sm font-medium capitalize transition-colors ${
                                                roleplayTone === tone
                                                    ? 'bg-primary-600 text-white'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                            }`}
                                        >
                                            {tone}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Session Length:
                                </label>
                                <div className="flex gap-2">
                                    {(['short', 'long'] as SessionLength[]).map((length) => (
                                        <button
                                            key={length}
                                            onClick={() => setSessionLength(length)}
                                            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium capitalize transition-colors ${
                                                sessionLength === length
                                                    ? 'bg-primary-600 text-white'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                            }`}
                                        >
                                            {length === 'short' ? 'Short (15-30 min)' : 'Extended (1-2 hours)'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleGenerateRoleplay}
                                disabled={isGenerating}
                                className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isGenerating ? (
                                    <>
                                        <RefreshIcon className="w-5 h-5 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5" />
                                        Generate Roleplay Scenario
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Generated Roleplay */}
                    {generatedRoleplay && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 space-y-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Generated Roleplay Scenario
                                </h3>
                                <button
                                    onClick={() => copyToClipboard(JSON.stringify(generatedRoleplay, null, 2))}
                                    className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                >
                                    Copy All
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Scenario Premise:</h4>
                                    <p className="text-gray-700 dark:text-gray-300">{generatedRoleplay.premise}</p>
                                </div>

                                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Opening Message:</h4>
                                    <p className="text-gray-700 dark:text-gray-300">{generatedRoleplay.openingMessage}</p>
                                    <button
                                        onClick={() => copyToClipboard(generatedRoleplay.openingMessage)}
                                        className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                    >
                                        Copy
                                    </button>
                                </div>

                                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Escalation Prompts:</h4>
                                    <ul className="space-y-2">
                                        {generatedRoleplay.escalationPrompts.map((prompt, index) => (
                                            <li key={index} className="flex items-start gap-2">
                                                <span className="text-primary-600 dark:text-primary-400">{index + 1}.</span>
                                                <div className="flex-1">
                                                    <p className="text-gray-700 dark:text-gray-300">{prompt}</p>
                                                    <button
                                                        onClick={() => copyToClipboard(prompt)}
                                                        className="mt-1 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                                    >
                                                        Copy
                                                    </button>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Ending CTA:</h4>
                                    <p className="text-gray-700 dark:text-gray-300">{generatedRoleplay.endingCTA}</p>
                                    <button
                                        onClick={() => copyToClipboard(generatedRoleplay.endingCTA)}
                                        className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Persona Builder Tab */}
            {activeTab === 'persona' && (
                <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Build a Persona
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Describe the persona you want to create:
                                </label>
                                <textarea
                                    value={personaPrompt}
                                    onChange={(e) => setPersonaPrompt(e.target.value)}
                                    placeholder="e.g., 'A confident, playful domme with a fitness background' or 'A soft, caring girlfriend experience persona'"
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[100px]"
                                />
                            </div>

                            <button
                                onClick={handleGeneratePersona}
                                disabled={isGenerating}
                                className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isGenerating ? (
                                    <>
                                        <RefreshIcon className="w-5 h-5 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5" />
                                        Generate Persona
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Generated Persona */}
                    {generatedPersona && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Generated Persona
                                </h3>
                                <button
                                    onClick={() => copyToClipboard(generatedPersona)}
                                    className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                >
                                    Copy
                                </button>
                            </div>
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                <pre className="text-gray-900 dark:text-white whitespace-pre-wrap font-sans">
                                    {generatedPersona}
                                </pre>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Interactive Posts Tab */}
            {activeTab === 'interactive' && (
                <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Generate Interactive Post Ideas
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    What kind of interactive posts are you looking for?
                                </label>
                                <textarea
                                    value={interactivePrompt}
                                    onChange={(e) => setInteractivePrompt(e.target.value)}
                                    placeholder="e.g., 'Polls and voting games' or 'Fan choice content ideas'"
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[100px]"
                                />
                            </div>

                            <button
                                onClick={handleGenerateInteractive}
                                disabled={isGenerating}
                                className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isGenerating ? (
                                    <>
                                        <RefreshIcon className="w-5 h-5 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5" />
                                        Generate Interactive Ideas
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Generated Interactive Ideas */}
                    {generatedInteractive.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Interactive Post Ideas
                            </h3>
                            <div className="space-y-3">
                                {generatedInteractive.map((idea, index) => (
                                    <div
                                        key={index}
                                        className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                    >
                                        <p className="text-gray-900 dark:text-white">{idea}</p>
                                        <button
                                            onClick={() => copyToClipboard(idea)}
                                            className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Sexting Session Tab */}
            {activeTab === 'sexting' && (
                <div className="space-y-6">
                    <OnlyFansSextingSession />
                </div>
            )}

            {/* Body Ratings Tab */}
            {activeTab === 'ratings' && (
                <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Generate Body Rating Prompts
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    What kind of body rating prompts do you want?
                                </label>
                                <textarea
                                    value={ratingPrompt}
                                    onChange={(e) => setRatingPrompt(e.target.value)}
                                    placeholder="e.g., 'Playful rating games' or 'Interactive body part comparisons'"
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[100px]"
                                />
                            </div>

                            <button
                                onClick={handleGenerateRatings}
                                disabled={isGenerating}
                                className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isGenerating ? (
                                    <>
                                        <RefreshIcon className="w-5 h-5 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5" />
                                        Generate Rating Prompts
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Generated Rating Prompts */}
                    {generatedRatings.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Body Rating Prompts
                            </h3>
                            <div className="space-y-3">
                                {generatedRatings.map((rating, index) => (
                                    <div
                                        key={index}
                                        className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                    >
                                        <p className="text-gray-900 dark:text-white">{rating}</p>
                                        <button
                                            onClick={() => copyToClipboard(rating)}
                                            className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
