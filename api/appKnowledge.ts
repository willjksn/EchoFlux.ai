export const APP_KNOWLEDGE = `
# EchoFlux.ai Knowledge Base

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
- From a good strategy, the user can:
  - Save it.
  - Send it into **Autopilot** as the base for a full campaign content pack.

### 2. Autopilot / AI Campaign Studio (Autopilot.tsx)
- Autopilot turns a goal/strategy into a **campaign content pack**:
  - Campaign summary + objectives.
  - Multiple posts with **captions, angles, hooks, and platform notes**.
  - Planned dates/slots (for planning only, not auto-posting).
- Status language is **about planning**, e.g. "AI is building your campaign content plan" and "Content pack ready!".
- Users can:
  - Review generated posts.
  - Copy individual captions or the **entire content pack** to clipboard for manual posting.

### 3. Approvals / Workflow Board (Approvals.tsx)
- A **Kanban-style workflow** for moving content from:
  - Draft → In Review → Ready to Post.
- Designed for creators to visually manage what’s **ready to post next**.
- Includes **"Copy all captions"** to export the visible posts as a content pack.
- Team/client features are hidden; it behaves like a **solo creator workflow board**.

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
  - Planned Autopilot posts.
  - Strategy-generated content that includes dates.
- When talking about the calendar, emphasize:
  - It’s a **planning calendar**, not a guarantee that content was posted.

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
  - Quick actions push users to **Strategy, Autopilot, Compose, Approvals**.
- If asked "Why don’t I see analytics here?", explain that **deep analytics are paused in this version**.

### 9. Pricing & Plans (Pricing.tsx, PlanSelectorModal.tsx)
- Visible creator plans:
  - **Free** – 1 active campaign, basic Strategy & Autopilot, limited AI captions, basic link-in-bio, small storage.
  - **Pro** – multiple active campaigns, full Strategy + Autopilot content packs, workflow board & calendar, more AI captions, media library, larger storage.
  - **Elite** – unlimited campaigns, advanced Strategy & Autopilot, workflow board & calendar, high AI caption limits, media library, more storage, **OnlyFans Studio included**.
- Business/Agency plans and "for businesses" positioning are **hidden/paused**.

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
- **Voice Assistant**:
  - Real-time audio assistant (if enabled via settings.voiceMode).
  - Can:
    - Answer questions about using EchoFlux.ai.
    - Help brainstorm content ideas, hooks, scripts, and captions.
    - Suggest workflows (e.g., "start in Strategy, then move into Autopilot").
    - Navigate to pages like dashboard, strategy, compose, approvals, media library, settings.

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
  - Explain: Start in **Strategy** to generate a roadmap → push into **Autopilot** for a content pack → refine in **Approvals**/**Compose** → copy captions into platforms.
- "Where do I see my content calendar?":
  - Point to the **planning calendar** and clarify it shows planned content, not verified posted content.
- "How do I use OnlyFans Studio?":
  - Mention it’s available on **Elite/OnlyFans Studio** plans.
  - Focus on planning, content organization, and any available analytics, but remind them that some media tools and deeper analytics are temporarily limited.
`;
