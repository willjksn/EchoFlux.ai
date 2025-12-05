import { MusicTrack } from '../../types';

/**
 * Royalty-free music tracks for Reels
 * These are placeholder tracks - in production, you would integrate with:
 * - YouTube Audio Library API
 * - Epidemic Sound API
 * - Artlist API
 * - Or host your own royalty-free music library
 */
export const ROYALTY_FREE_MUSIC: MusicTrack[] = [
  {
    id: 'upbeat-1',
    name: 'Upbeat Pop',
    artist: 'Royalty Free',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', // Example URL
    duration: 30,
    genre: 'Pop',
    mood: 'Energetic',
  },
  {
    id: 'chill-1',
    name: 'Chill Vibes',
    artist: 'Royalty Free',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    duration: 30,
    genre: 'Ambient',
    mood: 'Relaxed',
  },
  {
    id: 'trendy-1',
    name: 'Trendy Beat',
    artist: 'Royalty Free',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    duration: 30,
    genre: 'Hip-Hop',
    mood: 'Trendy',
  },
  {
    id: 'motivational-1',
    name: 'Motivational',
    artist: 'Royalty Free',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    duration: 30,
    genre: 'Electronic',
    mood: 'Motivational',
  },
  {
    id: 'funny-1',
    name: 'Fun & Playful',
    artist: 'Royalty Free',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    duration: 30,
    genre: 'Comedy',
    mood: 'Funny',
  },
];

/**
 * Get music tracks filtered by genre or mood
 */
export function getMusicTracks(filters?: { genre?: string; mood?: string }): MusicTrack[] {
  if (!filters) return ROYALTY_FREE_MUSIC;
  
  return ROYALTY_FREE_MUSIC.filter(track => {
    if (filters.genre && track.genre !== filters.genre) return false;
    if (filters.mood && track.mood !== filters.mood) return false;
    return true;
  });
}

/**
 * Search music tracks by name or artist
 */
export function searchMusicTracks(query: string): MusicTrack[] {
  const lowerQuery = query.toLowerCase();
  return ROYALTY_FREE_MUSIC.filter(
    track =>
      track.name.toLowerCase().includes(lowerQuery) ||
      track.artist.toLowerCase().includes(lowerQuery) ||
      track.genre?.toLowerCase().includes(lowerQuery) ||
      track.mood?.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get unique genres from music library
 */
export function getMusicGenres(): string[] {
  const genres = ROYALTY_FREE_MUSIC.map(track => track.genre).filter(Boolean) as string[];
  return [...new Set(genres)];
}

/**
 * Get unique moods from music library
 */
export function getMusicMoods(): string[] {
  const moods = ROYALTY_FREE_MUSIC.map(track => track.mood).filter(Boolean) as string[];
  return [...new Set(moods)];
}

