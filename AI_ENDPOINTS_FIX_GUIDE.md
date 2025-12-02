# AI Endpoints Fix Guide

## Problem
All AI endpoints are returning 500 errors due to:
1. Static imports causing module initialization errors
2. Missing API key checks
3. Errors returning 500 instead of 200 with error details

## Solution Pattern

All AI endpoints should follow this pattern:

```typescript
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.ts";

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 1. Check API keys early
  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    return res.status(200).json({
      success: false,
      error: "AI not configured",
      note: apiKeyCheck.error,
    });
  }

  // 2. Dynamic import for auth
  let user;
  try {
    const verifyAuth = await getVerifyAuth();
    user = await verifyAuth(req);
  } catch (authError: any) {
    return res.status(200).json({
      success: false,
      error: "Authentication error",
      note: authError?.message || "Failed to verify authentication.",
    });
  }

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // 3. Your endpoint logic here
  try {
    const getModelForTask = await getModelRouter();
    const model = await getModelForTask('taskType', user.uid);
    // ... rest of logic
  } catch (err: any) {
    return res.status(200).json({
      success: false,
      error: "Operation failed",
      note: err?.message || "An unexpected error occurred.",
      details: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    });
  }
}

export default withErrorHandling(handler);
```

## Endpoints Fixed ✅
- ✅ `generateReply.ts`
- ✅ `categorizeMessage.ts`
- ✅ `askChatbot.ts`
- ✅ `findTrendsByNiche.ts`

## Endpoints Still Needing Fix ⚠️
- ⚠️ `generateCaptions.ts` (has some error handling but uses static imports)
- ⚠️ `generateContentStrategy.ts`
- ⚠️ `generateAutopilotSuggestions.ts` (has dynamic imports but returns 500 errors)
- ⚠️ `generateAutopilotPlan.ts`
- ⚠️ `generateImage.ts`
- ⚠️ `generateVideo.ts`
- ⚠️ `generateAnalyticsReport.ts`
- ⚠️ `generateBrandSuggestions.ts`
- ⚠️ `generateCritique.ts`
- ⚠️ `generateCRMSummary.ts`
- ⚠️ `generateStoryboard.ts`
- ⚠️ `findTrends.ts`

## Key Changes Needed

1. **Replace static imports** with dynamic imports:
   ```typescript
   // ❌ OLD
   import { verifyAuth } from "./verifyAuth.ts";
   const user = await verifyAuth(req);
   
   // ✅ NEW
   const verifyAuth = await getVerifyAuth();
   const user = await verifyAuth(req);
   ```

2. **Add API key check** at the start:
   ```typescript
   const apiKeyCheck = checkApiKeys();
   if (!apiKeyCheck.hasKey) {
     return res.status(200).json({ success: false, error: "AI not configured", note: apiKeyCheck.error });
   }
   ```

3. **Wrap handler** with error handler:
   ```typescript
   export default withErrorHandling(handler);
   ```

4. **Change 500 errors to 200** with error details:
   ```typescript
   // ❌ OLD
   return res.status(500).json({ error: "Failed" });
   
   // ✅ NEW
   return res.status(200).json({
     success: false,
     error: "Failed",
     note: err?.message || "An unexpected error occurred.",
   });
   ```

