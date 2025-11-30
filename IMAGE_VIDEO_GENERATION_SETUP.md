# Image & Video Generation Setup Guide

This guide explains how to connect real image and video generation services to EngageSuite.ai.

---

## Current Status

- ❌ **Image Generation**: Only returns text prompts, not actual images
- ❌ **Video Generation**: Not implemented (returns 501 error)

---

## Supported Providers

### Image Generation Options:

1. **OpenAI DALL-E 3** (Recommended - Best quality, easiest)
   - High quality images
   - Good prompt understanding
   - Requires: `OPENAI_API_KEY`

2. **Replicate** (Flexible - Multiple models)
   - Supports Stable Diffusion, Flux, etc.
   - Requires: `REPLICATE_API_TOKEN`

3. **Google Imagen 3** (If available via Vertex AI)
   - Integration with existing Gemini setup
   - Requires: Google Cloud setup

### Video Generation Options:

1. **Replicate** (Recommended)
   - Supports Runway, Pika, Stable Video Diffusion
   - Requires: `REPLICATE_API_TOKEN`

2. **Stability AI** (If available)
   - Video generation API
   - Requires: Stability AI API key

---

## Implementation Plan

### Phase 1: Image Generation (OpenAI DALL-E 3)
1. Update `api/generateImage.ts` to use OpenAI DALL-E 3
2. Handle base image input for image-to-image
3. Return base64 image data
4. Update model router to use correct model for image prompts

### Phase 2: Video Generation (Replicate)
1. Implement `api/generateVideo.ts` with Replicate
2. Add async job polling for video generation
3. Return video URL when ready
4. Add status endpoint for checking video generation progress

### Phase 3: Multi-Provider Support
1. Add provider configuration
2. Allow switching between providers
3. Fallback options if one fails

---

## Environment Variables Needed

```env
# OpenAI (for DALL-E 3 image generation)
OPENAI_API_KEY=your_openai_api_key

# Replicate (for video generation and alternative image models)
REPLICATE_API_TOKEN=your_replicate_api_token

# Optional: Google Vertex AI (for Imagen)
# GOOGLE_CLOUD_PROJECT_ID=your_project_id
# GOOGLE_APPLICATION_CREDENTIALS=path_to_credentials.json
```

---

## Quick Start

1. Get API keys:
   - OpenAI: https://platform.openai.com/api-keys
   - Replicate: https://replicate.com/account/api-tokens

2. Add to `.env.local` (local) and Vercel (production)

3. Code will automatically use configured providers

---

## Testing

Once implemented:
1. Go to Compose → Image tab
2. Enter a prompt
3. Click Generate
4. Should see actual image (not just prompt text)

For video:
1. Go to Compose → Video tab  
2. Enter prompt or upload image
3. Click Generate
4. Video will be generated asynchronously

---

Let's start implementing!
