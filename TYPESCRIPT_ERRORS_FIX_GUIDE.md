# TypeScript Errors Fix Guide

## Current Status

✅ **Fixed:**
- Created missing `tsconfig.app.json` 
- Created missing `tsconfig.api.json`
- These files were referenced in `package.json` but didn't exist

## Common Issues & Fixes

### 1. `generateSextingSuggestion.ts` Errors

**Issue:** If `api/generateSextingSuggestion.ts` doesn't exist but is referenced somewhere, you have two options:

**Option A: Create the file** (if it should exist):
```typescript
// api/generateSextingSuggestion.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(503).json({ success: false, error: "AI not configured" });
    return;
  }

  let user;
  try {
    const verifyAuth = await getVerifyAuth();
    user = await verifyAuth(req);
  } catch (authError: any) {
    res.status(401).json({ success: false, error: "Authentication error" });
    return;
  }

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { prompt, context } = (req.body || {}) as { prompt?: string; context?: any };

  if (!prompt) {
    res.status(400).json({ error: "Missing 'prompt' in body" });
    return;
  }

  try {
    const getModelForTask = await getModelRouter();
    const model = await getModelForTask('reply', user.uid);

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const suggestion = result.response.text().trim();

    res.status(200).json({ suggestion });
  } catch (err: any) {
    console.error("generateSextingSuggestion error:", err);
    res.status(500).json({ error: err?.message || "Failed to generate suggestion" });
  }
}

export default withErrorHandling(handler);
```

**Option B: Remove references** (if the feature was removed):
- Search for `generateSextingSuggestion` in your codebase
- Remove or update any imports/calls to this endpoint

### 2. "Hidden" Items Errors

**Issue:** TypeScript complaining about accessing properties on objects that might not exist (plan-based features, user settings, etc.)

**Common Patterns:**
- Accessing properties on `user` that might not exist based on plan
- Accessing nested properties without proper type guards
- Using optional chaining incorrectly

**Fixes:**

```typescript
// ❌ Bad - assumes property exists
const featureEnabled = user.plan === 'Elite' && user.settings?.featureX;

// ✅ Good - proper type checking
const featureEnabled = user?.plan === 'Elite' && user?.settings?.featureX;

// ❌ Bad - accessing nested property
const value = user.settings.tone.formality;

// ✅ Good - optional chaining
const value = user?.settings?.tone?.formality;
```

### 3. Missing Type Definitions

**Common Issues:**
- Missing types for API responses
- Missing types for Firestore documents
- Missing types for component props

**Fix:** Add proper type definitions:

```typescript
// Add to types.ts if missing
export interface User {
  id: string;
  plan?: Plan;
  settings?: Settings;
  // ... other properties
}
```

## Quick Fix Commands

```powershell
# 1. Run TypeScript check to see all errors
npm run typecheck

# 2. If files are missing, check what's importing them
# Search for generateSextingSuggestion references
Get-ChildItem -Recurse -Include *.ts,*.tsx | Select-String "generateSextingSuggestion"

# 3. Common fixes for hidden items:
# - Add optional chaining (?.)
# - Add type guards
# - Add default values
```

## Safe Fixes You Can Apply

1. **Add optional chaining** - If accessing properties that might not exist
2. **Add type assertions** - If you're certain about types
3. **Add default values** - If properties might be undefined
4. **Fix import paths** - If imports are incorrect
5. **Remove unused imports** - Clean up imports

## After Fixes

Run these to verify:
```powershell
npm run typecheck:app
npm run typecheck:api
npm run build
```

Would you like me to:
1. Search for all `generateSextingSuggestion` references and fix them?
2. Check for "hidden" property access issues and add optional chaining?
3. Review specific files that are causing errors?
