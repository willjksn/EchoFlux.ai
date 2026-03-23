# 1:1 paid video sessions — product flow & technical map

This document describes how **fans buy a scheduled 1:1 video call with a creator**, how **joining**, **notifications**, and the **countdown timer** are supposed to work, and how that maps to the EchoFlux codebase today.

---

## 1. Intended experience (end-to-end)

### 1.1 Purchase

1. The fan buys a **1:1 live video** product (e.g. 15 or 30 minutes) from the creator’s **store** or **treats** catalog, at a price the creator set.
2. Payment is processed (typically **Stripe Checkout** on the creator’s **Connect** account, with platform fee where applicable).
3. The system records the purchase and creates or reserves a **video session** tied to that fan, creator, product, and **purchased duration**.

### 1.2 Scheduling (creator)

1. The **creator** opens their **video sessions** tooling (Fan Hub — sessions / video chats area).
2. They **schedule** the call: date & time (and timezone clarity for both parties).
3. That **scheduled time** is stored on the session (e.g. `scheduledFor` as an ISO timestamp).
4. Until the call is “ready,” the session stays in an appropriate state (e.g. `pending` scheduling → `accepted` once a Daily room exists, depending on product rules).

### 1.3 Five minutes before the call

1. **Five minutes before** `scheduledFor`, the fan should receive:
   - An **in-app notification** (and optionally email/push later), and/or  
   - A **deep link** that opens the join experience.
2. A **video join entry point** becomes available:
   - e.g. a **floating or in-page “Join video call”** control, or the same UI opened from the **notification link**.
3. The **creator** should see a matching prompt so they can **start** or **enter** the room on time.

*Implementation note:* “5 minutes before” requires something to **fire at that time** — typically a **scheduled job** (cron) or **Cloud Scheduler** that processes due reminders (see §4).

### 1.4 Joining and starting the call

1. The **fan** taps **Join** (from the bell, purchases page, or link).
2. The **creator** starts or joins the **same** Daily room (creator tools already use `VideoCallRoom` + `/api/liveVideoChat` in places).
3. Both sides use a **Daily.co** room created for that session (private room, meeting tokens from the API).
4. The **video call starts** when both are in the room (exact “who starts first” can be policy: e.g. creator must join before fan video unlocks, or both can join in waiting state).

### 1.5 Countdown timer

1. While the call is **active**, the UI shows a **countdown** for the **purchased duration** (e.g. 15:00 → 0:00).
2. When time reaches **zero**, the session should **end** gracefully (toast, hang up, API `end`, Daily room teardown, usage tracking).

**Current implementation (`VideoCallRoom.tsx`):**

- After the session is marked **started** (`/api/liveVideoChat?action=start`), `sessionStartTime` is set.
- A **1-second interval** computes remaining time as:  
  `durationMinutes * 60 - elapsedSeconds` from `sessionStartTime`.
- At **0**, it shows a toast and calls **`end`** on the session.
- There is also a **1 minute remaining** toast.

So the timer is **“time left from when the call was marked started”**, for **`durationMinutes` from the session** — which should match the **length the fan paid for** if that value is set correctly when the session is created from the product.

---

## 2. Roles & surfaces

| Role | Primary surfaces |
|------|-------------------|
| **Fan** | Storefront `/{handle}` (member area), **Purchases**, **notification bell**, optional **email link** |
| **Creator** | Fan Hub **Video chats** / **Sessions** (`LiveVideoChatManager`, related tabs), **Messages** (instant call path exists separately) |
| **System** | `/api/liveVideoChat`, Daily API (`DAILY_API_KEY`), Firestore, optional **cron** for `scheduled_notifications` |

---

## 3. Data & API (summary)

### 3.1 Firestore (conceptual)

- **`creators/{creatorId}/liveVideoChats/{sessionId}`**  
  - `fanId`, `creatorId`, `productId`, `durationMinutes`, `amountPaidCents`, …  
  - `status`: e.g. `pending` → `accepted` → `active` → `completed`  
  - `scheduledFor` (ISO string) when the call is scheduled  
  - `roomUrl`, `roomName` after Daily room is created (on **accept** today)  
  - `startedAt`, `endedAt`, `minutesUsed`

### 3.2 Key API actions (`/api/liveVideoChat`)

