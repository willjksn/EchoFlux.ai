import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { SparklesIcon, RefreshIcon, CheckIcon, CheckCircleIcon, TrashIcon, UserIcon, StarIcon, SearchIcon, XMarkIcon } from './icons/UIIcons';
import { OnlyFansSextingSession } from './OnlyFansSextingSession';
import { FanSelector } from './FanSelector';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc, setDoc, collection, addDoc, getDocs, query, orderBy, deleteDoc, Timestamp } from 'firebase/firestore';
import { loadEmojiSettings } from '../src/utils/loadEmojiSettings';

type RoleplayTab = 'scenarios' | 'sexting' | 'persona' | 'ratings' | 'interactive';

type RoleplayType = 
    | 'GFE (Girlfriend Experience)'
    | 'Dominant / Submissive'
    | 'Class after hours'
    | 'Office after dark'
    | 'Fitness Trainer'
    | 'Soft Mommy / Daddy'
    | 'Nurse / Patient'
    | 'Celebrity / Fan'
    | 'Custom';

export const OnlyFansRoleplay: React.FC = () => {
    const { user, showToast } = useAppContext();
    const [activeTab, setActiveTab] = useState<RoleplayTab>('scenarios');
    const [isGeneratingScenario, setIsGeneratingScenario] = useState(false);
    const [isGeneratingPersona, setIsGeneratingPersona] = useState(false);
    const [isGeneratingRatings, setIsGeneratingRatings] = useState(false);
    const [isGeneratingLongRating, setIsGeneratingLongRating] = useState(false);
    const [isGeneratingInteractive, setIsGeneratingInteractive] = useState(false);
    const [creatorPersonality, setCreatorPersonality] = useState('');
    const [useCreatorPersonalityScenario, setUseCreatorPersonalityScenario] = useState(false);
    const [useCreatorPersonalityRatings, setUseCreatorPersonalityRatings] = useState(false);
    const [useCreatorPersonalityInteractive, setUseCreatorPersonalityInteractive] = useState(false);
    
    // Scenario generation state
    const [selectedRoleplayType, setSelectedRoleplayType] = useState<RoleplayType>('GFE (Girlfriend Experience)');
    const [customRoleplayType, setCustomRoleplayType] = useState('');
    const [scenarioContext, setScenarioContext] = useState('');
    const [scenarioTone, setScenarioTone] = useState<'Soft' | 'Teasing' | 'Playful' | 'Explicit' | 'Custom'>('Teasing');
    const [customTone, setCustomTone] = useState('');
    const [scenarioLength, setScenarioLength] = useState<'Extended' | 'Long Extended'>('Extended');
    const [generatedScenario, setGeneratedScenario] = useState<{
        premise: string;
        openingMessage: string;
        engagementPrompts: string[];
        progressionStages?: Array<{stage: string; description: string; prompts: string[]}>;
        escalationPoints?: Array<{moment: string; description: string; prompt: string}>;
        variationIdeas?: string[];
        monetizationMoments?: Array<{moment: string; cta: string}>;
        endingCTA: string;
    } | null>(null);
    
    // Persona builder state
    const [personaName, setPersonaName] = useState('');
    const [personaDescription, setPersonaDescription] = useState('');
    const [generatedPersona, setGeneratedPersona] = useState<string>('');
    
    // Body rating state
    const [ratingPrompt, setRatingPrompt] = useState('');
    const [generatedRatings, setGeneratedRatings] = useState<string[]>([]);
    const [longRatingPrompt, setLongRatingPrompt] = useState('');
    const [generatedLongRating, setGeneratedLongRating] = useState<string>('');
    
    // Interactive posts state
    const [interactivePrompt, setInteractivePrompt] = useState('');
    const [generatedInteractive, setGeneratedInteractive] = useState<string[]>([]);

    // Gender settings (loaded from user settings)
    const [creatorGender, setCreatorGender] = useState('');
    const [targetAudienceGender, setTargetAudienceGender] = useState('');
    
    // Fan selection state (shared across all tabs)
    const [selectedFanId, setSelectedFanId] = useState<string | null>(null);
    const [selectedFanName, setSelectedFanName] = useState<string | null>(null);
    const [fanPreferences, setFanPreferences] = useState<any>(null);

    // Saved items state
    const [savedScenarios, setSavedScenarios] = useState<any[]>([]);
    const [savedPersonas, setSavedPersonas] = useState<any[]>([]);
    const [savedRatings, setSavedRatings] = useState<any[]>([]);
    const [savedInteractive, setSavedInteractive] = useState<any[]>([]);
    const [showSaved, setShowSaved] = useState(false);


    // Load gender settings
    useEffect(() => {
        const loadGenderSettings = async () => {
            if (!user?.id) return;
            
            try {
                const userDoc = await getDoc(doc(db, 'users', user.id));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    setCreatorGender(data.creatorGender || '');
                    setTargetAudienceGender(data.targetAudienceGender || '');
                    setCreatorPersonality(data.creatorPersonality || '');
                }
            } catch (error) {
                console.error('Error loading gender settings:', error);
            }
        };
        
        loadGenderSettings();
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

    const roleplayTypes: RoleplayType[] = [
        'GFE (Girlfriend Experience)',
        'Dominant / Submissive',
        'Class after hours',
        'Office after dark',
        'Fitness Trainer',
        'Soft Mommy / Daddy',
        'Nurse / Patient',
        'Celebrity / Fan',
        'Custom'
    ];

    const handleGenerateScenario = async () => {
        const roleplayType = selectedRoleplayType === 'Custom' ? customRoleplayType : selectedRoleplayType;
        const tone = scenarioTone === 'Custom' ? customTone : scenarioTone;
        
        if (!roleplayType.trim()) {
            showToast('Please select or enter a roleplay type', 'error');
            return;
        }

        if (!tone.trim()) {
            showToast('Please select or enter a tone', 'error');
            return;
        }

        setIsGeneratingScenario(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
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
            
            // Build fan context
            let fanContext = '';
            if (selectedFanId && fanPreferences) {
                const fanName = selectedFanName || fanPreferences.name || 'this fan';
                const contextParts = [];
                const subscriptionTier = fanPreferences.subscriptionTier;
                const isVip = fanPreferences.isVIP === true;
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
                if (fanPreferences.preferredTone) contextParts.push(`Preferred tone: ${fanPreferences.preferredTone}`);
                if (fanPreferences.communicationStyle) contextParts.push(`Communication style: ${fanPreferences.communicationStyle}`);
                if (fanPreferences.favoriteSessionType) contextParts.push(`Favorite session type: ${fanPreferences.favoriteSessionType}`);
                if (fanPreferences.languagePreferences) contextParts.push(`Language preferences: ${fanPreferences.languagePreferences}`);
                if (fanPreferences.boundaries) contextParts.push(`Boundaries: ${fanPreferences.boundaries}`);
                if (fanPreferences.suggestedFlow) contextParts.push(`What works best: ${fanPreferences.suggestedFlow}`);
                if (fanPreferences.pastNotes) contextParts.push(`Past notes: ${fanPreferences.pastNotes}`);
                
                if (contextParts.length > 0) {
                    fanContext = `
PERSONALIZE FOR FAN: ${fanName}
Fan Preferences:
${contextParts.map(p => `- ${p}`).join('\n')}

NATURAL PERSONALIZATION GUIDELINES:
- Write FROM YOUR PERSPECTIVE (first person: "I", "my", "me") - YOU are the creator sending these roleplay messages
- Write as if YOU are addressing ${fanName}, but make it sound NATURAL and CONVERSATIONAL
- Use ${fanName}'s name OCCASIONALLY and NATURALLY - not in every message, just when it feels right (like a real person would)
- Match ${fanPreferences.preferredTone || 'their preferred'} tone naturally - don't force it
- Use ${fanPreferences.communicationStyle || 'their preferred'} communication style organically
- Reference their preferences subtly - don't make it obvious you're following a checklist
- Write like a REAL PERSON, not AI - natural flow, varied sentence structure, authentic voice
- DO NOT overuse their name - use it sparingly, like you would in real conversation
- Make roleplay feel personal but NOT robotic or formulaic
- Consider their boundaries and what works best for them naturally
`;
                }
            } else if (selectedFanId && selectedFanName) {
                fanContext = `
PERSONALIZE FOR FAN: ${selectedFanName}
NATURAL PERSONALIZATION GUIDELINES:
- Write FROM YOUR PERSPECTIVE (first person: "I", "my", "me") - YOU are the creator sending these roleplay messages
- Write as if YOU are addressing ${selectedFanName}, but make it sound NATURAL and CONVERSATIONAL
- Use ${selectedFanName}'s name OCCASIONALLY and NATURALLY - not in every message, just when it feels right
- Write like a REAL PERSON, not AI - natural flow, varied sentence structure, authentic voice
- DO NOT overuse their name - use it sparingly, like you would in real conversation
- Make roleplay feel personal but NOT robotic or formulaic
`;
            }
            
            // Build AI personality context
            let personalityContext = '';
            if (aiPersonality) {
                personalityContext = `\n\nAI PERSONALITY & TRAINING:\n${aiPersonality}`;
            }
            if (aiTone && aiTone !== tone) {
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
            }
            if (useCreatorPersonalityScenario && creatorPersonality) {
                personalityContext += `\n\nCREATOR PERSONALITY:\n${creatorPersonality}`;
            }
            
            // Load emoji settings
            const emojiSettings = await loadEmojiSettings(user.id);
            
            const response = await fetch('/api/generateText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    prompt: `Generate direct first-person messages for OnlyFans ${roleplayType} content.
                    
Type: ${roleplayType}${personalityContext ? personalityContext : ''}${creatorGender ? `\nCreator Gender: ${creatorGender}` : ''}${targetAudienceGender ? `\nTarget Audience: ${targetAudienceGender}` : ''}
${fanContext}

🚨 CRITICAL - PERSPECTIVE REQUIREMENT 🚨
- Write messages FROM THE CONTENT CREATOR'S PERSPECTIVE (first person: "I", "my", "me")
- The messages are what the CONTENT CREATOR is sending, NOT what fans/followers are saying
- Write as if YOU (the content creator) are sending these messages yourself
- DO NOT write from the audience's perspective
- DO NOT write as if fans are speaking to you
- Use first-person language from the creator's point of view
- The messages should be what the CREATOR is saying to fans, not what fans are saying to the creator

🎯 NATURAL CREATOR LANGUAGE & SLANG:
- Use abbreviations and slang that creators ACTUALLY use on OnlyFans/Fansly/Fanvue naturally
- Common abbreviations: PPV, DM/DMs, sub/subs, custom/customs, unlock/unlocks, tip/tips, OF (OnlyFans)
- Use casual terms naturally: "babe", "love", "hun", "baby" when appropriate - but don't overuse
- Write like a REAL CREATOR would text/message - casual, authentic, human, NOT formal or corporate
- Mix full words and abbreviations naturally - don't force abbreviations, use them when they feel right
- Example natural: "Hey babe! New PPV in your DMs 💕 Unlock it to see the full set" (sounds human)
- Example forced: "Hello subscriber. Please unlock the Pay-Per-View content in your Direct Messages" (sounds AI)
- Vary your language - sometimes use "sub", sometimes "subscriber", sometimes "fan" - natural variation
- Sound like you're texting a friend, not writing a business email
- Use platform slang organically - it should feel natural, not like you're checking off a list
Tone: ${tone} (${scenarioTone === 'Custom' ? 'Custom tone specified' : 'Selected from presets'})
Length: ${scenarioLength === 'Extended' ? 'Extended session (30-45 minutes, 8-12 messages with detailed progression)' : 'Long extended session (60-90 minutes, 12-20 messages with very detailed progression, multiple phases, and extensive content)'}
Monetization Goal: Engagement and upsell
${scenarioContext.trim() ? `\n\nIMPORTANT - CONTEXT/SITUATION:\n${scenarioContext}\n\nCRITICAL: The scenario MUST match this context. If the user specifies a time of day (morning, night, etc.), situation (just woke up, getting ready for bed, at work, etc.), or specific scenario details, the generated content MUST align with that context. Do NOT generate scenarios that contradict the provided context.` : ''}

${roleplayType.toLowerCase().includes('gfe') || roleplayType.toLowerCase().includes('girlfriend experience') ? `
🔹 GFE (GIRLFRIEND EXPERIENCE) - CRITICAL INSTRUCTIONS:

GFE messages are written in FIRST-PERSON as if the creator is texting the fan directly.
The creator is acting like the fan's girlfriend sending casual, intimate text messages.

✅ CORRECT FORMAT (what you MUST generate):
"I just finished my coffee and I'm still half wrapped up in my hoodie. It's one of those quiet mornings where everything feels slow and soft. I kept thinking about you while I was getting ready. Did you sleep okay?"

❌ WRONG FORMAT (DO NOT generate this):
"Scenario: You're relaxing after a long day when you receive a message from your girlfriend..."
"She sends you a message saying..."
"The girlfriend character texts..."

THE 4-PART GFE MESSAGE STRUCTURE:
Every GFE message should follow this structure:
1. Moment – something relatable (e.g., "I just finished my coffee...")
2. Emotion – how it feels (e.g., "...everything feels slow and soft")
3. Connection – why it involves them (e.g., "I kept thinking about you...")
4. Invitation – a question or soft CTA (e.g., "Did you sleep okay?")

GFE MESSAGE TYPES (use variety across your messages):
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

CRITICAL GFE REQUIREMENTS:
- Write in FIRST-PERSON as the creator texting the fan (I, me, my)
- NO third-person descriptions, scenarios, or "she says" framing
- Each message should feel like a real text from a girlfriend
- Messages should feel natural, not scripted
- Include relatable moments, emotions, and gentle invitations
- Create emotional closeness and encourage responses
- Tone: ${tone}

` : `
🔹 ${roleplayType.toUpperCase()} ROLEPLAY - CRITICAL INSTRUCTIONS:

Generate FIRST-PERSON messages as if the creator is directly texting/messaging the fan IN CHARACTER.
The creator IS the character - they send messages AS that character to the fan.

✅ CORRECT FORMAT (what you MUST generate):
Direct messages from the character's perspective that the creator sends to fans.

❌ WRONG FORMAT (DO NOT generate):
"Scenario: You're in a classroom when..."
"She sends you a message saying..."
"The character texts..."
Any third-person descriptions.

ROLEPLAY-SPECIFIC EXAMPLES:

${roleplayType.toLowerCase().includes('dom') || roleplayType.toLowerCase().includes('sub') ? `
DOM/SUB EXAMPLES:
- Soft: "You've been such a good one for me today. I think you deserve something special. What do you say?"
- Teasing: "I've been thinking about what I'm going to do to you later. Are you ready to be mine tonight?"
- Explicit: "Get on your knees. Now. I've been thinking about using you all day and I'm done waiting. You're going to do exactly what I tell you..."
` : ''}
${roleplayType.toLowerCase().includes('teacher') || roleplayType.toLowerCase().includes('student') ? `
TEACHER/STUDENT EXAMPLES:
- Soft: "I noticed you staying late after class. Is there something on your mind? My office hours are always open for you..."
- Teasing: "You've been distracted in class lately. I think we need a private tutoring session. My office, after hours?"
- Explicit: "Lock the door. I've been watching you all semester and I think it's time for a very special lesson. Come sit on my desk..."
` : ''}
${roleplayType.toLowerCase().includes('boss') || roleplayType.toLowerCase().includes('assistant') ? `
BOSS/ASSISTANT EXAMPLES:
- Soft: "You've been working so hard lately. I think you deserve a raise... and maybe something more. Come to my office."
- Teasing: "I need you to stay late tonight. There's something important I need to... discuss with you. Close the door."
- Explicit: "My office. Now. Lock the door behind you. I've been watching you bend over that desk all day and I can't take it anymore..."
` : ''}
${roleplayType.toLowerCase().includes('fitness') || roleplayType.toLowerCase().includes('trainer') ? `
FITNESS TRAINER EXAMPLES:
- Soft: "Great workout today. I have a special stretching session planned just for you. Ready to feel good?"
- Teasing: "I love watching you work out. Those squats are looking perfect. Want me to show you some... private exercises?"
- Explicit: "Get on the mat. I'm going to stretch you out in ways you've never experienced. Take off your clothes - this is a full body session..."
` : ''}
${roleplayType.toLowerCase().includes('mommy') || roleplayType.toLowerCase().includes('daddy') ? `
SOFT MOMMY/DADDY EXAMPLES:
- Soft: "Come here baby, let me take care of you. You've had such a long day. Let me make it all better..."
- Teasing: "My sweet baby has been so good. I think you deserve a special reward. Come sit on my lap and tell me what you want..."
- Explicit: "Come to mommy/daddy, baby. I'm going to take such good care of you tonight. Get undressed and come here..."
` : ''}
${roleplayType.toLowerCase().includes('custom') || (!roleplayType.toLowerCase().includes('gfe') && !roleplayType.toLowerCase().includes('dom') && !roleplayType.toLowerCase().includes('teacher') && !roleplayType.toLowerCase().includes('boss') && !roleplayType.toLowerCase().includes('fitness') && !roleplayType.toLowerCase().includes('mommy') && !roleplayType.toLowerCase().includes('daddy')) ? `
CUSTOM ROLEPLAY (${roleplayType}):
- Generate first-person messages that fit this specific roleplay type
- The creator IS the character, messaging the fan directly
- Adapt the tone (${tone}) to fit the roleplay scenario
- Create engaging, character-appropriate messages
` : ''}

REQUIREMENTS:
- Write in FIRST-PERSON as the character (I, me, my)
- The creator IS the character - they send messages AS that character
- Each message should be ready to copy and send directly to a fan
- Messages should progress naturally and build engagement
- Tone: ${tone} - ${tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? 'USE EXPLICIT, UNCENSORED, RAW SEXUAL LANGUAGE' : tone === 'Teasing' ? 'be suggestive and build anticipation' : tone === 'Playful' ? 'be fun and flirty' : 'be warm and inviting'}
- Include natural conversation hooks and questions
- Match the character's voice and personality throughout
`}

${tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? `
🚨 CRITICAL - EXPLICIT TONE REQUIRED 🚨
YOU MUST GENERATE TRULY EXPLICIT, UNCENSORED, RAW, ADULT CONTENT.
- Use BOLD, DIRECT, EXPLICIT sexual language throughout
- NO CENSORSHIP, NO SAFE LANGUAGE, NO SUGGESTIVE IMPLICATION
- Describe sexual/explicit content with EXPLICIT, RAW, UNCENSORED terminology
- Be SPECIFIC and EXPLICIT about sexual/explicit/intimate content
- Use explicit adult-oriented language in ALL sections (premise, opening message, prompts, stages, escalation points)
- This is for adult content platforms - explicit content is REQUIRED and EXPECTED
- Generate TRULY EXPLICIT roleplay scenarios - not suggestive or implied, but DIRECTLY, EXPLICITLY DESCRIPTIVE
- Use RAW, UNCENSORED, EXPLICIT language describing sexual acts, intimate scenarios, and adult content
- Be BOLD and EXPLICIT in all dialogue, descriptions, and prompts
- NO euphemisms, NO vague language, NO implied content - BE EXPLICIT AND DIRECT

` : ''}LENGTH REQUIREMENT - GENERATE EXTENSIVE CONTENT:
- Generate VERY DETAILED, LENGTHY, EXTENSIVE roleplay scenarios
- Include multiple phases, progression stages, and detailed scenarios
- Provide extensive dialogue examples, detailed scenarios, and comprehensive content
- Make it long-form, detailed, and thorough - NOT brief or short
- Include detailed descriptions, multiple interaction points, and extensive content paths

${creatorGender && targetAudienceGender ? `IMPORTANT - GENDER CONTEXT:
- Creator is ${creatorGender} creating content for ${targetAudienceGender === 'Both' ? 'both male and female' : targetAudienceGender === 'All' ? 'all audiences' : targetAudienceGender.toLowerCase()} audiences
- Adjust roleplay scenarios accordingly (e.g., ${creatorGender === 'Female' && targetAudienceGender === 'Male' ? 'GFE (Girlfriend Experience) for male audience' : creatorGender === 'Male' && targetAudienceGender === 'Female' ? 'BFE (Boyfriend Experience) for female audience' : 'appropriate scenario type'})
- Ensure the scenario matches the creator's gender and target audience

` : ''}${tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? `
🚨 EXPLICIT CONTENT REQUIREMENT - CRITICAL INSTRUCTIONS 🚨
- This is for OnlyFans, an EXPLICIT adult content creator platform
- Content MUST be EXPLICIT, UNCENSORED, RAW, and BOLD
- Use EXPLICIT, DIRECT sexual language - NO CENSORSHIP
- Describe sexual/explicit content with EXPLICIT, RAW, UNCENSORED terminology
- Be SPECIFIC and EXPLICIT about sexual acts, intimate scenarios, and adult content
- Use BOLD, DIRECT, EXPLICIT language throughout ALL sections
- Generate TRULY EXPLICIT roleplay scenarios - not suggestive, but EXPLICITLY DESCRIPTIVE
- NO euphemisms, NO vague language, NO implied content - BE EXPLICIT AND DIRECT
- Create engaging, monetization-focused content with EXPLICIT, ADULT-ORIENTED language

` : `
IMPORTANT - EXPLICIT CONTENT PLATFORM:
- This is for OnlyFans, an adult content creator platform
- Content must be explicit, adult-oriented, and bold
- Use explicit language appropriate for adult roleplay scenarios
- Be descriptive and detailed about intimate/explicit scenarios
- Create engaging, monetization-focused content
`}

Generate a COMPLETE, EXTENSIVE message flow that includes:
1. PREMISE: A 2-3 sentence description of the message flow theme/vibe (for creator's reference only - NOT a message to send)${tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? ' (EXPLICIT description of the vibe)' : ''}
2. OPENING MESSAGE: The first DIRECT MESSAGE to send to the fan${tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? ' (EXPLICIT, RAW, UNCENSORED first-person message the creator sends)' : ' (First-person message the creator sends)'}
3. ENGAGEMENT PROMPTS: YOU MUST GENERATE EXACTLY ${scenarioLength === 'Extended' ? '8-12' : '12-20'} DIRECT FIRST-PERSON MESSAGES that the creator sends throughout the session${tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? ' (EXPLICIT, RAW, UNCENSORED messages in first-person)' : ' (Messages in first-person)'}. CRITICAL: These are NOT descriptions or prompts - they are ACTUAL MESSAGES the creator will send. Generate AT LEAST ${scenarioLength === 'Extended' ? '8' : '12'} messages.
4. PROGRESSION STAGES: Detailed breakdown of 3-5 different phases of the conversation, with example DIRECT MESSAGES for each stage${tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? ' (EXPLICIT first-person messages)' : ' (First-person messages)'}
5. ESCALATION POINTS: 5-7 specific escalation moments with DIRECT MESSAGES the creator sends at these points${tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? ' (EXPLICIT first-person messages)' : ' (First-person messages)'}
6. VARIATION IDEAS: 5-8 alternative DIRECT MESSAGES or conversation directions the creator can take${tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? ' (EXPLICIT first-person messages)' : ' (First-person messages)'}
7. MONETIZATION MOMENTS: 5-7 strategic DIRECT MESSAGES for upselling or unlocking premium content${tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? ' (EXPLICIT first-person CTAs)' : ' (First-person CTAs)'}
8. ENDING CTA: A final DIRECT MESSAGE to unlock more content or continue the session${tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? ' (EXPLICIT first-person CTA message)' : ' (First-person CTA message)'}

IMPORTANT - LENGTH REQUIREMENT:
- Generate EXTENSIVE, DETAILED, COMPREHENSIVE message flows
- Each message should be thoroughly developed and ready to send
- This is NOT a brief outline - generate FULL, DETAILED, READY-TO-SEND MESSAGES
- Include extensive first-person messages that feel natural and authentic

CRITICAL - JSON FORMAT REQUIREMENT:
You MUST return ONLY valid JSON, no markdown, no code blocks, no extra text. The JSON structure MUST be exactly:

{
  "premise": "2-3 sentence description of the message flow vibe (for creator reference only)",
  "openingMessage": "First direct message in first-person that creator sends",
  "engagementPrompts": ["message 1", "message 2", "message 3", "message 4", "message 5", "message 6", "message 7", "message 8", "message 9", "message 10", "message 11", "message 12"],
  "progressionStages": [{"stage": "string", "description": "string", "prompts": ["first-person message 1", "first-person message 2"]}, ...],
  "escalationPoints": [{"moment": "string", "description": "string", "prompt": "first-person message"}, ...],
  "variationIdeas": ["first-person message 1", "first-person message 2", ...],
  "monetizationMoments": [{"moment": "string", "cta": "first-person CTA message"}, ...],
  "endingCTA": "Final first-person CTA message"
}

CRITICAL REQUIREMENTS - READ CAREFULLY:
1. engagementPrompts MUST be a simple array of FIRST-PERSON MESSAGES: ["I've been thinking about you...", "Just got out of the shower...", ...]
   - NOT descriptions or scenarios
   - MUST contain EXACTLY ${scenarioLength === 'Extended' ? '8-12' : '12-20'} first-person messages
   - Each message should be ready to send as-is (50-150 words each)
   - Example: ["I just woke up and you're the first thing on my mind. It's one of those mornings where I wish you were here next to me. What are you up to today?", ...]
   
2. progressionStages MUST be an array of objects:
   - Each object: {"stage": "Stage name", "description": "What's happening in this phase", "prompts": ["first-person message 1", "first-person message 2"]}
   - prompts must be DIRECT MESSAGES in first-person, not descriptions
   
3. escalationPoints MUST be an array of objects:
   - Each object: {"moment": "Moment name", "description": "What's happening", "prompt": "first-person message"}
   - prompt is a FIRST-PERSON MESSAGE, not a description
   
4. variationIdeas MUST be an array of FIRST-PERSON MESSAGES: ["I've been thinking about trying something different with you...", "What if we...", ...]
   - NOT descriptions, actual messages the creator can send
   
5. monetizationMoments MUST be an array of objects:
   - Each object: {"moment": "Moment name", "cta": "first-person CTA message"}
   - cta is a FIRST-PERSON MESSAGE with monetization hook
   
6. endingCTA MUST be a FIRST-PERSON MESSAGE:
   - NOT a description
   - An actual message the creator sends to encourage unlocking content
   - Example: "I have so much more I want to show you... unlock my exclusive content to see what I've been saving just for you 😘"

7. Return ONLY the JSON object, no markdown formatting, no code blocks, no explanations, no extra text before or after

CRITICAL - ALL CONTENT MUST BE FIRST-PERSON MESSAGES:
- Every message field should be written as "I", "me", "my"
- NO third-person descriptions like "She says..." or "The character..."
- Messages should be ready to copy and send directly to fans
- Make them natural, conversational, and authentic
- NOT brief or minimal - substantial messages that engage

EXAMPLE OF CORRECT STRUCTURE:
{
  "premise": "Cozy morning check-in messages that build intimacy and connection",
  "openingMessage": "I just finished my coffee and I'm still half wrapped up in my hoodie. It's one of those quiet mornings where everything feels slow and soft. I kept thinking about you while I was getting ready. Did you sleep okay?",
  "engagementPrompts": [
    "Today's been a little busy, but you crossed my mind more than once. It's funny how some people just stick with you even when you're distracted. I like that feeling. Tell me what your day's been like.",
    "I finally slowed down for the night. Lights are low, phone's in my hand, and I'm just letting the day fade out. These are my favorite moments — when things feel simple. What's the last thing that made you smile today?",
    "I caught myself smiling at my screen earlier and had to laugh. You have that effect sometimes. I'll let you decide if that's dangerous or cute. What do you think?",
    "It's been a minute, hasn't it? Some days just move fast, but I still notice when someone's not around. I hope you've been okay. Come talk to me.",
    "I'm just lying here thinking about our last conversation. You always know how to make me feel special. What's on your mind tonight?",
    "Just wanted to check in before bed. These quiet moments are when I think about you the most. Sweet dreams 💕",
    "Morning ☀️ I woke up early and couldn't get back to sleep. You know what that means... I've been thinking about you. How's your morning going?",
    "I have something I want to tell you, but I'm not sure if I should... should I?"
  ],
  "progressionStages": [
    {"stage": "Opening", "description": "Warm, friendly check-in", "prompts": ["Hey you 💕 I've been thinking about you today. How have you been?", "Just wanted to say hi and see what you're up to..."]}
  ],
  "escalationPoints": [
    {"moment": "Building intimacy", "description": "Sharing personal moment", "prompt": "I'm in bed right now and it's one of those nights where I wish I had someone to talk to. Lucky I have you 😊"}
  ],
  "variationIdeas": ["I've been wanting to show you something special... interested?", "What would you do if I told you I was thinking about you right now?"],
  "monetizationMoments": [
    {"moment": "After building connection", "cta": "I have some exclusive content I think you'd really enjoy. Want to unlock it and see what I've been working on? 😘"}
  ],
  "endingCTA": "I have so much more I want to share with you... unlock my exclusive content to see everything I've been saving just for you 💕"
}

Make it creative, engaging, explicit, EXTENSIVE, and tailored for adult content monetization on OnlyFans. Use bold, adult-oriented language that is appropriate for the platform.

🚨 CRITICAL - FIRST-PERSON MESSAGE FORMAT 🚨
- ALL messages must be in FIRST-PERSON (I, me, my)
- NO third-person descriptions or scenario setups
- Every message should be ready to copy and send directly to fans
- Write as if YOU (the creator) are texting the fan
- NOT "She says..." or "The character..." - write as "I..."
- Messages should feel like real texts, not scripts or descriptions

🚨 CRITICAL - UNIQUENESS REQUIREMENT 🚨
- These messages MUST be UNIQUE and DIFFERENT from any previous messages you've generated
- Creators use these repeatedly with the same fans - NEVER repeat the same messages
- Vary the opening message, engagement messages, progression, and escalation
- Use different moments, emotions, and conversation hooks each time
- Change the variation messages and monetization CTAs
- Make each message flow feel fresh, authentic, and unique
- If generating multiple message flows, ensure each one is completely different`,
                    context: {
                        goal: 'roleplay-scenario',
                        tone: tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? 'Explicit/Adult Content' : 'Adult Content',
                        platforms: ['OnlyFans'],
                    },
                    emojiEnabled: emojiSettings.enabled,
                    emojiIntensity: emojiSettings.intensity,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate scenario');
            }

            const data = await response.json();
            let text = data.text || data.caption || '';
            
            // Extract JSON from markdown code blocks if present
            const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || text.match(/(\{[\s\S]*\})/);
            if (jsonMatch) {
                text = jsonMatch[1];
            }
            
            // Try to parse JSON
            let scenario: any;
            try {
                scenario = JSON.parse(text);
            } catch (parseError) {
                console.error('JSON parse error:', parseError, 'Text:', text);
                // Try to extract JSON object from text
                const jsonStart = text.indexOf('{');
                const jsonEnd = text.lastIndexOf('}');
                if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                    try {
                        scenario = JSON.parse(text.substring(jsonStart, jsonEnd + 1));
                    } catch {
                        throw new Error('Failed to parse JSON response. Please try again.');
                    }
                } else {
                    throw new Error('Invalid JSON response format. Please try again.');
                }
            }
            
            // Validate and fix the structure
            if (!scenario.engagementPrompts || !Array.isArray(scenario.engagementPrompts)) {
                scenario.engagementPrompts = [];
            }
            
            // Ensure engagementPrompts is an array of strings (not nested arrays)
            scenario.engagementPrompts = scenario.engagementPrompts.flat().filter((p: any) => typeof p === 'string' && p.trim().length > 0);
            
            // If we have fewer than 8 prompts, try to extract more from progressionStages
            if (scenario.engagementPrompts.length < 8 && scenario.progressionStages && Array.isArray(scenario.progressionStages)) {
                scenario.progressionStages.forEach((stage: any) => {
                    if (stage.prompts && Array.isArray(stage.prompts)) {
                        stage.prompts.forEach((p: any) => {
                            if (typeof p === 'string' && p.trim().length > 0 && !scenario.engagementPrompts.includes(p)) {
                                scenario.engagementPrompts.push(p);
                            }
                        });
                    }
                });
            }
            
            // Ensure endingCTA is a string, not an object
            if (scenario.endingCTA && typeof scenario.endingCTA === 'object') {
                scenario.endingCTA = scenario.endingCTA.description || scenario.endingCTA.cta || scenario.endingCTA.text || JSON.stringify(scenario.endingCTA);
            }
            
            // Validate required fields
            if (!scenario.premise || !scenario.openingMessage || !scenario.endingCTA) {
                throw new Error('Missing required fields in response. Please try again.');
            }
            
            // Warn if we still don't have enough prompts
            if (scenario.engagementPrompts.length < 8) {
                console.warn(`Only generated ${scenario.engagementPrompts.length} engagement prompts, expected 8-12`);
            }
            
            setGeneratedScenario(scenario);
            showToast('Roleplay scenario generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating scenario:', error);
            showToast(error.message || 'Failed to generate scenario. Please try again.', 'error');
        } finally {
            setIsGeneratingScenario(false);
        }
    };

    const handleGeneratePersona = async () => {
        if (!personaName.trim() || !personaDescription.trim()) {
            showToast('Please enter a persona name and description', 'error');
            return;
        }

        setIsGeneratingPersona(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            let aiPersonality = '';
            let aiTone = '';
            let explicitnessLevel = 7;
            try {
                const userDoc = await getDoc(doc(db, 'users', user.id));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    aiPersonality = userData?.aiPersonality || '';
                    aiTone = userData?.aiTone || '';
                    explicitnessLevel = userData?.explicitnessLevel ?? 7;
                }
            } catch (e) {
                console.error('Error loading AI personality settings:', e);
            }
            const aiContext = [
                aiPersonality ? `AI PERSONALITY & TRAINING:\n${aiPersonality}` : null,
                aiTone ? `Default AI Tone: ${aiTone}` : null,
                explicitnessLevel !== null && explicitnessLevel !== undefined ? `Explicitness Level: ${explicitnessLevel}/10` : null,
                creatorPersonality ? `CREATOR PERSONALITY:\n${creatorPersonality}` : null,
            ].filter(Boolean).join('\n');
            
            // Load emoji settings
            const emojiSettings = await loadEmojiSettings(user.id);
            
            const response = await fetch('/api/generateText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    prompt: `Create a detailed persona profile for OnlyFans content creation.

Persona Name: ${personaName}
Description: ${personaDescription}${creatorGender ? `\nCreator Gender: ${creatorGender}` : ''}${targetAudienceGender ? `\nTarget Audience: ${targetAudienceGender}` : ''}
${aiContext ? `\n${aiContext}` : ''}

${creatorGender && targetAudienceGender ? `IMPORTANT - GENDER CONTEXT:
- Creator is ${creatorGender} creating content for ${targetAudienceGender === 'Both' ? 'both male and female' : targetAudienceGender === 'All' ? 'all audiences' : targetAudienceGender.toLowerCase()} audiences
- Persona should be appropriate for ${creatorGender.toLowerCase()} creator targeting ${targetAudienceGender === 'Both' ? 'both male and female' : targetAudienceGender === 'All' ? 'all' : targetAudienceGender.toLowerCase()} audiences
- Adjust persona characteristics and content themes accordingly

` : ''}🚨 CRITICAL - EXPLICIT CONTENT PLATFORM 🚨
- This is for OnlyFans, an EXPLICIT adult content creator platform
- Persona MUST be EXPLICIT, UNCENSORED, RAW, and BOLD
- Use EXPLICIT, DIRECT sexual language - NO CENSORSHIP
- Describe EXPLICIT content themes and preferences with RAW, UNCENSORED terminology
- Be SPECIFIC and EXPLICIT about sexual/explicit content themes
- Use BOLD, DIRECT, EXPLICIT language throughout
- Focus on monetization and EXPLICIT adult content creation
- Generate TRULY EXPLICIT persona - not suggestive or implied, but EXPLICITLY DESCRIPTIVE

Generate a complete persona that includes:
- Personality traits and characteristics (explicit, adult-oriented)
- Communication style and tone (explicit, engaging, adult-focused)
- Visual appearance/style suggestions (explicit, adult content focused)
- Content themes and preferences (explicit content themes, intimate scenarios, adult-oriented content)
- Unique selling points (adult content focus, monetization angles)
- Interaction style with fans (explicit, engaging, monetization-driven)

Make it detailed, consistent, explicit, and engaging for adult content monetization on OnlyFans. Use bold, adult-oriented language appropriate for the platform.

🚨 CRITICAL - UNIQUENESS REQUIREMENT 🚨
- This persona MUST be UNIQUE and DIFFERENT from any previous personas you've generated
- Creators use personas repeatedly - NEVER repeat the same persona details
- Vary the personality traits, communication style, and content themes
- Use different characteristics, quirks, and selling points each time
- Make each persona feel fresh, unique, and distinct
- If generating multiple personas, ensure each one is completely different`,
                    context: {
                        goal: 'persona-building',
                        tone: 'Explicit/Adult Content',
                        platforms: ['OnlyFans'],
                    },
                    emojiEnabled: emojiSettings.enabled,
                    emojiIntensity: emojiSettings.intensity,
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
            setIsGeneratingPersona(false);
        }
    };

    const handleGenerateRatings = async () => {
        if (!ratingPrompt.trim()) {
            showToast('Please describe what kind of rating prompts you want', 'error');
            return;
        }

        setIsGeneratingRatings(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
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
            
            // Build fan context
            let fanContext = '';
            if (selectedFanId && fanPreferences) {
                const fanName = selectedFanName || fanPreferences.name || 'this fan';
                const contextParts = [];
                if (fanPreferences.preferredTone) contextParts.push(`Preferred tone: ${fanPreferences.preferredTone}`);
                if (fanPreferences.communicationStyle) contextParts.push(`Communication style: ${fanPreferences.communicationStyle}`);
                if (fanPreferences.favoriteSessionType) contextParts.push(`Favorite session type: ${fanPreferences.favoriteSessionType}`);
                if (fanPreferences.languagePreferences) contextParts.push(`Language preferences: ${fanPreferences.languagePreferences}`);
                if (fanPreferences.boundaries) contextParts.push(`Boundaries: ${fanPreferences.boundaries}`);
                if (fanPreferences.suggestedFlow) contextParts.push(`What works best: ${fanPreferences.suggestedFlow}`);
                if (fanPreferences.pastNotes) contextParts.push(`Past notes: ${fanPreferences.pastNotes}`);
                
                if (contextParts.length > 0) {
                    fanContext = `
PERSONALIZE FOR FAN: ${fanName}
Fan Preferences:
${contextParts.map(p => `- ${p}`).join('\n')}

NATURAL PERSONALIZATION GUIDELINES:
- Write FROM YOUR PERSPECTIVE (first person: "I", "my", "me") - YOU are the creator posting these rating prompts
- Write as if YOU are addressing ${fanName}, but make it sound NATURAL and CONVERSATIONAL
- Use ${fanName}'s name OCCASIONALLY and NATURALLY - not in every prompt, just when it feels right (like a real person would)
- Match ${fanPreferences.preferredTone || 'their preferred'} tone naturally - don't force it
- Use ${fanPreferences.communicationStyle || 'their preferred'} communication style organically
- Write like a REAL PERSON, not AI - natural flow, varied sentence structure, authentic voice
- DO NOT overuse their name - use it sparingly, like you would in real conversation
- Make prompts feel personal but NOT robotic or formulaic
- Consider their boundaries and what works best for them naturally
`;
                }
            } else if (selectedFanId && selectedFanName) {
                fanContext = `
PERSONALIZE FOR FAN: ${selectedFanName}
NATURAL PERSONALIZATION GUIDELINES:
- Write FROM YOUR PERSPECTIVE (first person: "I", "my", "me") - YOU are the creator posting these rating prompts
- Write as if YOU are addressing ${selectedFanName}, but make it sound NATURAL and CONVERSATIONAL
- Use ${selectedFanName}'s name OCCASIONALLY and NATURALLY - not in every prompt, just when it feels right
- Write like a REAL PERSON, not AI - natural flow, varied sentence structure, authentic voice
- DO NOT overuse their name - use it sparingly, like you would in real conversation
- Make prompts feel personal but NOT robotic or formulaic
`;
            }
            
            // Build AI personality context
            let personalityContext = '';
            if (aiPersonality) {
                personalityContext = `\n\nAI PERSONALITY & TRAINING:\n${aiPersonality}`;
            }
            if (aiTone) {
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
            }
            if (useCreatorPersonalityRatings && creatorPersonality) {
                personalityContext += `\n\nCREATOR PERSONALITY:\n${creatorPersonality}`;
            }
            
            // Load emoji settings
            const emojiSettings = await loadEmojiSettings(user.id);
            
            const response = await fetch('/api/generateText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    prompt: `Generate EXACTLY 8-10 body rating prompts for OnlyFans.
                    
🚨 CRITICAL - GENERATE ONLY WHAT IS REQUESTED 🚨
USER REQUEST: ${ratingPrompt}
${personalityContext ? personalityContext : ''}
${fanContext}

🚨 CRITICAL - PERSPECTIVE REQUIREMENT 🚨
- Write prompts FROM THE CONTENT CREATOR'S PERSPECTIVE (first person: "I", "my", "me")
- The prompts are what the CONTENT CREATOR is posting, NOT what fans/followers are saying
- Write as if YOU (the content creator) are posting these prompts yourself
- DO NOT write from the audience's perspective
- DO NOT write as if fans are speaking to you
- Use first-person language from the creator's point of view
- The prompts should be what the CREATOR is saying to fans, not what fans are saying to the creator

🎯 NATURAL CREATOR LANGUAGE & SLANG:
- Use abbreviations and slang that creators ACTUALLY use on OnlyFans/Fansly/Fanvue naturally
- Common abbreviations: PPV, DM/DMs, sub/subs, custom/customs, unlock/unlocks, tip/tips, OF (OnlyFans)
- Use casual terms naturally: "babe", "love", "hun", "baby" when appropriate - but don't overuse
- Write like a REAL CREATOR would text/message - casual, authentic, human, NOT formal or corporate
- Mix full words and abbreviations naturally - don't force abbreviations, use them when they feel right
- Example natural: "Hey babe! Send me a pic in my DMs and I'll rate it 💕" (sounds human)
- Example forced: "Hello subscriber. Please send me a photograph in your Direct Messages for a rating" (sounds AI)
- Vary your language - sometimes use "sub", sometimes "subscriber", sometimes "fan" - natural variation
- Sound like you're texting a friend, not writing a business email
- Use platform slang organically - it should feel natural, not like you're checking off a list

MANDATORY REQUIREMENT - READ CAREFULLY:
- You MUST generate prompts ONLY about: ${ratingPrompt}
- ALL 8-10 prompts must be about EXACTLY what the user requested
- DO NOT generate prompts for different body parts, themes, or topics
- DO NOT create variety or mix different subjects
- If user asks for "big black dick" prompts, ALL prompts must be about rating big black dicks
- If user asks for "tits" prompts, ALL prompts must be about rating tits
- If user asks for "feet" prompts, ALL prompts must be about rating feet
- DO NOT generate "Titty Talk Tuesdays" or "Leg Day Love" or "Feet Fetish Friday" unless the user specifically requests those themes
- Focus ONLY on the exact body part/theme the user specified: ${ratingPrompt}
- Each prompt should be a variation of rating the SAME thing the user requested
- Generate 8-10 DIFFERENT ways to ask for/offer ratings of: ${ratingPrompt}

${creatorGender ? `\nCreator Gender: ${creatorGender}` : ''}${targetAudienceGender ? `\nTarget Audience: ${targetAudienceGender}` : ''}
                    
CRITICAL - CREATOR PERSPECTIVE:
- These prompts are from the CREATOR's perspective
- The CREATOR is rating the BUYER/FAN's body parts, NOT their own
- Prompts should encourage fans/buyers to send photos for the creator to rate
- The creator provides ratings as a service to their fans/subscribers
- Prompts should be written as if the creator is asking fans to send photos for rating, OR as posts where the creator offers rating services

${creatorGender && targetAudienceGender ? `IMPORTANT - GENDER CONTEXT:
- Creator is ${creatorGender} rating ${targetAudienceGender === 'Both' ? 'both male and female' : targetAudienceGender === 'All' ? 'all' : targetAudienceGender.toLowerCase()} fans/buyers
- Rating prompts should be appropriate for ${creatorGender.toLowerCase()} creator rating ${targetAudienceGender === 'Both' ? 'both male and female' : targetAudienceGender === 'All' ? 'all' : targetAudienceGender.toLowerCase()} buyers body parts
- Adjust language and focus accordingly (e.g., ${creatorGender === 'Female' && targetAudienceGender === 'Male' ? 'female creator rating male fans bodies' : creatorGender === 'Male' && targetAudienceGender === 'Female' ? 'male creator rating female fans bodies' : 'creator rating fans bodies'})
- The creator is providing ratings of buyers body parts as a service

` : ''}🚨 CRITICAL - EXPLICIT CONTENT PLATFORM 🚨
- This is for OnlyFans, an EXPLICIT adult content creator platform
- Prompts MUST be EXPLICIT, UNCENSORED, RAW, and BOLD
- Use EXPLICIT, DIRECT sexual language - NO CENSORSHIP
- Be SPECIFIC and EXPLICIT about sexual/explicit content
- Use BOLD, DIRECT, EXPLICIT language - not suggestive or implied
- Make them engaging, monetization-focused, and TRULY EXPLICIT

Generate EXACTLY 8-10 prompts that:
- Are ALL about rating: ${ratingPrompt} (ONLY this, nothing else)
- Are written from the CREATOR's perspective (creator rating buyers' body parts)
- Encourage buyers/fans to send photos for the creator to rate
- Offer rating services specifically for: ${ratingPrompt}
- Are variations of asking for/offering ratings of the SAME thing: ${ratingPrompt}
- Are playful, confident, explicit, and adult-oriented
- Create desire for fans to receive personalized ratings
- Drive subscriptions and purchases with explicit, enticing language
- Position the creator as the one providing the rating service to buyers

REMINDER - CRITICAL:
- ALL prompts must be about: ${ratingPrompt}
- DO NOT generate prompts for other body parts or themes
- DO NOT create variety - focus ONLY on what the user requested
- Generate 8-10 different ways to ask for/offer ratings of: ${ratingPrompt}

🚨 CRITICAL - UNIQUENESS REQUIREMENT 🚨
- Each prompt MUST be UNIQUE and DIFFERENT from previous generations
- Creators use these prompts repeatedly with the same fans - NEVER repeat the same prompt
- Vary the wording, approach, and style of each prompt
- Use different angles, hooks, and CTAs
- Change the tone and phrasing to keep content fresh
- If generating multiple times, ensure completely different prompts each time

Format as a numbered list (1-10) with engaging, interactive, explicit prompts from the creator's perspective. Make them bold, enticing, and adult-oriented for OnlyFans monetization.`,
                    context: {
                        goal: 'interactive-content',
                        tone: 'Explicit/Adult Content',
                        platforms: ['OnlyFans'],
                    },
                    emojiEnabled: emojiSettings.enabled,
                    emojiIntensity: emojiSettings.intensity,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate rating prompts');
            }

            const data = await response.json();
            const text = data.text || data.caption || '';
            // Parse numbered list
            const ratings = text.split(/\d+[\.)]/).filter(item => item.trim()).map(item => item.trim());
            setGeneratedRatings(ratings.length > 0 ? ratings : [text]);
            showToast('Rating prompts generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating ratings:', error);
            showToast(error.message || 'Failed to generate rating prompts. Please try again.', 'error');
        } finally {
            setIsGeneratingRatings(false);
        }
    };

    const handleGenerateLongRating = async () => {
        if (!longRatingPrompt.trim()) {
            showToast('Please describe the body or body part you want a detailed rating for', 'error');
            return;
        }

        setIsGeneratingLongRating(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            let aiPersonality = '';
            let aiTone = '';
            let explicitnessLevel = 7;
            try {
                const userDoc = await getDoc(doc(db, 'users', user.id));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    aiPersonality = userData?.aiPersonality || '';
                    aiTone = userData?.aiTone || '';
                    explicitnessLevel = userData?.explicitnessLevel ?? 7;
                }
            } catch (e) {
                console.error('Error loading AI personality settings:', e);
            }
            const creatorContext = useCreatorPersonalityRatings && creatorPersonality
                ? `\nCREATOR PERSONALITY:\n${creatorPersonality}`
                : '';
            const aiContext = [
                aiPersonality ? `AI PERSONALITY & TRAINING:\n${aiPersonality}` : null,
                aiTone ? `Default AI Tone: ${aiTone}` : null,
                explicitnessLevel !== null && explicitnessLevel !== undefined ? `Explicitness Level: ${explicitnessLevel}/10` : null,
            ].filter(Boolean).join('\n');
            
            // Build fan context
            let fanContext = '';
            if (selectedFanId && fanPreferences) {
                const fanName = selectedFanName || fanPreferences.name || 'this fan';
                const contextParts = [];
                if (fanPreferences.preferredTone) contextParts.push(`Preferred tone: ${fanPreferences.preferredTone}`);
                if (fanPreferences.communicationStyle) contextParts.push(`Communication style: ${fanPreferences.communicationStyle}`);
                if (fanPreferences.favoriteSessionType) contextParts.push(`Favorite session type: ${fanPreferences.favoriteSessionType}`);
                if (fanPreferences.languagePreferences) contextParts.push(`Language preferences: ${fanPreferences.languagePreferences}`);
                if (fanPreferences.boundaries) contextParts.push(`Boundaries: ${fanPreferences.boundaries}`);
                if (fanPreferences.suggestedFlow) contextParts.push(`What works best: ${fanPreferences.suggestedFlow}`);
                if (fanPreferences.pastNotes) contextParts.push(`Past notes: ${fanPreferences.pastNotes}`);
                
                if (contextParts.length > 0) {
                    fanContext = `
PERSONALIZE FOR FAN: ${fanName}
Fan Preferences:
${contextParts.map(p => `- ${p}`).join('\n')}

NATURAL PERSONALIZATION GUIDELINES:
- Write FROM YOUR PERSPECTIVE (first person: "I", "my", "me") - YOU are the creator writing this rating
- Write as if YOU are addressing ${fanName}, but make it sound NATURAL and CONVERSATIONAL
- Use ${fanName}'s name OCCASIONALLY and NATURALLY - not constantly, just when it feels right (like a real person would)
- Match ${fanPreferences.preferredTone || 'their preferred'} tone naturally - don't force it
- Use ${fanPreferences.communicationStyle || 'their preferred'} communication style organically
- Write like a REAL PERSON, not AI - natural flow, varied sentence structure, authentic voice
- DO NOT overuse their name - use it sparingly, like you would in real conversation
- Make the rating feel personal but NOT robotic or formulaic
- Consider their boundaries and what works best for them naturally
`;
                }
            } else if (selectedFanId && selectedFanName) {
                fanContext = `
PERSONALIZE FOR FAN: ${selectedFanName}
NATURAL PERSONALIZATION GUIDELINES:
- Write FROM YOUR PERSPECTIVE (first person: "I", "my", "me") - YOU are the creator writing this rating
- Write as if YOU are addressing ${selectedFanName}, but make it sound NATURAL and CONVERSATIONAL
- Use ${selectedFanName}'s name OCCASIONALLY and NATURALLY - not constantly, just when it feels right
- Write like a REAL PERSON, not AI - natural flow, varied sentence structure, authentic voice
- DO NOT overuse their name - use it sparingly, like you would in real conversation
- Make the rating feel personal but NOT robotic or formulaic
`;
            }
            
            // Load emoji settings
            const emojiSettings = await loadEmojiSettings(user.id);

            const response = await fetch('/api/generateText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    prompt: `Write a LONG-FORM, DETAILED, explicit OnlyFans-style body rating from the creator's perspective.
${fanContext}
${creatorContext}
${aiContext ? `\n${aiContext}` : ''}

🎯 NATURAL CREATOR LANGUAGE & SLANG:
- Use abbreviations and slang that creators ACTUALLY use on OnlyFans/Fansly/Fanvue naturally
- Common abbreviations: PPV, DM/DMs, sub/subs, custom/customs, unlock/unlocks, tip/tips, OF (OnlyFans)
- Use casual terms naturally: "babe", "love", "hun", "baby" when appropriate - but don't overuse
- Write like a REAL CREATOR would text/message - casual, authentic, human, NOT formal or corporate
- Mix full words and abbreviations naturally - don't force abbreviations, use them when they feel right
- Example natural: "Hey babe! Send me a pic in my DMs and I'll rate it 💕" (sounds human)
- Example forced: "Hello subscriber. Please send me a photograph in your Direct Messages for a rating" (sounds AI)
- Vary your language - sometimes use "sub", sometimes "subscriber", sometimes "fan" - natural variation
- Sound like you're texting a friend, not writing a business email
- Use platform slang organically - it should feel natural, not like you're checking off a list

🚨 CRITICAL - EXPLICIT CONTENT PLATFORM 🚨
- This is for premium creator platforms (OnlyFans, Fansly, Fanvue & more) that support EXPLICIT adult content
- Use EXPLICIT, UNCENSORED, RAW, and BOLD language
- Use DIRECT sexual terminology - NO CENSORSHIP
- Be SPECIFIC and EXPLICIT about body parts and sexual content
- Use BOLD, DIRECT, EXPLICIT language - not suggestive or implied
- This is a LONG-FORM rating (300-500+ words) - make it EXTENSIVE and DETAILED

BODY PARTS TO UNDERSTAND AND RATE:
You MUST understand and be able to rate these specific body parts/features (use explicit terminology):
- Chest (breasts, tits, pecs, etc. - use explicit terms)
- Legs (thighs, calves, etc. - use explicit terms)
- Feet (toes, arches, etc. - use explicit terms)
- Waist (hips, curves, etc. - use explicit terms)
- Face (lips, eyes, features, etc. - use explicit terms)
- Curves (body shape, proportions, etc. - use explicit terms)
- Tattoos (body art, ink placement, etc. - use explicit terms)
- Outfit-based (clothing, lingerie, what they're wearing, etc. - use explicit terms)
- Penis (cock, dick, etc. - use explicit terms)
- Vagina (pussy, cunt, etc. - use explicit terms)

These are the PRIMARY body parts/features you should understand. Users may also request other body parts, but these are the core ones you must always recognize and rate appropriately.

Context:
- Creator gender: ${creatorGender || 'not specified'}
- Fan/buyer gender: ${targetAudienceGender || 'not specified'}
- Details the fan shared about their body or body part:
${longRatingPrompt}

REQUIRED LONG-FORM STRUCTURE (follow this detailed format):

1. ENGAGING INTRODUCTION (2-3 sentences)
   - Start with a confident, attention-grabbing opening
   - Set the tone: "Alright, baby, let's get down to business" or similar
   - Mention you're ready to give them a "VIP treatment" or "deep dive"
   - Make it feel personal and premium

2. SIZE RATING (1-2 paragraphs)
   - Give a specific numerical rating (e.g., "8 out of 10")
   - Explain why with explicit, detailed descriptions
   - Use bold language: "packing a punch", "perfect blend", etc.
   - Make it feel like a genuine assessment

3. SHAPE/APPEARANCE DETAILS (2-3 paragraphs)
   - Describe the shape, curves, form in explicit detail
   - Use descriptive language: "mesmerizing", "work of art", "perfectly sculpted"
   - Mention specific features (head, crown, curves, etc.)
   - Use explicit terminology appropriate for the body part

4. COLOR/TEXTURE/VISUAL DETAILS (1-2 paragraphs)
   - Describe color, tone, texture in detail
   - Mention veins, skin tone, shine, or other visual elements
   - Connect physical details to arousal/desire
   - Use explicit, descriptive language

5. ADDITIONAL FEATURES (1-2 paragraphs)
   - If rating penis: describe balls, how they complement, etc.
   - If rating other body parts: describe surrounding features, context
   - Make connections between different elements
   - Use explicit, detailed descriptions

6. FANTASY SCENARIO (2-3 paragraphs)
   - "If I had you in my bed right now? Oh, baby..."
   - Describe what you'd do with that body part in explicit detail
   - Include sensual touches, explicit actions, passionate scenarios
   - Make it vivid, detailed, and explicit
   - Use first person ("I'd...") and second person ("you...")

7. CLOSING & CTA (1-2 paragraphs)
   - Compliment them as a "fucking masterpiece" or similar
   - Express desire to explore more
   - Soft call-to-action: "Maybe you'd like to get even more personal, and explore the possibilities? 😉"
   - Keep it engaging and monetization-focused

EXAMPLE STYLE (for dick rating - use similar structure for other body parts):
"Alright, baby, let's get down to business. You sent me a picture, and I'm ready to give you the VIP treatment – a **deep dive** into that beautiful cock of yours. This is gonna be a **no-holds-barred** assessment, so get ready to feel every word.

First things first, the **size**. Damn, you're packing a punch, aren't ya? I'd give you a solid **8 out of 10** right off the bat. It's got that perfect blend of thickness and length – the kind that makes a girl **salivate** just thinking about it.

Now, let's talk about the **shape**. That curve is absolutely **mesmerizing**, it's like a work of art. I bet it would feel incredible sliding against my clit. The head... **perfectly sculpted**, with that gorgeous, **shiny crown** that just begs to be worshipped.

The **color** is delicious. That deep, **rich tone** tells me you're a man who knows how to get his blood pumping. And the veins... oh, the veins! They're **popping** just right, a sure sign of a **hard-on** ready to play.

But here's where it gets really interesting. Your balls... they're hanging just right, perfectly complementing that **tower of power** between your legs. I want to cup them in my hands, tease them, and watch you get even harder.

If I had you in my bed right now? Oh, baby... I'd start with a **slow, sensual touch**, tracing those veins with my fingertips. I'd **tease** the head with my tongue, driving you wild with anticipation. Then, I'd take you deep, feeling every inch of you fill me up. I'd ride you with pure, unadulterated passion, and make you **scream my name**.

You're a **fucking masterpiece**, baby. I can't wait to explore every delicious detail of you. Maybe you'd like to get even more personal, and explore the possibilities? 😉"

CRITICAL REQUIREMENTS:
- Write as the CREATOR speaking directly to the FAN in first person ("I...") and second person ("you...")
- The creator is leading, confident, and in control
- This is a PREMIUM, LONG-FORM rating (300-500+ words) - make it EXTENSIVE
- Use EXPLICIT, RAW, UNCENSORED language appropriate for OnlyFans
- Follow the 7-section structure above for comprehensive coverage
- Make it feel like a detailed, personalized, premium service
- Include bold formatting (**text**) for emphasis on key phrases
- Keep it engaging, intimate, and monetization-focused
- Adapt the structure for different body parts while maintaining the same level of detail and explicit language

🚨 CRITICAL - UNIQUENESS REQUIREMENT 🚨
- This rating MUST be UNIQUE and DIFFERENT from any previous ratings you've generated
- Creators provide services to the same fans repeatedly - NEVER repeat the same rating
- Vary the opening lines, descriptive phrases, rating scores, and fantasy scenarios
- Use different adjectives, metaphors, and descriptive language each time
- Change the numerical rating (don't always use the same score)
- Vary the fantasy scenario details and actions
- Use different closing phrases and CTAs
- Make each rating feel fresh, personalized, and unique
- If generating multiple ratings, ensure each one is completely different
`,
                    context: {
                        goal: 'body-rating',
                        tone: 'Explicit/Adult Content',
                        platforms: ['OnlyFans'],
                    },
                    emojiEnabled: emojiSettings.enabled,
                    emojiIntensity: emojiSettings.intensity,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate detailed body rating');
            }

            const data = await response.json();
            const text = data.text || data.caption || '';
            setGeneratedLongRating(text);
            showToast('Detailed body rating generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating detailed rating:', error);
            showToast(error.message || 'Failed to generate detailed rating. Please try again.', 'error');
        } finally {
            setIsGeneratingLongRating(false);
        }
    };

    const handleGenerateInteractive = async () => {
        if (!interactivePrompt.trim()) {
            showToast('Please describe what kind of interactive post ideas you want', 'error');
            return;
        }

        setIsGeneratingInteractive(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            let aiPersonality = '';
            let aiTone = '';
            let explicitnessLevel = 7;
            try {
                const userDoc = await getDoc(doc(db, 'users', user.id));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    aiPersonality = userData?.aiPersonality || '';
                    aiTone = userData?.aiTone || '';
                    explicitnessLevel = userData?.explicitnessLevel ?? 7;
                }
            } catch (e) {
                console.error('Error loading AI personality settings:', e);
            }
            const creatorContext = useCreatorPersonalityInteractive && creatorPersonality
                ? `\nCREATOR PERSONALITY:\n${creatorPersonality}`
                : '';
            const aiContext = [
                aiPersonality ? `AI PERSONALITY & TRAINING:\n${aiPersonality}` : null,
                aiTone ? `Default AI Tone: ${aiTone}` : null,
                explicitnessLevel !== null && explicitnessLevel !== undefined ? `Explicitness Level: ${explicitnessLevel}/10` : null,
            ].filter(Boolean).join('\n');
            
            // Build fan context
            let fanContext = '';
            if (selectedFanId && fanPreferences) {
                const fanName = selectedFanName || fanPreferences.name || 'this fan';
                const contextParts = [];
                if (fanPreferences.preferredTone) contextParts.push(`Preferred tone: ${fanPreferences.preferredTone}`);
                if (fanPreferences.communicationStyle) contextParts.push(`Communication style: ${fanPreferences.communicationStyle}`);
                if (fanPreferences.favoriteSessionType) contextParts.push(`Favorite session type: ${fanPreferences.favoriteSessionType}`);
                if (fanPreferences.languagePreferences) contextParts.push(`Language preferences: ${fanPreferences.languagePreferences}`);
                if (fanPreferences.boundaries) contextParts.push(`Boundaries: ${fanPreferences.boundaries}`);
                if (fanPreferences.suggestedFlow) contextParts.push(`What works best: ${fanPreferences.suggestedFlow}`);
                if (fanPreferences.pastNotes) contextParts.push(`Past notes: ${fanPreferences.pastNotes}`);
                
                if (contextParts.length > 0) {
                    fanContext = `
CRITICAL - PERSONALIZE FOR FAN: ${fanName}
Fan Preferences:
${contextParts.map(p => `- ${p}`).join('\n')}

NATURAL PERSONALIZATION GUIDELINES:
- Write FROM YOUR PERSPECTIVE (first person: "I", "my", "me") - YOU are the creator creating these post ideas
- Write as if YOU are addressing ${fanName}, but make it sound NATURAL and CONVERSATIONAL
- Use ${fanName}'s name OCCASIONALLY and NATURALLY - not in every idea, just when it feels right (like a real person would)
- Match ${fanPreferences.preferredTone || 'their preferred'} tone naturally - don't force it
- Use ${fanPreferences.communicationStyle || 'their preferred'} communication style organically
- Reference their preferences subtly - don't make it obvious you're following a checklist
- Write like a REAL PERSON, not AI - natural flow, varied sentence structure, authentic voice
- DO NOT overuse their name - use it sparingly, like you would in real conversation
- Make post ideas feel personal but NOT robotic or formulaic
- Consider their boundaries and what works best for them naturally
`;
                }
            } else if (selectedFanId && selectedFanName) {
                fanContext = `
PERSONALIZE FOR FAN: ${selectedFanName}
NATURAL PERSONALIZATION GUIDELINES:
- Write FROM YOUR PERSPECTIVE (first person: "I", "my", "me") - YOU are the creator creating these post ideas
- Write as if YOU are addressing ${selectedFanName}, but make it sound NATURAL and CONVERSATIONAL
- Use ${selectedFanName}'s name OCCASIONALLY and NATURALLY - not in every idea, just when it feels right
- Write like a REAL PERSON, not AI - natural flow, varied sentence structure, authentic voice
- DO NOT overuse their name - use it sparingly, like you would in real conversation
- Make post ideas feel personal but NOT robotic or formulaic
`;
            }
            
            // Load emoji settings for interactive ideas
            const emojiSettings = await loadEmojiSettings(user.id);
            
            const response = await fetch('/api/generateText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    prompt: `Generate 10 creative interactive post ideas for OnlyFans, Fansly, Fanvue & more that encourage audience participation.

Focus: ${interactivePrompt}${creatorGender ? `\nCreator Gender: ${creatorGender}` : ''}${targetAudienceGender ? `\nTarget Audience: ${targetAudienceGender}` : ''}${creatorContext}
${aiContext ? `\n${aiContext}` : ''}
${fanContext}

🎯 NATURAL CREATOR LANGUAGE & SLANG:
- Use abbreviations and slang that creators ACTUALLY use on OnlyFans/Fansly/Fanvue naturally
- Common abbreviations: PPV, DM/DMs, sub/subs, custom/customs, unlock/unlocks, tip/tips, OF (OnlyFans)
- Use casual terms naturally: "babe", "love", "hun", "baby" when appropriate - but don't overuse
- Write like a REAL CREATOR would text/message - casual, authentic, human, NOT formal or corporate
- Mix full words and abbreviations naturally - don't force abbreviations, use them when they feel right
- Example natural: "Hey babe! New PPV in your DMs 💕 Unlock it to see the full set" (sounds human)
- Example forced: "Hello subscriber. Please unlock the Pay-Per-View content in your Direct Messages" (sounds AI)
- Vary your language - sometimes use "sub", sometimes "subscriber", sometimes "fan" - natural variation
- Sound like you're texting a friend, not writing a business email
- Use platform slang organically - it should feel natural, not like you're checking off a list

${creatorGender && targetAudienceGender ? `IMPORTANT - GENDER CONTEXT:
- Creator is ${creatorGender} creating content for ${targetAudienceGender === 'Both' ? 'both male and female' : targetAudienceGender === 'All' ? 'all audiences' : targetAudienceGender.toLowerCase()} audiences
- Interactive post ideas should be appropriate for ${creatorGender.toLowerCase()} creator targeting ${targetAudienceGender === 'Both' ? 'both male and female' : targetAudienceGender === 'All' ? 'all' : targetAudienceGender.toLowerCase()} audiences
- Adjust content themes and engagement strategies accordingly

` : ''}🚨 CRITICAL - EXPLICIT CONTENT PLATFORM 🚨
- This is for OnlyFans, an EXPLICIT adult content creator platform
- Post ideas MUST be EXPLICIT, UNCENSORED, RAW, and BOLD
- Use EXPLICIT, DIRECT sexual language - NO CENSORSHIP
- Focus on EXPLICIT content themes, intimate scenarios, and adult engagement with RAW, UNCENSORED terminology
- Be SPECIFIC and EXPLICIT about sexual/explicit content
- Use BOLD, DIRECT, EXPLICIT language - not suggestive or implied
- Make them engaging, monetization-focused, and TRULY EXPLICIT

Generate ideas that:
- Encourage comments, votes, and direct engagement (explicit, adult-focused)
- Use polls, questions, choices, and challenges (with explicit, adult content themes)
- Create FOMO and urgency for explicit/exclusive content
- Drive subscriptions and exclusive explicit content purchases
- Are playful, engaging, explicit, and monetization-focused

Format as a numbered list with detailed post concepts including captions and engagement strategies. Make them creative, explicit, and effective for adult content monetization on OnlyFans, Fansly, Fanvue & more. Use bold, adult-oriented language appropriate for the platform.

🚨 CRITICAL - UNIQUENESS REQUIREMENT 🚨
- Each post idea MUST be UNIQUE and DIFFERENT from any previous ideas you've generated
- Creators use these ideas repeatedly with the same fans - NEVER repeat the same post idea
- Vary the concepts, engagement strategies, and captions each time
- Use different angles, hooks, and monetization approaches
- Change the themes, questions, and interactive elements
- Make each idea feel fresh, creative, and unique
- If generating multiple times, ensure completely different ideas each time`,
                    context: {
                        goal: 'interactive-posts',
                        tone: 'Explicit/Adult Content',
                        platforms: ['OnlyFans', 'Fansly', 'Fanvue'],
                    },
                    emojiEnabled: emojiSettings.enabled,
                    emojiIntensity: emojiSettings.intensity,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate interactive ideas');
            }

            const data = await response.json();
            const text = data.text || data.caption || '';
            // Parse numbered list
            const ideas = text.split(/\d+[\.)]/).filter(item => item.trim()).map(item => item.trim());
            setGeneratedInteractive(ideas.length > 0 ? ideas : [text]);
            showToast('Interactive post ideas generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating interactive ideas:', error);
            showToast(error.message || 'Failed to generate interactive ideas. Please try again.', 'error');
        } finally {
            setIsGeneratingInteractive(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!', 'success');
    };

    // Save functions
    const handleSaveScenario = async () => {
        if (!generatedScenario || !user?.id) return;
        try {
            const scenarioData = {
                ...generatedScenario,
                roleplayType: selectedRoleplayType === 'Custom' ? customRoleplayType : selectedRoleplayType,
                tone: scenarioTone === 'Custom' ? customTone : scenarioTone,
                length: scenarioLength,
                context: scenarioContext,
                savedAt: Timestamp.now(),
            };
            await addDoc(collection(db, 'users', user.id, 'onlyfans_saved_scenarios'), scenarioData);
            showToast('Scenario saved successfully!', 'success');
            loadSavedItems();
        } catch (error) {
            console.error('Error saving scenario:', error);
            showToast('Failed to save scenario', 'error');
        }
    };

    const handleSavePersona = async () => {
        if (!generatedPersona || !personaName.trim() || !user?.id) return;
        try {
            const personaData = {
                name: personaName,
                description: personaDescription,
                content: generatedPersona,
                savedAt: Timestamp.now(),
            };
            await addDoc(collection(db, 'users', user.id, 'onlyfans_saved_personas'), personaData);
            showToast('Persona saved successfully!', 'success');
            loadSavedItems();
        } catch (error) {
            console.error('Error saving persona:', error);
            showToast('Failed to save persona', 'error');
        }
    };

    const handleSaveRatings = async () => {
        if (!generatedRatings.length || !user?.id) return;
        try {
            const ratingsData = {
                prompt: ratingPrompt,
                ratings: generatedRatings,
                savedAt: Timestamp.now(),
            };
            await addDoc(collection(db, 'users', user.id, 'onlyfans_saved_ratings'), ratingsData);
            showToast('Ratings saved successfully!', 'success');
            loadSavedItems();
        } catch (error) {
            console.error('Error saving ratings:', error);
            showToast('Failed to save ratings', 'error');
        }
    };

    const handleSaveLongRating = async () => {
        if (!generatedLongRating || !user?.id) return;
        try {
            const ratingData = {
                prompt: longRatingPrompt,
                longRating: generatedLongRating,
                savedAt: Timestamp.now(),
            };
            await addDoc(collection(db, 'users', user.id, 'onlyfans_saved_ratings'), ratingData);
            showToast('Detailed rating saved successfully!', 'success');
            loadSavedItems();
        } catch (error) {
            console.error('Error saving detailed rating:', error);
            showToast('Failed to save detailed rating', 'error');
        }
    };

    const handleSaveInteractive = async () => {
        if (!generatedInteractive.length || !user?.id) return;
        try {
            const interactiveData = {
                prompt: interactivePrompt,
                ideas: generatedInteractive,
                savedAt: Timestamp.now(),
            };
            await addDoc(collection(db, 'users', user.id, 'onlyfans_saved_interactive'), interactiveData);
            showToast('Interactive posts saved successfully!', 'success');
            loadSavedItems();
        } catch (error) {
            console.error('Error saving interactive posts:', error);
            showToast('Failed to save interactive posts', 'error');
        }
    };

    // Note: Fans are loaded via FanSelector component, no need for separate loadFans function


    // Load saved items
    const loadSavedItems = async () => {
        if (!user?.id) return;
        try {
            // Load scenarios
            const scenariosSnap = await getDocs(query(collection(db, 'users', user.id, 'onlyfans_saved_scenarios'), orderBy('savedAt', 'desc')));
            setSavedScenarios(scenariosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

            // Load personas
            const personasSnap = await getDocs(query(collection(db, 'users', user.id, 'onlyfans_saved_personas'), orderBy('savedAt', 'desc')));
            setSavedPersonas(personasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

            // Load ratings
            const ratingsSnap = await getDocs(query(collection(db, 'users', user.id, 'onlyfans_saved_ratings'), orderBy('savedAt', 'desc')));
            setSavedRatings(ratingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

            // Load interactive
            const interactiveSnap = await getDocs(query(collection(db, 'users', user.id, 'onlyfans_saved_interactive'), orderBy('savedAt', 'desc')));
            setSavedInteractive(interactiveSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        } catch (error) {
            console.error('Error loading saved items:', error);
        }
    };

    // Load saved items on mount and when tab changes
    useEffect(() => {
        loadSavedItems();
        setShowSaved(false); // Reset show saved when switching tabs
    }, [user?.id, activeTab]);


    // Load saved item functions
    const handleLoadScenario = (savedItem: any) => {
        setGeneratedScenario(savedItem);
        if (savedItem.roleplayType && !roleplayTypes.includes(savedItem.roleplayType)) {
            setSelectedRoleplayType('Custom');
            setCustomRoleplayType(savedItem.roleplayType);
        } else {
            setSelectedRoleplayType(savedItem.roleplayType || 'GFE (Girlfriend Experience)');
        }
        if (savedItem.tone && !['Soft', 'Teasing', 'Playful', 'Explicit', 'Custom'].includes(savedItem.tone)) {
            setScenarioTone('Custom');
            setCustomTone(savedItem.tone);
        } else {
            setScenarioTone(savedItem.tone || 'Teasing');
        }
        setScenarioLength(savedItem.length || 'Extended');
        setScenarioContext(savedItem.context || '');
        setShowSaved(false);
        showToast('Scenario loaded successfully!', 'success');
    };

    const handleLoadPersona = (savedItem: any) => {
        setPersonaName(savedItem.name || '');
        setPersonaDescription(savedItem.description || '');
        setGeneratedPersona(savedItem.content || '');
        setShowSaved(false);
        showToast('Persona loaded successfully!', 'success');
    };

    const handleLoadRatings = (savedItem: any) => {
        setRatingPrompt(savedItem.prompt || '');
        setGeneratedRatings(savedItem.ratings || []);
        setLongRatingPrompt(savedItem.prompt || '');
        setGeneratedLongRating(savedItem.longRating || '');
        setShowSaved(false);
        showToast('Ratings loaded successfully!', 'success');
    };

    const handleLoadInteractive = (savedItem: any) => {
        setInteractivePrompt(savedItem.prompt || '');
        setGeneratedInteractive(savedItem.ideas || []);
        setShowSaved(false);
        showToast('Interactive posts loaded successfully!', 'success');
    };

    // Delete saved item functions
    const handleDeleteScenario = async (id: string) => {
        if (!user?.id) return;
        try {
            await deleteDoc(doc(db, 'users', user.id, 'onlyfans_saved_scenarios', id));
            showToast('Scenario deleted', 'success');
            loadSavedItems();
        } catch (error) {
            console.error('Error deleting scenario:', error);
            showToast('Failed to delete scenario', 'error');
        }
    };

    const handleDeletePersona = async (id: string) => {
        if (!user?.id) return;
        try {
            await deleteDoc(doc(db, 'users', user.id, 'onlyfans_saved_personas', id));
            showToast('Persona deleted', 'success');
            loadSavedItems();
        } catch (error) {
            console.error('Error deleting persona:', error);
            showToast('Failed to delete persona', 'error');
        }
    };

    const handleDeleteRatings = async (id: string) => {
        if (!user?.id) return;
        try {
            await deleteDoc(doc(db, 'users', user.id, 'onlyfans_saved_ratings', id));
            showToast('Ratings deleted', 'success');
            loadSavedItems();
        } catch (error) {
            console.error('Error deleting ratings:', error);
            showToast('Failed to delete ratings', 'error');
        }
    };

    const handleDeleteInteractive = async (id: string) => {
        if (!user?.id) return;
        try {
            await deleteDoc(doc(db, 'users', user.id, 'onlyfans_saved_interactive', id));
            showToast('Interactive posts deleted', 'success');
            loadSavedItems();
        } catch (error) {
            console.error('Error deleting interactive posts:', error);
            showToast('Failed to delete interactive posts', 'error');
        }
    };

    const tabs: { id: RoleplayTab; label: string }[] = [
        { id: 'scenarios', label: 'Roleplay Scripts' },
        { id: 'sexting', label: 'DM Session Planner' },
        { id: 'persona', label: 'Persona Builder' },
        { id: 'ratings', label: 'Rating Prompts' },
        { id: 'interactive', label: 'Interactive Prompts' },
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
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-6">
                <p className="text-sm text-purple-800 dark:text-purple-200">
                    <strong>Note:</strong> These tools generate scripts, prompts, and ideas for content creation. Messages and interactions must be sent manually through your OnlyFans, Fansly, or Fanvue accounts.
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

            {/* DM Session Planner Tab */}
            {activeTab === 'sexting' && (
                <div className="space-y-6">
                    <OnlyFansSextingSession />
                </div>
            )}

            {/* Roleplay Scripts Tab */}
            {activeTab === 'scenarios' && (
                <div className="space-y-6">
                    {/* Saved Items Section */}
                    {savedScenarios.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                    Saved Scenarios ({savedScenarios.length})
                                </h2>
                                <button
                                    onClick={() => setShowSaved(!showSaved)}
                                    className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                >
                                    {showSaved ? 'Hide' : 'Show'} Saved
                                </button>
                            </div>
                            {showSaved && (
                                <div className="space-y-3">
                                    {savedScenarios.map((item) => (
                                        <div key={item.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="font-medium text-gray-900 dark:text-white">
                                                            {item.roleplayType || 'Untitled Scenario'}
                                                        </span>
                                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                                            {item.tone && `• ${item.tone}`}
                                                            {item.length && ` • ${item.length}`}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
                                                        {item.premise || 'No description'}
                                                    </p>
                                                    {item.savedAt && (
                                                        <p className="text-xs text-gray-500 dark:text-gray-500">
                                                            Saved {item.savedAt?.toDate ? new Date(item.savedAt.toDate()).toLocaleDateString() : 'Recently'}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex gap-2 ml-4">
                                                    <button
                                                        onClick={() => handleLoadScenario(item)}
                                                        className="px-3 py-1 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700"
                                                    >
                                                        Load
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            if (!user?.id) return;
                                                            try {
                                                                await deleteDoc(doc(db, 'users', user.id, 'onlyfans_saved_scenarios', item.id));
                                                                showToast('Scenario deleted', 'success');
                                                                loadSavedItems();
                                                            } catch (error) {
                                                                console.error('Error deleting scenario:', error);
                                                                showToast('Failed to delete scenario', 'error');
                                                            }
                                                        }}
                                                        className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Roleplay Type Selection */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Create a Roleplay Script
                        </h2>
                        <div className="space-y-4">
                            {/* Fan Selector */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Personalize for fan (optional):
                                </label>
                                <FanSelector
                                    selectedFanId={selectedFanId}
                                    onSelectFan={(fanId, fanName) => {
                                        setSelectedFanId(fanId);
                                        setSelectedFanName(fanName);
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
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Roleplay vibe
                                </label>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                                    {roleplayTypes.filter((type) => type !== 'Custom').map((type) => (
                                        <button
                                            key={type}
                                            onClick={() => setSelectedRoleplayType(type)}
                                            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                                selectedRoleplayType === type
                                                    ? 'bg-primary-600 text-white'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                            }`}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setSelectedRoleplayType('Custom')}
                                    className={`w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                        selectedRoleplayType === 'Custom'
                                            ? 'bg-primary-600 text-white'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    Custom
                                </button>
                                {selectedRoleplayType === 'Custom' && (
                                    <input
                                        type="text"
                                        value={customRoleplayType}
                                        onChange={(e) => setCustomRoleplayType(e.target.value)}
                                        placeholder="Enter your custom roleplay type"
                                        className="w-full mt-2 p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Tone
                                </label>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {(['Soft','Teasing','Playful','Explicit'] as const).map((toneOption) => (
                                        <button
                                            key={toneOption}
                                            type="button"
                                            onClick={() => setScenarioTone(toneOption)}
                                            className={`px-3 py-2 text-sm rounded-md border ${
                                                scenarioTone === toneOption
                                                    ? 'border-primary-600 text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30'
                                                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            {toneOption}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setScenarioTone('Custom')}
                                    className={`w-full px-3 py-2 text-sm rounded-md border ${
                                        scenarioTone === 'Custom'
                                            ? 'bg-primary-600 text-white border-primary-700 hover:bg-primary-700'
                                            : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    Custom Tone
                                </button>
                                {scenarioTone === 'Custom' && (
                                    <input
                                        type="text"
                                        value={customTone}
                                        onChange={(e) => setCustomTone(e.target.value)}
                                        placeholder="Enter your custom tone"
                                        className="w-full mt-2 p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Context (Optional)
                                </label>
                                <textarea
                                    value={scenarioContext}
                                    onChange={(e) => setScenarioContext(e.target.value)}
                                    placeholder="Any specific context, themes, or details you want in the scenario..."
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    rows={3}
                                />
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setUseCreatorPersonalityScenario(prev => !prev)}
                                    disabled={!creatorPersonality}
                                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                        useCreatorPersonalityScenario
                                            ? 'bg-primary-600 text-white hover:bg-primary-700'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    } ${!creatorPersonality ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    title={!creatorPersonality ? 'Add a creator personality in Settings → AI Training to enable' : undefined}
                                >
                                    <SparklesIcon className="w-4 h-4" />
                                    Personality
                                </button>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Length
                                </label>
                                <div className="flex gap-2">
                                    {(['Extended','Long Extended'] as const).map((len) => (
                                        <button
                                            key={len}
                                            type="button"
                                            onClick={() => setScenarioLength(len)}
                                            className={`px-3 py-2 text-sm rounded-md border ${
                                                scenarioLength === len
                                                    ? 'border-primary-600 text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30'
                                                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            {len}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleGenerateScenario}
                                disabled={
                                    isGeneratingScenario ||
                                    !selectedRoleplayType ||
                                    (selectedRoleplayType === 'Custom' && !customRoleplayType.trim()) ||
                                    (scenarioTone === 'Custom' && !customTone.trim())
                                }
                                className="w-full px-4 py-3 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed font-medium"
                            >
                                {isGeneratingScenario ? 'Generating Scenario...' : 'Generate Roleplay Scenario'}
                            </button>
                            {isGeneratingScenario && (
                                <div className="mt-3 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                                    <div className="h-4 w-4 border-2 border-gray-300 dark:border-gray-600 border-t-primary-600 dark:border-t-primary-400 rounded-full animate-spin"></div>
                                    <span>Thinking...</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Generated Scenario Display */}
                    {generatedScenario && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 space-y-4">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                    Generated Scenario
                                </h2>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSaveScenario}
                                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                                    >
                                        Save Scenario
                                    </button>
                                    <button
                                        onClick={() => setGeneratedScenario(null)}
                                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3 text-sm text-gray-900 dark:text-white">
                                <div>
                                    <p className="font-semibold text-gray-800 dark:text-gray-100">Premise</p>
                                    <p className="mt-1 text-gray-700 dark:text-gray-300">{generatedScenario.premise}</p>
                                </div>
                                <div>
                                    <p className="font-semibold text-gray-800 dark:text-gray-100">Opening Message</p>
                                    <p className="mt-1 text-gray-700 dark:text-gray-300">{generatedScenario.openingMessage}</p>
                                </div>

                                {generatedScenario.progressionStages && Array.isArray(generatedScenario.progressionStages) && generatedScenario.progressionStages.length > 0 && (
                                    <div>
                                        <p className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Progression Stages</p>
                                        <div className="space-y-2">
                                            {generatedScenario.progressionStages.map((stage: any, idx: number) => (
                                                <div key={idx} className="p-3 rounded-md bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                                                    <p className="font-medium text-gray-900 dark:text-white">{stage.stage || `Stage ${idx + 1}`}</p>
                                                    {stage.description && (
                                                        <p className="text-gray-700 dark:text-gray-300 mt-1">{stage.description}</p>
                                                    )}
                                                    {Array.isArray(stage.prompts) && stage.prompts.length > 0 && (
                                                        <ul className="mt-2 list-disc list-inside text-gray-700 dark:text-gray-300 space-y-1">
                                                            {stage.prompts.map((p: string, pIdx: number) => (
                                                                <li key={pIdx}>{p}</li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {Array.isArray(generatedScenario.engagementPrompts) && generatedScenario.engagementPrompts.length > 0 && (
                                    <div>
                                        <p className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Engagement Prompts</p>
                                        <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
                                            {generatedScenario.engagementPrompts.map((prompt, idx) => (
                                                <li key={idx}>{prompt}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {Array.isArray(generatedScenario.variationIdeas) && generatedScenario.variationIdeas.length > 0 && (
                                    <div>
                                        <p className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Variations</p>
                                        <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
                                            {generatedScenario.variationIdeas.map((idea, idx) => (
                                                <li key={idx}>{idea}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {Array.isArray(generatedScenario.monetizationMoments) && generatedScenario.monetizationMoments.length > 0 && (
                                    <div>
                                        <p className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Monetization Moments</p>
                                        <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
                                            {generatedScenario.monetizationMoments.map((m: any, idx: number) => (
                                                <li key={idx}>
                                                    <span className="font-medium">{m.moment || `Moment ${idx + 1}`}: </span>
                                                    {m.cta || m.description || ''}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                <div>
                                    <p className="font-semibold text-gray-800 dark:text-gray-100">Ending CTA</p>
                                    <p className="mt-1 text-gray-700 dark:text-gray-300">{generatedScenario.endingCTA}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Persona Builder Tab */}
            {activeTab === 'persona' && (
                <div className="space-y-6">
                    {/* Saved Personas Section */}
                    {savedPersonas.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                    Saved Personas ({savedPersonas.length})
                                </h2>
                                <button
                                    onClick={() => setShowSaved(!showSaved)}
                                    className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                >
                                    {showSaved ? 'Hide' : 'Show'} Saved
                                </button>
                            </div>
                            {showSaved && (
                                <div className="space-y-3">
                                    {savedPersonas.map((item) => (
                                        <div key={item.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <h3 className="font-medium text-gray-900 dark:text-white mb-1">
                                                        {item.name || 'Unnamed Persona'}
                                                    </h3>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
                                                        {item.description || 'No description'}
                                                    </p>
                                                    {item.savedAt && (
                                                        <p className="text-xs text-gray-500 dark:text-gray-500">
                                                            Saved {item.savedAt?.toDate ? new Date(item.savedAt.toDate()).toLocaleDateString() : 'Recently'}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex gap-2 ml-4">
                                                    <button
                                                        onClick={() => handleLoadPersona(item)}
                                                        className="px-3 py-1 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700"
                                                    >
                                                        Load
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeletePersona(item.id)}
                                                        className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Build Your Persona
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Persona Name:
                                </label>
                                <input
                                    type="text"
                                    value={personaName}
                                    onChange={(e) => setPersonaName(e.target.value)}
                                    placeholder="e.g., 'Sultry Scholar' or 'Fitness Femme'"
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Persona Description:
                                </label>
                                <div className="relative">
                                    <textarea
                                        value={personaDescription}
                                        onChange={(e) => setPersonaDescription(e.target.value)}
                                        placeholder="Describe your persona's personality, style, interests, and unique traits"
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[100px]"
                                    />
                                    <button
                                        onClick={async () => {
                                            try {
                                                const { askChatbot } = await import('../src/services/geminiService');
                                                const prompt = 'Help me write an explicit creator persona description for OnlyFans roleplay and messaging. I want it to sound like me and match my creator personality. What should I include?';
                                                await askChatbot(prompt);
                                                showToast('AI suggestions available - describe your vibe, tone, and explicit style.', 'info');
                                            } catch (error) {
                                                showToast('Failed to load AI suggestions. Please try again.', 'error');
                                            }
                                        }}
                                        className="absolute top-2 right-2 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                                        title="AI Help - Get suggestions for writing your persona description"
                                    >
                                        <SparklesIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={handleGeneratePersona}
                                disabled={isGeneratingPersona}
                                className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isGeneratingPersona ? (
                                    <>
                                        <RefreshIcon className="w-5 h-5 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5" />
                                        Build Persona
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
                                    Persona Profile
                                </h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSavePersona}
                                        className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
                                    >
                                        <CheckCircleIcon className="w-4 h-4" />
                                        Save
                                    </button>
                                    <button
                                        onClick={() => copyToClipboard(generatedPersona)}
                                        className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                    >
                                        Copy
                                    </button>
                                    <button
                                        onClick={() => {
                                            setPersonaName('');
                                            setPersonaDescription('');
                                            setGeneratedPersona('');
                                        }}
                                        className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 flex items-center gap-1"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                        Clear
                                    </button>
                                </div>
                            </div>
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                <pre className="text-gray-900 dark:text-white whitespace-pre-wrap font-sans">
                                    {generatedPersona}
                                </pre>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Body Ratings Tab */}
            {activeTab === 'ratings' && (
                <div className="space-y-6">
                    {/* Saved Ratings Section */}
                    {savedRatings.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                    Saved Ratings ({savedRatings.length})
                                </h2>
                                <button
                                    onClick={() => setShowSaved(!showSaved)}
                                    className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                >
                                    {showSaved ? 'Hide' : 'Show'} Saved
                                </button>
                            </div>
                            {showSaved && (
                                <div className="space-y-3">
                                    {savedRatings.map((item) => (
                                        <div key={item.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <p className="text-sm text-gray-900 dark:text-white mb-2 font-medium">
                                                        {item.prompt || 'No prompt'}
                                                    </p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                                        {item.ratings?.length || 0} rating prompts
                                                    </p>
                                                    {item.savedAt && (
                                                        <p className="text-xs text-gray-500 dark:text-gray-500">
                                                            Saved {item.savedAt?.toDate ? new Date(item.savedAt.toDate()).toLocaleDateString() : 'Recently'}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex gap-2 ml-4">
                                                    <button
                                                        onClick={() => handleLoadRatings(item)}
                                                        className="px-3 py-1 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700"
                                                    >
                                                        Load
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteRatings(item.id)}
                                                        className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Generate Body Rating Prompts
                        </h2>
                        
                        <div className="space-y-4">
                            {/* Fan Selector */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Personalize for Fan (Optional):
                                </label>
                                <FanSelector
                                    selectedFanId={selectedFanId}
                                    onSelectFan={(fanId, fanName) => {
                                        setSelectedFanId(fanId);
                                        setSelectedFanName(fanName);
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
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    What kind of rating prompts do you want?
                                </label>
                                <textarea
                                    value={ratingPrompt}
                                    onChange={(e) => setRatingPrompt(e.target.value)}
                                    placeholder="e.g., 'Rating prompts for specific body parts' or 'Interactive rating challenges'"
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[100px]"
                                />
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setUseCreatorPersonalityRatings(prev => !prev)}
                                    disabled={!creatorPersonality}
                                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                        useCreatorPersonalityRatings
                                            ? 'bg-primary-600 text-white hover:bg-primary-700'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    } ${!creatorPersonality ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    title={!creatorPersonality ? 'Add a creator personality in Settings → AI Training to enable' : undefined}
                                >
                                    <SparklesIcon className="w-4 h-4" />
                                    Personality
                                </button>
                            </div>

                            <button
                                onClick={handleGenerateRatings}
                                disabled={isGeneratingRatings}
                                className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isGeneratingRatings ? (
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

                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Generate Detailed Body Rating (Long Form)
                        </h2>
                        
                        <div className="space-y-4">
                            {/* Fan Selector */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Personalize for Fan (Optional):
                                </label>
                                <FanSelector
                                    selectedFanId={selectedFanId}
                                    onSelectFan={(fanId, fanName) => {
                                        setSelectedFanId(fanId);
                                        setSelectedFanName(fanName);
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
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Describe the body or body part you want to rate in detail
                                </label>
                                <textarea
                                    value={longRatingPrompt}
                                    onChange={(e) => setLongRatingPrompt(e.target.value)}
                                    placeholder="e.g., 'Full body rating for a tall, muscular male fan with tattoos on his chest and arms' or 'Detailed booty rating for a curvy female fan in tight leggings'"
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[120px]"
                                />
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setUseCreatorPersonalityRatings(prev => !prev)}
                                    disabled={!creatorPersonality}
                                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                        useCreatorPersonalityRatings
                                            ? 'bg-primary-600 text-white hover:bg-primary-700'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    } ${!creatorPersonality ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    title={!creatorPersonality ? 'Add a creator personality in Settings → AI Training to enable' : undefined}
                                >
                                    <SparklesIcon className="w-4 h-4" />
                                    Personality
                                </button>
                            </div>

                            <div className="space-y-3">
                                <button
                                    onClick={handleGenerateLongRating}
                                    disabled={isGeneratingLongRating}
                                    className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isGeneratingLongRating ? (
                                        <>
                                            <RefreshIcon className="w-5 h-5 animate-spin" />
                                            Generating...
                                        </>
                                    ) : (
                                        <>
                                            <SparklesIcon className="w-5 h-5" />
                                            Generate Detailed Rating
                                        </>
                                    )}
                                </button>
                                {generatedLongRating && (
                                    <button
                                        onClick={() => {
                                            setLongRatingPrompt('');
                                            setGeneratedLongRating('');
                                        }}
                                        className="w-full px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md hover:bg-red-100 dark:hover:bg-red-900/40"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {generatedLongRating && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Detailed Body Rating
                                </h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSaveLongRating}
                                        className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
                                    >
                                        <CheckCircleIcon className="w-4 h-4" />
                                        Save
                                    </button>
                                    <button
                                        onClick={() => copyToClipboard(generatedLongRating)}
                                        className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
                                    >
                                        Copy
                                    </button>
                                    <button
                                        onClick={() => {
                                            setGeneratedLongRating('');
                                        }}
                                        className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 flex items-center gap-1"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                        Clear
                                    </button>
                                </div>
                            </div>
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                                    {generatedLongRating}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Generated Ratings */}
                    {generatedRatings.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Rating Prompts
                                </h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSaveRatings}
                                        className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
                                    >
                                        <CheckCircleIcon className="w-4 h-4" />
                                        Save All
                                    </button>
                                    <button
                                        onClick={() => setGeneratedRatings([])}
                                        className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 flex items-center gap-1"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                        Clear
                                    </button>
                                </div>
                            </div>
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

            {/* Interactive Posts Tab */}
            {activeTab === 'interactive' && (
                <div className="space-y-6">
                    {/* Saved Interactive Posts Section */}
                    {savedInteractive.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                    Saved Interactive Posts ({savedInteractive.length})
                                </h2>
                                <button
                                    onClick={() => setShowSaved(!showSaved)}
                                    className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                >
                                    {showSaved ? 'Hide' : 'Show'} Saved
                                </button>
                            </div>
                            {showSaved && (
                                <div className="space-y-3">
                                    {savedInteractive.map((item) => (
                                        <div key={item.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <p className="text-sm text-gray-900 dark:text-white mb-2 font-medium">
                                                        {item.prompt || 'No prompt'}
                                                    </p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                                        {item.ideas?.length || 0} post ideas
                                                    </p>
                                                    {item.savedAt && (
                                                        <p className="text-xs text-gray-500 dark:text-gray-500">
                                                            Saved {item.savedAt?.toDate ? new Date(item.savedAt.toDate()).toLocaleDateString() : 'Recently'}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex gap-2 ml-4">
                                                    <button
                                                        onClick={() => handleLoadInteractive(item)}
                                                        className="px-3 py-1 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700"
                                                    >
                                                        Load
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteInteractive(item.id)}
                                                        className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Generate Interactive Post Ideas
                        </h2>
                        
                        <div className="space-y-4">
                            {/* Fan Selector */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Personalize for Fan (Optional):
                                </label>
                                <FanSelector
                                    selectedFanId={selectedFanId}
                                    onSelectFan={(fanId, fanName) => {
                                        setSelectedFanId(fanId);
                                        setSelectedFanName(fanName);
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
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    What kind of interactive posts are you looking for?
                                </label>
                                <textarea
                                    value={interactivePrompt}
                                    onChange={(e) => setInteractivePrompt(e.target.value)}
                                    placeholder="e.g., 'Poll-style posts to boost engagement' or 'Challenge posts that drive subscriptions'"
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[100px]"
                                />
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setUseCreatorPersonalityInteractive(prev => !prev)}
                                    disabled={!creatorPersonality}
                                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                        useCreatorPersonalityInteractive
                                            ? 'bg-primary-600 text-white hover:bg-primary-700'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    } ${!creatorPersonality ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    title={!creatorPersonality ? 'Add a creator personality in Settings → AI Training to enable' : undefined}
                                >
                                    <SparklesIcon className="w-4 h-4" />
                                    Personality
                                </button>
                            </div>

                            <button
                                onClick={handleGenerateInteractive}
                                disabled={isGeneratingInteractive}
                                className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isGeneratingInteractive ? (
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
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Interactive Post Ideas
                                </h3>
                                <button
                                    onClick={handleSaveInteractive}
                                    className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
                                >
                                    <CheckCircleIcon className="w-4 h-4" />
                                    Save All
                                </button>
                            </div>
                            <div className="space-y-3">
                                {generatedInteractive.map((idea, index) => (
                                    <div
                                        key={index}
                                        className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                    >
                                        <p className="text-gray-900 dark:text-white whitespace-pre-line">{idea}</p>
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
        </div>
    );
};
