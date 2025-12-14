import React, { useState } from 'react';
import { useAppContext } from './AppContext';
import { SparklesIcon, RefreshIcon } from './icons/UIIcons';
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
    const [activeTab, setActiveTab] = useState<'roleplay' | 'persona' | 'interactive' | 'ratings'>('roleplay');
    const [isGenerating, setIsGenerating] = useState(false);

    // Roleplay Scenario state
    const [roleplayType, setRoleplayType] = useState<RoleplayType>('GFE');
    const [customRoleplay, setCustomRoleplay] = useState('');
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
                    prompt: `Generate a complete roleplay scenario for OnlyFans content creation. 

Roleplay Type: ${selectedType}
Tone: ${roleplayTone}
Session Length: ${sessionLength === 'short' ? 'Short session (15-30 minutes)' : 'Extended session (1-2 hours)'}

Generate a detailed roleplay scenario that includes:
1. SCENARIO PREMISE: A brief description of the roleplay setting and characters (2-3 sentences)
2. OPENING MESSAGE: The first message that starts the roleplay session (engaging and sets the scene)
3. ESCALATION PROMPTS: 5-7 prompts that help escalate the roleplay naturally (each should be a natural progression)
4. ENDING CTA: A soft call-to-action that encourages unlocking exclusive content or continuing the session

Make it creative, engaging, and tailored for adult content platforms. The tone should be ${roleplayTone}. Format as JSON with keys: premise, openingMessage, escalationPrompts (array), endingCTA.`,
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

Make it detailed, creative, and tailored for adult content platforms. Format as a well-structured persona profile.`,
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

Format as a numbered list with brief descriptions. Make them engaging and monetization-friendly.`,
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
                    prompt: `Generate 12 creative body rating prompt ideas for OnlyFans based on: ${ratingPrompt}

Each prompt should be:
- Engaging and playful
- Encourage audience interaction
- Suitable for adult content platforms
- Include clear instructions for rating

Examples:
- "Rate my legs from 1-10... winner gets a surprise tonight 😈"
- "Which do you want more tonight: thighs or back?"
- "Pick what I post next 👀"

Format as a numbered list with complete prompt text. Make them creative and varied.`,
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
        { id: 'roleplay', label: 'Roleplay Scenarios' },
        { id: 'persona', label: 'Persona Builder' },
        { id: 'interactive', label: 'Interactive Posts' },
        { id: 'ratings', label: 'Body Ratings' },
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
                    Generate roleplay scenarios, personas, interactive post ideas, and body rating prompts.
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
