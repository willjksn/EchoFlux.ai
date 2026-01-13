import React, { useState, useRef, useEffect } from 'react';
import { ChatIcon, SendIcon, MicrophoneWaveIcon, StopCircleIcon, XMarkIcon } from './icons/UIIcons';
import { ChatMessage } from '../types';
import { askChatbot } from '../src/services/geminiService';
import { useAppContext } from './AppContext';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
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

type AssistantMode = 'text' | 'voice';

export const UnifiedAssistant: React.FC = () => {
  const { user, showToast, settings, setActivePage } = useAppContext();
  const [mode, setMode] = useState<AssistantMode>('text');
  const [isOpen, setIsOpen] = useState(false);
  
  // Text mode state
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'bot', content: "Hi there! I'm the EchoFlux.ai assistant. How can I help you today?" }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Voice mode state
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

  // Text mode handlers
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (mode === 'text') {
      scrollToBottom();
    }
  }, [messages, isLoading, mode]);

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: inputValue };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const botResponse = await askChatbot(inputValue);
      const botMessage: ChatMessage = { role: 'bot', content: botResponse };
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error(error);
      const errorMessage: ChatMessage = { role: 'bot', content: "Sorry, I'm having a little trouble right now. Please try again later." };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Voice mode handlers
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
    sources.current.forEach(s => {
      try { s.stop(); } catch {}
      try { s.disconnect(); } catch {}
    });
    sources.current.clear();
    setIsSpeaking(false);
    setIsConnecting(false);
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isOpen || mode !== 'voice') {
      disconnect();
      return;
    }
  }, [isOpen, mode]);

  const connect = async () => {
    if (isConnecting || isSpeaking) return;
    setIsConnecting(true);
    setConnectionError(null);

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
    const liveModel =
      (typeof (settings as any)?.voiceModel === "string" && (settings as any).voiceModel?.trim()) ||
      "models/gemini-2.5-flash-native-audio-preview-09-2025";

    if (!liveModel) {
      const msg = "Voice model not configured. Please set a model and retry.";
      setConnectionError(msg);
      showToast(msg, "error");
      setIsConnecting(false);
      return;
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      const msg = "AudioContext not supported in this browser.";
      setConnectionError(msg);
      showToast(msg, "error");
      setIsConnecting(false);
      return;
    }

    if (!inputAudioContext.current) inputAudioContext.current = new AudioContextClass({ sampleRate: 16000 });
    if (!outputAudioContext.current) outputAudioContext.current = new AudioContextClass({ sampleRate: 24000 });

    const outputNode = outputAudioContext.current.createGain();
    outputNode.connect(outputAudioContext.current.destination);

    // Import APP_KNOWLEDGE for unified knowledge base
    const { APP_KNOWLEDGE } = await import('../constants/appKnowledge.js');
    
    // Check if user is admin - fetch from Firestore if not in context
    let isAdmin = (user as any)?.role === 'Admin';
    if (!isAdmin && user?.id) {
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
        const res = await fetch('/api/getUserRole', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (res.ok) {
          const data = await res.json();
          isAdmin = data?.role === 'Admin';
        }
      } catch (error) {
        console.error('Failed to check admin status:', error);
        // Continue with non-admin access if check fails
      }
    }

    // Filter knowledge base based on admin status
    let knowledgeBase = APP_KNOWLEDGE;
    if (!isAdmin) {
      // Remove admin section from knowledge base for non-admins
      const adminSectionStart = knowledgeBase.indexOf("## Admin Dashboard & Features");
      if (adminSectionStart !== -1) {
        // Find the end of admin section (look for next major section or end)
        const nextSection = knowledgeBase.indexOf("\n---\n## ", adminSectionStart);
        if (nextSection !== -1) {
          knowledgeBase = knowledgeBase.substring(0, adminSectionStart) + knowledgeBase.substring(nextSection + 5);
        } else {
          // If no next section, remove from admin section to end
          knowledgeBase = knowledgeBase.substring(0, adminSectionStart);
        }
      }
    }

    const adminRestriction = !isAdmin ? `
      CRITICAL ADMIN RESTRICTION:
      - You MUST NOT answer any questions about admin features, admin dashboard, admin tools, or admin functionality.
      - If the user asks about admin features, politely decline and say: "I can only answer questions about admin features if you have admin access. Please contact support if you need admin assistance."
      - Do NOT provide any information about:
        - Admin Dashboard
        - User management
        - Admin tools (Tavily searches, invite codes, announcements, etc.)
        - Review management
        - Model usage analytics
        - Any admin-only features
      - Redirect non-admin users asking about admin features to contact support.
    ` : "";

    const systemInstruction = `
      You are the built-in **EchoFlux.ai Voice Assistant**, helping ${
        user?.name || 'the creator'
      } use the app and create better content.

      CRITICAL PRODUCT LIMITS (DO NOT MISREPRESENT):
      - EchoFlux.ai is currently a creator-focused AI Content Studio & Campaign Planner (offline/planning-first).
      - Do NOT claim the app provides social listening or competitor tracking in the current version.
      - Do NOT claim the app provides automated DM/comment reply automation or automatic posting.
      - You do NOT have live web access. Be honest about uncertainty for time-sensitive questions.

      ${adminRestriction}

      COMPREHENSIVE APP KNOWLEDGE BASE:
      ${knowledgeBase}

      VOICE-SPECIFIC INSTRUCTIONS:
      - Voice replies should usually stay under ~30 seconds but can be longer when needed for detailed explanations.
      - Be clear, concrete, and encouraging in your spoken responses.
      - Use examples when helpful (e.g., suggest 2–3 alternative hooks or approaches).
      - When describing navigation, tell users HOW to navigate (e.g., "Click on the Strategy option in the sidebar" or "Go to the Compose page by clicking Compose in the navigation menu").
      - DO NOT attempt to navigate for the user - only provide clear instructions on how they can navigate themselves.
      - You CAN navigate to pages programmatically when the user explicitly asks (e.g., "go to compose" or "open strategy").

      User is Admin: ${isAdmin}

      FIRST GREETING:
      - When you first connect, greet them as the EchoFlux.ai voice assistant and offer help like:
        - "Hi! I'm your EchoFlux.ai voice assistant. I can explain how to use any feature in the app, help you create content, answer questions about social media strategy, and more. What would you like to learn about or work on today?"
    `;

    sessionPromise.current = ai.live.connect({
      model: liveModel,
      callbacks: {
        onopen: async () => {
          setIsConnecting(false);
          setConnectionError(null);
          setConversationHistory([]);
          showToast("Voice Assistant Connected. You can start speaking!", "success");

          try {
            if (!inputAudioContext.current) {
              inputAudioContext.current = new AudioContextClass({ sampleRate: 16000 });
            }
            if (!outputAudioContext.current) {
              outputAudioContext.current = new AudioContextClass({ sampleRate: 24000 });
            }

            if (!inputAudioContext.current) throw new Error("Input audio context unavailable");
            if (!outputAudioContext.current) throw new Error("Output audio context unavailable");

            mediaStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });

            const source = inputAudioContext.current.createMediaStreamSource(mediaStream.current);
            scriptProcessor.current = inputAudioContext.current.createScriptProcessor(4096, 1, 1);

            scriptProcessor.current.onaudioprocess = (e) => {
              const pcm = createBlob(e.inputBuffer.getChannelData(0));
              sessionPromise.current?.then(s => s.sendRealtimeInput({ media: pcm })).catch(() => {});
            };

            source.connect(scriptProcessor.current);
            scriptProcessor.current.connect(inputAudioContext.current.destination);
          } catch (err: any) {
            console.error("Failed to get microphone access:", err);
            showToast("Microphone access denied. Please enable microphone permissions.", "error");
            disconnect();
          }
        },
        onmessage: async (msg: LiveServerMessage) => {
          if (msg.serverContent?.modelTurn) {
            const parts = msg.serverContent.modelTurn.parts || [];
            
            for (const part of parts) {
              if (part.text) {
                const text = part.text;
                setConversationHistory(prev => [...prev, {
                  type: 'assistant',
                  text,
                  timestamp: new Date()
                }]);
              }
              
              if (part.inlineData?.mimeType?.startsWith('audio/')) {
                const b64 = part.inlineData.data;
                if (!b64) continue;

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
                }
              }
            }
          }
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
        },
        onclose: () => {
          if (isOpen) {
            showToast("Voice Assistant disconnected.", "error");
            setConversationHistory([]);
          }
          disconnect();
        }
      },
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction,
      }
    });

    try {
      await sessionPromise.current;
    } catch (err: any) {
      console.error("Failed to connect voice assistant:", err);
      showToast(err?.message || "Failed to connect voice assistant.", "error");
      disconnect();
    }
  };

  const toggleVoiceSession = async () => {
    if (isSpeaking || isConnecting) {
      disconnect();
      return;
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!outputAudioContext.current) outputAudioContext.current = new AudioContextClass({ sampleRate: 24000 });
    if (outputAudioContext.current.state === "suspended") await outputAudioContext.current.resume();

    await connect();
  };

  const handleModeSwitch = (newMode: AssistantMode) => {
    if (mode === 'voice' && isSpeaking) {
      disconnect();
    }
    setMode(newMode);
  };

  // Hide for Free plan users (voice mode only)
  if (mode === 'voice' && user?.plan === 'Free') {
    return null;
  }

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="bg-primary-600 text-white p-4 rounded-full shadow-lg hover:bg-primary-700 transition-transform transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          aria-label="Toggle assistant"
        >
          <ChatIcon />
        </button>
      </div>
      
      <div className={`fixed bottom-24 right-6 z-50 w-[calc(100%-3rem)] max-w-sm h-[60vh] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl flex flex-col transition-all duration-300 ease-in-out ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}>
        {/* Header with Mode Toggle */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">EchoFlux.ai Assistant</h3>
          <div className="flex items-center gap-2">
            {/* Mode Toggle */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              <button
                onClick={() => handleModeSwitch('text')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  mode === 'text'
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Text
              </button>
              <button
                onClick={() => handleModeSwitch('voice')}
                disabled={user?.plan === 'Free'}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  mode === 'voice'
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                } ${user?.plan === 'Free' ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={user?.plan === 'Free' ? 'Voice mode requires Pro or Elite plan' : 'Switch to voice mode'}
              >
                Voice
              </button>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        {mode === 'text' ? (
          <>
            {/* Messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              {messages.map((msg, index) => (
                <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'bot' && <div className="w-8 h-8 rounded-full bg-primary-500 flex-shrink-0"></div>}
                  <div className={`px-4 py-2 rounded-2xl max-w-xs ${msg.role === 'user' ? 'bg-primary-500 text-white rounded-br-none' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none'}`}>
                    <p className="text-sm">{msg.content}</p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex items-end gap-2 justify-start">
                  <div className="w-8 h-8 rounded-full bg-primary-500 flex-shrink-0"></div>
                  <div className="px-4 py-3 rounded-2xl bg-gray-200 dark:bg-gray-700 rounded-bl-none">
                    <div className="flex items-center space-x-1">
                      <span className="w-2 h-2 bg-gray-500 rounded-full animate-pulse [animation-delay:-0.3s]"></span>
                      <span className="w-2 h-2 bg-gray-500 rounded-full animate-pulse [animation-delay:-0.15s]"></span>
                      <span className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700">
              <form onSubmit={handleTextSubmit} className="flex items-center space-x-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask about features or pricing..."
                  className="w-full p-3 border rounded-full bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-primary-500 focus:border-primary-500"
                />
                <button type="submit" disabled={isLoading || !inputValue.trim()} className="p-3 bg-primary-600 text-white rounded-full hover:bg-primary-700 disabled:bg-primary-300 disabled:cursor-not-allowed transition-colors">
                  <SendIcon className="w-5 h-5"/>
                </button>
              </form>
            </div>
          </>
        ) : (
          <>
            {/* Voice Mode Content */}
            <div className="flex-1 p-4 overflow-y-auto">
              {connectionError && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">{connectionError}</p>
                </div>
              )}

              {showTranscript && conversationHistory.length > 0 && (
                <div className="space-y-3 mb-4">
                  {conversationHistory.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`px-3 py-2 rounded-lg max-w-xs text-sm ${
                        msg.type === 'user'
                          ? 'bg-primary-500 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                      }`}>
                        <p>{msg.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!isConnecting && !isSpeaking && !connectionError && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Click the microphone to start speaking
                  </p>
                  <button
                    onClick={toggleVoiceSession}
                    className="bg-primary-600 text-white p-6 rounded-full hover:bg-primary-700 transition-colors shadow-lg"
                    aria-label="Start voice assistant"
                  >
                    <MicrophoneWaveIcon className="w-8 h-8" />
                  </button>
                </div>
              )}

              {(isConnecting || isSpeaking) && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  {isConnecting && (
                    <p className="text-gray-600 dark:text-gray-400 mb-4">Connecting...</p>
                  )}
                  {isSpeaking && (
                    <p className="text-gray-600 dark:text-gray-400 mb-4">Listening...</p>
                  )}
                  <button
                    onClick={toggleVoiceSession}
                    className={`p-6 rounded-full transition-colors shadow-lg text-white ${
                      isSpeaking ? "bg-red-600 hover:bg-red-700 animate-pulse" :
                      isConnecting ? "bg-yellow-500 hover:bg-yellow-600 animate-pulse" :
                      "bg-red-600 hover:bg-red-700"
                    }`}
                    aria-label="Stop voice assistant"
                  >
                    <StopCircleIcon className="w-8 h-8" />
                  </button>
                </div>
              )}
            </div>

            {/* Voice Mode Footer */}
            <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <button
                onClick={() => setShowTranscript(!showTranscript)}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                {showTranscript ? 'Hide' : 'Show'} Transcript
              </button>
              {user?.plan === 'Free' && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Voice mode requires Pro or Elite plan
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
};
