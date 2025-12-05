# EngageSuite.ai - Complete Application Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [User Types & Plans](#user-types--plans)
4. [Core Features](#core-features)
5. [Pages & Components](#pages--components)
6. [API Endpoints](#api-endpoints)
7. [Database Structure](#database-structure)
8. [Authentication & Authorization](#authentication--authorization)
9. [AI Integration](#ai-integration)
10. [Deployment](#deployment)
11. [Development Setup](#development-setup)
12. [Key Workflows](#key-workflows)
13. [Admin Features](#admin-features)
14. [Promotions System](#promotions-system)

---

## Overview

**EngageSuite.ai** is an AI-powered Social Media & Marketing Operating System designed to help creators and businesses manage their social media presence, generate content, automate engagement, and grow their audience.

### Core Concept

EngageSuite.ai offers two tailored experiences:
- **Creators**: Focused on brand growth, engagement, and audience building
- **Businesses**: Focused on marketing, leads, sales, and ROI

Users select their role during a mandatory onboarding process, which customizes the entire experience.

### Key Technologies

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Backend**: Vercel Serverless Functions, Firebase (Firestore, Auth, Storage)
- **AI**: Google Gemini API, OpenAI, Replicate
- **Deployment**: Vercel
- **Database**: Firebase Firestore
- **Storage**: Firebase Storage

---

## Architecture

### Frontend Architecture

```
src/
├── components/          # React components
│   ├── contexts/        # Context providers (Auth, Data, UI)
│   ├── analytics/      # Analytics-related components
│   ├── icons/          # Icon components
│   └── [Page Components]
├── src/
│   └── services/       # Service layer (API calls, utilities)
├── types.ts           # TypeScript type definitions
├── constants.ts       # Application constants
├── firebaseConfig.ts  # Firebase configuration
└── App.tsx           # Main application component
```

### Backend Architecture

```
api/
├── _auth.ts              # Authentication utilities
├── _firebaseAdmin.ts     # Firebase Admin SDK setup
├── _gemini.ts            # Gemini AI integration
├── [Feature APIs]        # Individual API endpoints
└── oauth/                # OAuth handlers for social platforms
```

### State Management

- **React Context API**: Global state management
  - `AuthContext`: User authentication state
  - `DataContext`: Application data (messages, campaigns, etc.)
  - `UIContext`: UI state (modals, sidebar, theme)

---

## User Types & Plans

### Creator Plans

| Plan | Price | Social Accounts | AI Replies/Month | Image Gen | Video Gen | Key Features |
|------|-------|----------------|------------------|-----------|-----------|--------------|
| **Free** | $0 | 1 | 50 | 0 | 0 | Basic features, limited AI replies |
| **Pro** | $49/mo | 3 | 500 | 50 | 1 | AI Content Strategist, basic generation |
| **Elite** | $199/mo | 5 | 1,500 | 500 | 25 | Advanced CRM, 3 voice clones, more generations |

### Business Plans

| Plan | Price | Social Accounts | AI Replies/Month | Key Features |
|------|-------|----------------|------------------|-------------|
| **Starter** | $99/mo | 3 | 1,000 | AI Marketing Manager, Business Analytics |
| **Growth** | $249/mo | 5 | 2,500 | Competitor Analysis, Social Listening |
| **Agency** | $599/mo | Unlimited | Unlimited | Client Workflows, Team Management |

### Plan Features Matrix

| Feature | Free | Pro | Elite | Starter | Growth | Agency |
|---------|------|-----|------|---------|--------|--------|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Compose | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| AI Content Strategist | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Calendar | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Analytics | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Automation/Autopilot | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Link in Bio | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Opportunities/Trends | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Approvals Workflow | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Team Management | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Client Management | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Social Listening | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Competitor Analysis | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |

---

## Core Features

### 1. AI Content Generation

#### Compose Page
- **AI Caption Generation**: Generate captions from text prompts or uploaded media
- **Image Generation**: Create images using AI (Gemini Imagen 3)
- **Video Generation**: Generate video clips using Google Veo model
- **Multi-Media Posts**: Combine images, videos, and captions
- **Platform Optimization**: Auto-optimize content for each platform
- **Hashtag Suggestions**: AI-generated hashtags based on content

#### Media Library
- Upload and organize media assets
- Use existing media in new posts
- Delete unused media
- Storage quota management

### 2. AI Content Strategist

- **Multi-Week Roadmaps**: Generate content plans spanning multiple weeks
- **Topic Suggestions**: AI-suggested topics based on niche and audience
- **Media Type Recommendations**: Suggestions for images vs videos
- **Caption Pre-Generation**: Auto-generate captions for each post
- **Image/Video Ideas**: Specific creative suggestions for each topic
- **Calendar Integration**: Automatically schedule to calendar

### 3. AI Autopilot / Marketing Manager

- **Campaign Ideas**: Dynamic AI-generated campaign suggestions
- **Custom Campaigns**: Create campaigns from custom goals
- **Full Campaign Generation**: AI generates strategy and all posts
- **Approval Workflow**: Review and approve generated content
- **Multi-Week Execution**: Automatically execute campaigns over time

### 4. Social CRM & Inbox

- **Unified Inbox**: All DMs and comments in one feed
- **AI Reply Generation**: Auto-generate replies in user's voice
- **Message Categorization**: Auto-categorize messages (Lead, Support, etc.)
- **CRM Sidebar**: View user profiles, add notes, tags, view history
- **AI Relationship Summary**: AI-generated summaries of relationships
- **Sentiment Analysis**: Analyze message sentiment

### 5. Content Calendar

- **Visual Calendar**: Drag-and-drop scheduling interface
- **Best Time Recommendations**: AI-suggested optimal posting times
- **Multi-Platform Scheduling**: Schedule to multiple platforms
- **Post Preview**: Preview posts before scheduling
- **Bulk Operations**: Schedule multiple posts at once

### 6. Analytics

- **Overview Dashboard**: Key metrics and insights
- **Social Listening**: Monitor mentions and conversations
- **Competitor Analysis**: Track competitor performance
- **AI-Powered Reports**: Generate detailed analytics reports
- **Trend Analysis**: Identify trending topics and opportunities
- **Performance Tracking**: Track engagement, growth, and ROI

### 7. Opportunities & Trends

- **Trending Hashtags**: Discover trending hashtags in your niche
- **Viral Audio**: Find trending audio clips
- **Popular Topics**: Identify trending topics
- **Collaboration Opportunities**: Find potential collaborators
- **Content Gaps**: Identify content opportunities

### 8. Link in Bio Builder

- **Mobile-Optimized Pages**: Create beautiful landing pages
- **Email Capture**: Built-in email capture forms
- **Custom Branding**: Customize colors, fonts, layout
- **Link Management**: Add multiple links and social profiles
- **Analytics**: Track clicks and conversions

### 9. Approval Workflow (Elite/Agency)

- **Kanban Board**: Visual workflow management
- **Stages**: Draft → In Review → Approved
- **Team Collaboration**: Assign reviewers and approvers
- **Comments & Feedback**: Add comments on posts
- **Bulk Approval**: Approve multiple posts at once

### 10. Team & Client Management (Agency)

- **Team Members**: Invite and manage team members
- **Client Accounts**: Manage multiple client accounts
- **Role-Based Access**: Admin and Member roles
- **Client Assignment**: Assign team members to clients
- **Unified Dashboard**: View all clients from one dashboard

### 11. Automation

- **Auto-Reply**: Automatically respond to messages
- **Auto-Respond**: Automatically respond to comments
- **Keyword Prioritization**: Prioritize messages with specific keywords
- **Ignored Keywords**: Filter out unwanted messages
- **Tone Customization**: Customize AI tone and style

### 12. Ad Generator

- **AI Ad Creation**: Generate ad copy and creative
- **Multi-Format Support**: Generate ads for different platforms
- **A/B Testing**: Generate multiple ad variations
- **Performance Optimization**: AI-optimized ad copy

---

## Pages & Components

### Main Pages

#### Dashboard (`components/Dashboard.tsx`)
- Overview of all activity
- Recent messages, campaigns, analytics
- Quick actions and shortcuts
- Activity feed

#### Compose (`components/Compose.tsx`)
- Create posts with AI assistance
- Upload/generate media
- Multi-platform posting
- Caption generation

#### Analytics (`components/Analytics.tsx`)
- Analytics overview
- Social listening
- Competitor analysis
- AI-powered reports

#### Strategy (`components/Strategy.tsx`)
- AI Content Strategist
- Content roadmap generation
- Topic suggestions
- Calendar integration

#### Calendar (`components/Calendar.tsx`)
- Visual content calendar
- Drag-and-drop scheduling
- Best time recommendations
- Post preview

#### Automation (`components/Automation.tsx`)
- Autopilot/Marketing Manager
- Campaign management
- Auto-reply settings

#### Opportunities (`components/Opportunities.tsx`)
- Trending hashtags
- Viral content
- Collaboration opportunities

#### Media Library (`components/MediaLibrary.tsx`)
- Media asset management
- Upload/download
- Organization

#### Approvals (`components/Approvals.tsx`)
- Kanban workflow board
- Post review and approval
- Team collaboration

#### Team (`components/Team.tsx`)
- Team member management
- Role assignment
- Client assignment

#### Clients (`components/Clients.tsx`)
- Client account management
- Client switching
- Unified dashboard

#### Settings (`components/Settings.tsx`)
- Account settings
- Social account connections
- AI preferences
- Tone customization

#### Bio Page Builder (`components/BioPageBuilder.tsx`)
- Landing page creation
- Link management
- Email capture forms

#### Ad Generator (`components/AdGenerator.tsx`)
- AI ad generation
- Multi-format support

#### Admin Dashboard (`components/AdminDashboard.tsx`)
- User management
- Analytics overview
- Promotions management
- Model usage tracking

### Supporting Components

- **Header** (`components/Header.tsx`): Top navigation bar
- **Sidebar** (`components/Sidebar.tsx`): Main navigation sidebar
- **PaymentModal** (`components/PaymentModal.tsx`): Payment processing
- **PromotionsManagement** (`components/PromotionsManagement.tsx`): Admin promotions
- **CRMSidebar** (`components/CRMSidebar.tsx`): CRM user profile sidebar
- **ErrorBoundary** (`components/ErrorBoundary.tsx`): Error handling
- **Toast** (`components/Toast.tsx`): Notification system

---

## API Endpoints

### Authentication & User Management

- `POST /api/verifyAuth` - Verify Firebase auth token
- `POST /api/getSocialStats` - Get social media statistics
- `POST /api/syncSocialData` - Sync social media data

### Content Generation

- `POST /api/generateCaptions` - Generate captions from prompts/media
- `POST /api/generateImage` - Generate images using AI
- `POST /api/generateVideo` - Generate videos using AI
- `POST /api/getVideoStatus` - Check video generation status
- `POST /api/analyzeMediaForPost` - Analyze media for post optimization

### Strategy & Planning

- `POST /api/generateContentStrategy` - Generate content strategy
- `POST /api/generateContentIdeas` - Generate content ideas
- `POST /api/getStrategies` - Get saved strategies
- `POST /api/saveStrategy` - Save content strategy
- `POST /api/updateStrategyStatus` - Update strategy status

### Automation & Campaigns

- `POST /api/generateAutopilotPlan` - Generate autopilot campaign plan
- `POST /api/generateAutopilotSuggestions` - Get campaign suggestions
- `POST /api/getGeneratedContent` - Get generated campaign content
- `POST /api/saveGeneratedContent` - Save generated content

### Messaging & CRM

- `POST /api/generateReply` - Generate AI replies to messages
- `POST /api/categorizeMessage` - Categorize incoming messages
- `POST /api/generateCRMSummary` - Generate CRM relationship summary

### Analytics

- `POST /api/getAnalytics` - Get analytics data
- `POST /api/generateAnalyticsReport` - Generate AI analytics report
- `POST /api/findTrends` - Find trending topics
- `POST /api/findTrendsByNiche` - Find trends by niche
- `POST /api/scrapeTrendingTopics` - Scrape trending topics

### Social Media Integration

- `GET /api/oauth/instagram/authorize` - Instagram OAuth
- `GET /api/oauth/instagram/callback` - Instagram OAuth callback
- `GET /api/oauth/x/authorize` - X (Twitter) OAuth
- `GET /api/oauth/x/callback` - X OAuth callback
- `POST /api/social/disconnect` - Disconnect social account
- `POST /api/social/fetchRealStats` - Fetch real-time stats

### Voice & Audio

- `POST /api/cloneVoice` - Clone user voice
- `POST /api/generateSpeech` - Generate speech from text
- `POST /api/generateSpeechWithVoice` - Generate speech with cloned voice
- `POST /api/generateTextToSpeechAudio` - TTS audio generation
- `POST /api/combineVideoAudio` - Combine video and audio

### Ads & Marketing

- `POST /api/generateAd` - Generate ad copy and creative
- `POST /api/generateBrandSuggestions` - Generate brand suggestions

### Promotions

- `POST /api/validatePromotion` - Validate promotion code
- `POST /api/applyPromotion` - Apply promotion to purchase

### Admin & Analytics

- `POST /api/getModelUsageAnalytics` - Get AI model usage statistics
- `POST /api/trackModelUsage` - Track model usage

### Webhooks

- `POST /api/webhooks/instagram` - Instagram webhook handler
- `POST /api/webhooks/facebook` - Facebook webhook handler
- `POST /api/webhooks/youtube` - YouTube webhook handler

---

## Database Structure

### Firestore Collections

#### `users`
User account data:
```typescript
{
  id: string;
  name: string;
  email: string;
  avatar: string;
  bio: string;
  plan: 'Free' | 'Pro' | 'Elite' | 'Starter' | 'Growth' | 'Agency';
  role: 'Admin' | 'User';
  userType: 'Creator' | 'Business';
  signupDate: string;
  businessName?: string;
  businessType?: string;
  businessGoal?: string;
  niche?: string;
  audience?: string;
  hasCompletedOnboarding: boolean;
  hasAutopilot: boolean;
  notifications: {
    newMessages: boolean;
    weeklySummary: boolean;
    trendAlerts: boolean;
  };
  monthlyCaptionGenerationsUsed: number;
  monthlyImageGenerationsUsed: number;
  monthlyVideoGenerationsUsed: number;
  monthlyAdGenerationsUsed?: number;
  monthlyRepliesUsed: number;
  storageUsed: number;
  storageLimit: number;
  mediaLibrary: MediaItem[];
  settings: Settings;
  hashtagSets?: HashtagSet[];
  socialStats?: Record<Platform, SocialStats>;
  goals?: {
    followerGoal?: number;
    monthlyPostsGoal?: number;
    monthlyLeadsGoal?: number;
  };
  bioPage?: BioPageConfig;
  socialAccounts?: SocialAccount[];
  subscriptionEndDate?: string;
  cancelAtPeriodEnd?: boolean;
  subscriptionStartDate?: string;
  billingCycle?: 'monthly' | 'annually';
}
```

#### `strategies`
Content strategies:
```typescript
{
  id: string;
  userId: string;
  clientId?: string;
  name: string;
  niche: string;
  audience: string;
  goal: string;
  plan: {
    weeks: Week[];
  };
  createdAt: string;
  updatedAt: string;
}
```

#### `analytics_reports`
Analytics reports:
```typescript
{
  id: string;
  userId: string;
  clientId?: string;
  dateRange: string;
  platform: string;
  generatedAt: string;
  reportContent: string;
  summary?: string;
  growthInsights?: string[];
  recommendedActions?: string[];
  riskFactors?: string[];
}
```

#### `promotions`
Promotion codes:
```typescript
{
  id: string;
  code: string;
  name: string;
  description?: string;
  type: 'percentage' | 'fixed' | 'free';
  discountValue: number;
  applicablePlans: Plan[];
  startDate: string;
  endDate: string;
  maxUses?: number;
  currentUses: number;
  maxUsesPerUser?: number;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
  freeDays?: number;
  discountDurationDays?: number;
}
```

#### `promotion_usages`
Promotion usage tracking:
```typescript
{
  id: string;
  promotionId: string;
  userId: string;
  userEmail: string;
  plan: Plan;
  originalPrice: number;
  discountedPrice: number;
  discountAmount: number;
  usedAt: string;
  expiresAt?: string;
}
```

#### `model_usage_logs`
AI model usage tracking:
```typescript
{
  id: string;
  userId: string;
  model: string;
  task: string;
  cost: number;
  timestamp: string;
  success: boolean;
  error?: string;
}
```

#### `media_library`
User media assets:
```typescript
{
  id: string;
  userId: string;
  url: string;
  type: 'image' | 'video';
  filename: string;
  size: number;
  uploadedAt: string;
}
```

#### `autopilot_campaigns`
Autopilot campaigns:
```typescript
{
  id: string;
  userId: string;
  clientId?: string;
  name: string;
  goal: string;
  status: 'draft' | 'active' | 'completed' | 'paused';
  plan: CampaignPlan;
  createdAt: string;
  updatedAt: string;
}
```

#### `scheduled_posts`
Scheduled posts:
```typescript
{
  id: string;
  userId: string;
  clientId?: string;
  platform: Platform;
  content: string;
  mediaUrl?: string;
  scheduledAt: string;
  status: 'scheduled' | 'posted' | 'failed';
  postedAt?: string;
}
```

---

## Authentication & Authorization

### Firebase Authentication

- **Email/Password**: Standard email authentication
- **OAuth**: Social media OAuth (Instagram, X/Twitter)
- **Token Verification**: JWT tokens for API authentication

### Role-Based Access Control

- **Admin**: Full access to admin dashboard, user management, promotions
- **User**: Standard user access based on plan
- **Team Member**: Limited access (Agency plans)

### Plan-Based Feature Access

Features are gated based on user plan. See [Plan Features Matrix](#plan-features-matrix) for details.

---

## AI Integration

### Google Gemini API

- **Text Generation**: Captions, replies, strategies
- **Image Generation**: Imagen 3 model
- **Video Generation**: Veo model
- **Analysis**: Content analysis, sentiment analysis

### OpenAI API

- **Text Generation**: Alternative text generation
- **Image Generation**: DALL-E (if configured)

### Replicate

- **Video Processing**: Video generation and processing

### Model Usage Tracking

All AI model usage is tracked for:
- Cost analysis
- Usage limits
- Performance monitoring
- Admin analytics

---

## Deployment

### Vercel Deployment

1. **Build**: `npm run build`
2. **Deploy**: `vercel --prod`
3. **Environment Variables**: Set in Vercel dashboard
   - `GEMINI_API_KEY`
   - `OPENAI_API_KEY`
   - `REPLICATE_API_TOKEN`
   - Firebase configuration

### Firebase Configuration

- **Firestore**: Database
- **Storage**: Media storage
- **Auth**: User authentication
- **Security Rules**: Configured for data access control

### Environment Setup

Required environment variables:
```env
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key (optional)
REPLICATE_API_TOKEN=your_replicate_token (optional)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_PRIVATE_KEY=your_private_key
```

---

## Development Setup

### Prerequisites

- Node.js 20.x
- npm or yarn
- Firebase account
- Google Gemini API key

### Installation

```bash
# Clone repository
git clone [repository-url]

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your keys

# Run development server
npm run dev
```

### Project Structure

```
engagesuite.ai/
├── api/                 # Vercel serverless functions
├── components/          # React components
├── src/                # Source files
│   └── services/      # Service layer
├── public/            # Static assets
├── types.ts          # TypeScript types
├── constants.ts     # Constants
├── firebaseConfig.ts # Firebase config
├── App.tsx          # Main app component
└── package.json     # Dependencies
```

### Development Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `vercel dev` - Run Vercel development server

---

## Key Workflows

### 1. User Onboarding

1. User signs up/logs in
2. Select user type (Creator or Business)
3. Complete onboarding questionnaire
4. Choose plan
5. Connect social accounts
6. Start using the platform

### 2. Creating a Post

1. Navigate to Compose page
2. Enter prompt or upload media
3. Generate caption (AI-assisted)
4. Generate/upload images or videos
5. Select platforms
6. Schedule or post immediately

### 3. Content Strategy Workflow

1. Navigate to Strategy page
2. Enter niche, audience, goals
3. AI generates multi-week roadmap
4. Review topics and suggestions
5. Generate captions for each post
6. Upload media
7. Schedule to calendar

### 4. Autopilot Campaign

1. Navigate to Automation page
2. Select campaign idea or create custom
3. AI generates full campaign
4. Review generated content
5. Approve posts
6. Campaign executes automatically

### 5. Message Response Workflow

1. Receive message in inbox
2. AI categorizes message
3. AI generates reply
4. Review and edit if needed
5. Send reply
6. CRM profile updated

### 6. Analytics Review

1. Navigate to Analytics page
2. View overview metrics
3. Generate AI-powered report
4. Review insights and recommendations
5. Take action on recommendations

---

## Admin Features

### Admin Dashboard

Accessible only to users with `role: 'Admin'`.

#### Overview Tab
- Total users count
- Simulated MRR
- New users (30 days)
- Image/Video generation stats
- Plan distribution
- Top users by AI generations
- Recent activity feed
- Model usage analytics

#### Users Tab
- User list with search
- Plan management
- Usage statistics
- Storage usage
- Edit user details

#### Promotions Tab
- Create promotions
- View all promotions
- Activate/deactivate promotions
- View usage statistics
- Delete promotions

### User Management

- View all users
- Edit user plans
- View usage statistics
- Manage user accounts

### Promotions Management

See [PROMOTIONS_SYSTEM.md](./PROMOTIONS_SYSTEM.md) for detailed documentation.

### Model Usage Analytics

- Track AI model usage
- Cost analysis
- Performance metrics
- Usage by user
- Usage by task type

---

## Promotions System

The promotions system allows admins to create discount codes, free trials, and limited-time offers.

### Features

- Percentage discounts
- Fixed amount discounts
- Free access periods
- Plan-specific promotions
- Usage limits (total and per-user)
- Date range control
- Automatic tracking

See [PROMOTIONS_SYSTEM.md](./PROMOTIONS_SYSTEM.md) for complete documentation.

---

## Additional Resources

### Documentation Files

- `PROMOTIONS_SYSTEM.md` - Promotions system documentation
- `COMMENT_DETECTION_ANALYSIS.md` - Comment detection analysis
- `FEATURE_ANALYSIS.md` - Feature analysis documentation

### Support

For technical support or questions:
- Check documentation files
- Review API endpoints
- Check Firebase console for data issues
- Review Vercel logs for deployment issues

---

## Version History

- **v1.0.0** - Initial release
  - Core features implemented
  - Creator and Business experiences
  - AI content generation
  - Social CRM
  - Analytics
  - Promotions system

---

## License

[Your License Here]

---

**Last Updated**: December 2024

