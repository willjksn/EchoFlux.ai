
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { MicrophoneWaveIcon, StopCircleIcon, XMarkIcon, SparklesIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';

interface AudioMediaData {
  data: string;
  mimeType: string;
}

// Helper to create Blob for audio input
function createBlob(data: Float32Array): AudioMediaData {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  
  // Simple manual base64 encoding for raw PCM data
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return {
    data: base64,
    mimeType: 'audio/pcm;rate=16000',
  };
}

// Helper to decode base64 to Uint8Array
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper to decode raw audio data
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const VoiceAssistant: React.FC = () => {
    const { user, showToast, settings } = useAppContext();
    const [isOpen, setIsOpen] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    
    const nextStartTime = useRef(0);
    const inputAudioContext = useRef<AudioContext | null>(null);
    const outputAudioContext = useRef<AudioContext | null>(null);
    const sessionPromise = useRef<Promise<any> | null>(null);
    const sources = useRef<Set<AudioBufferSourceNode>>(new Set());
    const scriptProcessor = useRef<ScriptProcessorNode | null>(null);
    const mediaStream = useRef<MediaStream | null>(null);

    useEffect(() => {
        return () => {
            // Cleanup on unmount
            disconnect();
        };
    }, []);

    // Respect user settings
    if (!settings.voiceMode) {
        return null;
    }

    const disconnect = () => {
        if (sessionPromise.current) {
            sessionPromise.current.then(session => session.close()).catch(() => {});
            sessionPromise.current = null;
        }
        if (mediaStream.current) {
            mediaStream.current.getTracks().forEach(track => track.stop());
            mediaStream.current = null;
        }
        if (scriptProcessor.current) {
            scriptProcessor.current.disconnect();
            scriptProcessor.current = null;
        }
        if (inputAudioContext.current && inputAudioContext.current.state !== 'closed') {
            inputAudioContext.current.close().catch(() => {});
            inputAudioContext.current = null;
        }
        if (outputAudioContext.current && outputAudioContext.current.state !== 'closed') {
            outputAudioContext.current.close().catch(() => {});
            outputAudioContext.current = null;
        }
        setIsSpeaking(false);
        setIsConnecting(false);
    };

    const startSession = async () => {
        if (!user) return;
        if (!process.env.API_KEY) {
            showToast("API Key is missing.", 'error');
            setIsOpen(false);
            return;
        }
        
        setIsConnecting(true);
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        
        // Initialize audio contexts if not exists or closed
        if (!inputAudioContext.current || inputAudioContext.current.state === 'closed') {
             inputAudioContext.current = new AudioContextClass({ sampleRate: 16000 });
        }
        if (!outputAudioContext.current || outputAudioContext.current.state === 'closed') {
             outputAudioContext.current = new AudioContextClass({ sampleRate: 24000 });
        }

        const outputNode = outputAudioContext.current!.createGain();
        outputNode.connect(outputAudioContext.current!.destination);

        const systemInstruction = `
            You are "Engage", an expert Social Media Strategist and Assistant for ${user.name}.
            Your goal is to help the user plan content, reply to messages, and find trends.
            Speak conversationally, concisely, and with high energy. Keep responses short (under 2 sentences usually) unless asked for a long explanation.
            IMPORTANT: As soon as the connection is established, introduce yourself briefly and ask "How can I help you today?".
        `;

        sessionPromise.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: async () => {
                    try {
                        setIsConnecting(false);
                        showToast("Voice Assistant Connected.", "success");
                        mediaStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
                        
                        if (!inputAudioContext.current) return;

                        const source = inputAudioContext.current.createMediaStreamSource(mediaStream.current);
                        scriptProcessor.current = inputAudioContext.current.createScriptProcessor(4096, 1, 1);
                        
                        scriptProcessor.current.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createBlob(inputData);
                            sessionPromise.current?.then((session) => {
                                try {
                                    session.sendRealtimeInput({ media: pcmBlob });
                                } catch(e) {
                                    // Silent fail if session closed
                                }
                            }).catch(() => {}); // Ignore promise errors on closed sessions
                        };
                        
                        source.connect(scriptProcessor.current);
                        scriptProcessor.current.connect(inputAudioContext.current.destination);

                    } catch (e: any) {
                        console.error("Mic Error:", e);
                        let errorMessage = "Could not access microphone.";
                        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
                            errorMessage = "Microphone permission denied. Please allow access in browser settings.";
                        }
                        showToast(errorMessage, 'error');
                        setIsOpen(false);
                        disconnect();
                    }
                },
                onmessage: async (message: LiveServerMessage) => {
                    const base64Audio =
    message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data ?? null;
                    
                    if (base64Audio) {
                        setIsSpeaking(true);
                        if (!outputAudioContext.current) return;
                        
                        const ctx = outputAudioContext.current;
                        nextStartTime.current = Math.max(nextStartTime.current, ctx.currentTime);
                        
                        try {
                            const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                            
                            const source = ctx.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputNode);
                            source.addEventListener('ended', () => {
                                sources.current.delete(source);
                                if (sources.current.size === 0) setIsSpeaking(false);
                            });
                            
                            source.start(nextStartTime.current);
                            nextStartTime.current += audioBuffer.duration;
                            sources.current.add(source);
                        } catch (e) {
                            console.error("Audio Decode Error:", e);
                        }
                    }

                    if (message.serverContent?.interrupted) {
                        sources.current.forEach(src => src.stop());
                        sources.current.clear();
                        nextStartTime.current = 0;
                        setIsSpeaking(false);
                    }
                },
                onclose: () => {
                    console.log("Session closed");
                    disconnect();
                    setIsOpen(false);
                },
                onerror: (e) => {
                    console.error("Live API Error:", e);
                    showToast("Connection lost. Please try again.", 'error');
                    disconnect();
                    setIsOpen(false);
                }
            },
            config: {
                responseModalities: [Modality.AUDIO],
                systemInstruction,
            }
        });
    };

    const toggleSession = async () => {
        if (isOpen) {
            setIsOpen(false);
            disconnect();
        } else {
            setIsOpen(true);
            setIsConnecting(true);
            
            // Initialize and resume audio context on user interaction to prevent autoplay blocks
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!outputAudioContext.current) {
                 outputAudioContext.current = new AudioContextClass({ sampleRate: 24000 });
            }
            if (outputAudioContext.current.state === 'suspended') {
                await outputAudioContext.current.resume();
            }
            
            startSession();
        }
    };

    return (
        <div className="fixed bottom-24 right-6 z-40 mb-16">
            <button
                onClick={toggleSession}
                className={`p-4 rounded-full shadow-lg transition-all transform hover:scale-110 focus:outline-none ring-2 ring-offset-2 ring-offset-gray-900 ${
                    isSpeaking
                    ? 'bg-red-500 text-white ring-purple-400 ring-4 animate-pulse'
                    : isConnecting
                    ? 'bg-yellow-500 text-white ring-yellow-400 animate-pulse'
                    : isOpen
                    ? 'bg-red-500 text-white ring-red-400'
                    : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white ring-purple-400'
                }`}
                title={isOpen ? "Stop Voice Assistant" : "Start Voice Assistant"}
            >
                {isOpen || isConnecting ? <StopCircleIcon className="w-6 h-6" /> : <MicrophoneWaveIcon className="w-6 h-6" />}
            </button>
        </div>
    );
};
