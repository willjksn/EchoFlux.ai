/**
 * Daily.co API Helper for Live Video Chat
 * 
 * Daily.co handles WebRTC video calls - we use their API to:
 * 1. Create private rooms for each session
 * 2. Generate meeting tokens with time limits
 * 3. Delete rooms when sessions end
 */

const DAILY_API_KEY = process.env.DAILY_API_KEY;
const DAILY_API_BASE = 'https://api.daily.co/v1';

interface DailyRoomConfig {
  name: string;
  privacy?: 'public' | 'private';
  properties?: {
    exp?: number;  // Expiration timestamp
    max_participants?: number;
    enable_chat?: boolean;
    enable_screenshare?: boolean;
    start_video_off?: boolean;
    start_audio_off?: boolean;
    eject_at_room_exp?: boolean;
  };
}

interface DailyRoom {
  id: string;
  name: string;
  url: string;
  privacy: string;
  config: Record<string, unknown>;
  created_at: string;
}

interface DailyMeetingToken {
  token: string;
}

interface DailyTokenConfig {
  room_name: string;
  user_name?: string;
  user_id?: string;
  is_owner?: boolean;
  exp?: number;
  enable_screenshare?: boolean;
  start_video_off?: boolean;
  start_audio_off?: boolean;
}

async function dailyFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  if (!DAILY_API_KEY) {
    throw new Error('DAILY_API_KEY not configured');
  }

  const response = await fetch(`${DAILY_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DAILY_API_KEY}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error || 
      `Daily.co API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Create a private video room for a live chat session
 */
export async function createVideoRoom(
  sessionId: string,
  durationMinutes: number
): Promise<{ roomUrl: string; roomName: string }> {
  const roomName = `livechat-${sessionId}`;
  
  // Room expires 15 minutes after the session duration (buffer time)
  const expirationTime = Math.floor(Date.now() / 1000) + (durationMinutes + 15) * 60;

  const room = await dailyFetch<DailyRoom>('/rooms', {
    method: 'POST',
    body: JSON.stringify({
      name: roomName,
      privacy: 'private',
      properties: {
        exp: expirationTime,
        max_participants: 2,
        enable_chat: true,
        enable_screenshare: false,
        eject_at_room_exp: true,
        start_video_off: false,
        start_audio_off: false,
      },
    } as DailyRoomConfig),
  });

  return {
    roomUrl: room.url,
    roomName: room.name,
  };
}

/**
 * Generate a meeting token for a participant
 * Tokens provide secure, time-limited access to rooms
 */
export async function createMeetingToken(
  roomName: string,
  userId: string,
  userName: string,
  isCreator: boolean,
  durationMinutes: number
): Promise<string> {
  // Token expires when the session should end (plus 5 min buffer)
  const expirationTime = Math.floor(Date.now() / 1000) + (durationMinutes + 5) * 60;

  const tokenResponse = await dailyFetch<DailyMeetingToken>('/meeting-tokens', {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        user_name: userName,
        user_id: userId,
        is_owner: isCreator,  // Creator can kick/mute
        exp: expirationTime,
        enable_screenshare: false,
        start_video_off: false,
        start_audio_off: false,
      },
    }),
  });

  return tokenResponse.token;
}

/**
 * Delete a room when the session ends
 */
export async function deleteVideoRoom(roomName: string): Promise<void> {
  try {
    await dailyFetch(`/rooms/${roomName}`, {
      method: 'DELETE',
    });
  } catch (error) {
    // Room may already be deleted or expired - log but don't throw
    console.warn(`Failed to delete room ${roomName}:`, error);
  }
}

/**
 * Get room details
 */
export async function getRoomDetails(roomName: string): Promise<DailyRoom | null> {
  try {
    return await dailyFetch<DailyRoom>(`/rooms/${roomName}`);
  } catch {
    return null;
  }
}

/**
 * Check if Daily.co is configured
 */
export function isDailyConfigured(): boolean {
  return !!DAILY_API_KEY;
}