| Action | Purpose |
|--------|---------|
| `POST ?action=request` | Fan (authenticated) creates a **pending** session; can include `scheduledFor`, `productId`, paid amount fields. |
| `POST ?action=accept` | Creator accepts; **creates Daily room**; notifies fan (`video_chat_accepted`). |
| `POST ?action=token` | Fan or creator gets a **meeting token** + `roomUrl` (session must be `accepted` or `active`). |
| `POST ?action=start` | Marks session **active**, sets `startedAt` (used for timer). |
| `POST ?action=end` | Completes session, deletes Daily room, tracks usage. |
| `POST ?action=instant` | Creator-only **instant** call (separate flow; not the “purchased + scheduled” flow). |

**Daily:** Requires **`DAILY_API_KEY`** on the server (e.g. Vercel). If missing, live video API returns **503**.

### 3.3 Notifications (`api/_fanNotifications.ts`)

- **`sendFanNotification`** — writes to `fan_notifications` / `users/{fanId}/notifications`.
- Types include **`video_chat_accepted`**, **`video_chat_starting`**, **`video_chat_reminder`**.
- **`scheduleReminder`** — writes to **`scheduled_notifications`** with `scheduledFor`.
- **`processScheduledReminders`** — finds due rows and sends notifications; intended to be run on a **schedule** (cron), not on every HTTP request.

---

## 4. “5 minutes before” — what must exist

For the fan to get a **link + join UI 5 minutes before** `scheduledFor`:

1. **When the creator saves the schedule**, the backend (or a Cloud Function) should call **`scheduleReminder`** with `scheduledFor = sessionTime - 5 minutes` (or equivalent), including **`data`** such as `creatorId`, `sessionId`, and a path for the deep link (e.g. `/{handle}/video?session=…`).
2. A **recurring job** must call **`processScheduledReminders`** (or equivalent) so those documents actually fire.
3. The **fan app** must **listen** for notifications and render **Join** + load **`VideoCallRoom`** (or iframe flow) with `sessionId` + `creatorId`.

**Today:** Reminder **infrastructure exists** in code; wiring **purchase → session → schedule 5 min reminder → cron → fan UI** is the integration work to verify end-to-end.

---

## 5. Purchase → session (gap to close)

For “fan buys first”:

1. **Stripe webhook** (or checkout success handler) should create or update a **`liveVideoChats`** document (or a **purchase** doc that the creator later “confirms” into a session) with `productId`, `durationMinutes`, `amountPaidCents`, `fanId`.
2. Creator **scheduling** UI then sets **`scheduledFor`** on that session (or creates the pending session if you split purchase vs schedule).

Until that link is explicit, the **`request`** action can still create sessions from an authenticated fan, but it may not automatically match **“just paid in Checkout.”**

---

## 6. Fan storefront vs main app

- **`VideoCallRoom`** and token API require the fan to be **signed in** (Firebase auth).
- The **public member storefront** (`FanStorefrontView`) today focuses on **feed, treats, DMs, tip** — it does **not** yet bundle the full “scheduled call + Join + VideoCallRoom” loop in one place.
- A **deep link** like `https://yoursite.com/{handle}?videoSession={sessionId}` (or app route under `/fan`) can open the same React tree with auth and mount **`VideoCallRoom`**.

---

## 7. Environment checklist

| Variable / setup | Purpose |
|------------------|---------|
| `DAILY_API_KEY` | Server-side Daily REST API (rooms + tokens). |
| Vercel **cron** or external scheduler | Call **`processScheduledReminders`** (or your wrapper) on an interval. |
| Stripe Connect + webhooks | Payouts and (when wired) **purchase → session**. |
| `NEXT_PUBLIC_APP_URL` / origin | Correct return URLs and deep links in notifications. |

---

## 8. Quick reference — your story in one paragraph

**Fan buys** a 1:1 video package → **Creator schedules** the call time → **5 minutes before**, the fan gets a **notification + link** and can open the **join window** → **Creator starts** (or both join) the **Daily** room → **Countdown** runs for the **purchased minutes** from **call start** until **auto end** and cleanup.

---

## 9. Related files

| Area | Files |
|------|--------|
| API | `api/liveVideoChat.ts`, `api/_dailyco.ts`, `api/_fanNotifications.ts` |
| Creator UI | `components/LiveVideoChatManager.tsx`, `components/FanHubMessages.tsx` (instant path) |
| Call UI | `components/VideoCallRoom.tsx` |
| Types | `types.ts` — `LiveVideoChatSession`, `scheduledFor` |

For **DM file video** vs **live Daily**, see also **`docs/LIVE_VIDEO_AND_STREAMS.md`**.
