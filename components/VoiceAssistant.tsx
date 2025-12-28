
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { MicrophoneWaveIcon, StopCircleIcon, XMarkIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { auth } from '../firebaseConfig';
import { Page } from '../types';

// Helper to create Blob for audio input
function createBlob(data: Float32Array) {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) int16[i] = data[i] * 32768;

  const bytes = new Uint8Array(int16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);

  return {
    data: base64,
    mimeType: "audio/pcm;rate=16000",
  };
}

function decode(base64: string) {
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number) {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let c = 0; c < numChannels; c++) {
    const channelData = buffer.getChannelData(c);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + c] / 32768;
    }
  }

  return buffer;
}

interface ConversationMessage {
  type: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export const VoiceAssistant: React.FC = () => {
  const { user, showToast, settings } = useAppContext();
  
  // Hide Voice Assistant for Free plan users
  if (user?.plan === 'Free') {
    return null;
  }
  const [isOpen, setIsOpen] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);

  const nextStartTime = useRef(0);
  const inputAudioContext = useRef<AudioContext | null>(null);
  const outputAudioContext = useRef<AudioContext | null>(null);
  const sessionPromise = useRef<Promise<any> | null>(null);
  const sources = useRef<Set<AudioBufferSourceNode>>(new Set());
  const scriptProcessor = useRef<ScriptProcessorNode | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);

  // ----------------------------------------------------
  // ✅ FIXED: Define disconnect BEFORE useEffect
  // ----------------------------------------------------
  const disconnect = () => {
    if (sessionPromise.current) {
      sessionPromise.current.then(s => s.close()).catch(() => {});
      sessionPromise.current = null;
    }
    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach(t => t.stop());
      mediaStream.current = null;
    }
    if (scriptProcessor.current) {
      scriptProcessor.current.disconnect();
      scriptProcessor.current = null;
    }
    if (inputAudioContext.current && inputAudioContext.current.state !== "closed") {
      inputAudioContext.current.close().catch(() => {});
      inputAudioContext.current = null;
    }
    if (outputAudioContext.current && outputAudioContext.current.state !== "closed") {
      outputAudioContext.current.close().catch(() => {});
      outputAudioContext.current = null;
    }

    setIsSpeaking(false);
    setIsConnecting(false);
    setConnectionError(null);
  };

  // ----------------------------------------------------
  // CLEANUP HOOK
  // ----------------------------------------------------
  useEffect(() => {
    return () => {
      disconnect(); // NOW SAFE
    };
  }, []);

  if (!settings.voiceMode) return null;

  const startSession = async () => {
    if (!user) return;

    setIsConnecting(true);
    setConnectionError(null);

    // Get API key securely from backend with timeout
    let apiKey: string;
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      
      // Add timeout for API key fetch
      const fetchPromise = fetch('/api/getVoiceApiKey', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      );
      
      const res = await Promise.race([fetchPromise, timeoutPromise]) as Response;

      if (!res.ok) {
        throw new Error(`Failed to get API key: ${res.status}`);
      }

      const data = await res.json();
      if (!data.success || !data.apiKey) {
        throw new Error(data.note || data.error || 'API key not available');
      }

      apiKey = data.apiKey;
    } catch (err: any) {
      console.error('Failed to get API key:', err);
      const errorMsg = err?.message || "Failed to connect. Please check your API key configuration.";
      setConnectionError(errorMsg);
      showToast(errorMsg, "error");
      setIsConnecting(false);
      setIsOpen(false);
      return;
    }

    const ai = new GoogleGenAI({ apiKey });

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!inputAudioContext.current) inputAudioContext.current = new AudioContextClass({ sampleRate: 16000 });
    if (!outputAudioContext.current) outputAudioContext.current = new AudioContextClass({ sampleRate: 24000 });

    const outputNode = outputAudioContext.current.createGain();
    outputNode.connect(outputAudioContext.current.destination);

    const systemInstruction = `
      You are the built-in **EchoFlux.ai Voice Assistant**, helping ${
        user.name || 'the creator'
      } use the app and create better content.

      AGE REQUIREMENTS & ELIGIBILITY (CRITICAL):
      - EchoFlux.ai requires users to be at least 13 years old
      - Users under 18 must have parent/guardian consent
      - OnlyFans Studio and explicit content features are restricted to users 18+ only
      - EchoFlux.ai complies with COPPA and age-related regulations
      - If asked about age requirements, clearly explain these policies and direct users to Terms of Service
      - If you suspect a user may be underage or accessing restricted features inappropriately, advise them to review Terms of Service and contact support

      PRODUCT CONTEXT (VERY IMPORTANT):
      - EchoFlux.ai is currently an **AI Content Studio & Campaign Planner for creators** in **offline / planning mode**.
      - Do NOT promise:
        - Automatic posting to social platforms
        - Real-time analytics, competitor tracking, or social listening
        - Team/client management for agencies
        - Autopilot features (removed from app)
      - If asked about social listening or competitor tracking:
        - Clearly say they are not available in the current version.
        - Offer planning-based alternatives (Opportunities, Strategy, weekly trends, and best practices).
      - Emphasize:
        - Strategy and campaign planning
        - Generating content packs (captions, hooks, ideas)
        - Organizing everything on a calendar
        - Copying content out to post manually on any platform

      YOUR CORE JOB:
      - Know the main surfaces in the app and how they relate:
        - Dashboard: high-level planning snapshot + quick actions
        - Strategy: generate multi-week content roadmaps (monthly allowances vary by plan and are shown in-app)
        - Compose: refine captions and plan for platforms (not \"publish\")
          - AI-generated captions are automatically optimized for the selected platform (Instagram, TikTok, X, etc.)
          - \"Analyze Content Gaps\" button analyzes content strategy across all social platforms and saves to shared history with Dashboard
          - History section shows \"Recent: Analyze Content Gaps, Predictions & Repurposes\" with gap analyses, predictions, and repurposes
        - Calendar: visual planning calendar for scheduled content
        - Media Library: find and reuse assets
        - Link-in-Bio: build link-in-bio pages (Free: 1 link, Pro: 5 links, Elite: unlimited)
        - OnlyFans Studio (Elite only): plan and review OF content
          - AI Captions tab includes \"Analyze Content Gaps\" (OnlyFans-specific), \"Predict Performance\", and \"Repurpose Content\" buttons
          - History section shows \"Recent: Analyze Content Gaps, Predictions & Repurposes\" with OnlyFans-specific analyses (separate from main app history)
          - Gap analysis automatically saves to OnlyFans history (separate collection from Dashboard/Compose)
        - Settings: brand voice, AI behavior, voice mode
      - Help the user by providing COMPREHENSIVE, DETAILED explanations:
        - Explain WHERE to find features (which page, which section, which button)
        - Provide STEP-BY-STEP instructions for using each feature
        - Describe ALL available options and settings for each feature
        - Explain the FULL FUNCTIONALITY and capabilities of features
        - Give context on how features work together in workflows
        - Brainstorm hooks, angles, scripts, captions, and content ideas
        - Turn rough ideas spoken aloud into clearer, creator-ready copy
        - When asked "how do I...", provide thorough, detailed instructions that cover the entire process

      PRICING & FEATURES:
      - Plan names and limits can change; if asked about exact limits, tell users to check the Pricing page / in-app usage stats.
      - Voice Assistant is available on supported plans and provides detailed guidance on using the app and creating content.

      WHEN ASKED \"HOW DO I ...\" ABOUT THE APP:
      - Provide detailed, step-by-step instructions on how to accomplish tasks and use features.
      - Be specific about where to find features, what buttons to click, and the exact workflow.
      - Give comprehensive explanations that help users understand the full functionality.
      - When describing navigation, tell users HOW to navigate (e.g., "Click on the Strategy option in the sidebar" or "Go to the Compose page by clicking Compose in the navigation menu").
      - DO NOT attempt to navigate for the user - only provide clear instructions on how they can navigate themselves.
      - Note: Autopilot and Workflow/Approvals features have been removed from the app.

      DETAILED FEATURE DESCRIPTIONS:
      - When explaining features, provide comprehensive information including:
        - What the feature does and its purpose
        - Where to find it in the app (which page/section)
        - Step-by-step instructions on how to use it
        - What options and settings are available
        - Tips and best practices for getting the most out of the feature
      - Be thorough and detailed - users should understand the full functionality after your explanation.

      CONTENT CREATION:
      - Treat the user as a creator first (OF, TikTok, IG, YouTube, etc.).
      - Help them with:
        - Campaign ideas and themes
        - Series concepts and content pillars
        - Hooks, captions, call-to-actions, and scripts
        - Remixing or improving ideas they already have
      - **Platform-Optimized Captions**: When users generate captions in Compose, they are automatically optimized for the selected platform (Instagram, TikTok, X, LinkedIn, etc.) - the AI considers character limits, style, hashtags, and best practices for each platform.
      - Match their **tone and boundaries**:
        - If they mention being explicit/NSFW, you may lean into that style but stay within normal AI policy limits.
        - If they ask for safe/brand-friendly content, keep it clean and professional.

      LANGUAGE:
      - Default to replying in clear, natural English.
      - Only switch to another language if the user explicitly asks for it (for example: "answer in Spanish").

      STYLE:
      - Voice replies should usually stay under ~30 seconds but can be longer when needed.
      - Be clear, concrete, and encouraging.
      - Use examples when helpful (e.g., show 2–3 alternative hooks).
      - If something is not available in this version (e.g., analytics, auto-posting), say so honestly and offer a planning-based workaround.

      WEEKLY TRENDS:
      - All users benefit from shared social media trends refreshed on a recurring schedule (currently Monday and Thursday).
      - Weekly trends cover: general social media trends, platform updates, content creator tips, engagement strategies, hashtag strategies, video content trends.
      - You do NOT have live web access in the voice assistant. If asked for \"what's trending today\", be honest and provide reliable evergreen best practices plus how to use Opportunities/Strategy in-app.

      FIRST GREETING:
      - When you first connect, greet them as the EchoFlux.ai voice assistant and offer help like:
        - \"Hi! I'm your EchoFlux.ai voice assistant. I can explain how to use any feature in the app, help you create content, answer questions about social media strategy, and more. What would you like to learn about or work on today?\"
    `;

    // Define available tools/functions (no live web search in current version)
    const tools = [
      {
        name: 'show_help',
        description: 'Show available commands and what the assistant can do. Use this when the user asks what you can do, how to use you, or what commands are available.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    ];

    sessionPromise.current = ai.live.connect({
      model: "gemini-2.5-flash-native-audio-preview-09-2025",
      tools: tools,
      generationConfig: {
        // Default to English responses unless the user explicitly asks otherwise
        language: "en",
      },
      callbacks: {
        onopen: async () => {
          setIsConnecting(false);
          setConnectionError(null);
          setConversationHistory([]); // Clear history on new connection
          showToast("Voice Assistant Connected. You can start speaking!", "success");

          try {
            mediaStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });

            const source = inputAudioContext.current!.createMediaStreamSource(mediaStream.current);
            scriptProcessor.current = inputAudioContext.current!.createScriptProcessor(4096, 1, 1);

            scriptProcessor.current.onaudioprocess = (e) => {
              const pcm = createBlob(e.inputBuffer.getChannelData(0));
              sessionPromise.current?.then(s => s.sendRealtimeInput({ media: pcm })).catch(() => {});
            };

            source.connect(scriptProcessor.current);
            scriptProcessor.current.connect(inputAudioContext.current!.destination);
          } catch (e: any) {
            console.error("Mic Error:", e);
            const errorMessage = e?.message || e?.name || "Unknown error";
            if (errorMessage.includes("Permission") || errorMessage.includes("NotAllowedError")) {
              showToast("Microphone access denied. Please enable microphone permissions in your browser settings.", "error");
            } else if (errorMessage.includes("NotFoundError") || errorMessage.includes("DevicesNotFoundError")) {
              showToast("No microphone found. Please connect a microphone and try again.", "error");
            } else {
              showToast(`Microphone error: ${errorMessage}`, "error");
            }
            disconnect();
          }
        },

        onmessage: async (msg: LiveServerMessage) => {
          // Handle function calls FIRST - before processing audio
          const functionCall = msg.serverContent?.modelTurn?.parts?.find(p => p.functionCall);
          if (functionCall?.functionCall) {
            const { name, args } = functionCall.functionCall;
            let result = '';
            
            console.log('[VoiceAssistant] Function call received:', { name, args });
            
            try {
              switch (name) {
                case 'show_help':
                  result = `I'm your EchoFlux.ai Voice Assistant! I can help you with:
- Explaining how to use any feature in the app with detailed step-by-step instructions
- Providing comprehensive guides on creating content, generating strategies, using the calendar, and more
- Answering questions about social media strategy, content creation, marketing, and best practices
- Sharing what tends to work (best practices) and how to use the in-app trends/opportunities tools
- Giving detailed feedback on your content ideas and strategies
- Explaining workflows and helping you understand the full functionality of each feature

Just ask me how to do something or what you'd like to learn about!`;
                  break;
                  
                default:
                  result = `Unknown function: ${name}`;
              }
              
              // Send function response back to the AI IMMEDIATELY
              const session = await sessionPromise.current;
              if (session) {
                try {
                  await session.sendRealtimeInput({
                    functionResponse: {
                      name,
                      response: { result }
                    }
                  });
                  console.log('[VoiceAssistant] Function response sent:', { name, resultLength: result.length });
                } catch (responseError: any) {
                  console.error('[VoiceAssistant] Failed to send function response:', responseError);
                }
              } else {
                console.error('[VoiceAssistant] No active session to send function response');
              }
            } catch (err: any) {
              console.error('[VoiceAssistant] Function call error:', err);
              const session = await sessionPromise.current;
              if (session) {
                try {
                  await session.sendRealtimeInput({
                    functionResponse: {
                      name,
                      response: { error: err?.message || 'Failed to execute function' }
                    }
                  });
                } catch (responseError: any) {
                  console.error('[VoiceAssistant] Failed to send error response:', responseError);
                }
              }
            }
            
            return; // Don't process audio for function calls
          }

          // Extract text if available (for transcript)
          const textPart = msg.serverContent?.modelTurn?.parts?.find(p => p.text);
          if (textPart?.text) {
            setConversationHistory(prev => [...prev, {
              type: 'assistant',
              text: textPart.text,
              timestamp: new Date()
            }]);
          }

          const b64 = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (!b64) return;

          setIsSpeaking(true);

          const ctx = outputAudioContext.current!;
          nextStartTime.current = Math.max(nextStartTime.current, ctx.currentTime);

          try {
            const audioBuffer = await decodeAudioData(decode(b64), ctx, 24000, 1);
            const src = ctx.createBufferSource();
            src.buffer = audioBuffer;
            src.connect(outputNode);

            src.onended = () => {
              sources.current.delete(src);
              if (sources.current.size === 0) setIsSpeaking(false);
            };

            src.start(nextStartTime.current);
            nextStartTime.current += audioBuffer.duration;
            sources.current.add(src);
          } catch (err: any) {
            console.error("Decode fail:", err);
            // Don't show toast for decode errors as they're usually non-critical
            // The audio might still play partially
          }
        },

        onclose: () => {
          if (isOpen) {
            showToast("Voice Assistant disconnected.", "info");
            // Clear conversation history when disconnecting
            setConversationHistory([]);
          }
          disconnect();
          setIsOpen(false);
        },

        onerror: (err: any) => {
          console.error("Live API Error:", err);
          const errorMessage = err?.message || err?.error || "Unknown error";
          if (errorMessage.includes("API key") || errorMessage.includes("authentication")) {
            showToast("Authentication failed. Please check your API key configuration.", "error");
          } else if (errorMessage.includes("network") || errorMessage.includes("connection")) {
            showToast("Connection lost. Please check your internet connection and try again.", "error");
          } else if (errorMessage.includes("quota") || errorMessage.includes("limit")) {
            showToast("API quota exceeded. Please try again later.", "error");
          } else {
            showToast(`Connection error: ${errorMessage}`, "error");
          }
          disconnect();
          setIsOpen(false);
        }
      },
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction
      }
    });
  };

  const toggleSession = async () => {
    if (isOpen) {
      setIsOpen(false);
      disconnect();
      return;
    }

    setIsOpen(true);
    setIsConnecting(true);

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!outputAudioContext.current) outputAudioContext.current = new AudioContextClass({ sampleRate: 24000 });
    if (outputAudioContext.current.state === "suspended") await outputAudioContext.current.resume();

    startSession();
  };

  return (
    <div className="fixed bottom-24 right-6 z-40 mb-16">
      {/* Transcript Panel */}
      {showTranscript && conversationHistory.length > 0 && (
        <div className="absolute bottom-full right-0 mb-4 w-80 max-h-96 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Conversation</h3>
            <button
              onClick={() => setShowTranscript(false)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
            {conversationHistory.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${msg.type === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.type === 'user'
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-900 dark:text-primary-100'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {msg.text}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {msg.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        {/* Transcript toggle button */}
        {isOpen && conversationHistory.length > 0 && (
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="absolute -left-12 top-0 p-2 bg-gray-700 dark:bg-gray-600 text-white rounded-full shadow-lg hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors"
            title="Show conversation transcript"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
        )}

        <button
          onClick={toggleSession}
          className={`p-4 rounded-full shadow-lg transition-all transform hover:scale-110 text-white ${
            isSpeaking ? "bg-red-500 animate-pulse" :
            isConnecting ? "bg-yellow-500 animate-pulse" :
            isOpen ? "bg-red-500 hover:bg-red-600" :
            "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
          }`}
          title={
            isSpeaking ? "AI is speaking - Click to stop" :
            isConnecting ? "Connecting..." :
            isOpen ? "Voice Assistant Active - Click to disconnect" :
            "Start Voice Assistant"
          }
          disabled={isConnecting}
        >
          {isOpen || isConnecting ? (
            <StopCircleIcon className="w-6 h-6" />
          ) : (
            <MicrophoneWaveIcon className="w-6 h-6" />
          )}
        </button>
        {/* Status indicator */}
        {isOpen && !isConnecting && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white dark:border-gray-800 animate-pulse"></div>
        )}
      </div>
      {/* Connection status tooltip */}
      {isConnecting && (
        <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-sm rounded-lg shadow-lg whitespace-nowrap animate-pulse">
          Connecting to voice assistant...
        </div>
      )}
      {connectionError && (
        <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-red-600 dark:bg-red-700 text-white text-sm rounded-lg shadow-lg max-w-xs">
          {connectionError}
        </div>
      )}
      {isOpen && !isConnecting && !isSpeaking && (
        <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-green-600 dark:bg-green-700 text-white text-sm rounded-lg shadow-lg whitespace-nowrap">
          Listening... Speak now
        </div>
      )}
      {isSpeaking && (
        <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-blue-600 dark:bg-blue-700 text-white text-sm rounded-lg shadow-lg whitespace-nowrap animate-pulse">
          AI is speaking...
        </div>
      )}
    </div>
  );
};
