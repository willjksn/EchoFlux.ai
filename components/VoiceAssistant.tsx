
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { MicrophoneWaveIcon, StopCircleIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { auth } from '../firebaseConfig';

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
  const { user, showToast, settings, setActivePage, setComposeContext } = useAppContext();
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
      You are "Engage", an expert Social Media Strategist and Assistant for ${user.name || 'the user'}.
      
      Your role:
      - Help with social media strategy, content ideas, posting schedules, and engagement tips
      - Provide feedback and constructive advice on content, strategies, and social media approaches
      - Share trending topics, what's popular in social media, emerging formats, and viral content patterns
      - Answer questions about social media, marketing, content creation, and general topics (like a regular AI assistant)
      - Provide quick, actionable advice
      - Keep voice responses concise (under 30 seconds), but provide detailed answers when asked complex questions
      - Be friendly, professional, and encouraging
      - You can perform actions like navigating to pages, opening compose, etc.
      
      When you first connect, greet the user warmly and ask "How can I help you with your social media today?"
      
      Capabilities:
      - Answer Questions: You can answer questions about social media, marketing, content creation, trends, best practices, technology, business, and general knowledge topics
      - Provide Feedback: Give constructive feedback on content ideas, posting strategies, engagement tactics, captions, and social media approaches
      - Share Trends: Discuss what's trending in social media, popular content formats, emerging platforms, viral content patterns, hashtag trends, and industry insights
      - General Q&A: Answer questions like a regular AI assistant - you're knowledgeable about many topics beyond just social media
      - Navigate Pages: Use function calls to navigate to different pages in the app
      
      Available actions:
      - Navigate to pages: dashboard, analytics, compose, calendar, automation, strategy, media library, settings
      - Open compose page to create a new post
      - Check analytics or view calendar
      
      Communication style:
      - Be conversational and natural
      - Provide detailed answers when asked complex questions
      - Give specific, actionable feedback and advice
      - Use examples when helpful
      - Be encouraging and supportive
      - For trending topics, mention specific platforms, formats, or examples when relevant
      
      Remember: You're both a helpful AI assistant AND a social media expert. Answer questions naturally, provide feedback, discuss trends, and help with tasks. Use function calls to perform actions when the user requests them.
    `;

    // Define available tools/functions
    const tools = [
      {
        name: 'navigate_to_page',
        description: 'Navigate to a specific page in the app. Use this when the user wants to go to a page like dashboard, analytics, compose, calendar, automation, strategy, media library, or settings.',
        parameters: {
          type: 'object',
          properties: {
            page: {
              type: 'string',
              enum: ['dashboard', 'analytics', 'compose', 'calendar', 'automation', 'strategy', 'media library', 'settings', 'approvals', 'team'],
              description: 'The page to navigate to'
            }
          },
          required: ['page']
        }
      },
      {
        name: 'open_compose',
        description: 'Open the compose page to create a new post. Use this when the user wants to create a post, write content, or compose something.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'check_analytics',
        description: 'Navigate to the analytics page to view performance metrics and insights.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'view_calendar',
        description: 'Navigate to the calendar page to view scheduled posts and content calendar.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'open_automation',
        description: 'Navigate to the automation page to set up automated content creation.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'open_strategy',
        description: 'Navigate to the strategy page to generate content roadmaps and strategies.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      },
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
          // Handle function calls
          const functionCall = msg.serverContent?.modelTurn?.parts?.find(p => p.functionCall);
          if (functionCall?.functionCall) {
            const { name, args } = functionCall.functionCall;
            let result = '';
            
            try {
              switch (name) {
                case 'navigate_to_page':
                  const page = args?.page as string;
                  if (page) {
                    // Map page names to correct page identifiers
                    const pageMap: Record<string, any> = {
                      'dashboard': 'dashboard',
                      'analytics': 'analytics',
                      'compose': 'compose',
                      'calendar': 'calendar',
                      'automation': 'automation',
                      'strategy': 'strategy',
                      'media library': 'mediaLibrary',
                      'media-library': 'mediaLibrary',
                      'settings': 'settings',
                      'approvals': 'approvals',
                      'team': 'team'
                    };
                    const mappedPage = pageMap[page.toLowerCase()] || page;
                    setActivePage(mappedPage as any);
                    result = `Navigated to ${page}.`;
                    showToast(`Navigated to ${page}`, "success");
                  }
                  break;
                  
                case 'open_compose':
                  setActivePage('compose');
                  result = 'Opened compose page. You can now create a new post.';
                  showToast('Opened compose page', "success");
                  break;
                  
                case 'check_analytics':
                  setActivePage('analytics');
                  result = 'Opened analytics page. You can view your performance metrics here.';
                  showToast('Opened analytics', "success");
                  break;
                  
                case 'view_calendar':
                  setActivePage('calendar');
                  result = 'Opened calendar. You can view your scheduled posts here.';
                  showToast('Opened calendar', "success");
                  break;
                  
                case 'open_automation':
                  setActivePage('automation');
                  result = 'Opened automation page. You can set up automated content creation here.';
                  showToast('Opened automation', "success");
                  break;
                  
                case 'open_strategy':
                  setActivePage('strategy');
                  result = 'Opened strategy page. You can generate content roadmaps here.';
                  showToast('Opened strategy', "success");
                  break;
                  
                case 'show_help':
                  result = `I can help you with:
- Navigate to pages: dashboard, analytics, compose, calendar, automation, strategy, media library, settings
- Open compose page to create posts
- Check analytics and view calendar
- Provide social media strategy advice and feedback
- Share trending topics and what's popular
- Answer questions about social media, marketing, content creation, and general topics
- Give feedback on your content ideas and strategies
- Discuss best practices and tips

Just ask me anything or tell me what you'd like to do!`;
                  break;
                  
                default:
                  result = `Unknown function: ${name}`;
              }
              
              // Send function response back to the AI
              const session = await sessionPromise.current;
              if (session) {
                await session.sendRealtimeInput({
                  functionResponse: {
                    name,
                    response: { result }
                  }
                });
              }
            } catch (err: any) {
              console.error('Function call error:', err);
              const session = await sessionPromise.current;
              if (session) {
                await session.sendRealtimeInput({
                  functionResponse: {
                    name,
                    response: { error: err?.message || 'Failed to execute function' }
                  }
                });
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
