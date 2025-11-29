# Model Routing Implementation Guide

## Overview
We've implemented a smart model routing system that automatically selects the best AI model for each task based on complexity, cost, and performance requirements.

## Quick Start

### Basic Usage

Replace your existing model initialization:

**Before:**
```typescript
import { getModel } from "./_geminiShared.ts";
const model = getModel("gemini-2.0-flash");
```

**After:**
```typescript
const { getModelForTask } = await import("./_modelRouter.ts");
const model = getModelForTask('caption'); // or 'analytics', 'reply', etc.
```

## Task Types Available

### Low-Cost Tasks (Fast & Cheap)
- `'caption'` - Caption generation
- `'reply'` - Message replies
- `'categorize'` - Message categorization
- `'hashtags'` - Hashtag suggestions

**Model Used**: `gemini-2.0-flash-lite`
**Cost Savings**: 50-70% compared to Flash

### Medium-Cost Tasks (Balanced)
- `'strategy'` - Content strategy
- `'autopilot'` - Campaign planning
- `'brand'` - Brand suggestions
- `'critique'` - Content critique
- `'crm-summary'` - CRM summaries
- `'chatbot'` - General chatbot
- `'image-prompt'` - Image prompt expansion

**Model Used**: `gemini-2.0-flash`
**Best for**: Moderate complexity tasks

### High-Cost Tasks (Best Quality)
- `'analytics'` - Analytics insights
- `'trends'` - Trend analysis

**Model Used**: `gemini-2.0-flash-thinking-exp`
**Best for**: Complex reasoning and analysis

## Updated Routes

The following routes have been updated to use model routing:

✅ `api/generateCaptions.ts` - Uses `'caption'` task type
✅ `api/generateReply.ts` - Uses `'reply'` task type
✅ `api/categorizeMessage.ts` - Uses `'categorize'` task type
✅ `api/generateAnalyticsReport.ts` - Uses `'analytics'` task type
✅ `api/findTrends.ts` - Uses `'trends'` task type

## Examples

### Example 1: Caption Generation
```typescript
// api/generateCaptions.ts
const { getModelForTask } = await import("./_modelRouter.ts");
const model = getModelForTask('caption');
```

### Example 2: Analytics Report
```typescript
// api/generateAnalyticsReport.ts
const { getModelForTask } = await import("./_modelRouter.ts");
const model = getModelForTask('analytics');
```

### Example 3: Auto-detect Task Type
```typescript
// api/someRoute.ts
const { getModelForTask, inferTaskType } = await import("./_modelRouter.ts");

const taskType = inferTaskType({ 
  endpoint: 'generateCaptions',
  prompt: 'Create a caption for...'
});
const model = getModelForTask(taskType);
```

## Monitoring & Cost Tracking

Track model usage and costs:

```typescript
import { getModelNameForTask, getCostTierForTask } from "./_modelRouter.ts";

const modelName = getModelNameForTask('caption');
const costTier = getCostTierForTask('caption');

console.log(`Using ${modelName} (${costTier} cost tier)`);
```

## Fallback Behavior

The router automatically falls back to compatible models if the primary model fails:
- `gemini-2.0-flash-lite` → `gemini-2.0-flash` → `gemini-1.5-flash`
- `gemini-2.0-flash-thinking-exp` → `gemini-2.0-flash` → `gemini-1.5-pro`

## Next Steps

1. **Monitor Costs**: Track usage of each model to see actual savings
2. **Test Quality**: Compare output quality between models
3. **Add More Routes**: Update remaining routes to use model routing
4. **Image/Video**: Integrate specialized providers (Imagen, Veo) for media generation

## Routes Still Using Legacy Model

These routes can be updated when ready:
- `api/generateContentStrategy.ts`
- `api/generateAutopilotPlan.ts`
- `api/generateBrandSuggestions.ts`
- `api/generateCritique.ts`
- `api/generateCRMSummary.ts`
- `api/askChatbot.ts`
- `api/generateStoryboard.ts`
- `api/generateImage.ts` (needs actual image provider integration)

