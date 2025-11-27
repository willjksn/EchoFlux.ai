
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { MicrophoneWaveIcon, StopCircleIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';

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

    if (!process.env.API_KEY) {
      showToast("API Key is missing.", "error");
      setIsOpen(false);
      return;
    }

    setIsConnecting(true);

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!inputAudioContext.current) inputAudioContext.current = new AudioContextClass({ sampleRate: 16000 });
    if (!outputAudioContext.current) outputAudioContext.current = new AudioContextClass({ sampleRate: 24000 });

    const outputNode = outputAudioContext.current.createGain();
    outputNode.connect(outputAudioContext.current.destination);

    const systemInstruction = `
      You are "Engage", an expert Social Media Strategist and Assistant for ${user.name}.
      Keep responses short and helpful.
      Ask "How can I help you today?" on connect.
    `;

    sessionPromise.current = ai.live.connect({
      model: "gemini-2.5-flash-native-audio-preview-09-2025",
      callbacks: {
        onopen: async () => {
          setIsConnecting(false);
          showToast("Voice Assistant Connected.", "success");

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
            showToast("Microphone access blocked.", "error");
            disconnect();
          }
        },

        onmessage: async (msg: LiveServerMessage) => {
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
          } catch (err) {
            console.error("Decode fail:", err);
          }
        },

        onclose: () => {
          disconnect();
          setIsOpen(false);
        },

        onerror: (err) => {
          console.error("Live API Error:", err);
          showToast("Connection lost.", "error");
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
      <button
        onClick={toggleSession}
        className={`p-4 rounded-full shadow-lg transition-all transform hover:scale-110 ${
          isSpeaking ? "bg-red-500 animate-pulse" :
          isConnecting ? "bg-yellow-500 animate-pulse" :
          isOpen ? "bg-red-500" :
          "bg-gradient-to-r from-purple-600 to-pink-600"
        }`}
      >
        {isOpen || isConnecting ? <StopCircleIcon className="w-6 h-6" /> : <MicrophoneWaveIcon className="w-6 h-6" />}
      </button>
    </div>
  );
};
