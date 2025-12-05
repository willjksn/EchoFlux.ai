# Music for Instagram Reels - Implementation Guide

## Overview

This document explains the music selection feature for Instagram Reels and other video content in EngageSuite.ai.

## Important Limitations

### Instagram's Music Library
**Instagram's music library is NOT accessible via third-party apps or APIs.** This is due to:
- Licensing restrictions from music labels
- Instagram's music library is only available within the Instagram mobile app
- Instagram's Content Publishing API does not support adding music to scheduled posts

### What This Means
When you schedule a Reel through EngageSuite.ai:
- **You CANNOT** pre-add Instagram's licensed music tracks
- **You CAN** add royalty-free music that will be embedded in your video file
- **You MUST** add Instagram's music manually when posting the Reel in the Instagram app

## Current Implementation

### Features Added

1. **Music Selection UI**
   - Available for all video content (not just Reels)
   - Located in the MediaBox component on the Compose page
   - Shows "Select Music" button for videos
   - Displays selected music track information

2. **Royalty-Free Music Library**
   - Integrated music service (`src/services/musicService.ts`)
   - Currently includes placeholder tracks
   - Supports search and genre filtering
   - Ready for integration with real music APIs

3. **Music Persistence**
   - Selected music is saved with each media item
   - Persists across page reloads and logouts
   - Stored in Firestore (`compose_media` collection)

4. **Instagram Reels Reminder**
   - Shows a yellow info box when Instagram is selected for a video
   - Reminds users that Instagram's music must be added manually
   - Explains that selected music can be embedded in the video file

### How It Works

1. **Selecting Music:**
   - Upload or select a video in the Compose page
   - Click "Select Music" button
   - Browse/search royalty-free tracks
   - Select a track (it will be saved with your video)

2. **For Instagram Reels:**
   - Select Instagram as a platform for your video
   - See the reminder note about manual music addition
   - When you post, add Instagram's music in the Instagram app

3. **For TikTok and YouTube:**
   - Music selection is saved and ready
   - Video processing API endpoint created (`/api/processVideoWithMusic`)
   - **Status**: UI is ready, but video processing needs to be integrated with a service (Cloudinary, AWS MediaConvert, etc.)
   - Currently: Music selection is saved, but video processing is not yet active
   - **Next Step**: Integrate with Cloudinary or similar service to actually merge audio with video

## Future Enhancements

### Option 1: Integrate Real Music APIs
- **YouTube Audio Library API** - Free, royalty-free music
- **Epidemic Sound API** - Premium music library (requires subscription)
- **Artlist API** - Premium music library (requires subscription)
- **Pixabay Music API** - Free music library

### Option 2: Host Your Own Music Library
- Upload royalty-free tracks to Firebase Storage
- Create a music library management system
- Allow users to upload their own licensed music

### Option 3: Video Processing Service (IN PROGRESS)
- ✅ API endpoint created (`/api/processVideoWithMusic`)
- ✅ Logic added to check for music selection on TikTok/YouTube videos
- ⏳ **NEEDS**: Integration with video processing service:
  - **Cloudinary** (recommended - easy integration, good free tier)
  - **AWS MediaConvert** (more complex, but powerful)
  - **ffmpeg.wasm** (client-side, limited by browser)
- Once integrated, music will automatically be embedded into videos for TikTok and YouTube

## Technical Details

### Files Modified

1. **`types.ts`**
   - Added `MusicTrack` interface
   - Extended `MediaItemState` with `selectedMusic` and `musicNote` fields

2. **`src/services/musicService.ts`** (New)
   - Music library service
   - Search and filter functions
   - Ready for API integration

3. **`components/MediaBox.tsx`**
   - Added music selection UI
   - Music modal with search/filter
   - Instagram Reels reminder note

4. **`components/Compose.tsx`**
   - Updated to persist music selection
   - Loads music data from Firestore
   - Checks for music selection when uploading videos
   - Calls video processing API for TikTok/YouTube (when processing is available)

5. **`api/processVideoWithMusic.ts`** (New)
   - API endpoint for processing videos with music
   - Currently returns original video (placeholder)
   - Ready for Cloudinary or AWS MediaConvert integration

### Data Structure

```typescript
interface MusicTrack {
  id: string;
  name: string;
  artist: string;
  url: string; // URL to audio file
  duration: number; // in seconds
  genre?: string;
  mood?: string;
}

interface MediaItemState {
  // ... existing fields
  selectedMusic?: MusicTrack;
  musicNote?: string;
}
```

## User Instructions

### For Instagram Reels:
1. Create your video content in EngageSuite.ai
2. Select Instagram as a platform
3. Optionally select royalty-free music (will be embedded in video)
4. Schedule or save your post
5. When posting in Instagram app:
   - Open Instagram
   - Go to Reels
   - Upload your video
   - Tap the music icon
   - Select a track from Instagram's library
   - Post your Reel

### For TikTok and YouTube:
1. Create your video content
2. Select music from the royalty-free library
3. Select TikTok and/or YouTube as platforms (not Instagram)
4. **Current Status**: Music selection is saved, but video processing needs to be integrated
5. **Coming Soon**: Music will automatically be embedded into the video file
6. For now: Music selection is saved for reference, but you'll need to add music manually or use a video editor

## Legal Considerations

- **Royalty-Free Music**: All music in the library must be royalty-free or properly licensed
- **User-Uploaded Music**: Users must have rights to any music they upload
- **Instagram Music**: Instagram's music library is covered by Instagram's licensing agreements
- **Copyright Compliance**: Always ensure you have proper rights to use music

## Recommendations

1. **For Production**: Replace placeholder music URLs with real royalty-free tracks
2. **Consider Integration**: Integrate with YouTube Audio Library or similar service
3. **Video Processing**: Add video processing to embed music into video files
4. **User Education**: Clearly communicate limitations to users
5. **Documentation**: Keep this document updated as features evolve

## Support

If users have questions about music for Reels:
- Explain Instagram's limitations
- Direct them to use royalty-free music for other platforms
- Show them how to add music manually in Instagram app
- Consider creating a tutorial video

