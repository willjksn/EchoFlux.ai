import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { SparklesIcon, RefreshIcon, CheckIcon, CheckCircleIcon, TrashIcon } from './icons/UIIcons';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc, collection, addDoc, getDocs, query, orderBy, deleteDoc, Timestamp } from 'firebase/firestore';

type RoleplayTab = 'scenarios' | 'persona' | 'ratings' | 'interactive';

type RoleplayType = 
    | 'GFE (Girlfriend Experience)'
    | 'Dominant / Submissive'
    | 'Teacher / Student'
    | 'Boss / Assistant'
    | 'Fitness Trainer'
    | 'Soft Mommy / Daddy'
    | 'Custom';

export const OnlyFansRoleplay: React.FC = () => {
    const { user, showToast } = useAppContext();
    const [activeTab, setActiveTab] = useState<RoleplayTab>('scenarios');
    const [isGenerating, setIsGenerating] = useState(false);
    
    // Scenario generation state
    const [selectedRoleplayType, setSelectedRoleplayType] = useState<RoleplayType>('GFE (Girlfriend Experience)');
    const [customRoleplayType, setCustomRoleplayType] = useState('');
    const [useCustomRoleplayType, setUseCustomRoleplayType] = useState(false);
    const [scenarioTone, setScenarioTone] = useState<'Soft' | 'Teasing' | 'Playful' | 'Explicit'>('Teasing');
    const [customTone, setCustomTone] = useState('');
    const [useCustomTone, setUseCustomTone] = useState(false);
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
    
    // Interactive posts state
    const [interactivePrompt, setInteractivePrompt] = useState('');
    const [generatedInteractive, setGeneratedInteractive] = useState<string[]>([]);

    // Gender settings (loaded from user settings)
    const [creatorGender, setCreatorGender] = useState('');
    const [targetAudienceGender, setTargetAudienceGender] = useState('');

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
                }
            } catch (error) {
                console.error('Error loading gender settings:', error);
            }
        };
        
        loadGenderSettings();
    }, [user?.id]);

    const roleplayTypes: RoleplayType[] = [
        'GFE (Girlfriend Experience)',
        'Dominant / Submissive',
        'Teacher / Student',
        'Boss / Assistant',
        'Fitness Trainer',
        'Soft Mommy / Daddy',
        'Custom'
    ];

    const handleGenerateScenario = async () => {
        const roleplayType = useCustomRoleplayType ? customRoleplayType : (selectedRoleplayType === 'Custom' ? customRoleplayType : selectedRoleplayType);
        const tone = useCustomTone ? customTone : scenarioTone;
        
        if (!roleplayType.trim()) {
            showToast('Please select or enter a roleplay type', 'error');
            return;
        }

        if (!tone.trim()) {
            showToast('Please select or enter a tone', 'error');
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
                    prompt: `Generate a detailed roleplay scenario for OnlyFans content creation.
                    
Type: ${roleplayType}${creatorGender ? `\nCreator Gender: ${creatorGender}` : ''}${targetAudienceGender ? `\nTarget Audience: ${targetAudienceGender}` : ''}
Tone: ${tone} (${useCustomTone ? 'Custom tone specified' : 'Selected from presets'})
Length: ${scenarioLength === 'Extended' ? 'Extended session (30-45 minutes with detailed progression)' : 'Long extended session (60-90 minutes with very detailed progression, multiple phases, and extensive content)'}
Monetization Goal: Engagement and upsell

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

Generate a COMPLETE, EXTENSIVE, DETAILED roleplay scenario that includes:
1. PREMISE: A DETAILED, COMPREHENSIVE description of the scenario setup, context, background, and setting${tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? ' (EXPLICIT, RAW, UNCENSORED, extensive, and detailed for adult content - multiple paragraphs with EXPLICIT sexual language and descriptions)' : ' (explicit, extensive, and detailed for adult content - multiple paragraphs)'}
2. OPENING MESSAGE: The first message to start the roleplay session${tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? ' (EXPLICIT, RAW, UNCENSORED, engaging, adult-oriented, detailed - should be substantial with EXPLICIT sexual language and direct adult content)' : ' (explicit, engaging, adult-oriented, detailed - should be substantial, not brief)'}
3. ENGAGEMENT PROMPTS: YOU MUST GENERATE EXACTLY 8-12 EXTENSIVE prompts for maintaining engagement throughout the session, organized by progression phases${tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? ' (EXPLICIT, RAW, UNCENSORED, adult-focused, monetization-driven, with EXPLICIT sexual descriptions and direct adult language for each phase)' : ' (explicit, adult-focused, monetization-driven, with detailed descriptions for each phase)'}. CRITICAL: Generate AT LEAST 8 prompts, ideally 10-12 prompts. Do NOT generate fewer than 8 prompts.
4. PROGRESSION STAGES: Detailed breakdown of 3-5 different stages/phases of the roleplay, with specific prompts and scenarios for each stage${tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? ' (EXPLICIT, RAW, UNCENSORED descriptions with direct sexual language)' : ''}
5. ESCALATION POINTS: 5-7 specific escalation moments or turning points in the roleplay with detailed descriptions${tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? ' (EXPLICIT, RAW, UNCENSORED descriptions of sexual escalation with direct adult language)' : ''}
6. VARIATION IDEAS: 5-8 alternative paths or variations the roleplay could take${tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? ' (EXPLICIT, RAW, UNCENSORED variations with direct sexual content)' : ''}
7. MONETIZATION MOMENTS: 5-7 strategic moments for upselling or unlocking premium content, with specific CTAs${tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? ' (EXPLICIT, RAW, UNCENSORED CTAs with direct adult language)' : ''}
8. ENDING CTA: A detailed call-to-action to unlock more content or continue the session (clear monetization focus with multiple options)${tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? ' (EXPLICIT, RAW, UNCENSORED CTA with direct adult language)' : ''}

IMPORTANT - LENGTH REQUIREMENT:
- The complete scenario should be EXTENSIVE, DETAILED, and COMPREHENSIVE
- Each section should be thoroughly developed with multiple paragraphs, detailed descriptions, and extensive content
- This is NOT a brief outline - generate a FULL, DETAILED, LENGTHY scenario guide
- Include extensive dialogue examples, detailed scenario descriptions, and comprehensive interaction paths

CRITICAL - JSON FORMAT REQUIREMENT:
You MUST return ONLY valid JSON, no markdown, no code blocks, no extra text. The JSON structure MUST be exactly:

{
  "premise": "string with EXTENSIVE detailed description (multiple paragraphs)",
  "openingMessage": "string with EXTENSIVE detailed message (substantial, not brief)",
  "engagementPrompts": ["string 1", "string 2", "string 3", "string 4", "string 5", "string 6", "string 7", "string 8", "string 9", "string 10", "string 11", "string 12"],
  "progressionStages": [{"stage": "string", "description": "string", "prompts": ["string", "string"]}, ...],
  "escalationPoints": [{"moment": "string", "description": "string", "prompt": "string"}, ...],
  "variationIdeas": ["string", "string", ...],
  "monetizationMoments": [{"moment": "string", "cta": "string"}, ...],
  "endingCTA": "string with EXTENSIVE detailed call-to-action"
}

CRITICAL REQUIREMENTS - READ CAREFULLY:
1. engagementPrompts MUST be a simple array of strings: ["prompt 1", "prompt 2", ...]
   - NOT: [{"prompts": []}] or [["prompt"]] or [] or any nested structure
   - MUST contain EXACTLY 8-12 strings, each string should be EXTENSIVE and detailed (50-200 words each)
   - Example: ["Detailed prompt about exploring desires...", "Another detailed prompt about escalating tension...", ...]
   
2. progressionStages MUST be an array of objects:
   - Each object: {"stage": "Stage name", "description": "Detailed description", "prompts": ["prompt 1", "prompt 2"]}
   - prompts inside progressionStages is separate from engagementPrompts
   
3. escalationPoints MUST be an array of objects:
   - Each object: {"moment": "Moment name", "description": "Detailed description", "prompt": "Single prompt string"}
   - prompt is a STRING, not an array
   
4. variationIdeas MUST be an array of strings: ["idea 1", "idea 2", ...]
   - NOT objects, NOT nested arrays, just strings
   
5. monetizationMoments MUST be an array of objects:
   - Each object: {"moment": "Moment name", "cta": "Call to action string"}
   - cta is a STRING, not an object
   
6. endingCTA MUST be a STRING:
   - NOT an object like {"description": "..."}
   - Just a plain string with the call-to-action text

7. Return ONLY the JSON object, no markdown formatting, no code blocks, no explanations, no extra text before or after

CRITICAL - GENERATE EXTENSIVE CONTENT:
- Each field should contain EXTENSIVE, DETAILED, LENGTHY content
- premise should be multiple paragraphs with detailed scenario setup
- openingMessage should be substantial, not brief
- engagementPrompts should include detailed descriptions, not just short prompts
- Include ALL sections with comprehensive, extensive content
- Make it a complete, thorough, detailed guide - NOT brief or minimal

EXAMPLE OF CORRECT STRUCTURE:
{
  "premise": "Detailed premise text here...",
  "openingMessage": "Detailed opening message here...",
  "engagementPrompts": [
    "First detailed engagement prompt with extensive description...",
    "Second detailed engagement prompt with extensive description...",
    "Third detailed engagement prompt with extensive description...",
    "Fourth detailed engagement prompt with extensive description...",
    "Fifth detailed engagement prompt with extensive description...",
    "Sixth detailed engagement prompt with extensive description...",
    "Seventh detailed engagement prompt with extensive description...",
    "Eighth detailed engagement prompt with extensive description...",
    "Ninth detailed engagement prompt with extensive description...",
    "Tenth detailed engagement prompt with extensive description..."
  ],
  "progressionStages": [
    {"stage": "Stage 1", "description": "Description", "prompts": ["prompt 1", "prompt 2"]}
  ],
  "escalationPoints": [
    {"moment": "Moment 1", "description": "Description", "prompt": "Prompt text"}
  ],
  "variationIdeas": ["Idea 1", "Idea 2"],
  "monetizationMoments": [
    {"moment": "Moment 1", "cta": "CTA text"}
  ],
  "endingCTA": "Detailed ending CTA text here..."
}

Make it creative, engaging, explicit, EXTENSIVE, and tailored for adult content monetization on OnlyFans. Use bold, adult-oriented language that is appropriate for the platform.`,
                    context: {
                        goal: 'roleplay-scenario',
                        tone: tone === 'Explicit' || tone.toLowerCase().includes('explicit') ? 'Explicit/Adult Content' : 'Adult Content',
                        platforms: ['OnlyFans'],
                    },
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
            setIsGenerating(false);
        }
    };

    const handleGeneratePersona = async () => {
        if (!personaName.trim() || !personaDescription.trim()) {
            showToast('Please enter a persona name and description', 'error');
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
                    prompt: `Create a detailed persona profile for OnlyFans content creation.

Persona Name: ${personaName}
Description: ${personaDescription}${creatorGender ? `\nCreator Gender: ${creatorGender}` : ''}${targetAudienceGender ? `\nTarget Audience: ${targetAudienceGender}` : ''}

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

Make it detailed, consistent, explicit, and engaging for adult content monetization on OnlyFans. Use bold, adult-oriented language appropriate for the platform.`,
                    context: {
                        goal: 'persona-building',
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

    const handleGenerateRatings = async () => {
        if (!ratingPrompt.trim()) {
            showToast('Please describe what kind of rating prompts you want', 'error');
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
                    prompt: `Generate 8-10 creative body rating prompts and interactive post ideas for OnlyFans.
                    
Focus: ${ratingPrompt}${creatorGender ? `\nCreator Gender: ${creatorGender}` : ''}${targetAudienceGender ? `\nTarget Audience: ${targetAudienceGender}` : ''}
                    
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
- Focus on EXPLICIT body parts, intimate content, and adult themes with RAW, UNCENSORED terminology
- Be SPECIFIC and EXPLICIT about sexual/explicit content
- Use BOLD, DIRECT, EXPLICIT language - not suggestive or implied
- Make them engaging, monetization-focused, and TRULY EXPLICIT

Generate prompts that:
- Are written from the CREATOR's perspective (creator rating buyers' body parts)
- Encourage buyers/fans to send photos for the creator to rate
- Offer rating services (e.g., "Send me a photo of your [body part] and I'll rate it 1-10")
- Are playful, confident, explicit, and adult-oriented
- Create desire for fans to receive personalized ratings
- Drive subscriptions and purchases with explicit, enticing language
- Include specific body parts the creator will rate (explicit, adult-focused)
- Position the creator as the one providing the rating service to buyers

Format as a numbered list with engaging, interactive, explicit prompts from the creator's perspective. Make them bold, enticing, and adult-oriented for OnlyFans monetization.`,
                    context: {
                        goal: 'interactive-content',
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
            // Parse numbered list
            const ratings = text.split(/\d+[\.)]/).filter(item => item.trim()).map(item => item.trim());
            setGeneratedRatings(ratings.length > 0 ? ratings : [text]);
            showToast('Rating prompts generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating ratings:', error);
            showToast(error.message || 'Failed to generate rating prompts. Please try again.', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerateInteractive = async () => {
        if (!interactivePrompt.trim()) {
            showToast('Please describe what kind of interactive post ideas you want', 'error');
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
                    prompt: `Generate 10 creative interactive post ideas for OnlyFans that encourage audience participation.

Focus: ${interactivePrompt}${creatorGender ? `\nCreator Gender: ${creatorGender}` : ''}${targetAudienceGender ? `\nTarget Audience: ${targetAudienceGender}` : ''}

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

Format as a numbered list with detailed post concepts including captions and engagement strategies. Make them creative, explicit, and effective for adult content monetization on OnlyFans. Use bold, adult-oriented language appropriate for the platform.`,
                    context: {
                        goal: 'interactive-posts',
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
            // Parse numbered list
            const ideas = text.split(/\d+[\.)]/).filter(item => item.trim()).map(item => item.trim());
            setGeneratedInteractive(ideas.length > 0 ? ideas : [text]);
            showToast('Interactive post ideas generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating interactive ideas:', error);
            showToast(error.message || 'Failed to generate interactive ideas. Please try again.', 'error');
        } finally {
            setIsGenerating(false);
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
                roleplayType: useCustomRoleplayType ? customRoleplayType : selectedRoleplayType,
                tone: useCustomTone ? customTone : scenarioTone,
                length: scenarioLength,
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
            setUseCustomRoleplayType(true);
            setCustomRoleplayType(savedItem.roleplayType);
        } else {
            setSelectedRoleplayType(savedItem.roleplayType || 'GFE (Girlfriend Experience)');
        }
        if (savedItem.tone && !['Soft', 'Teasing', 'Playful', 'Explicit'].includes(savedItem.tone)) {
            setUseCustomTone(true);
            setCustomTone(savedItem.tone);
        } else {
            setScenarioTone(savedItem.tone || 'Teasing');
        }
        setScenarioLength(savedItem.length || 'Extended');
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
        { id: 'scenarios', label: 'Roleplay Scenarios' },
        { id: 'persona', label: 'Persona Builder' },
        { id: 'ratings', label: 'Body Ratings' },
        { id: 'interactive', label: 'Interactive Posts' },
    ];

    return (
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <SparklesIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Roleplay & Interactive Ideas
                    </h1>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    Generate roleplay scenarios, build personas, create rating prompts, and design interactive posts for OnlyFans.
                </p>
            </div>

            {/* Important Notice */}
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-6">
                <p className="text-sm text-purple-800 dark:text-purple-200">
                    <strong>Note:</strong> These tools generate scripts, prompts, and ideas for content creation. Messages and interactions must be sent manually through your OnlyFans account.
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
                                                        onClick={() => handleDeleteScenario(item.id)}
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
                            Generate Roleplay Scenario
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Roleplay Type:
                                </label>
                                <div className="flex items-center gap-2 mb-2">
                                    <input
                                        type="checkbox"
                                        id="useCustomRoleplay"
                                        checked={useCustomRoleplayType}
                                        onChange={(e) => {
                                            setUseCustomRoleplayType(e.target.checked);
                                            if (!e.target.checked) {
                                                setCustomRoleplayType('');
                                            }
                                        }}
                                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                                    />
                                    <label htmlFor="useCustomRoleplay" className="text-sm text-gray-700 dark:text-gray-300">
                                        Use custom roleplay type
                                    </label>
                                </div>
                                
                                {useCustomRoleplayType ? (
                                    <input
                                        type="text"
                                        value={customRoleplayType}
                                        onChange={(e) => setCustomRoleplayType(e.target.value)}
                                        placeholder="Enter your custom roleplay type"
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-3"
                                    />
                                ) : (
                                    <>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                                            {roleplayTypes.slice(0, -1).map((type) => (
                                                <button
                                                    key={type}
                                                    onClick={() => setSelectedRoleplayType(type)}
                                                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                                        selectedRoleplayType === type
                                                            ? 'bg-primary-600 text-white'
                                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                    }`}
                                                >
                                                    {type.split(' / ')[0]}
                                                </button>
                                            ))}
                                        </div>
                                        {selectedRoleplayType === 'Custom' && (
                                            <input
                                                type="text"
                                                value={customRoleplayType}
                                                onChange={(e) => setCustomRoleplayType(e.target.value)}
                                                placeholder="Enter custom roleplay type"
                                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-3"
                                            />
                                        )}
                                    </>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Tone:
                                </label>
                                <div className="flex items-center gap-2 mb-2">
                                    <input
                                        type="checkbox"
                                        id="useCustomTone"
                                        checked={useCustomTone}
                                        onChange={(e) => {
                                            setUseCustomTone(e.target.checked);
                                            if (!e.target.checked) {
                                                setCustomTone('');
                                            }
                                        }}
                                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                                    />
                                    <label htmlFor="useCustomTone" className="text-sm text-gray-700 dark:text-gray-300">
                                        Use custom tone
                                    </label>
                                </div>
                                
                                {useCustomTone ? (
                                    <input
                                        type="text"
                                        value={customTone}
                                        onChange={(e) => setCustomTone(e.target.value)}
                                        placeholder="Enter your custom tone (e.g., 'seductive and dominant', 'playful and submissive')"
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                ) : (
                                    <div className="flex gap-2">
                                        {(['Soft', 'Teasing', 'Playful', 'Explicit'] as const).map((tone) => (
                                            <button
                                                key={tone}
                                                onClick={() => setScenarioTone(tone)}
                                                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                                    scenarioTone === tone
                                                        ? 'bg-primary-600 text-white'
                                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                }`}
                                            >
                                                {tone}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Session Length:
                                </label>
                                <div className="flex gap-2">
                                    {(['Extended', 'Long Extended'] as const).map((length) => (
                                        <button
                                            key={length}
                                            onClick={() => setScenarioLength(length)}
                                            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                                scenarioLength === length
                                                    ? 'bg-primary-600 text-white'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                            }`}
                                        >
                                            {length}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleGenerateScenario}
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
                                        Generate Scenario
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Generated Scenario */}
                    {generatedScenario && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Generated Scenario
                                </h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSaveScenario}
                                        className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
                                    >
                                        <CheckCircleIcon className="w-4 h-4" />
                                        Save
                                    </button>
                                    <button
                                        onClick={() => copyToClipboard(JSON.stringify(generatedScenario, null, 2))}
                                        className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                    >
                                        Copy All
                                    </button>
                                </div>
                            </div>
                            
                            <div className="space-y-4">
                                <div>
                                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Premise:</h4>
                                    <p className="text-gray-700 dark:text-gray-300 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                        {generatedScenario.premise}
                                    </p>
                                </div>
                                
                                <div>
                                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Opening Message:</h4>
                                    <p className="text-gray-700 dark:text-gray-300 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                        {generatedScenario.openingMessage}
                                    </p>
                                    <button
                                        onClick={() => copyToClipboard(generatedScenario.openingMessage)}
                                        className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                    >
                                        Copy
                                    </button>
                                </div>
                                
                                <div>
                                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Engagement Prompts:</h4>
                                    <div className="space-y-2">
                                        {generatedScenario.engagementPrompts.map((prompt, index) => (
                                            <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                                <p className="text-gray-700 dark:text-gray-300">{prompt}</p>
                                                <button
                                                    onClick={() => copyToClipboard(prompt)}
                                                    className="mt-1 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                
                                {generatedScenario.progressionStages && generatedScenario.progressionStages.length > 0 && (
                                    <div>
                                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Progression Stages:</h4>
                                        <div className="space-y-3">
                                            {generatedScenario.progressionStages.map((stage, index) => (
                                                <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                                    <h5 className="font-medium text-gray-900 dark:text-white mb-1">{stage.stage}</h5>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{stage.description}</p>
                                                    {stage.prompts && stage.prompts.length > 0 && (
                                                        <div className="space-y-1 mt-2">
                                                            {stage.prompts.map((prompt, pIndex) => (
                                                                <p key={pIndex} className="text-sm text-gray-700 dark:text-gray-300 pl-2 border-l-2 border-primary-300 dark:border-primary-600">
                                                                    {prompt}
                                                                </p>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {generatedScenario.escalationPoints && generatedScenario.escalationPoints.length > 0 && (
                                    <div>
                                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Escalation Points:</h4>
                                        <div className="space-y-2">
                                            {generatedScenario.escalationPoints.map((point, index) => (
                                                <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                                    <h5 className="font-medium text-gray-900 dark:text-white mb-1">{point.moment}</h5>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{point.description}</p>
                                                    <p className="text-sm text-gray-700 dark:text-gray-300 italic">{point.prompt}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {generatedScenario.variationIdeas && generatedScenario.variationIdeas.length > 0 && (
                                    <div>
                                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Variation Ideas:</h4>
                                        <div className="space-y-2">
                                            {generatedScenario.variationIdeas.map((variation, index) => (
                                                <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                                    <p className="text-gray-700 dark:text-gray-300">{variation}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {generatedScenario.monetizationMoments && generatedScenario.monetizationMoments.length > 0 && (
                                    <div>
                                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Monetization Moments:</h4>
                                        <div className="space-y-2">
                                            {generatedScenario.monetizationMoments.map((moment, index) => (
                                                <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border-l-4 border-primary-500">
                                                    <h5 className="font-medium text-gray-900 dark:text-white mb-1">{moment.moment}</h5>
                                                    <p className="text-sm text-gray-700 dark:text-gray-300">{moment.cta}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Ending CTA:</h4>
                                    <p className="text-gray-700 dark:text-gray-300 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                        {generatedScenario.endingCTA}
                                    </p>
                                    <button
                                        onClick={() => copyToClipboard(generatedScenario.endingCTA)}
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
                                <textarea
                                    value={personaDescription}
                                    onChange={(e) => setPersonaDescription(e.target.value)}
                                    placeholder="Describe your persona's personality, style, interests, and unique traits"
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

                    {/* Generated Ratings */}
                    {generatedRatings.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Rating Prompts
                                </h3>
                                <button
                                    onClick={handleSaveRatings}
                                    className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
                                >
                                    <CheckCircleIcon className="w-4 h-4" />
                                    Save All
                                </button>
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
