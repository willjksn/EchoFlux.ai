# Platform Capability Matrix - Complete Guide

## What is the Capability Matrix?

The **Platform Capability Matrix** is a centralized data structure that defines which features each social media platform supports. It's a single source of truth that the UI uses to:

1. **Show/hide features** based on platform capabilities
2. **Display helpful tooltips** explaining limitations
3. **Validate operations** before attempting them
4. **Provide clear feedback** to users about what's available

---

## How It Works

### Core Structure

```typescript
PLATFORM_CAPABILITIES: Record<Platform, PlatformCapabilities>

// Example:
{
  Instagram: {
    publishing: true,           // ✅ Fully supported
    inbox: true,                // ✅ Fully supported
    analytics: true,            // ✅ Fully supported
    comments: true              // ✅ Fully supported
  },
  X: {
    publishing: true,           // ✅ Fully supported
    inbox: "paid_api",          // ⚠️ Requires paid API tier
    analytics: "paid_api",      // ⚠️ Requires paid API tier
    comments: true              // ✅ Fully supported
  },
  TikTok: {
    publishing: true,           // ✅ Fully supported
    inbox: false,               // ❌ Not supported
    comments: false,            // ❌ Not supported
    analytics: "basic"          // ⚠️ Basic support only
  }
}
```

### Capability Values

Each capability can have one of these values:

| Value | Meaning | Example |
|-------|---------|---------|
| `true` | **Fully supported** - Feature works completely | Instagram inbox |
| `false` | **Not supported** - Feature unavailable | TikTok inbox |
| `"limited"` | **Partially supported** - Works with restrictions | YouTube comments |
| `"paid_api"` | **Requires paid API tier** - Need upgraded plan | X inbox |
| `"bot_opt_in"` | **Requires bot setup** - User must configure bot | Discord DM auto-reply |
| `"own_posts_only"` | **Only on your posts** - Limited scope | Reddit inbox |
| `"channels_only"` | **Channels only** - Not DMs | Discord comments |
| `"basic"` | **Basic support** - Limited functionality | TikTok analytics |
| `"custom"` | **Custom implementation** - Special handling needed | Discord analytics |
| `"external_only"` | **External tools required** | TikTok trend detection |
| `"public_search"` | **Public search only** | Reddit trend detection |
| `"moderator_features_optional"` | **Moderator features available** | Reddit community features |

---

## Available Capabilities

The matrix defines these feature capabilities:

### Core Features
- **`publishing`** - Can publish posts/content
- **`reels_publishing`** - Can publish Reels/short videos (Instagram only)
- **`stories_publishing`** - Can publish Stories (Instagram only)

### Communication Features
- **`inbox`** - Can access/manage messages/DMs
- **`comments`** - Can read/respond to comments
- **`dm_auto_reply`** - Can set up automated DM replies

### Analytics & Insights
- **`analytics`** - Can access analytics/data
- **`trend_detection`** - Can detect trending topics

### Community Features
- **`community_features`** - Advanced community management features

---

## Helper Functions

The matrix comes with utility functions to check capabilities:

### 1. `hasCapability(platform, capability)`
**Returns:** `boolean` - True if platform supports the capability (even if limited)

```typescript
hasCapability('X', 'inbox')        // true (even though it's "paid_api")
hasCapability('TikTok', 'inbox')   // false (not supported)
hasCapability('Instagram', 'inbox') // true (fully supported)
```

**Use case:** Show/hide UI elements based on whether a feature exists at all.

---

### 2. `isFullySupported(platform, capability)`
**Returns:** `boolean` - True only if capability value is exactly `true`

```typescript
isFullySupported('Instagram', 'inbox')  // true ✅
isFullySupported('X', 'inbox')          // false ⚠️ (it's "paid_api")
isFullySupported('TikTok', 'inbox')     // false ❌
```

**Use case:** Decide whether to show a warning icon or full support badge.

---

### 3. `getCapability(platform, capability)`
**Returns:** `CapabilityValue | undefined` - The actual value from the matrix

```typescript
getCapability('X', 'inbox')          // "paid_api"
getCapability('Instagram', 'inbox')  // true
getCapability('TikTok', 'inbox')     // false
```

**Use case:** Get the exact value to display in tooltips or conditional logic.

---

### 4. `getCapabilityDescription(value)`
**Returns:** `string` - Human-readable description of the value

```typescript
getCapabilityDescription(true)              // "Fully supported"
getCapabilityDescription("paid_api")        // "Requires paid API tier"
getCapabilityDescription("bot_opt_in")      // "Requires bot setup"
getCapabilityDescription("own_posts_only")  // "Only on your posts"
```

**Use case:** Display tooltip text explaining limitations.

---

### 5. `getPlatformsWithCapability(capability, fullySupportedOnly?)`
**Returns:** `Platform[]` - List of platforms that support the capability

```typescript
getPlatformsWithCapability('inbox')
// Returns: ['Instagram', 'Facebook', 'X', 'Discord', 'Telegram', 'Reddit']

getPlatformsWithCapability('inbox', true)  // Only fully supported
// Returns: ['Instagram', 'Facebook', 'Discord', 'Telegram']
```

**Use case:** Filter platform lists, show which platforms support a feature.

---

## Real-World Usage Example

### In Settings Component (Connected Accounts)

