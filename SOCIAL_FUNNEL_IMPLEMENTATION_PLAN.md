# Social Funnel Implementation Plan

## Overview
This document outlines the implementation plan for:
1. **UTM parameter tracking** on bio page links (OnlyFans, Fansly, Fanvue)
2. **Auto-posting** to Instagram, X (Twitter), and Facebook from EchoFlux Compose

---

## Current Status

### ✅ Already Implemented
- **Instagram Publishing**: `publishInstagramPost()` in `src/services/socialMediaService.ts`
  - Called in `Compose.tsx` `handlePublishMedia()` (line 1276)
  - Supports: IMAGE, REELS, VIDEO, carousel posts, scheduling
  - **Currently Admin-only** (testing phase)
- **X (Twitter) Publishing**: `publishTweet()` in `src/services/socialMediaService.ts`
  - Called in `Compose.tsx` `handlePublishMedia()` (line 1307)
  - Supports: text, images, videos, multi-image posts
  - **Currently Admin-only** (testing phase)
- **Bio Page Links**: Custom links can be added via `BioPageBuilder.tsx`
  - Links stored in `BioPageConfig.customLinks[]`
  - Click tracking endpoint referenced but not implemented

### ⚠️ Testing Phase (Admin-Only)
- **Auto-Publishing UI**: Publish button visible only to Admin role
- **Publish Function**: `handlePublishMedia()` checks for Admin role before allowing publish
- **Once tested**: Remove admin checks to enable for all plans

### ❌ Missing
- **Facebook Publishing**: No `publishFacebookPost()` function exists
  - Only DM/comment sync in `api/platforms/facebook.ts`
- **UTM Parameters**: Bio links don't automatically include UTM tracking
- **Click Tracking API**: `/api/trackBioLinkClick` endpoint doesn't exist

---

## Implementation Plan

### Phase 1: UTM Parameters on Bio Links

#### 1.1 Update Bio Link Data Structure
**File**: `types.ts`

Add optional UTM fields to `BioLink` interface:
```typescript
export interface BioLink {
    id: string;
    title: string;
    url: string;
    isActive: boolean;
    clicks: number;
    thumbnail?: string;
    icon?: string;
    // NEW: UTM tracking
    utmSource?: string;      // e.g., "bio_page"
    utmMedium?: string;       // e.g., "social"
    utmCampaign?: string;     // e.g., "onlyfans_promo"
    utmContent?: string;      // Optional: specific link identifier
    autoAddUtm?: boolean;     // Auto-add UTM if not manually set
}
```

#### 1.2 Add UTM Builder Utility
**New File**: `src/utils/utmBuilder.ts`

```typescript
export interface UTMParams {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
}

export function buildUrlWithUTM(baseUrl: string, params: UTMParams): string {
    const url = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => {
        if (value) {
            url.searchParams.set(key, value);
        }
    });
    return url.toString();
}

export function getDefaultUTMParams(linkTitle: string, username?: string): UTMParams {
    return {
        utm_source: 'echoflux_bio',
        utm_medium: 'social',
        utm_campaign: linkTitle.toLowerCase().replace(/\s+/g, '_'),
        utm_content: username || 'bio_link',
    };
}
```

#### 1.3 Update BioPageBuilder to Include UTM Fields
**File**: `components/BioPageBuilder.tsx`

- Add UTM input fields (optional, with "Auto-generate" toggle)
- When adding/editing links, auto-populate UTM if `autoAddUtm` is enabled
- Show preview of final URL with UTM parameters

#### 1.4 Update BioPageView to Apply UTM on Click
**File**: `components/BioPageView.tsx`

Modify `handleLinkClick()` (line 177) to:
1. Check if link has UTM parameters
2. If `autoAddUtm` is true and no manual UTM, generate default UTM
3. Build final URL with UTM parameters
4. Track click with UTM data

```typescript
const handleLinkClick = async (url: string, linkId?: string, link?: BioLink) => {
    let finalUrl = url.trim();
    
    // Add UTM parameters if configured
    if (link) {
        const utmParams: UTMParams = {};
        
        if (link.autoAddUtm && !link.utmSource) {
            // Auto-generate UTM
            const defaults = getDefaultUTMParams(link.title, bioPage.username);
            Object.assign(utmParams, defaults);
        } else if (link.utmSource) {
            // Use manual UTM
            if (link.utmSource) utmParams.utm_source = link.utmSource;
            if (link.utmMedium) utmParams.utm_medium = link.utmMedium;
            if (link.utmCampaign) utmParams.utm_campaign = link.utmCampaign;
            if (link.utmContent) utmParams.utm_content = link.utmContent;
        }
        
        if (Object.keys(utmParams).length > 0) {
            finalUrl = buildUrlWithUTM(finalUrl, utmParams);
        }
    }
    
    // Ensure URL is valid
    if (!finalUrl.match(/^https?:\/\//i)) {
        finalUrl = 'https://' + finalUrl;
    }
    
    // Track click
    if (linkId && username) {
        fetch('/api/trackBioLinkClick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, linkId, utmParams }),
        }).catch(err => console.error('Error tracking click:', err));
    }
    
    window.open(finalUrl, '_blank', 'noopener,noreferrer');
};
```

