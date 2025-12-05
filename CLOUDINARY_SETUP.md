# Cloudinary Setup for Video Processing

## Overview

Cloudinary has been integrated for video processing, but **full audio merging requires additional setup**.

## Current Status

✅ **What's Working:**
- Cloudinary SDK installed
- Video upload to Cloudinary
- Audio track upload to Cloudinary
- Video optimization (format, codec, quality)

⏳ **What Needs Setup:**
- Audio merging with video (requires additional service)

## Why Audio Merging Needs Additional Setup

Cloudinary's transformation API doesn't directly support merging audio tracks with videos. The `overlay` feature is for visual overlays, not audio mixing.

## Options for Audio Merging

### Option 1: Backend Service with ffmpeg (Recommended)

Create a separate API endpoint or service that uses ffmpeg to merge audio:

```typescript
// Example: Use a service like AWS Lambda with ffmpeg
// or a dedicated video processing service
```

**Pros:**
- Full control over audio mixing
- Can adjust volume levels
- Can trim/loop audio to match video length
- Professional quality

**Cons:**
- Requires additional infrastructure
- More complex setup

### Option 2: Cloudinary Video Editing API

Cloudinary offers a video editing API (may require premium plan):

```typescript
// Use Cloudinary's video editing API
// This requires both files to be uploaded first
```

**Pros:**
- Integrated with Cloudinary
- Server-side processing
- No additional infrastructure

**Cons:**
- May require premium plan
- Limited customization

### Option 3: Client-Side Processing (Limited)

Use `ffmpeg.wasm` in the browser:

```typescript
// Process videos client-side
// Limited by browser capabilities and file size
```

**Pros:**
- No backend required
- Free

**Cons:**
- Limited to small videos
- Browser performance issues
- User's device does the processing

## Environment Variables Required

Add these to your Vercel environment variables:

```
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## Getting Cloudinary Credentials

1. Sign up at https://cloudinary.com
2. Go to Dashboard
3. Copy your Cloud Name, API Key, and API Secret
4. Add them to Vercel environment variables

## Next Steps

1. **For MVP/Testing:** Current implementation works - videos are uploaded and optimized. Audio tracks are saved for reference.

2. **For Production:** Choose one of the audio merging options above and implement it.

3. **Recommended:** Set up an AWS Lambda function with ffmpeg or use a video processing service like:
   - AWS MediaConvert
   - Mux
   - Video.js processing service
   - Custom backend with ffmpeg

## Testing

The current implementation will:
- ✅ Upload videos to Cloudinary
- ✅ Upload audio tracks to Cloudinary
- ✅ Optimize videos (format, codec, quality)
- ⏳ Return optimized video URL (audio not yet merged)

To test:
1. Select a video in Compose
2. Select music
3. Select TikTok or YouTube (not Instagram)
4. Upload/Schedule
5. Video will be uploaded to Cloudinary and optimized
6. Audio track will be saved for reference

## Future Enhancement

Once audio merging is implemented:
- Music will be automatically embedded in videos
- Videos will be ready to post to TikTok/YouTube
- No manual editing required

