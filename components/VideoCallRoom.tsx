import React, { useEffect, useRef, useState, useCallback } from "react";
import { useAppContext } from "./AppContext";
import { auth } from "../firebaseConfig";

interface VideoCallRoomProps {
  sessionId: string;
  creatorId: string;
  onLeave: () => void;
  onSessionEnd?: (minutesUsed: number) => void;
}

const PhoneIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 3H8a2 2 0 00-2 2v14a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="10" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
  </svg>
);

const MicIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);

const MicOffIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
  </svg>
);

const VideoIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const VideoOffIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
  </svg>
);

const EndCallIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
  </svg>
);

export const VideoCallRoom: React.FC<VideoCallRoomProps> = ({
  sessionId,
  creatorId,
  onLeave,
  onSessionEnd,
}) => {
  const { user, showToast } = useAppContext();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [isCreator, setIsCreator] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  // Fetch meeting token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const authToken = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
        if (!authToken) {
          setError("Please sign in to join the video call");
          setIsLoading(false);
          return;
        }

        const res = await fetch("/api/liveVideoChat?action=token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ sessionId, creatorId }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || "Failed to join video call");
        }

        const data = await res.json();
        setRoomUrl(data.roomUrl);
        setToken(data.token);
        setDurationMinutes(data.durationMinutes || 10);
        setIsCreator(data.isCreator || false);
        setTimeRemaining(data.durationMinutes * 60);
        setIsLoading(false);
      } catch (e) {
        console.error("Failed to get video token:", e);
        setError(e instanceof Error ? e.message : "Failed to join video call");
        setIsLoading(false);
      }
    };

    fetchToken();
  }, [sessionId, creatorId]);

  // Mark session as started
  const markSessionStarted = useCallback(async () => {
    try {
      const authToken = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      if (!authToken) return;

      await fetch("/api/liveVideoChat?action=start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ sessionId, creatorId }),
      });

      setSessionStartTime(Date.now());
    } catch (e) {
      console.error("Failed to mark session started:", e);
    }
  }, [sessionId, creatorId]);

  // End session
  const endSession = useCallback(async () => {
    try {
      const authToken = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      if (!authToken) return;

      const minutesUsed = sessionStartTime 
        ? Math.ceil((Date.now() - sessionStartTime) / 60000)
        : 0;

      await fetch("/api/liveVideoChat?action=end", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ sessionId, creatorId, minutesUsed }),
      });

      onSessionEnd?.(minutesUsed);
      onLeave();
    } catch (e) {
      console.error("Failed to end session:", e);
      showToast?.("Failed to end session properly", "error");
      onLeave();
    }
  }, [sessionId, creatorId, sessionStartTime, onLeave, onSessionEnd, showToast]);

  // Timer countdown
  useEffect(() => {
    if (timeRemaining === null || !sessionStartTime) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
      const remaining = durationMinutes * 60 - elapsed;
      
      if (remaining <= 0) {
        clearInterval(interval);
        showToast?.("Time's up! Session ending...", "info");
        endSession();
      } else {
        setTimeRemaining(remaining);
        
        // Warning at 1 minute
        if (remaining === 60) {
          showToast?.("1 minute remaining", "info");
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionStartTime, durationMinutes, endSession, showToast]);

  // Format time remaining
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Handle leaving
  const handleLeave = () => {
    if (window.confirm("Are you sure you want to leave the call?")) {
      endSession();
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-lg">Connecting to video call...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white max-w-md mx-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
            <PhoneIcon />
          </div>
          <h2 className="text-xl font-bold mb-2">Unable to Join</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={onLeave}
            className="px-6 py-3 bg-white text-gray-900 rounded-lg font-medium hover:bg-gray-100 transition"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Construct Daily.co iframe URL with token
  const dailyUrl = roomUrl && token ? `${roomUrl}?t=${token}` : null;

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-800/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-pink-500 flex items-center justify-center">
            <VideoIcon />
          </div>
          <div>
            <h2 className="text-white font-semibold">Live Video Chat</h2>
            <p className="text-gray-400 text-sm">
              {isCreator ? "You're the host" : "Connected"}
            </p>
          </div>
        </div>
        
        {/* Timer */}
        {timeRemaining !== null && sessionStartTime && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${
            timeRemaining <= 60 ? "bg-red-500/20 text-red-400" : "bg-gray-700 text-white"
          }`}>
            <ClockIcon />
            <span className="font-mono font-bold text-lg">{formatTime(timeRemaining)}</span>
          </div>
        )}
      </div>

      {/* Video Area */}
      <div className="flex-1 relative">
        {dailyUrl ? (
          <iframe
            ref={iframeRef}
            src={dailyUrl}
            allow="camera; microphone; fullscreen; display-capture"
            className="w-full h-full border-0"
            onLoad={() => {
              markSessionStarted();
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-white">
            <p>Preparing video room...</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 p-6 bg-gray-800/80 backdrop-blur">
        <button
          onClick={() => setIsMuted(!isMuted)}
          className={`p-4 rounded-full transition ${
            isMuted 
              ? "bg-red-500 text-white" 
              : "bg-gray-700 text-white hover:bg-gray-600"
          }`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOffIcon /> : <MicIcon />}
        </button>
        
        <button
          onClick={() => setIsVideoOff(!isVideoOff)}
          className={`p-4 rounded-full transition ${
            isVideoOff 
              ? "bg-red-500 text-white" 
              : "bg-gray-700 text-white hover:bg-gray-600"
          }`}
          title={isVideoOff ? "Turn camera on" : "Turn camera off"}
        >
          {isVideoOff ? <VideoOffIcon /> : <VideoIcon />}
        </button>
        
        <button
          onClick={handleLeave}
          className="p-4 rounded-full bg-red-600 text-white hover:bg-red-700 transition"
          title="End call"
        >
          <EndCallIcon />
        </button>
      </div>
    </div>
  );
};

export default VideoCallRoom;
