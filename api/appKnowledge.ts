export const APP_KNOWLEDGE = `
# EchoFlux.ai Knowledge Base

## Age Requirements and Eligibility
**IMPORTANT:** EchoFlux.ai has strict age requirements that must be enforced:
- **Minimum Age:** Users must be at least **13 years old** to use EchoFlux.ai
- **Users Under 18:** If under 18 (or age of majority in their jurisdiction), users must have parent/guardian consent. Parents/guardians are responsible for their child's activities.
- **Adult Content Features (18+):** Certain features including OnlyFans Studio and explicit content generation tools are restricted to users who are **18 years of age or older**. Users must verify they are 18+ and legally permitted to access adult content in their jurisdiction.
- **Age Verification:** EchoFlux.ai reserves the right to verify age at any time. False age information may result in immediate account suspension or termination.
- **Compliance:** EchoFlux.ai complies with COPPA (Children's Online Privacy Protection Act) and other age-related regulations.

If users ask about age requirements, clearly explain these policies and direct them to the Terms of Service for complete details. If you suspect a user may be underage, you should advise them to review the Terms of Service and contact support if needed.

## Core Concept
EchoFlux.ai is an **AI Content Studio & Campaign Planner for creators**.

- Current live mode is **offline / planning-first**:
  - Users **do not need to connect social accounts**.
  - The app focuses on **strategy, campaign planning, content packs, and calendars**.
  - Creators **copy content out** to post manually wherever they like.
- "Business"/"Agency" modes, social listening, competitor tracking, and deep analytics are **paused/hidden for now** but may return later.

## Key Surfaces & Workflows

### 1. Strategy (Strategy.tsx)
- **AI Content Strategist** asks about niche, audience, goals, and preferred platforms.
- It generates:
  - A **multi-week content roadmap** (campaigns, themes, and example posts).
  - Suggested **posting cadence** and content types (reels, carousels, stories, etc.).
- Uses weekly trends (free, updated every Monday) + Tavily searches (Pro/Elite only) for niche-specific research.
- From a good strategy, the user can:
  - Save it.
  - Use it to create posts in Compose.
  - Organize content on the Calendar.

### 4. Compose (Compose.tsx)
- Main **caption/editor & content planning** surface.
- Users can:
  - Write or refine captions.
  - Choose **platforms to plan for** (label is "Plan for platforms", not "Publish to").
  - Attach media from the media library.
- **Image/Video generation tabs are currently hidden/disabled in the UI**:
  - The app may still have backend endpoints for generation, but live product copy says these are temporarily disabled.
- Publishing and scheduling buttons are **guarded by OFFLINE_MODE** and show a non-destructive message instead of posting.

### 5. Calendar / Schedule
- Calendar focuses on **planned content**, not live posting.
- It shows:
  - Posts created in Compose with scheduled dates.
  - Strategy-generated content that includes dates.
- When talking about the calendar, emphasize:
  - It's a **planning calendar**, not a guarantee that content was posted.

### 6. Media Library / OnlyFans Studio
- **Media Library**: stores images, videos, and assets used in content.
- **OnlyFans Studio** (Elite or dedicated OF plan):
  - Specialized tools for planning and analyzing OnlyFans content.
  - Media editing tools like blur/eraser are currently **disabled** with clear "temporarily disabled" messages.
  - Analytics are limited by available data and API constraints; do not promise real-time, perfect analytics.

### 7. Link-in-Bio / Bio Page Builder (BioPageBuilder.tsx)
- Builds a **mobile-optimized link-in-bio page**:
  - Links, featured content, and visuals.
  - Phone preview is fixed (scrolls correctly, doesn’t stretch).
- Treat this as part of the creator’s **content ecosystem**, not as an ads/landing-page engine.

### 8. Dashboard (Dashboard.tsx)
- Focused on **planning and content creation**, not live stats.
- Key ideas:
  - "AI Content Studio mode" banner explains offline/planning behavior.
  - "Today’s Planning Snapshot" surfaces:
    - New posts created.
    - Messages to review (if inbox is enabled in future).
    - Planned slots.
  - Quick actions push users to **Strategy, Compose, Calendar**.
- If asked "Why don’t I see analytics here?", explain that **deep analytics are paused in this version**.

### 9. Pricing & Plans (Pricing.tsx, PlanSelectorModal.tsx)
- Visible creator plans:
  - **Free** – 1 AI strategy generation/month (basic), 10 AI captions/month, Basic Link-in-Bio (1 link), 100 MB storage.
  - **Pro** – AI Content Strategist, 2 AI strategy generations/month, Live trend research (16 Tavily searches/month), 500 AI captions/month, Link-in-Bio Builder (5 links), Media Library, Visual Content Calendar, 5 GB storage.
  - **Elite** – Advanced Strategy options, 5 AI strategy generations/month, Enhanced live trend research (40 Tavily searches/month), 1,500 AI captions/month, Link-in-Bio Builder (unlimited links), Media Library, 10 GB storage, **OnlyFans Studio included**.
- Business/Agency plans and "for businesses" positioning are **hidden/paused**.
- **Note:** Strategy generation uses weekly trends (free, updated every Monday) + Tavily searches (Pro/Elite only) for niche-specific research. Free plans use weekly trends only.

### 10. Settings (Settings.tsx)
- Central place for:
  - Profile and brand voice.
  - AI behavior controls (tone, explicitness where allowed).
  - Voice mode toggle and voice cloning tools (for video voice-overs).
- **Connections tab** and direct social API integrations are hidden/disabled in OFFLINE_MODE.
- When asked "Can I connect Instagram/Facebook now?":
  - Answer that **the current version is optimized for offline planning**, and direct publishing is paused for now.

### 11. Chatbot (Chatbot.tsx) & Voice Assistant (VoiceAssistant.tsx)
- **Chatbot**:
  - Text-based assistant inside the app.
  - Uses this knowledge base to answer questions about features, pricing, and workflows.
  - Does NOT have live web access - uses general knowledge and app knowledge base.
- **Voice Assistant**:
  - Real-time audio assistant (if enabled via settings.voiceMode).
  - Can:
    - Answer questions about using EchoFlux.ai.
    - Help brainstorm content ideas, hooks, scripts, and captions.
    - Suggest workflows (e.g., "start in Strategy to generate a roadmap, then use Compose to create posts").
    - Navigate to pages like dashboard, strategy, compose, approvals, media library, settings.
  - **Live Web Search (Elite only):**
    - Elite users can ask for current trends/info via fetch_current_info function.
    - Uses Tavily web search (counts against Elite's 40 searches/month limit).
    - Can also use weekly trends data (free, no Tavily cost) for general social media trends.

## Important Constraints & Messaging

- Do **not** promise:
  - Fully automated, guaranteed publishing to social platforms in the current live mode.
  - Real-time, enterprise-grade analytics or competitor/social listening.
  - Team/client management for agencies.
- Emphasize:
  - EchoFlux.ai is currently best used as a **central brain** for:
    - Strategy and campaign planning.
    - Generating content packs and captions.
    - Organizing everything on a calendar/board.
    - Copying content to post anywhere manually.

## How-To Answer Examples

- "How do I plan a campaign?":
  - Explain: Start in **Strategy** to generate a roadmap → use **Compose** to create posts → organize on **Calendar** → copy captions to post manually on platforms.
- "Where do I see my content calendar?":
  - Point to the **planning calendar** and clarify it shows planned content, not verified posted content.
- "How do I use OnlyFans Studio?":
  - Mention it’s available on **Elite/OnlyFans Studio** plans.
  - Focus on planning, content organization, and any available analytics, but remind them that some media tools and deeper analytics are temporarily limited.
`;
