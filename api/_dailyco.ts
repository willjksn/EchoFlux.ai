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
    enable_hidden_participants?: boolean;
    enable_mesh_sfu?: boolean;
    experimental_optimize_large_calls?: boolean;
    permissions?: {
      canSend?: boolean | string[];
      hasPresence?: boolean;
      canReceive?: Record<string, unknown>;
      canAdmin?: boolean | string[];
    };
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

function formatDailyApiErrorBody(errorData: Record<string, unknown>, status: number, statusText: string): string {
  const err = typeof errorData.error === "string" ? errorData.error.trim() : "";
  let infoPart = "";
  if (typeof errorData.info === "string") {
    infoPart = errorData.info.trim();
  } else if (errorData.info != null && typeof errorData.info === "object") {
    try {
      infoPart = JSON.stringify(errorData.info);
    } catch {
      infoPart = String(errorData.info);
    }
  }
  const base = [err, infoPart].filter(Boolean).join(" — ");
  return base || `HTTP ${status} ${statusText}`;
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
    const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const detail = formatDailyApiErrorBody(errorData, response.status, response.statusText);
    throw new Error(`Daily.co: ${detail}`);
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
    await dailyFetch(`/rooms/${encodeURIComponent(roomName)}`, {
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
    return await dailyFetch<DailyRoom>(`/rooms/${encodeURIComponent(roomName)}`);
  } catch {
    return null;
  }
}

function sanitizeDailyRoomSegment(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

/** Daily: only [A-Za-z0-9_-], max 128 chars (see POST /rooms docs). */
const DAILY_ROOM_NAME_OK = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Large broadcast room for fan live streams (Daily interactive live streaming / Prebuilt).
 * Reuses an existing room if the name already exists.
 */
export async function createOrGetLiveStreamBroadcastRoom(
  creatorId: string,
  streamId: string,
  durationHours: number
): Promise<{ roomUrl: string; roomName: string }> {
  const safeCreator = sanitizeDailyRoomSegment(creatorId) || "c";
  const safeStream = sanitizeDailyRoomSegment(streamId) || "s";
  let roomName = `efls-${safeCreator}-${safeStream}`.slice(0, 128);
  if (!DAILY_ROOM_NAME_OK.test(roomName)) {
    throw new Error(`Daily.co: room name failed validation after sanitize: ${roomName}`);
  }

  const existing = await getRoomDetails(roomName);
  if (existing?.url) {
    return { roomUrl: existing.url, roomName: existing.name || roomName };
  }

  const hours = Math.min(Math.max(durationHours, 1), 72);
  const expirationTime = Math.floor(Date.now() / 1000) + hours * 3600;

  // Minimal properties: omit max_participants (Daily default is 200). Extra flags have caused invalid-request-error on some domains.
  const createBody = {
    name: roomName,
    privacy: "private" as const,
    properties: {
      exp: expirationTime,
      enable_chat: true,
      enable_screenshare: true,
      eject_at_room_exp: true,
    },
  };

  try {
    const room = await dailyFetch<DailyRoom>("/rooms", {
      method: "POST",
      body: JSON.stringify(createBody),
    });
    return {
      roomUrl: room.url,
      roomName: room.name,
    };
  } catch (e) {
    // Duplicate name / race: first GET missed, POST failed — room may exist now.
    const retry = await getRoomDetails(roomName);
    if (retry?.url) {
      return { roomUrl: retry.url, roomName: retry.name || roomName };
    }
    throw e;
  }
}

/**
 * Meeting token for broadcast presenter (owner) or passive viewer (hidden participant).
 */
export async function createLiveStreamMeetingToken(
  roomName: string,
  userId: string,
  userName: string,
  role: 'presenter' | 'viewer',
  durationMinutes: number
): Promise<string> {
  const isPresenter = role === 'presenter';
  const expirationTime = Math.floor(Date.now() / 1000) + (durationMinutes + 5) * 60;

  const tokenResponse = await dailyFetch<DailyMeetingToken>('/meeting-tokens', {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        user_name: userName,
        user_id: userId,
        is_owner: isPresenter,
        exp: expirationTime,
        enable_screenshare: isPresenter,
        start_video_off: !isPresenter,
        start_audio_off: !isPresenter,
      },
    }),
  });

  return tokenResponse.token;
}

/**
 * Check if Daily.co is configured
 */
export function isDailyConfigured(): boolean {
  return !!DAILY_API_KEY;
}
