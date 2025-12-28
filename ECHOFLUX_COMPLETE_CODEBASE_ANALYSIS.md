# EchoFlux.ai - Complete Codebase Analysis & Feature Documentation

**Last Updated:** January 2025  
**Version:** 1.0  
**Status:** Production - Offline/Planning-First Mode

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Product Overview](#product-overview)
3. [Architecture & Technology Stack](#architecture--technology-stack)
4. [User Plans & Feature Matrix](#user-plans--feature-matrix)
5. [Core Features & Components](#core-features--components)
6. [OnlyFans Studio (Elite Plan)](#onlyfans-studio-elite-plan)
7. [API Endpoints & Backend Services](#api-endpoints--backend-services)
8. [Database Structure](#database-structure)
9. [Authentication & Authorization](#authentication--authorization)
10. [AI Integration & Models](#ai-integration--models)
11. [Workflows & User Journeys](#workflows--user-journeys)
12. [Admin Features](#admin-features)
13. [Deployment & Infrastructure](#deployment--infrastructure)
14. [Key Constraints & Limitations](#key-constraints--limitations)

---

## Executive Summary

**EchoFlux.ai** is a comprehensive AI-powered content planning and creation studio designed for content creators, with specialized tools for OnlyFans creators. The application operates in **offline/planning-first mode**, focusing on strategy generation, content creation, and organization rather than automated social media posting.

### Key Characteristics:
- **Offline Mode**: No social account connections required; users manually copy content to post
- **AI-First**: Extensive use of Google Gemini API for content generation and strategy
- **Planning-Focused**: Emphasis on roadmaps, calendars, and content organization
- **Creator-Centric**: Designed for Free, Pro, and Elite creator plans
- **OnlyFans Studio**: Elite plan includes specialized OnlyFans content planning tools

### Current Status:
- ✅ Fully functional offline planning and creation tools
- ✅ Three-tier pricing (Free, Pro, Elite)
- ✅ Comprehensive OnlyFans Studio for Elite users
- ⚠️ Direct social media posting disabled (offline mode)
- ⚠️ Deep analytics and social listening paused
- ⚠️ Business/Agency plans hidden

---

## Product Overview

### Core Concept

EchoFlux.ai positions itself as an **AI Content Studio & Campaign Planner** that helps creators:
1. **Plan** multi-week content strategies with AI
2. **Create** captions, hooks, and content ideas with AI
3. **Organize** everything on visual calendars and workflow boards
4. **Copy & Post** manually to their chosen platforms

### Target Audience

- **Primary**: Content creators (Free, Pro, Elite plans)
- **Secondary**: OnlyFans creators (Elite plan with OnlyFans Studio)
- **Future**: Businesses and agencies (currently hidden)

### Value Proposition

**For Creators:**
- Eliminate content planning burnout
- Generate unlimited content ideas and captions
- Organize campaigns across multiple weeks
- Plan content without needing social account connections

**For OnlyFans Creators (Elite):**
- Specialized content planning and analysis
- Performance prediction for OnlyFans content
- Content gap analysis specific to OnlyFans
- Repurpose OnlyFans content for other platforms

---

## Architecture & Technology Stack

### Frontend

**Framework & Libraries:**
- React 18 with TypeScript
- Vite (build tool)
- Tailwind CSS (styling)
- Firebase SDK (client-side)

**State Management:**
- React Context API
  - `AppContext`: Global app state
  - `AuthContext`: Authentication state
  - `DataContext`: Application data (notifications, announcements)
  - `UIContext`: UI state (modals, sidebar, theme)

**Key Components:**
- 60+ React components in `components/` directory
- Modular architecture with reusable UI components
- Dark mode support throughout

### Backend

**Infrastructure:**
- Vercel Serverless Functions (`api/` directory)
- Firebase (Firestore, Auth, Storage)
- Node.js runtime

**API Architecture:**
- RESTful API endpoints
- JWT-based authentication (Firebase ID tokens)
- Serverless function structure

### AI & External Services

**Primary AI:**
- Google Gemini API (text generation, content strategy)
- Google Imagen 3 (image generation - currently disabled in UI)
- Google Veo (video generation - currently disabled in UI)

**Secondary Services:**
- Tavily API (web search for trend research - Pro/Elite only)
- OpenAI API (optional, for text generation fallback)
- Replicate (video processing - optional)

### Database

**Firebase Firestore:**
- NoSQL document database
- Real-time synchronization
- Security rules for access control

**Key Collections:**
- `users` - User accounts and profiles
- `strategies` - Content strategies
- `media_library` - Media assets
- `autopilot_campaigns` - Campaign data
- `content_gap_analysis_history` - Gap analysis results
- `onlyfans_content_brain_history` - OnlyFans-specific analyses
- `announcements` - Admin announcements
- `plan_change_events` - Plan upgrade tracking

### Storage

**Firebase Storage:**
- Media file storage (images, videos)
- Storage quotas by plan (100 MB Free, 5 GB Pro, 10 GB Elite)
- Upload/download functionality

---

## User Plans & Feature Matrix

### Creator Plans

#### **Free Plan**
**Price:** $0/month or $0/year  
**Target:** Individuals testing the studio

**Features:**
- ✅ 1 AI strategy generation/month (basic)
- ✅ 10 AI captions/month
- ✅ Basic Link-in-Bio (1 link)
- ✅ Media Library access
- ✅ 100 MB storage
- ✅ Dashboard access
- ❌ Calendar (Pro+)
- ❌ Advanced strategy options
- ❌ Live trend research (Tavily)
- ❌ OnlyFans Studio

**Limitations:**
- Uses weekly trends only (free, updated Monday)
- No Tavily web search for niche research
- Limited caption generation

---

#### **Pro Plan**
**Price:** $29/month or $23/month (annually - 20% off = $276/year)  
**Target:** Creators scaling their brand

**Features:**
- ✅ AI Content Strategist
- ✅ 2 AI strategy generations/month
- ✅ Live trend research (16 Tavily searches/month)
- ✅ 500 AI captions/month
- ✅ Link-in-Bio Builder (5 links)
- ✅ Media Library
- ✅ Visual Content Calendar
- ✅ AI Voice Assistant
- ✅ 5 GB storage
- ❌ OnlyFans Studio
- ❌ Advanced strategy options
- ❌ Enhanced trend research

**Key Upgrades:**
- Tavily searches for niche-specific research
- More caption generations
- Calendar access
- More storage

---

#### **Elite Plan**
**Price:** $59/month or $47/month (annually - 20% off = $564/year)  
**Target:** Professional & OnlyFans creators

**Features:**
- ✅ Advanced Strategy options
- ✅ 5 AI strategy generations/month
- ✅ Enhanced live trend research (40 Tavily searches/month)
- ✅ 1,500 AI captions/month
- ✅ Link-in-Bio Builder (unlimited links)
- ✅ Media Library
- ✅ Visual Content Calendar
- ✅ AI Voice Assistant (with live web search)
- ✅ 10 GB storage
- ✅ **OnlyFans Studio (included)**

**OnlyFans Studio Includes:**
- Content Brain (AI Captions, Gap Analysis, Predictions, Repurposing)
- Studio Calendar & Workflow
- Media Vault & Export Hub
- Roleplay Ideas Generator
- OnlyFans-specific analytics

**Key Differentiators:**
- OnlyFans Studio access
- More strategy generations
- More Tavily searches
- More caption generations
- Unlimited Link-in-Bio links
- Voice Assistant with live web search

---

### Feature Comparison Matrix

| Feature | Free | Pro | Elite |
|---------|------|-----|-------|
| **Dashboard** | ✅ | ✅ | ✅ |
| **AI Content Strategist** | Basic (1/month) | Full (2/month) | Advanced (5/month) |
| **AI Captions** | 10/month | 500/month | 1,500/month |
| **Strategy Generations** | 1/month | 2/month | 5/month |
| **Live Trend Research** | Weekly trends only | 16 Tavily/month | 40 Tavily/month |
| **Calendar** | ❌ | ✅ | ✅ |
| **Link-in-Bio** | 1 link | 5 links | Unlimited |
| **Media Library** | ✅ | ✅ | ✅ |
| **Storage** | 100 MB | 5 GB | 10 GB |
| **OnlyFans Studio** | ❌ | ❌ | ✅ |
| **Voice Assistant** | ❌ | ✅ | ✅ (with web search) |
| **Content Gap Analysis** | ❌ | ✅ | ✅ |
| **Opportunities/Trends** | ❌ | ✅ | ✅ |

---

## Core Features & Components

### 1. Dashboard (`components/Dashboard.tsx`)

**Purpose:** Central hub for planning and content creation overview

**Key Features:**
- Today's Planning Snapshot
- Quick actions (Strategy, Compose, Calendar)
- Recent posts created
- AI Content Studio mode banner (explains offline behavior)

**User Flow:**
1. View planning snapshot
2. Quick navigation to key features
3. Monitor content creation activity

---

### 2. AI Content Strategist (`components/Strategy.tsx`)

**Purpose:** Generate multi-week content roadmaps

**Input:**
- Niche
- Audience
- Goals
- Preferred platforms
- Duration (4 weeks, 8 weeks, etc.)
- Tone
- Platform focus

**Output:**
- Multi-week content roadmap
- Weekly themes and campaigns
- Daily content topics
- Suggested post types (reels, carousels, stories)
- Image/video ideas for each post
- Caption suggestions

**Features:**
- Save strategies
- Load active strategies
- Update strategy status
- Integrate with Calendar
- Upload media to posts
- Generate captions from strategy

**Plan Differences:**
- **Free:** Basic strategy (weekly trends only)
- **Pro:** 2/month with Tavily research (16 searches)
- **Elite:** 5/month with enhanced Tavily research (40 searches)

**Technical Details:**
- Uses Gemini API for generation
- Tavily API for live trend research (Pro/Elite)
- Weekly trends data (free, updated Monday)
- Stores in Firestore `strategies` collection

---

### 3. Compose (`components/Compose.tsx`)

**Purpose:** Create and refine captions and content

**Key Features:**
- **AI Caption Generation:**
  - Platform-optimized (Instagram, TikTok, X, LinkedIn, etc.)
  - Character limits respected
  - Style optimized for platform
  - Hashtag suggestions

- **Content Gap Analysis:**
  - Analyzes across all social platforms
  - Identifies content gaps
  - Provides suggestions
  - Shared history with Dashboard
  - Stored in `content_gap_analysis_history`

- **History Section:**
  - Predictions
  - Repurposes
  - Content gap analyses
  - View and manage past analyses

- **Media Attachment:**
  - Link to Media Library
  - Attach images/videos to posts

**Workflow:**
1. Select platform(s) to plan for
2. Enter prompt or upload media
3. Generate AI caption
4. Refine/edit caption
5. Attach media
6. Copy to clipboard for manual posting

**Limitations:**
- Image/Video generation tabs hidden in UI
- Publishing buttons show offline mode message
- Manual copy-paste workflow

---

### 4. Calendar (`components/Calendar.tsx`)

**Purpose:** Visual planning calendar for content

**Features:**
- Month/week/day views
- Drag-and-drop scheduling
- Shows posts from Strategy and Compose
- Click to edit content
- Visual organization

**Note:** Planning calendar only - does not guarantee actual posting

---

### 5. Media Library (`components/MediaLibrary.tsx`)

**Purpose:** Store and organize media assets

**Features:**
- Upload images and videos
- Organize into folders
- Search and filter
- Delete unused media
- Storage quota management
- Link to posts in Compose/Strategy

**Storage Limits:**
- Free: 100 MB
- Pro: 5 GB
- Elite: 10 GB

---

### 6. Link-in-Bio Builder (`components/BioPageBuilder.tsx`)

**Purpose:** Create mobile-optimized link-in-bio pages

**Features:**
- Add multiple links (plan-dependent)
- Custom branding
- Featured content
- Mobile preview
- Email capture forms (optional)

**Link Limits:**
- Free: 1 link
- Pro: 5 links
- Elite: Unlimited

---

### 7. Opportunities/Trends (`components/Opportunities.tsx`)

**Purpose:** Discover trending content opportunities

**Features:**
- Trending hashtags
- Viral audio clips
- Popular topics
- Niche-specific trends
- Collaboration opportunities

**Plan Access:**
- Free: ❌
- Pro: ✅
- Elite: ✅

**Technical:**
- Uses Tavily API for live research
- Weekly trends data (free)
- Counts against monthly Tavily limit

---

### 8. Analytics (`components/Analytics.tsx`)

**Purpose:** View planning and content insights

**Current Status:** Limited analytics (deep analytics paused)

**Features:**
- Overview metrics
- Content performance (if data available)
- Planning insights

**Note:** No real-time social media analytics (offline mode)

---

### 9. Settings (`components/Settings.tsx`)

**Purpose:** Configure profile and AI behavior

**Features:**
- Profile settings
- Brand voice configuration
- AI tone controls
- Explicit content settings (where allowed)
- Voice mode toggle
- Voice cloning tools

**Hidden in Offline Mode:**
- Social account connections
- Direct platform integrations

---

### 10. Voice Assistant (`components/VoiceAssistant.tsx`)

**Purpose:** Real-time audio assistant

**Features:**
- Answer questions about EchoFlux
- Brainstorm content ideas
- Generate hooks and scripts
- Navigate to pages
- Suggest workflows

**Elite-Only Feature:**
- Live web search via Tavily API
- Current trends and information
- Counts against 40 searches/month limit

---

### 11. Chatbot (`components/Chatbot.tsx`)

**Purpose:** Text-based assistant

**Features:**
- Answer questions about features
- Explain workflows
- Help with onboarding
- Uses app knowledge base

**Note:** No live web access (uses app knowledge only)

---

## OnlyFans Studio (Elite Plan)

### Overview

OnlyFans Studio is a specialized suite of tools included with the Elite plan, designed specifically for OnlyFans creators to plan, analyze, and optimize their content.

### Components

#### 1. Content Brain (`components/OnlyFansContentBrain.tsx`)

**AI Captions Tab:**
- Generate OnlyFans-optimized captions
- Analyze Content Gaps (OnlyFans-specific)
- Predict Performance
- Repurpose Content (for other platforms)
- History management

**Features:**

**a. Content Gap Analysis:**
- Separate from main app gap analysis
- Analyzes OnlyFans-specific content strategy
- Identifies gaps in OnlyFans content
- Provides OnlyFans-specific suggestions
- Stored in `onlyfans_content_brain_history` (type: `gap_analysis`)
- Separate history from Dashboard/Compose

**b. Performance Prediction:**
- Predicts how content will perform on OnlyFans
- Score (0-100)
- Confidence level
- Factor analysis (timing, content type, audience, etc.)
- Improvement suggestions
- Optimized version generation

**c. Content Repurposing:**
- Repurpose OnlyFans content for other platforms
- Platform-specific optimizations
- Format recommendations
- Hashtag suggestions
- Copy-ready content for each platform

---

#### 2. Studio Calendar (`components/OnlyFansCalendar.tsx`)

**Purpose:** OnlyFans-specific content calendar

**Features:**
- View OnlyFans content schedule
- Plan shoots and content releases
- Organize content by type
- Track posting cadence

---

#### 3. Media Vault (`components/OnlyFansMediaVault.tsx`)

**Purpose:** Organize OnlyFans media assets

**Features:**
- Upload and organize OnlyFans content
- Folder organization
- Media tagging
- Export functionality

**Note:** Media editing tools (blur/eraser) currently disabled

---

#### 4. Export Hub (`components/OnlyFansExportHub.tsx`)

**Purpose:** Export content packages

**Features:**
- Export content for posting
- Package content with captions
- Download ready-to-post content

---

#### 5. Roleplay Ideas (`components/OnlyFansRoleplay.tsx`)

**Purpose:** Generate roleplay content ideas

**Features:**
- AI-generated roleplay scenarios
- Interactive roleplay concepts
- Content suggestions

---

#### 6. OnlyFans Analytics (`components/OnlyFansAnalytics.tsx`)

**Purpose:** OnlyFans-specific analytics

**Features:**
- Content performance insights
- Limited by available data
- API constraints apply

**Note:** No real-time analytics (offline mode limitations)

---

#### 7. OnlyFans Studio Settings (`components/OnlyFansStudioSettings.tsx`)

**Purpose:** Configure OnlyFans Studio preferences

**Features:**
- OnlyFans-specific settings
- Content type preferences
- Audience targeting

---

### OnlyFans Studio Workflow

1. **Plan Content:**
   - Use Content Brain to generate captions
   - Analyze content gaps
   - Predict performance

2. **Organize:**
   - Add to Studio Calendar
   - Store in Media Vault

3. **Optimize:**
   - Use performance predictions
   - Repurpose for other platforms
   - Refine based on gap analysis

4. **Export:**
   - Use Export Hub
   - Download ready-to-post content
   - Post manually to OnlyFans

---

## API Endpoints & Backend Services

### Authentication & User Management

- `POST /api/verifyAuth` - Verify Firebase ID token
- `POST /api/verifyCheckoutSession` - Verify Stripe checkout (plan upgrades)
- `POST /api/createCheckoutSession` - Create Stripe checkout session

### Content Generation

- `POST /api/generateCaptions` - Generate AI captions
- `POST /api/generateContentStrategy` - Generate content strategy
- `POST /api/generateImage` - Generate images (currently disabled in UI)
- `POST /api/generateVideo` - Generate videos (currently disabled in UI)

### Strategy Management

- `POST /api/getStrategies` - Get saved strategies
- `POST /api/saveStrategy` - Save strategy
- `POST /api/updateStrategyStatus` - Update strategy status

### Content Analysis

- `POST /api/analyzeMediaForPost` - Analyze media for post optimization
- `POST /api/analyzeContentGaps` - Analyze content gaps (main app)
- `POST /api/analyzeOnlyFansContentGaps` - Analyze OnlyFans content gaps

### OnlyFans Studio

- `POST /api/predictOnlyFansPerformance` - Predict OnlyFans content performance
- `POST /api/repurposeOnlyFansContent` - Repurpose OnlyFans content
- `POST /api/generateOnlyFansCaptions` - Generate OnlyFans captions

### Trends & Opportunities

- `POST /api/findTrends` - Find trending topics
- `POST /api/findTrendsByNiche` - Find trends by niche (Tavily)
- `POST /api/scrapeTrendingTopics` - Scrape trending topics

### Announcements & Admin

- `GET /api/getAnnouncements` - Get active announcements (authenticated)
- `GET /api/getPublicAnnouncements` - Get public announcements (no auth)
- `POST /api/adminUpsertAnnouncement` - Create/update announcement (admin)
- `POST /api/adminListAnnouncements` - List all announcements (admin)
- `POST /api/adminDeleteAnnouncement` - Delete announcement (admin)
- `POST /api/adminGrantPromoCohort` - Grant rewards to promo cohort (admin)
- `POST /api/adminBulkGrantReward` - Bulk grant rewards (admin)

### Usage & Analytics

- `GET /api/getUsageStats` - Get user usage statistics
- `POST /api/trackModelUsage` - Track AI model usage
- `POST /api/getModelUsageAnalytics` - Get model usage analytics (admin)

### Webhooks

- `POST /api/stripeWebhook` - Handle Stripe webhooks (subscriptions, payments)

---

## Database Structure

### Firestore Collections

#### `users`
User account data and settings.

**Key Fields:**
- `id`, `email`, `name`, `avatar`, `bio`
- `plan`: 'Free' | 'Pro' | 'Elite'
- `userType`: 'Creator' | 'Business'
- `role`: 'Admin' | 'User'
- `hasCompletedOnboarding`: boolean
- `storageUsed`, `storageLimit`
- `monthlyCaptionGenerationsUsed`, `monthlyImageGenerationsUsed`, `monthlyVideoGenerationsUsed`
- `subscriptionStartDate`, `subscriptionEndDate`, `billingCycle`
- `settings`: User preferences and AI behavior

#### `strategies`
Content strategies generated by AI Content Strategist.

**Key Fields:**
- `id`, `userId`, `name`
- `niche`, `audience`, `goal`
- `plan`: StrategyPlan (weeks, days, content)
- `status`: 'draft' | 'active' | 'archived'
- `createdAt`, `updatedAt`

#### `media_library`
Media assets stored by users.

**Structure:**
- `users/{userId}/media_library/{mediaId}`
- `url`, `type`, `filename`, `size`, `uploadedAt`
- `folderId` (optional)

#### `content_gap_analysis_history`
Main app content gap analyses (shared by Dashboard and Compose).

**Key Fields:**
- `id`, `userId`
- `summary`, `gaps`, `suggestions`
- `generatedAt`

#### `onlyfans_content_brain_history`
OnlyFans Studio content analyses.

**Key Fields:**
- `id`, `userId`
- `type`: 'gap_analysis' | 'prediction' | 'repurpose'
- `result`: Analysis results
- `generatedAt`

#### `announcements`
Admin announcements and promotions.

**Key Fields:**
- `id`, `title`, `message`, `type`
- `targetPlans`, `targetUserIds` (optional)
- `startDate`, `endDate`
- `isActive`, `isBanner`, `isPublic`, `dismissible`

#### `plan_change_events`
Plan upgrade tracking for promo cohort grants.

**Key Fields:**
- `id`, `userId`
- `fromPlan`, `toPlan`
- `changedAt`, `source`

---

## Authentication & Authorization

### Firebase Authentication

**Methods:**
- Email/Password
- OAuth (Instagram, X/Twitter) - configured but limited in offline mode

**Token Verification:**
- JWT-based (Firebase ID tokens)
- Verified on all protected API endpoints
- Stored in `Authorization: Bearer {token}` header

### Role-Based Access Control

**Admin:**
- Full access to Admin Dashboard
- User management
- Announcement management
- Bulk reward grants
- Promo cohort grants

**User:**
- Standard access based on plan
- Feature gating by plan

### Plan-Based Feature Access

Features are gated based on user plan:
- Frontend checks: `user.plan === 'Free' | 'Pro' | 'Elite'`
- Backend verification on API calls
- Usage limits enforced

---

## AI Integration & Models

### Google Gemini API

**Primary Use Cases:**
- Content strategy generation
- Caption generation
- Content gap analysis
- Performance prediction
- Content repurposing
- Roleplay idea generation

**Models:**
- Gemini Pro (text generation)
- Gemini Imagen 3 (image generation - disabled in UI)
- Gemini Veo (video generation - disabled in UI)

### Tavily API

**Purpose:** Live web search for trend research

**Usage:**
- Pro: 16 searches/month
- Elite: 40 searches/month
- Free: Not available

**Features:**
- Niche-specific trend research
- Real-time information retrieval
- Integrated into Strategy generation

### Model Usage Tracking

**Purpose:** Monitor costs and usage

**Tracking:**
- Model name
- Task type
- Cost
- Success/failure
- Timestamp

**Storage:** `model_usage_logs` collection

---

## Workflows & User Journeys

### 1. New User Onboarding

1. **Sign Up**
   - Email/password or OAuth
   - Account created in Firebase Auth

2. **Select Plan**
   - Free, Pro, or Elite
   - If paid: Stripe checkout

3. **Onboarding Modal**
   - Niche selection
   - Audience definition
   - Goal setting
   - Plan-specific feature introduction

4. **Dashboard Introduction**
   - Quick tour of features
   - Start with Strategy or Compose

---

### 2. Content Strategy Workflow

1. **Navigate to Strategy**
2. **Enter Details:**
   - Niche, audience, goals
   - Platform focus
   - Duration, tone
3. **Generate Strategy:**
   - AI generates multi-week roadmap
   - Weekly themes and campaigns
   - Daily content topics
4. **Review & Refine:**
   - Edit topics
   - Upload media
   - Generate captions
5. **Save & Use:**
   - Save strategy
   - Add to Calendar
   - Create posts in Compose

---

### 3. Compose Workflow

1. **Navigate to Compose**
2. **Select Platform(s)**
3. **Enter Prompt or Upload Media**
4. **Generate Caption:**
   - AI optimizes for selected platform
   - Character limits respected
   - Style optimized
5. **Refine & Edit:**
   - Edit caption
   - Add hashtags
   - Attach media
6. **Copy & Post:**
   - Copy to clipboard
   - Post manually to platform

---

### 4. OnlyFans Studio Workflow (Elite)

1. **Navigate to OnlyFans Studio**
2. **Content Brain:**
   - Generate OnlyFans captions
   - Analyze content gaps
   - Predict performance
   - Repurpose for other platforms
3. **Organize:**
   - Add to Studio Calendar
   - Store in Media Vault
4. **Export:**
   - Use Export Hub
   - Download content
   - Post manually to OnlyFans

---

### 5. Content Gap Analysis Workflow

**Main App (Dashboard/Compose):**
1. Click "Analyze Content Gaps"
2. AI analyzes across all platforms
3. Results saved to shared history
4. Review gaps and suggestions
5. Take action on suggestions

**OnlyFans Studio:**
1. Click "Analyze Content Gaps" in Content Brain
2. AI analyzes OnlyFans-specific content
3. Results saved to OnlyFans history (separate)
4. Review OnlyFans-specific gaps
5. Optimize OnlyFans content

---

## Admin Features

### Admin Dashboard (`components/AdminDashboard.tsx`)

**Tabs:**
1. **Overview:**
   - Total users
   - Simulated MRR
   - New users (30 days)
   - Plan distribution
   - Top users by generations
   - Recent activity

2. **Users:**
   - User list with search
   - Edit user details
   - Change plans
   - View usage statistics
   - Grant referral rewards

3. **Referral Rewards:**
   - Configure referral rewards
   - Grant manual rewards

4. **Announcements:**
   - Create/edit announcements
   - Manage public banners
   - Bulk grant rewards
   - Promo cohort grants

### Announcements System

**Types:**
- Public banners (landing page)
- In-app banners
- Reminders (notifications dropdown)

**Features:**
- Target by plan or user IDs
- Schedule with start/end dates
- Dismissible/non-dismissible
- Action buttons (navigate to pages)

### Bulk Rewards

**Reward Types:**
- Extra generations
- Free months
- Storage boost

**Targeting:**
- By plan
- By user IDs
- Promo cohort (users who upgraded during window)

---

## Deployment & Infrastructure

### Vercel Deployment

**Build Process:**
1. `npm run build` (Vite)
2. Output to `dist/` directory
3. Deploy to Vercel

**Environment Variables:**
- `GEMINI_API_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `STRIPE_SECRET_KEY_LIVE` / `STRIPE_SECRET_KEY_Test`
- `STRIPE_WEBHOOK_SECRET`
- `TAVILY_API_KEY`
- `OPENAI_API_KEY` (optional)
- `REPLICATE_API_TOKEN` (optional)

### Firebase Configuration

**Services:**
- Firestore (database)
- Auth (authentication)
- Storage (media files)

**Security Rules:**
- User data access control
- Admin-only collections
- Plan-based feature access

### CDN & Assets

**Static Assets:**
- Served via Vercel CDN
- Optimized builds
- Code splitting

---

## Key Constraints & Limitations

### Offline Mode Constraints

1. **No Auto-Posting:**
   - Publishing buttons show offline message
   - Users manually copy content to post
   - No social account connections required

2. **Limited Analytics:**
   - No real-time social media analytics
   - Planning-focused insights only
   - No competitor tracking
   - No social listening

3. **No Direct Integrations:**
   - Social API connections hidden
   - OAuth configured but limited
   - Manual workflow required

### Feature Limitations

1. **Image/Video Generation:**
   - Tabs hidden in UI
   - Backend endpoints exist
   - Temporarily disabled

2. **Media Editing:**
   - Blur/eraser tools disabled
   - Clear "temporarily disabled" messages

3. **Business/Agency Plans:**
   - Hidden from pricing
   - Code exists but not accessible
   - May return in future

### Usage Limits

**Free Plan:**
- 1 strategy/month
- 10 captions/month
- No Tavily searches

**Pro Plan:**
- 2 strategies/month
- 500 captions/month
- 16 Tavily searches/month

**Elite Plan:**
- 5 strategies/month
- 1,500 captions/month
- 40 Tavily searches/month

---

## Summary

EchoFlux.ai is a comprehensive AI-powered content planning and creation studio designed for creators, with specialized OnlyFans tools for Elite users. The application operates in offline/planning-first mode, focusing on strategy generation, content creation, and organization rather than automated posting.

**Key Strengths:**
- Comprehensive AI-powered content tools
- Specialized OnlyFans Studio for Elite users
- Flexible planning and organization
- No social account connections required
- Creator-focused design

**Current Limitations:**
- Offline mode (no auto-posting)
- Limited analytics
- Image/video generation disabled in UI
- Business/Agency plans hidden

**Future Potential:**
- Direct social media integrations
- Enhanced analytics
- Image/video generation re-enabled
- Business/Agency plan activation

---

**Document Version:** 1.0  
**Last Updated:** January 2025  
**Status:** Production - Offline Mode