---

### Phase 2: Facebook Publishing Implementation

#### 2.1 Create Facebook Publishing Function
**File**: `api/platforms/facebook/publish.ts` (NEW)

```typescript
import { db } from '../../../firebaseConfig';

interface FacebookPublishOptions {
    mediaUrl?: string;
    mediaUrls?: string[];  // For multi-image posts
    caption: string;
    mediaType?: 'image' | 'video';
    scheduledPublishTime?: string;  // ISO 8601 timestamp
    pageId?: string;  // Facebook Page ID (if user has multiple pages)
}

export async function publishFacebookPost(
    userId: string,
    options: FacebookPublishOptions
): Promise<{ postId: string; status: 'published' | 'scheduled' }> {
    // 1. Get user's Facebook account from Firestore
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const facebookAccount = userData?.socialAccounts?.find(
        (acc: any) => acc.platform === 'Facebook' && acc.connected
    );
    
    if (!facebookAccount?.accessToken) {
        throw new Error('Facebook account not connected');
    }
    
    // 2. Get Page access token (if posting to a Page)
    const pageId = options.pageId || facebookAccount.accountId;
    const pageAccessToken = await getPageAccessToken(
        facebookAccount.accessToken,
        pageId
    );
    
    // 3. Upload media if provided
    let mediaId: string | undefined;
    if (options.mediaUrl) {
        if (options.mediaType === 'video') {
            mediaId = await uploadFacebookVideo(pageAccessToken, options.mediaUrl, options.caption);
        } else {
            mediaId = await uploadFacebookPhoto(pageAccessToken, pageId, options.mediaUrl, options.caption);
        }
    }
    
    // 4. Create post via Facebook Graph API
    const postUrl = `https://graph.facebook.com/v18.0/${pageId}/feed`;
    const postData: any = {
        message: options.caption,
        access_token: pageAccessToken,
    };
    
    if (mediaId) {
        postData.attached_media = JSON.stringify([{ media_fbid: mediaId }]);
    }
    
    if (options.scheduledPublishTime) {
        postData.published = false;
        postData.scheduled_publish_time = Math.floor(new Date(options.scheduledPublishTime).getTime() / 1000);
    }
    
    const response = await fetch(postUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(postData),
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Facebook API error: ${error.error?.message || 'Unknown error'}`);
    }
    
    const result = await response.json();
    return {
        postId: result.id,
        status: options.scheduledPublishTime ? 'scheduled' : 'published',
    };
}

async function getPageAccessToken(userAccessToken: string, pageId: string): Promise<string> {
    // Exchange user token for page token
    const response = await fetch(
        `https://graph.facebook.com/v18.0/${pageId}?fields=access_token&access_token=${userAccessToken}`
    );
    const data = await response.json();
    return data.access_token;
}

async function uploadFacebookPhoto(
    pageAccessToken: string,
    pageId: string,
    imageUrl: string,
    caption: string
): Promise<string> {
    // Step 1: Upload photo
    const uploadUrl = `https://graph.facebook.com/v18.0/${pageId}/photos`;
    const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            url: imageUrl,
            caption: caption,
            access_token: pageAccessToken,
            published: false,  // Don't publish yet, just upload
        }),
    });
    
    const result = await response.json();
    return result.id;  // Photo ID
}