```typescript
import { hasCapability, getCapability, isFullySupported, getCapabilityDescription } from '../src/services/platformCapabilities';

// For each connected platform, show capability badges:
{isConnected && (
  <div className="mt-1.5 flex flex-wrap gap-1">
    {/* Posting badge - only show if platform supports posting */}
    {hasCapability(platform, 'publishing') && (
      <span
        className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700"
        title={
          isFullySupported(platform, 'publishing')
            ? 'Posting: Fully supported'
            : `Posting: ${getCapabilityDescription(getCapability(platform, 'publishing') || false)}`
        }
      >
        Posting
        {!isFullySupported(platform, 'publishing') && ' ⚠️'}
      </span>
    )}
    
    {/* Inbox badge */}
    {hasCapability(platform, 'inbox') && (
      <span
        className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700"
        title={
          isFullySupported(platform, 'inbox')
            ? 'Inbox: Fully supported'
            : `Inbox: ${getCapabilityDescription(getCapability(platform, 'inbox') || false)}`
        }
      >
        Inbox
        {!isFullySupported(platform, 'inbox') && ' ⚠️'}
      </span>
    )}
  </div>
)}
```

### How It Renders:

**Instagram (fully supported):**
```
[Instagram Icon] Instagram  ✓
Posting  Inbox  Analytics
```

**X (paid API required):**
```
[X Icon] X  ✓
Posting  Inbox ⚠️  Analytics ⚠️
```
*Hover over "Inbox ⚠️" shows: "Inbox: Requires paid API tier"*

**TikTok (no inbox):**
```
[TikTok Icon] TikTok  ✓
Posting  Analytics ⚠️
```
*No Inbox badge because `hasCapability('TikTok', 'inbox')` returns `false`*

---

## Platform Examples

### Instagram
- ✅ **Publishing:** Fully supported (including Reels)
- ✅ **Inbox:** Fully supported
- ✅ **Comments:** Fully supported
- ⚠️ **DM Auto-Reply:** Limited
- ✅ **Analytics:** Fully supported

### X (Twitter)
- ✅ **Publishing:** Fully supported
- ⚠️ **Inbox:** Requires paid API tier
- ✅ **Comments:** Fully supported
- ⚠️ **DM Auto-Reply:** Requires paid API tier
- ⚠️ **Analytics:** Requires paid API tier

### TikTok
- ✅ **Publishing:** Fully supported
- ❌ **Inbox:** Not supported
- ❌ **Comments:** Not supported
- ❌ **DM Auto-Reply:** Not supported
- ⚠️ **Analytics:** Basic support

### Discord
- ✅ **Publishing:** Fully supported
- ✅ **Inbox:** Fully supported
- ⚠️ **Comments:** Channels only (not DMs)
- ⚠️ **DM Auto-Reply:** Requires bot setup
- ⚠️ **Analytics:** Custom implementation

### Pinterest
- ✅ **Publishing:** Fully supported
- ❌ **Inbox:** Not supported
- ❌ **Comments:** Not supported
- ❌ **DM Auto-Reply:** Not supported
- ✅ **Analytics:** Fully supported (traffic-focused: saves, clicks, impressions)
- ⚠️ **Trend Detection:** Limited
- ❌ **Community Features:** Not supported
- **🎯 Special Note:** Pinterest is a **visual search engine** (not social media). Content is evergreen, SEO-driven, and focuses on traffic metrics rather than engagement. Optimal posting: 3-5 pins/week. See `PINTEREST_STRATEGY_IMPLEMENTATION.md` for detailed strategy.

### Reddit
- ✅ **Publishing:** Fully supported
- ⚠️ **Inbox:** Only on your posts
- ⚠️ **Comments:** Only on your posts
- ✅ **Trend Detection:** Public search available
- ⚠️ **Community Features:** Moderator features optional

---

## Benefits

### 1. **Single Source of Truth**
- All platform capabilities defined in one place
- Easy to update when APIs change
- No scattered conditionals throughout the codebase

### 2. **Consistent UI**
- Same capability checks used everywhere
- Uniform tooltips and warnings
- Predictable user experience

### 3. **Easy to Extend**
- Adding new platforms? Just add to the matrix
- New capabilities? Add to the interface
- No need to update dozens of files

### 4. **Better UX**
- Users see clear warnings about limitations
- Tooltips explain why features are limited
- Prevents confusion and support tickets

---

## Adding New Platforms

When adding a new platform:

1. **Add to the matrix:**
```typescript
NewPlatform: {
  publishing: true,
  inbox: "limited",
  comments: false,
  // ... other capabilities
}
```

2. **Use the helper functions:**
```typescript
if (hasCapability('NewPlatform', 'inbox')) {
  // Show inbox feature
}

if (isFullySupported('NewPlatform', 'inbox')) {
  // Show without warning
} else {
  // Show with warning and tooltip
}
```

3. **The UI automatically adapts** - No need to update individual components!

---

## File Location

**Source:** `src/services/platformCapabilities.ts`

**Used in:**
- `components/Settings.tsx` - Shows capability badges with tooltips
- Future: Can be used in Compose, Automation, Analytics, etc.

---

## Summary

The Capability Matrix is a **smart way to manage platform differences** without hardcoding checks everywhere. It makes the codebase:

- ✅ **Maintainable** - One place to update capabilities
- ✅ **Consistent** - Same logic everywhere
- ✅ **User-friendly** - Clear explanations of limitations
- ✅ **Scalable** - Easy to add platforms and features
