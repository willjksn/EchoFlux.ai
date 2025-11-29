# AI Model Routing Strategy

## Overview
Different AI tasks require different models based on complexity, cost, and performance requirements. This document outlines the strategy for routing tasks to optimal models.

## Model Selection Matrix

### 1. **Captions & Short Text Generation** (Cheapest)
- **Primary Model**: `gemini-2.0-flash-lite` or `gemini-1.5-flash`
- **Use Cases**: 
  - Caption generation
  - Short replies to messages
  - Hashtag suggestions
  - Simple categorization
- **Why**: Fast, cheap, good enough for simple text tasks
- **Estimated Cost**: ~$0.075 per 1M input tokens, ~$0.30 per 1M output tokens

### 2. **Analytics & Insights** (Thinking Models)
- **Primary Model**: `gemini-2.0-flash-thinking-exp` or `gemini-1.5-pro`
- **Fallback**: `gemini-2.0-flash`
- **Use Cases**:
  - Analytics reports
  - Trend analysis
  - Competitor insights
  - Strategic recommendations
  - Complex reasoning tasks
- **Why**: Needs deeper analysis, pattern recognition, and reasoning
- **Estimated Cost**: Thinking models ~$0.50-1.50 per 1M tokens, Pro ~$1.25-5.00 per 1M tokens

### 3. **Content Strategy & Planning** (Balanced)
- **Primary Model**: `gemini-2.0-flash`
- **Fallback**: `gemini-1.5-pro` for complex multi-week plans
- **Use Cases**:
  - Content strategy generation
  - Autopilot campaign plans
  - Brand suggestions
  - Storyboard creation
- **Why**: Moderate complexity, needs good structure but not deep reasoning
- **Estimated Cost**: ~$0.075 per 1M input tokens

### 4. **Image Generation**
- **Primary**: Imagen 3 (via Google Vertex AI)
- **Fallback**: DALL-E 3 (via OpenAI), Stable Diffusion (via Stability AI)
- **Use Cases**: Image creation for social media posts
- **Why**: Specialized image models outperform text models
- **Estimated Cost**: ~$0.02-0.04 per image (Imagen 3), $0.04-0.12 (DALL-E 3)

### 5. **Video Generation**
- **Primary**: Veo 2 (via Google Vertex AI) 
- **Fallback**: Runway Gen-3, Pika Labs API
- **Use Cases**: Short video clips for social media
- **Why**: Video generation requires specialized models
- **Estimated Cost**: ~$0.05-0.10 per second of video (Veo), varies by platform

### 6. **Voice/Speech Generation**
- **Primary**: Google Cloud Text-to-Speech (Premium voices)
- **Fallback**: ElevenLabs API (for voice cloning)
- **Use Cases**: Voice-over generation for videos
- **Estimated Cost**: ~$4-16 per 1M characters (Google TTS), varies for ElevenLabs

## Implementation Strategy

### Phase 1: Gemini Model Routing (Immediate)
1. Create model router based on task type
2. Route simple tasks to Flash/Flash-Lite
3. Route complex tasks to Thinking/Pro models
4. **Benefit**: Immediate cost savings on high-volume tasks

### Phase 2: Multi-Provider Integration (Future)
1. Add OpenAI for alternative text generation
2. Integrate Imagen 3 for image generation
3. Integrate Veo 2 for video generation
4. **Benefit**: Best-in-class for each modality

### Phase 3: Cost Optimization (Advanced)
1. A/B test model performance
2. Implement fallback chains
3. Add usage analytics
4. **Benefit**: Continuous cost optimization

## Environment Variables Needed

```env
# Gemini (Current)
GEMINI_API_KEY=your_key_here

# Optional - For image/video generation
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json

# Optional - Alternative providers
OPENAI_API_KEY=your_key_here  # For DALL-E fallback
STABILITY_API_KEY=your_key_here  # For Stable Diffusion fallback
RUNWAY_API_KEY=your_key_here  # For video generation
ELEVENLABS_API_KEY=your_key_here  # For voice cloning
```

## Cost Comparison (Approximate)

| Task Type | Current Model | Recommended Model | Cost Savings |
|-----------|--------------|-------------------|--------------|
| Captions | gemini-2.0-flash | gemini-2.0-flash-lite | 50-70% |
| Analytics | gemini-2.0-flash | gemini-2.0-flash-thinking | Better quality, similar cost |
| Strategy | gemini-2.0-flash | gemini-2.0-flash | No change |
| Images | N/A | Imagen 3 | New capability |
| Videos | N/A | Veo 2 | New capability |

## Next Steps
1. ✅ Create model routing service
2. ✅ Update API routes to use router
3. ⏳ Test with different models
4. ⏳ Integrate image/video providers
5. ⏳ Monitor costs and performance

