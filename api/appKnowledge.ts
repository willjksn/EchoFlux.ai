// Shared knowledge base for API endpoints
// Note: This is a duplicate of constants/appKnowledge.ts because API TypeScript config
// only includes api/**/*.ts and cannot import from outside the api directory
export const APP_KNOWLEDGE = `
# EchoFlux.ai Knowledge Base

## Age Requirements and Eligibility
**IMPORTANT:** EchoFlux.ai has strict age requirements that must be enforced:
- **Minimum Age:** Users must be at least **13 years old** to use EchoFlux.ai
- **Users Under 18:** If under 18 (or age of majority in their jurisdiction), users must have parent/guardian consent. Parents/guardians are responsible for their child's activities.
- **Adult Content Features (18+):** Certain features including Premium Content Studio and explicit content generation tools are restricted to users who are **18 years of age or older**. Users must verify they are 18+ and legally permitted to access adult content in their jurisdiction.
- **Age Verification:** EchoFlux.ai reserves the right to verify age at any time. False age information may result in immediate account suspension or termination.
- **Compliance:** EchoFlux.ai complies with COPPA (Children's Online Privacy Protection Act) and other age-related regulations.

If users ask about age requirements, clearly explain these policies and direct them to the Terms of Service for complete details. If you suspect a user may be underage, you should advise them to review the Terms of Service and contact support if needed.

## Core Concept
EchoFlux.ai is an **AI Content Studio & Campaign Planner for creators**.

- Current live mode is **offline / planning-first**:
  - Users **do not need to connect social accounts**.
  - The app focuses on **strategy, campaign planning, content packs, and calendars**.
  - Creators **copy content out** to post manually wherever they like.
- "Business"/"Agency" modes, **social listening**, **competitor tracking**, and deep analytics are **paused/hidden for now** (not available in the current version) but may return later.

## Key Surfaces & Workflows

### 1. Strategy (AI Content Strategist) - Detailed Guide

**What it is:**
The Strategy page generates multi-week content roadmaps tailored to your niche, audience, and goals. It's your starting point for planning campaigns.

**Where to find it:**
- Click "Strategy" in the sidebar navigation
- Or use the quick action button on the Dashboard

**How to use it - Step by step:**

1. **Set Your Niche:**
   - Enter your primary content niche (e.g., "fitness", "fashion", "gaming", "adult content")
   - This helps the AI understand your content focus

2. **Define Your Audience:**
   - Describe your target audience (e.g., "women 25-35 interested in wellness", "gamers 18-24")
   - Be specific - the more detail, the better the strategy

3. **Choose Your Goal:**
   - Options include: "Increase Followers/Fans", "Drive Sales/Revenue", "Boost Engagement", "Build Brand Awareness", "Lead Generation"
   - Select the goal that matches your current priority

4. **Select Duration:**
   - Choose 1, 2, 3, or 4 weeks
   - Longer durations provide more comprehensive roadmaps

5. **Set Your Tone:**
   - Options: Professional, Friendly, Casual, Witty, Inspirational, Sexy/Bold, Explicit/Adult Content (for premium platforms)
   - This determines the voice/style of generated content

6. **Choose Platform Focus:**
   - Select your primary platform (Instagram, TikTok, X, OnlyFans, Fansly, Fanvue, etc.)
   - The strategy will be optimized for that platform's best practices

7. **Generate Strategy:**
   - Click "Generate Strategy" button
   - Wait for AI to create your multi-week roadmap
   - Review the generated campaigns, themes, and post ideas

8. **After Generation:**
   - **Save the strategy** for future reference
   - **Use it in Compose** - click on any post idea to create actual content
   - **Add to Calendar** - schedule the roadmap items on your content calendar

**Best practices:**
- Run a new strategy at the start of each month to stay fresh
- Use different goals for different campaigns (e.g., one for growth, one for sales)
- Combine strategies - you can have multiple saved strategies for different purposes
- Refine your niche description based on what works - the AI learns from your inputs

**When to use it:**
- Starting a new content campaign
- Planning monthly content themes
- Need fresh ideas and angles
- Want to align content with business goals
- Preparing for product launches or promotions

**Plan limits:**
- Free: 1 basic strategy/month
- Pro: 2 strategies/month
- Elite: 5 strategies/month

**Example workflow:**
"I want to plan content for my OnlyFans account focused on fitness content. My audience is men 25-40 interested in workout routines and nutrition. My goal is to increase subscribers. I'll generate a 4-week strategy with an explicit tone, then use the post ideas in Compose to create actual captions."

---

### 2. Compose (AI Content Generation) - Detailed Guide

**What it is:**
The main content creation surface where you write, refine, and generate AI-powered captions optimized for specific platforms.

**Where to find it:**
- Click "Compose" in the sidebar navigation
- Or use the quick action button on the Dashboard

**How to use it - Complete workflow:**

**Step 1: Upload or Select Media (Optional)**
- Click "Upload Media" to add images/videos
- Or select from your Media Library
- You can create text-only posts without media

**Step 2: Write Your Initial Idea**
- Type your content idea, topic, or rough draft in the text area
- This can be a sentence, bullet points, or full paragraph
- The AI will refine and expand this

**Step 3: Select Platforms**
- Check the platforms you want to plan for (Instagram, TikTok, X, LinkedIn, etc.)
- **Important:** This is "Plan for platforms" - you'll copy content manually, not auto-post
- Each platform will get optimized captions

**Step 4: Set Your Goal**
- Choose: Engagement, Sales/Revenue, Growth, Brand Awareness, or Lead Generation
- This guides the AI to create content that drives your desired outcome

**Step 5: Choose Your Tone**
- Select from: Professional, Friendly, Casual, Witty, Inspirational, Sexy/Bold, Explicit/Adult Content
- Match your brand voice and platform audience

**Step 6: Generate Captions**
- Click "Generate Captions" button
- AI creates multiple caption options optimized for your selected platforms
- Each caption is automatically tailored to platform best practices:
  - **Instagram:** Character limits, hashtag placement, engagement hooks
  - **TikTok:** Hook-first format, trending style, call-to-action placement
  - **X (Twitter):** Concise, thread-friendly, engagement-driven
  - **LinkedIn:** Professional tone, value-focused, network-building style

**Step 7: Review and Refine**
- Review all generated captions
- Click on any caption to edit it manually
- Use the "Remix" button to regenerate with different angles
- Copy your favorite captions

**Step 8: Schedule or Save**
- Click "Schedule" to add to your content calendar
- Or copy captions to post manually on your platforms
- Save as draft for later editing

**Advanced Features:**

**Analyze Content Gaps:**
- Click "Analyze Content Gaps" button
- AI analyzes your content strategy across all platforms
- Identifies missing content types, topics, or formats
- Provides suggestions to fill gaps
- Results automatically save to history (shared with Dashboard)
- View past analyses in the "Recent: Analyze Content Gaps, Predictions & Repurposes" section

**History Section:**
- View past predictions, repurposes, and gap analyses
- Click "View" on any item to see full details
- Delete items you no longer need

**Hashtag Manager:**
- Save and reuse hashtag sets
- Create platform-specific hashtag collections
- Quick access to trending hashtags from Opportunities page

**Best practices:**
- Generate 3-5 caption options and pick the best one
- Use different tones for different platforms (e.g., professional for LinkedIn, casual for TikTok)
- Regularly use "Analyze Content Gaps" to ensure content variety
- Save successful caption patterns as templates
- Combine Compose with Strategy - use strategy post ideas as starting points

**When to use it:**
- Creating daily posts for social media
- Need quick caption ideas for uploaded media
- Want platform-optimized content
- Refining rough content ideas into polished captions
- Creating content from Strategy roadmap items

**Plan limits:**
- Free: 10 AI captions/month
- Pro: 500 AI captions/month
- Elite: 1,500 AI captions/month

**Example workflow:**
"I uploaded a workout video. I'll select Instagram and TikTok, set goal to 'Engagement', tone to 'Motivational', then generate captions. I'll get Instagram-optimized captions with proper hashtag placement and TikTok hooks that grab attention in the first 3 seconds."

---

### 3. Opportunities (Trend Discovery) - Detailed Guide

**What it is:**
A trend discovery tool that scans for trending topics, hashtags, and content opportunities based on your niche.

**Where to find it:**
- Click "Opportunities" in the sidebar navigation
- Available on Pro, Elite, and Agency plans

**How to use it - Complete workflow:**

**Step 1: Enter Your Niche**
- Type your content niche or topic (e.g., "fitness", "beauty", "gaming", "adult content")
- Be specific for better results (e.g., "women's fitness" vs just "fitness")

**Step 2: Scan for Opportunities**
- Click "Find Opportunities" button
- AI scans for trending topics, hashtags, and content angles
- Results appear in a scrollable list

**Step 3: Filter Results**
- Use platform filter to see opportunities for specific platforms
- Filter by type: "All", "Trending Hashtag", "Content Angle", "Engagement Opportunity"
- Sort by: Relevance, Engagement Potential, or Trending Status

**Step 4: Review Opportunities**
- Each opportunity shows:
  - Title and description
  - Platform it's trending on
  - Related hashtags
  - Best practices for leveraging it
  - Engagement potential

**Step 5: Act on Opportunities**
- Click "Generate Content" to create captions based on the opportunity
- Click "Save Hashtags" to add trending hashtags to your Hashtag Manager
- Click "Use in Compose" to open Compose with the opportunity pre-loaded
- Opportunities auto-save to your scan history

**Step 6: Review History**
- View past scans in the "Scan History" section
- Reload previous scans to reference old opportunities
- Track which opportunities you've acted on

**Best practices:**
- Scan weekly to stay on top of trends
- Focus on opportunities with high engagement potential
- Combine multiple opportunities into single posts when relevant
- Use trending hashtags from opportunities in your regular content
- Act quickly - trends move fast, so capitalize while they're hot

**When to use it:**
- Need fresh content ideas
- Want to ride trending topics
- Looking for new hashtags to use
- Planning content around current events or trends
- Want to boost engagement with trending topics

**Auto-scan feature:**
- Enable auto-scan to automatically find opportunities when you visit the page
- Saves time by showing trends immediately
- Can be toggled on/off

**Example workflow:**
"I'm a fitness creator. I'll enter 'women's fitness' as my niche, click Find Opportunities, and see trending hashtags like #HomeWorkoutChallenge. I'll click 'Generate Content' to create posts around this trend, then save the hashtags to use in future posts."

---

### 4. Premium Content Studio (OnlyFans, Fansly, Fanvue) - Complete Guide

**What it is:**
A specialized suite of tools for creators on premium platforms (OnlyFans, Fansly, Fanvue). Includes content planning, roleplay scenarios, fan management, messaging tools, and export packages.

**Where to find it:**
- Click "Premium Content Studio" in the sidebar (Elite plan only)
- Or navigate to the OnlyFans Studio page

**Access Requirements:**
- Available on **Elite** plan or dedicated **OnlyFansStudio** plan
- Free and Pro plans see an upgrade prompt

**Main Dashboard:**
The Premium Content Studio dashboard shows:
- Quick stats: Total fans, active fans, VIP fans, upcoming sessions
- Recent fan activity
- VIP fans needing attention
- Upcoming scheduled sessions
- Quick access to all subpages

**Subpages and Features:**

#### A. Content Brain (AI Captions & Analysis)

**What it does:**
Generates AI captions specifically optimized for premium platforms, analyzes content gaps, predicts performance, and repurposes content.

**How to use it:**

1. **Generate AI Captions:**
   - Enter your content concept or description
   - Select tone (Teasing, Flirty, Explicit)
   - Choose goal (Engagement, Sales, Retention)
   - Click "Generate Captions"
   - Get multiple caption options ready to copy

2. **Analyze Content Gaps:**
   - Click "Analyze Content Gaps" button
   - AI analyzes your OnlyFans/Fansly/Fanvue content strategy
   - Identifies missing content types, themes, or formats
   - Provides suggestions specific to premium platforms
   - Results save to OnlyFans-specific history (separate from main app)
   - View in "Recent: Analyze Content Gaps, Predictions & Repurposes" section

3. **Predict Performance:**
   - Select content you've created
   - Click "Predict Performance"
   - AI predicts how it will perform on your platform
   - Get insights on engagement potential, revenue likelihood
   - Use predictions to prioritize which content to post

4. **Repurpose Content:**
   - Select existing content
   - Click "Repurpose Content"
   - AI adapts it for other platforms (Instagram, TikTok, X)
   - Maintains brand voice while optimizing for each platform
   - Results save to history

**Best practices:**
- Use Content Brain weekly to analyze your content mix
- Generate 3-5 caption options and pick the most engaging
- Regularly check content gaps to ensure variety
- Use performance predictions to schedule your best content
- Repurpose top-performing content to other platforms

**Example workflow:**
"I created a new photo set. I'll go to Content Brain, enter 'new lingerie set, bedroom theme', select 'Flirty' tone and 'Sales' goal, then generate captions. I'll get 5 options optimized for OnlyFans engagement and conversion."

---

#### B. Roleplay & Interactive Ideas

**What it does:**
Generates roleplay scenarios, builds fan personas, creates rating prompts, and designs interactive posts for premium platforms.

**How to use it:**

1. **Generate Roleplay Scenarios:**
   - Select roleplay type: Teacher/Student, Boss/Employee, Doctor/Patient, Stranger/Stranger, Dom/Sub, Nurse/Patient, Celebrity/Fan, or Custom
   - If Custom, click "Custom" button and enter your custom roleplay type in the text field
   - Choose scenario tone: Teasing, Flirty, Explicit, Romantic, or Custom
   - If Custom tone, click "Custom" button and enter your custom tone description
   - Enter any specific details or preferences
   - Click "Generate Roleplay Scenario"
   - Get a complete scenario script with dialogue and actions
   - Save scenarios for reuse

2. **Build Fan Personas:**
   - Create detailed profiles for your fans
   - Track preferences, spending habits, favorite content types
   - Use personas to personalize messaging

3. **Create Rating Prompts:**
   - Generate interactive rating prompts (e.g., "Rate my outfit 1-10")
   - Increase engagement and conversation starters
   - Save prompts to reuse

4. **Design Interactive Posts:**
   - Create posts that encourage fan interaction
   - Generate "choose your adventure" style content
   - Build engagement through interactivity

**Best practices:**
- Build a library of roleplay scenarios for different fan preferences
- Match roleplay tone to your brand and audience
- Use interactive posts to boost engagement
- Personalize scenarios based on fan personas
- Rotate roleplay types to keep content fresh

**Example workflow:**
"A VIP fan loves teacher/student roleplay. I'll go to Roleplay & Interactive Ideas, select 'Teacher/Student' type, choose 'Explicit' tone, add details about their preferences, generate a scenario, then use it in my next messaging session with them."

---

#### C. Chat/Sexting Session Assistant

**What it does:**
Helps you create engaging chatting and sexting sessions with fans. Generates conversation starters, responses, and maintains engaging dialogue.

**How to use it:**

1. **Start a Session:**
   - Click "Start New Session"
   - Select a fan from your fan list (or create new fan profile)
   - Choose session type: Casual Chat, Sexting, Roleplay, or Custom

2. **Set Session Parameters:**
   - If Roleplay, select roleplay type: Teacher/Student, Boss/Employee, Doctor/Patient, Stranger/Stranger, Dom/Sub, Nurse/Patient, Celebrity/Fan, or Custom
   - Choose tone: Teasing, Flirty, Explicit, Romantic, or Custom
   - Enter any specific context or goals

3. **Generate Suggestions:**
   - AI generates conversation starters, responses, and dialogue
   - Get suggestions based on the session context
   - Copy suggestions to use in your actual messaging

4. **Manage Sessions:**
   - Save session plans for scheduled messaging
   - Track session history
   - Reference past successful sessions

**Best practices:**
- Prepare session plans in advance for scheduled messaging
- Match session tone to fan preferences
- Use roleplay scenarios to create immersive experiences
- Keep sessions engaging with varied dialogue
- Track which session types work best for different fans

**Example workflow:**
"I have a messaging session scheduled with a VIP fan at 8 PM. I'll go to Chat/Sexting Session Assistant, select their profile, choose 'Roleplay' type 'Boss/Employee' with 'Explicit' tone, generate conversation suggestions, then copy them to use during our session."

---

#### D. Content Calendar

**What it does:**
Visual calendar for planning and scheduling premium content. Shows all scheduled posts, sessions, and content releases.

**How to use it:**
- View monthly/weekly view of scheduled content
- Color-coded by content type
- Click any date to see scheduled items
- Drag and drop to reschedule
- Add custom events (PPV releases, special promotions, etc.)
- Export schedule as reference document

**Best practices:**
- Plan 2-4 weeks in advance
- Balance content types (photos, videos, PPV, messages)
- Schedule high-value content during peak engagement times
- Use calendar to ensure consistent posting
- Plan themed weeks (e.g., "lingerie week", "fitness week")

**Example workflow:**
"I'll plan my December content. I'll schedule a new photo set every Monday, PPV releases on Fridays, and daily messaging sessions. I'll use the calendar to ensure I have content ready for each day and don't miss any important dates."

---

#### E. Media Vault

**What it does:**
Organizes and manages all your premium content assets. Tag, categorize, and quickly find media for content creation.

**How to use it:**
- Upload images, videos, and other assets
- Organize into folders or categories
- Tag with keywords for easy searching
- Create collections (e.g., "Lingerie Sets", "Workout Videos", "Behind the Scenes")
- Search by tags, dates, or keywords
- Filter by content type or collection
- Select media from vault when creating new content

**Best practices:**
- Tag everything when uploading
- Create consistent folder structures
- Regularly organize and clean up old content
- Use collections to group related content
- Keep vault organized for quick access

**Example workflow:**
"I need a photo for today's post. I'll go to Media Vault, search for 'lingerie', filter by 'recent', find the perfect image, then use it in Compose to create a caption."

---

#### F. Export Hub

**What it is:**
Creates ready-to-upload content packages with captions, media checklists, and platform-specific formatting.

**How to use it:**
- Select content items to include in export package
- Choose target platform (OnlyFans, Fansly, Fanvue)
- Content formats automatically for that platform's requirements
- Generate downloadable package
- Includes: formatted captions, media checklist, posting instructions
- Download and follow checklist when uploading manually

**Best practices:**
- Create export packages weekly for batch uploading
- Include all related media in one package
- Use checklists to ensure nothing is missed
- Save export packages for reference
- Format captions before exporting to save time

**Example workflow:**
"I've created 10 posts this week. I'll go to Export Hub, select all 10 posts, choose 'OnlyFans' as the platform, create the export package, download it, then use the checklist to upload everything manually to my OnlyFans account."

---

#### G. Fan Management

**What it does:**
Central hub for managing fan relationships, tracking engagement, preferences, and session history across all Premium Content Studio features.

**How to use it:**
- View all fans, filter by type (VIP, Active, Big Spenders, etc.)
- Click on any fan to see their full profile (preferences, spending history, session history, notes)
- Add notes about fan preferences
- Tag fans (VIP, Big Spender, Loyal, etc.)
- See which fans need attention (inactive VIPs, etc.)
- Track upcoming scheduled sessions
- Identify your most valuable fans

**Best practices:**
- Regularly update fan profiles with new information
- Use tags to quickly identify fan types
- Schedule sessions with VIP fans regularly
- Track what content each fan responds to
- Use fan data to personalize messaging and content

**Example workflow:**
"I want to check on my VIP fans. I'll go to Fan Management, filter by 'VIP', see that John hasn't been active in 10 days, then schedule a personalized messaging session with him to re-engage."

---

#### H. Guides & Tips

**What it does:**
Educational resources with best practices, strategies, and step-by-step guides for successful premium content creation.

**How to use it:**
- Browse guides by topic
- Learn platform-specific best practices
- Get tips for increasing engagement and revenue
- Follow step-by-step tutorials

---

#### I. Settings

**What it does:**
Manage your Premium Content Studio preferences, AI training data, and account settings specific to premium platforms.

**How to use it:**
- Configure AI behavior for premium content
- Set default tones and styles
- Manage content preferences
- Adjust platform-specific settings

---

**Premium Content Studio Complete Workflow Example:**

**Weekly Routine:**
1. **Monday:** Use Content Brain to analyze gaps, generate captions for the week
2. **Tuesday:** Plan roleplay scenarios for scheduled messaging sessions
3. **Wednesday:** Organize media in Media Vault, tag new uploads
4. **Thursday:** Review Fan Management, schedule sessions with VIP fans
5. **Friday:** Create export packages in Export Hub for weekend content
6. **Daily:** Use Chat/Sexting Session Assistant for real-time messaging support

**Monthly Planning:**
1. Start with Content Calendar to plan monthly themes
2. Use Content Brain to generate bulk captions
3. Organize all media in Media Vault
4. Schedule fan sessions throughout the month
5. Create export packages weekly for easy uploading

---

### 5. Calendar / Schedule

**What it is:**
Visual planning calendar that shows all your scheduled content across platforms.

**How to use it:**
- View content scheduled for specific dates
- Click dates to see scheduled posts
- Drag and drop to reschedule
- See content from both main app and Premium Content Studio

**Best practices:**
- Keep calendar 2-4 weeks ahead
- Balance content types and platforms
- Use calendar to ensure consistent posting
- Plan themed content weeks

---

### 6. Media Library

**What it is:**
Central storage for all your images, videos, and assets used across the app.

**How to use it:**
- Upload media files
- Organize into folders
- Search and filter
- Select media when creating content in Compose or Premium Content Studio

**Best practices:**
- Tag media when uploading
- Create organized folder structures
- Regularly clean up unused assets
- Use descriptive filenames

---

### 7. Link-in-Bio / Bio Page Builder

**What it is:**
Builds a mobile-optimized link-in-bio page with customizable design, links, and email capture.

**How to use it:**
- Design your page appearance (colors, fonts, styles)
- Add social links and custom links
- Configure email signup form
- Preview on mobile device mockup
- Publish to get your unique URL

**Best practices:**
- Keep design clean and mobile-friendly
- Use high-contrast colors for readability
- Include clear call-to-actions
- Test email capture form
- Update links regularly

**Plan limits:**
- Free: 1 link
- Pro: 5 links
- Elite: Unlimited links

---

### 8. Dashboard (Central Command)

**What it is:**
Your home base showing overview of activity, upcoming content, and quick actions.

**Key sections:**
- Today's Planning Snapshot
- Upcoming scheduled posts
- Quick action buttons
- Usage statistics
- Recent activity

**How to use it:**
- Check daily for planning overview
- Use quick actions to jump to features
- Monitor usage against plan limits
- Review upcoming content schedule

---

### 9. Pricing & Plans

**Creator Plans:**
- **Free** – 1 AI strategy/month (basic), 10 AI captions/month, Basic Link-in-Bio (1 link), 100 MB storage
- **Pro** – AI Content Strategist, 2 strategies/month, 500 captions/month, Link-in-Bio (5 links), Media Library, Calendar, 5 GB storage
- **Elite** – Advanced Strategy options, 5 strategies/month, 1,500 captions/month, Link-in-Bio (unlimited), Media Library, 10 GB storage, **Premium Content Studio included**

**Note:** Trend context refreshes on a recurring schedule (Mon/Thu). The current version does not provide user-triggered live web research.

---

### 10. Settings

**What it includes:**
- Profile and brand voice configuration
- AI behavior controls (tone, explicitness)
- Customize content generation settings

**How to use:**
- Set your brand voice and tone preferences
- Configure AI to match your style
- Customize content generation settings

---

### 11. Chatbot

**Chatbot:**
- Text-based assistant accessible to all users
- Click the chat icon (bottom right) to open
- Ask questions about features, workflows, or get help
- Uses this knowledge base for accurate answers

**The chatbot can:**
- Explain any feature in detail
- Provide step-by-step instructions
- Help brainstorm content ideas
- Answer questions about workflows
- Guide you through using the app

---

## Important Constraints & Messaging

- Do **not** promise:
  - Fully automated, guaranteed publishing to social platforms in the current live mode
  - Real-time, enterprise-grade analytics or competitor/social listening
  - Team/client management for agencies
- Emphasize:
  - EchoFlux.ai is currently best used as a **central brain** for:
    - Strategy and campaign planning
    - Generating content packs and captions
    - Organizing everything on a calendar/board
    - Copying content to post anywhere manually

## Detailed How-To Examples

### "How do I plan a campaign?"
1. Go to **Strategy** page (click "Strategy" in sidebar)
2. Enter your niche, audience, and goals
3. Select duration (1-4 weeks) and tone
4. Choose your primary platform
5. Click "Generate Strategy"
6. Review the multi-week roadmap with campaigns and post ideas
7. Save the strategy
8. Use post ideas in **Compose** to create actual content
9. Schedule content on **Calendar**
10. Copy captions and post manually to your platforms

### "How do I create a post in Compose?"
1. Go to **Compose** page (click "Compose" in sidebar)
2. Optionally upload media or select from Media Library
3. Type your content idea or rough draft
4. Select platforms you want to plan for
5. Choose your goal (Engagement, Sales, Growth, etc.)
6. Select tone (Professional, Friendly, Casual, etc.)
7. Click "Generate Captions"
8. Review generated options - each is optimized for the selected platform
9. Click on any caption to edit it
10. Copy your favorite caption
11. Optionally schedule it or save as draft

### "How do I use Premium Content Studio?"
1. Navigate to **Premium Content Studio** (Elite plan required)
2. Start at the Dashboard to see overview
3. **Content Brain:** Generate captions, analyze gaps, predict performance
4. **Roleplay & Interactive Ideas:** Create roleplay scenarios and interactive posts
5. **Chat/Sexting Session Assistant:** Get conversation suggestions for fan messaging
6. **Content Calendar:** Plan and schedule premium content
7. **Media Vault:** Organize all your premium content assets
8. **Export Hub:** Create ready-to-upload packages
9. **Fan Management:** Track and manage fan relationships
10. **Guides & Tips:** Learn best practices
11. All content must be manually uploaded to OnlyFans, Fansly, or Fanvue

### "How do I find trending opportunities?"
1. Go to **Opportunities** page (Pro/Elite plans)
2. Enter your niche in the search field
3. Click "Find Opportunities" or enable auto-scan
4. Review trending topics, hashtags, and content angles
5. Filter by platform or opportunity type
6. Click "Generate Content" to create posts around trends
7. Click "Save Hashtags" to add trending hashtags to your collection
8. Click "Use in Compose" to open Compose with the opportunity pre-loaded
9. Act quickly - trends move fast!

### "How do I use the Strategy page effectively?"
1. Be specific with your niche (e.g., "women's fitness 25-35" not just "fitness")
2. Clearly define your audience demographics and interests
3. Choose goals that align with your current priorities
4. Use 4-week strategies for comprehensive planning
5. Match tone to your brand voice
6. Select the platform you post most on
7. After generation, review all campaign themes
8. Save strategies you like for future reference
9. Use strategy post ideas as starting points in Compose
10. Regenerate if you want different angles or themes

### "What's the difference between Dashboard/Compose gap analysis and Premium Content Studio gap analysis?"
- **Dashboard & Compose:** Share the same gap analysis history
  - Analyzes content across Instagram, TikTok, X, LinkedIn, Facebook, Threads, YouTube
  - Stored in \`content_gap_analysis_history\` collection
  - Use for general social media content strategy
- **Premium Content Studio:** Has completely separate gap analysis
  - Analyzes OnlyFans, Fansly, Fanvue-specific content only
  - Stored in \`onlyfans_content_brain_history\` collection
  - Use for premium platform-specific strategy
  - They don't overlap - each serves its own purpose

### "How do captions work in Compose?"
1. When you select a platform (Instagram, TikTok, X, etc.) and generate captions
2. AI automatically optimizes captions for that platform:
   - **Instagram:** Proper hashtag placement, engagement hooks, character limits
   - **TikTok:** Hook-first format, trending style, optimal length
   - **X (Twitter):** Concise, thread-friendly, engagement-driven
   - **LinkedIn:** Professional tone, value-focused, network-building
3. Each platform gets captions tailored to its best practices
4. You can generate for multiple platforms at once
5. Each platform receives platform-specific optimized captions
6. Use "Analyze Content Gaps" to ensure content variety across platforms

### "How do I manage fans in Premium Content Studio?"
1. Go to **Fan Management** in Premium Content Studio
2. View all fans, filter by type (VIP, Active, Big Spenders, etc.)
3. Click on any fan to see their full profile:
   - Preferences and interests
   - Spending history and patterns
   - Session history and engagement
   - Notes and tags
4. Use fan data to personalize:
   - Content recommendations
   - Messaging tone and style
   - Roleplay scenarios
   - Session scheduling
5. Track VIP fans needing attention
6. Schedule sessions based on fan activity patterns

### "How do I create roleplay scenarios?"
1. Go to **Roleplay & Interactive Ideas** in Premium Content Studio
2. Select roleplay type (Teacher/Student, Boss/Employee, etc.) or choose "Custom"
3. If Custom, click "Custom" button and enter your custom roleplay type in the text field
4. Select tone (Teasing, Flirty, Explicit, etc.) or choose "Custom"
5. If Custom tone, click "Custom" button and enter your custom tone description
6. Add any specific details or preferences
7. Click "Generate Roleplay Scenario"
8. Review the complete scenario with dialogue and actions
9. Save scenarios you like for reuse
10. Use saved scenarios in Chat/Sexting Session Assistant

### "How do I use the Chat/Sexting Session Assistant?"
1. Go to **Chat/Sexting Session Assistant** in Premium Content Studio
2. Click "Start New Session"
3. Select a fan from your fan list (or create new fan profile)
4. Choose session type: Casual Chat, Sexting, Roleplay, or Custom
5. If Roleplay, select roleplay type and tone
6. Enter any specific context or goals for the session
7. AI generates conversation starters and response suggestions
8. Copy suggestions to use in your actual messaging
9. Save session plans for scheduled messaging
10. Reference past successful sessions

### "How do I export content packages?"
1. Go to **Export Hub** in Premium Content Studio
2. Select content items to include in the package
3. Choose target platform (OnlyFans, Fansly, Fanvue)
4. Content automatically formats for that platform's requirements
5. Click "Create Export Package"
6. Download the package (includes formatted captions and checklist)
7. Follow the checklist when manually uploading
8. Copy captions directly to your platform

---

## Feature-Specific Best Practices

### Strategy Best Practices:
- Run new strategies monthly to stay fresh
- Use different goals for different campaigns
- Combine multiple strategies for variety
- Be specific with niche and audience descriptions
- Save successful strategies as templates

### Compose Best Practices:
- Generate 3-5 options and pick the best
- Use different tones for different platforms
- Regularly analyze content gaps
- Save successful caption patterns
- Combine with Strategy for comprehensive planning

### Opportunities Best Practices:
- Scan weekly for trending topics
- Act quickly on high-engagement opportunities
- Save trending hashtags for future use
- Combine multiple opportunities when relevant
- Track which opportunities drive the most engagement

### Premium Content Studio Best Practices:
- Use Content Brain weekly for caption generation
- Plan roleplay scenarios in advance
- Keep Media Vault organized with tags
- Schedule fan sessions regularly
- Create export packages weekly for batch uploading
- Track fan preferences to personalize content
- Use calendar to ensure consistent posting
- Analyze content gaps monthly

---

## Common Questions & Answers

**Q: Can I auto-post to social media?**
A: No, EchoFlux.ai is currently in planning mode. You create and plan content here, then copy/paste to post manually on your platforms. This keeps your accounts safe and gives you full control.

**Q: How do I know which content will perform best?**
A: In Premium Content Studio, use the "Predict Performance" feature in Content Brain. It analyzes your content and predicts engagement potential before you post.

**Q: Can I use the same caption for multiple platforms?**
A: You can, but it's better to use platform-optimized captions. When you select multiple platforms in Compose, AI generates captions optimized for each platform's best practices.

**Q: How often should I run a new strategy?**
A: Monthly is recommended, but you can run new strategies whenever you need fresh ideas or are starting a new campaign.

**Q: What's the difference between Strategy and Compose?**
A: Strategy creates high-level roadmaps and campaign themes. Compose creates actual captions and posts. Use Strategy for planning, then Compose to create the actual content.

**Q: How do I feature my review on the landing page?**
A: Reviews are managed by admins. If you're an admin, go to Admin Dashboard → Tools tab → Reviews, then check the "Featured" checkbox next to any review. Featured reviews appear on the landing page.

**Q: Can I use Premium Content Studio for platforms other than OnlyFans?**
A: Yes! Premium Content Studio works for OnlyFans, Fansly, Fanvue, and other premium platforms. The tools are designed to work across all premium content platforms.

---

## Navigation Help

**How to navigate to any page:**
- Use the sidebar on the left to click any page name
- Dashboard, Compose, Strategy, Calendar, Opportunities, Premium Content Studio, etc.
- Each page name is clickable and will take you there
- The active page is highlighted in the sidebar

**Quick actions:**
- Dashboard has quick action buttons to jump to Strategy, Compose, or Calendar
- Use these for faster navigation to common tasks

---

## Admin Dashboard & Features - Complete Guide

**What it is:**
The Admin Dashboard is a comprehensive management interface for administrators to manage users, monitor system usage, configure settings, and manage content.

**Access Requirements:**
- Only users with \`role: "Admin"\` in their user document can access
- Navigate to Admin Dashboard from sidebar (only visible to admins)

**Main Tabs:**

### 1. Overview Tab

**What it shows:**
- **Key Statistics Cards:**
  - Total Users
  - Simulated MRR (Monthly Recurring Revenue)
  - New Users (last 30 days)
  - Image Generations (total)
  - Video Generations (total)

- **Plan Distribution:**
  - Visual breakdown of users by plan (Free, Pro, Elite)
  - Percentage and count for each plan
  - Color-coded progress bars

- **Top Users by AI Generations:**
  - List of users with most image/video generations
  - Shows avatar, name, email, and generation count

- **Recent Activity Feed:**
  - Real-time activity log of user actions
  - Shows user name, action details, and timestamp

- **AI Model Usage Analytics:**
  - **Key Metrics:**
    - Total Requests
    - Total Cost
    - Average Cost per Request
    - Error Rate
  - **Requests by Model:**
    - Breakdown by AI model (gemini-2.0-flash, gemini-2.0-flash-lite, tavily-web-search)
    - Percentage and count for each model
  - **Requests by Task Type:**
    - Breakdown by task (caption, analytics, sexting_session, strategy, etc.)
    - Shows which features are used most
  - **Requests by Cost Tier:**
    - Low, Medium, High cost breakdown
  - **Top Users by Requests:**
    - Users with most AI requests
    - Shows request count and cost per user
  - **Time Range Selector:**
    - Filter by: Last 7 days, Last 30 days, Last 90 days

**How to use:**
- Monitor overall system health and usage
- Track user growth and plan distribution
- Identify power users and usage patterns
- Monitor AI costs and optimize model usage
- Review recent activity for troubleshooting

---

### 2. Users Tab

**What it does:**
Manage all users in the system - view, edit, delete, and modify user accounts.

**Features:**

1. **User List:**
   - View all users in a paginated table
   - Search by name, email, or user ID
   - Filter by plan, user type, or status
   - Sort by signup date, plan, or activity

2. **User Details:**
   - Click "Edit" on any user to see full details:
     - Profile information (name, email, avatar)
     - Plan and subscription status
     - Usage statistics (captions, strategies, storage)
     - Account settings and preferences
     - Activity history

3. **Edit User:**
   - **Change Plan:**
     - Select new plan (Free, Pro, Elite, Agency, etc.)
     - Update subscription status
   - **Modify User Data:**
     - Update name, email, avatar
     - Change user type (Creator, Business)
     - Adjust usage limits
     - Set custom storage limits
   - **Account Actions:**
     - Suspend/activate accounts
     - Reset passwords
     - Delete accounts (with confirmation)

4. **User Storage:**
   - View storage usage per user
   - See storage limits by plan
   - Monitor storage trends

**How to use:**
- **Search for a user:**
  1. Go to Admin Dashboard → Users tab
  2. Type name/email in search box
  3. Click on user to view details

- **Change a user's plan:**
  1. Find user in Users tab
  2. Click "Edit" button
  3. Select new plan from dropdown
  4. Click "Save Changes"
  5. User's features update immediately

- **View user usage:**
  1. Click "Edit" on any user
  2. View usage statistics section
  3. See captions used, strategies generated, storage used

**Best practices:**
- Use search to quickly find users
- Review usage before changing plans
- Check activity history when troubleshooting
- Be careful when deleting accounts (irreversible)

---

### 3. Tools Tab

**What it does:**
Collection of admin tools for managing system settings, content, and configurations.

**Sub-tabs:**

#### A. Admin Tools (Tools Home)

**What it does:**
Run live Tavily web searches, manage trend presets, and monitor API usage.

**Features:**

1. **Run Weekly Trends Now:**
   - Button: "Run Weekly Trends Now"
   - Manually triggers the weekly trends refresh job
   - Updates trend data immediately (normally runs on schedule)
   - Use when you need fresh trends before the scheduled run

2. **Tavily Usage Statistics:**
   - **Overall Total Calls:**
    - Total API calls made (excludes cache hits)
    - Breakdown: Admin calls, User calls, Weekly/System calls
   - **This Month:**
    - Monthly usage totals
    - Same breakdown as overall
   - **Top Users This Month:**
    - Top 10 users by Tavily API usage
    - Shows user ID, role, plan, and call count
   - **Refresh Button:**
    - Click "Refresh Totals" to update statistics

3. **"What's Viral This Week" Presets:**
   - **Preset Categories:**
    - **Instagram:** Reels trends, algorithm updates, hook formulas, caption patterns
    - **TikTok:** Trend signals, caption structure, retention hooks, policy changes
    - **X (Twitter):** Post formats, thread templates, engagement patterns, policy changes
    - **OnlyFans:** Monetization best practices, PPV promo copy, retention messaging, policy updates
   - **How to use:**
    1. Select a preset category from dropdown
    2. Set max results (1-10)
    3. Choose search depth (Basic or Advanced)
    4. Optionally check "Bypass cache" for fresh results
    5. Click "Run Preset (Save)"
    6. Results are saved to Firestore for Gemini to use immediately

4. **Custom Tavily Search:**
   - **Query Field:**
    - Enter any search query (e.g., "OnlyFans policy updates 2025")
   - **Settings:**
    - Max results: 1-10
    - Search depth: Basic or Advanced
    - Bypass cache: Check to force fresh results
   - **Actions:**
    - Click "Run Tavily Search" to execute
    - Click "Clear" to reset results
   - **Results:**
    - Shows title, snippet, and link for each result
    - Click links to open in new tab
    - Results are NOT automatically saved (use presets to save)

**Best practices:**
- Use presets for common trend categories
- Run weekly trends manually if needed before scheduled time
- Monitor Tavily usage to track API costs
- Use "Bypass cache" sparingly (increases API calls)
- Save important searches as presets for reuse

**Example workflow:**
"I need to update Instagram trends immediately. I'll go to Admin Tools, select 'Instagram Reels trends this week' preset, set max results to 5, choose Advanced depth, then click 'Run Preset (Save)'. The results will be saved and available to Gemini immediately."

---

#### B. Referral Rewards

**What it does:**
Configure and manage the referral rewards system.

**Features:**
- Set reward amounts for referrals
- Configure reward conditions
- View referral statistics
- Grant rewards manually to users

**How to use:**
- Configure reward settings
- Monitor referral activity
- Manually grant rewards when needed

---

#### C. Announcements

**What it does:**
Create and manage system-wide announcements shown to users.

**Features:**
- Create new announcements
- Edit existing announcements
- Set announcement visibility (all users, specific plans, etc.)
- Schedule announcements
- Delete announcements

**How to use:**
1. Go to Admin Dashboard → Tools tab → Announcements
2. Click "Create Announcement"
3. Enter title, message, and settings
4. Set visibility and schedule
5. Save announcement
6. Users see it in their dashboard

---

#### D. Invite Codes

**What it does:**
Manage invite codes for controlled user signups.

**Features:**
- **Create Invite Codes:**
  - Generate new invite codes
  - Set code expiration dates
  - Assign codes to specific plans
  - Set usage limits (how many times code can be used)
- **View Invite Codes:**
  - See all active and expired codes
  - View usage statistics per code
  - See which users signed up with each code
- **Manage Codes:**
  - Activate/deactivate codes
  - Delete unused codes
  - Edit code settings

**How to use:**
- **Create an invite code:**
  1. Go to Admin Dashboard → Tools tab → Invite Codes
  2. Click "Create New Code"
  3. Enter code name/identifier
  4. Set plan assignment (optional)
  5. Set expiration date (optional)
  6. Set usage limit (optional)
  7. Click "Generate Code"
  8. Copy code to share with users

- **View code usage:**
  1. Go to Invite Codes tab
  2. Find code in list
  3. Click to see usage details
  4. View users who signed up with that code

**Best practices:**
- Use descriptive code names
- Set expiration dates for time-limited promotions
- Monitor code usage to track signup sources
- Deactivate codes when no longer needed

---

#### E. Waitlist

**What it does:**
Manage user waitlist for features or access.

**Features:**
- View waitlist entries
- Approve/deny waitlist requests
- Export waitlist data
- Send notifications to waitlisted users

**How to use:**
1. Go to Admin Dashboard → Tools tab → Waitlist
2. View all waitlist entries
3. Click "Approve" to grant access
4. Click "Deny" to remove from waitlist
5. Export data if needed

---

#### F. Feedback

**What it does:**
View and manage user feedback submissions.

**Features:**
- View all feedback submissions
- Filter by status, date, or user
- Respond to feedback
- Mark feedback as resolved
- Export feedback data

**How to use:**
1. Go to Admin Dashboard → Tools tab → Feedback
2. View feedback list
3. Click on any feedback to see details
4. Respond or mark as resolved
5. Filter by status to find pending items

---

#### G. Feedback Forms

**What it does:**
Create and manage custom feedback forms for users.

**Features:**
- **Create Forms:**
  - Design custom feedback forms
  - Add custom fields (text, rating, dropdown, etc.)
  - Set form visibility and targeting
- **Manage Forms:**
  - Edit existing forms
  - Activate/deactivate forms
  - View form submissions
  - Delete forms

**How to use:**
- **Create a feedback form:**
  1. Go to Admin Dashboard → Tools tab → Feedback Forms
  2. Click "Create New Form"
  3. Enter form name and description
  4. Add custom fields as needed
  5. Set visibility settings
  6. Save form
  7. Users see form in their dashboard

- **View form submissions:**
  1. Go to Feedback Forms tab
  2. Click on a form
  3. View all submissions
  4. Export data if needed

---

#### H. Email Center

**What it does:**
Manage email campaigns and scheduled emails.

**Features:**
- View scheduled emails
- Create email campaigns
- Manage email templates
- View email statistics
- Send test emails

**How to use:**
1. Go to Admin Dashboard → Tools tab → Email Center
2. View scheduled emails list
3. Create new campaigns or templates
4. Monitor email delivery and statistics

---

#### I. Reviews

**What it does:**
Manage user reviews for the landing page.

**Features:**

1. **View All Reviews:**
   - See all user-submitted reviews
   - Filter by featured status
   - Sort by date, rating, or featured status

2. **Create/Edit Reviews:**
   - **Create New Review:**
    - Click "Add Review" button
    - Enter username, rating, text
    - Set country, plan (optional)
    - Choose to show avatar or use initials
    - Upload avatar URL (optional)
    - Click "Save Review"
   - **Edit Existing Review:**
    - Click "Edit" button on any review
    - Modify any fields
    - Click "Save Changes"

3. **Feature Reviews:**
   - **How to feature a review:**
    1. Go to Admin Dashboard → Tools tab → Reviews
    2. Find the review you want to feature
    3. Check the "Featured" checkbox
    4. Review is immediately featured
    5. Featured reviews appear on the landing page for all visitors
   - **Unfeature a review:**
    - Uncheck the "Featured" checkbox
    - Review is removed from landing page

4. **Delete Reviews:**
   - Click "Delete" button on any review
   - Confirm deletion
   - Review is permanently removed

5. **Review Statistics:**
   - See count of featured reviews
   - View total reviews count
   - Refresh button to reload reviews

**Best practices:**
- Feature 3-5 high-quality reviews
- Regularly review and update featured reviews
- Respond to user feedback in reviews
- Keep featured reviews diverse (different plans, countries)

**Example workflow:**
"A user submitted a great review. I'll go to Admin Dashboard → Tools → Reviews, find their review, check the 'Featured' checkbox, and it will immediately appear on the landing page for all visitors (logged in or not)."

---

## Admin Feature Summary

**Overview Tab:**
- Monitor system health and usage
- Track user growth and plan distribution
- View AI model usage and costs
- Review recent activity

**Users Tab:**
- Search and manage all users
- Edit user plans and settings
- View user usage statistics
- Suspend/delete accounts

**Tools Tab:**
- **Admin Tools:** Run Tavily searches, manage trends, monitor API usage
- **Referral Rewards:** Configure referral system
- **Announcements:** Create system-wide announcements
- **Invite Codes:** Generate and manage invite codes
- **Waitlist:** Manage feature waitlist
- **Feedback:** View and respond to user feedback
- **Feedback Forms:** Create custom feedback forms
- **Email Center:** Manage email campaigns
- **Reviews:** Feature/unfeature reviews for landing page

**Navigation:**
- Click "Admin Dashboard" in sidebar (only visible to admins)
- Use tabs at top: Overview, Users, Tools
- Within Tools tab, use sub-tabs for specific tools

**Important Notes:**
- All admin features require Admin role
- Changes take effect immediately
- Some actions (like deleting users) are irreversible
- Monitor API usage to control costs
- Featured reviews appear on public landing page

---

Remember: When users ask "how do I...", provide COMPREHENSIVE, DETAILED step-by-step instructions. Explain WHERE to find features (which page, which section), WHAT each feature does, WHEN to use it, and HOW to use it effectively. Give real examples and best practices.
`;