async function uploadFacebookVideo(
    pageAccessToken: string,
    videoUrl: string,
    caption: string
): Promise<string> {
    // Facebook video upload is a 3-step process:
    // 1. Initialize upload
    // 2. Upload video chunks
    // 3. Publish video
    
    // For simplicity, use direct URL upload (if video is publicly accessible)
    const uploadUrl = `https://graph.facebook.com/v18.0/videos`;
    const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            file_url: videoUrl,
            description: caption,
            access_token: pageAccessToken,
        }),
    });
    
    const result = await response.json();
    return result.id;
}
```

#### 2.2 Create API Endpoint for Facebook Publishing
**New File**: `api/platforms/facebook/publish.ts` (API Route)

```typescript
import { NextApiRequest, NextApiResponse } from 'next';
import { publishFacebookPost } from '../../../api/platforms/facebook/publish';
import { verifyAuth } from '../../../src/utils/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const userId = await verifyAuth(req);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const { mediaUrl, mediaUrls, caption, mediaType, scheduledPublishTime, pageId } = req.body;
        
        const result = await publishFacebookPost(userId, {
            mediaUrl,
            mediaUrls,
            caption,
            mediaType,
            scheduledPublishTime,
            pageId,
        });
        
        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Facebook publish error:', error);
        return res.status(500).json({ 
            error: error.message || 'Failed to publish to Facebook' 
        });
    }
}
```

#### 2.3 Add Facebook Publishing to Frontend Service
**File**: `src/services/socialMediaService.ts`

Add function:
```typescript
export async function publishFacebookPost(
    mediaUrl: string,
    caption: string,
    mediaType?: 'image' | 'video',
    scheduledPublishTime?: string,
    mediaUrls?: string[],
    pageId?: string
): Promise<{ postId: string; status: 'published' | 'scheduled' }> {
    const token = auth.currentUser
        ? await auth.currentUser.getIdToken(true)
        : null;

    if (!token) {
        throw new Error('User must be logged in to publish posts');
    }

    try {
        const response = await fetch('/api/platforms/facebook/publish', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                mediaUrl,
                mediaUrls,
                caption,
                mediaType,
                scheduledPublishTime,
                pageId,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.details || error.error || 'Failed to publish to Facebook');
        }

        return await response.json();
    } catch (error: any) {
        console.error('Failed to publish Facebook post:', error);
        throw error;
    }
}
```

#### 2.4 Integrate Facebook Publishing into Compose
**File**: `components/Compose.tsx`

1. Import the function:
```typescript
import { publishInstagramPost, publishTweet, publishPinterestPin, publishFacebookPost } from '../src/services/socialMediaService';
```

2. Add Facebook publishing in `handlePublishMedia()` (after X publishing, around line 1320):
```typescript
// Publish to Facebook if selected
const hasFacebook = platformsToPost.includes('Facebook');
if (hasFacebook && mediaUrl) {
    try {
        const result = await publishFacebookPost(
            mediaUrl,
            item.captionText,
            item.type === 'video' ? 'video' : 'image',
            undefined, // scheduledPublishTime (not used for immediate publish)
            mediaUrls, // Multiple images
            undefined  // pageId (use default page)
        );

        console.log('Published to Facebook:', result.postId);
    } catch (facebookError: any) {
        console.error('Failed to publish to Facebook:', facebookError);
        showToast(`Failed to publish to Facebook: ${facebookError.message || 'Please check your connection'}. Other platforms published successfully.`, 'error');
    }
}
```

3. Add Facebook scheduling in `handleScheduleMedia()` (after Instagram scheduling, around line 1570):
```typescript
// Schedule to Facebook if selected
const hasFacebook = platformsToPost.includes('Facebook');
if (hasFacebook && mediaUrl) {
    try {
        const result = await publishFacebookPost(
            mediaUrl,
            item.captionText,
            item.type === 'video' ? 'video' : 'image',
            item.scheduledDate, // Pass scheduled time
            mediaUrls,
            undefined
        );

        if (result.status === 'scheduled') {
            console.log('Scheduled to Facebook:', result.postId);
        }
    } catch (facebookError: any) {
        console.error('Failed to schedule to Facebook:', facebookError);
        showToast(`Failed to schedule to Facebook: ${facebookError.message || 'Please check your connection'}. Other platforms scheduled successfully.`, 'error');
    }
}
```

---

### Phase 3: Click Tracking API (Optional but Recommended)

#### 3.1 Create Click Tracking Endpoint
**New File**: `api/trackBioLinkClick.ts`

```typescript
import { NextApiRequest, NextApiResponse } from 'next';
import { db } from '../firebaseConfig';
import { collection, doc, updateDoc, increment, getDoc } from 'firebase/firestore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { username, linkId, utmParams } = req.body;

        if (!username || !linkId) {
            return res.status(400).json({ error: 'Username and linkId are required' });
        }

        // Find user by username
        const usersRef = collection(db, 'users');
        const userQuery = await getDocs(
            query(usersRef, where('bioPage.username', '==', username))
        );

        if (userQuery.empty) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userId = userQuery.docs[0].id;
        const userDoc = await getDoc(doc(db, 'users', userId));
        const userData = userDoc.data();

        if (!userData?.bioPage) {
            return res.status(404).json({ error: 'Bio page not found' });
        }

        // Update click count
        const bioPage = userData.bioPage;
        const linkIndex = (bioPage.customLinks || []).findIndex((l: any) => l.id === linkId);
        
        if (linkIndex === -1) {
            return res.status(404).json({ error: 'Link not found' });
        }

        // Increment click count
        const updatedLinks = [...(bioPage.customLinks || [])];
        updatedLinks[linkIndex] = {
            ...updatedLinks[linkIndex],
            clicks: (updatedLinks[linkIndex].clicks || 0) + 1,
        };

        // Save to Firestore
        await updateDoc(doc(db, 'users', userId), {
            'bioPage.customLinks': updatedLinks,
        });

        // Optional: Log click with UTM params for analytics
        if (utmParams) {
            await addDoc(collection(db, 'users', userId, 'link_clicks'), {
                linkId,
                clickedAt: new Date().toISOString(),
                utmParams,
            });
        }

        return res.status(200).json({ success: true });
    } catch (error: any) {
        console.error('Error tracking click:', error);
        return res.status(500).json({ error: 'Failed to track click' });
    }
}
```

---

## Testing Checklist

### UTM Parameters
- [ ] Bio link builder shows UTM input fields
- [ ] Auto-generate UTM works when enabled
- [ ] Manual UTM parameters are preserved
- [ ] Final URL includes UTM parameters on click
- [ ] UTM parameters are tracked in click logs

### Facebook Publishing
- [ ] Facebook account connection works
- [ ] Image posts publish successfully
- [ ] Video posts publish successfully
- [ ] Text-only posts work
- [ ] Scheduled posts are created correctly
- [ ] Error handling works (disconnected account, invalid media, etc.)
- [ ] Multi-image posts work (if supported by Facebook API)

### Integration
- [ ] Compose page shows Facebook as publishable platform
- [ ] Publishing to Instagram + X + Facebook simultaneously works
- [ ] Scheduling to all three platforms works
- [ ] Error messages are clear when one platform fails

---

## Environment Variables Needed

Add to `.env` or Vercel:
```env
# Facebook (if not already set)
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
META_APP_ID=your_app_id  # Alternative name
META_APP_SECRET=your_app_secret  # Alternative name
```

---

## Facebook API Requirements

### Permissions Needed
- `pages_manage_posts` - Post to Facebook Pages
- `pages_read_engagement` - Read page insights
- `pages_show_list` - List user's pages

### App Review
Facebook requires app review for:
- Publishing to Pages
- Scheduling posts
- Accessing user's pages list

**Note**: For development, you can use your own Facebook account and pages without review, but production requires app review.

---

## Next Steps

### Phase 0: Admin Testing (CURRENT)
1. ✅ **Admin-only visibility** - Publish button only shows for Admin role
2. ✅ **Admin-only function access** - `handlePublishMedia()` checks Admin role
3. ⏳ **Test Instagram/X publishing** - Verify both platforms work correctly
4. ⏳ **Once tested**: Remove admin checks to enable for all plans

### Phase 1: UTM Parameters (Next)
1. **Start with UTM Parameters** (easier, no API dependencies)
   - Update types
   - Create UTM utility
   - Update BioPageBuilder and BioPageView

### Phase 2: Facebook Publishing
2. **Then Facebook Publishing** (requires API setup)
   - Set up Facebook App in Meta Developer Console
   - Implement publishing functions
   - Add to Compose component
   - Test thoroughly

### Phase 3: Click Tracking
3. **Finally Click Tracking** (optional analytics)
   - Create API endpoint
   - Test tracking accuracy

### Phase 4: Rollout
4. **Remove Admin Restrictions**
   - Once all features tested and working
   - Remove `user?.role === 'Admin'` checks
   - Enable for all plans (or specific plan tiers)

---

## Notes

- **Instagram and X are already working** - no changes needed for those
- **Currently Admin-only** - Auto-publishing is gated behind Admin role for testing
- **To enable for all users**: Remove the `user?.role === 'Admin'` checks in:
  - `components/MediaBox.tsx` (line ~1699) - Publish button visibility
  - `components/Compose.tsx` (line ~1137) - `handlePublishMedia()` function access
- **Facebook requires Page access** - users must connect a Facebook Page (not just personal profile)
- **UTM parameters are optional** - users can disable auto-UTM if they want manual control
- **Click tracking is fire-and-forget** - failures won't block link clicks

## Admin Testing Checklist

Before rolling out to all users, test:
- [ ] Instagram image posts publish successfully
- [ ] Instagram carousel posts work
- [ ] Instagram Reels publish correctly
- [ ] Instagram video posts work
- [ ] X text-only posts publish
- [ ] X image posts publish
- [ ] X multi-image posts work
- [ ] X video posts publish
- [ ] Error handling works (disconnected accounts, invalid media, etc.)
- [ ] Publishing to multiple platforms simultaneously works
- [ ] Scheduled posts work correctly
- [ ] Post status updates correctly in UI
