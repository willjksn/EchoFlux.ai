# Live video: what exists today vs paywalled “go live”

## What `videoEnabled` does **today** (My Page → Monetization)

- It only controls whether **fans can attach video files** in **direct messages** (member hub Messages tab).
- It does **not** control:
  - **Daily.co** 1:1 live video sessions
  - **Live broadcasts** (one creator, many viewers)
  - **Live chat** next to a stream

Rename in the UI: **“Video in DMs”** (or similar) so it isn’t confused with live video products.

---

## Paid 1:1 live video chat (fan ↔ creator)

**Intent:** Fan buys a time-boxed session; both join a private Daily room.

**Already in the codebase (backend + creator dashboard):**

- `api/liveVideoChat.ts` — sessions in `creators/{creatorId}/liveVideoChats`, Daily rooms, tokens.
- `components/LiveVideoChatManager.tsx` — creator accepts / starts calls (Fan Hub → Video chats / sessions area in `OnlyFansStudio`).
- Treat **product types** include `live_chat_*` and `live_video_*` durations (see `types.ts` / store).

**Gaps for your exact “fan buys and joins” flow:**

- Fan storefront (`FanStorefrontView`) does **not** yet expose a dedicated “join my purchased live session” surface tied to `liveVideoChat` (today flow is oriented around creator-initiated + API `request` actions).
- **Webhook / checkout → auto-create session** after a fan buys a `live_video_*` product may be incomplete vs subscriptions/tips—you’d verify `stripeWebhook` + product fulfillment for those types.

**Doable:** Yes. Wire: purchase success → create or unlock session → fan UI (bell or Treats/Orders) → `VideoCallRoom` with token from `liveVideoChat?action=token`.

**Full product spec (purchase → schedule → 5‑min reminder → join → countdown):** see **`docs/ONE_ON_ONE_VIDEO_SESSIONS.md`**.

---

## Paywalled (or free) **live room** + **viewer chat**

**Intent:**

- Creator **goes live** in a **room**.
- Access is **paid or free** (ticket or “free show”).
- **Many fans watch**; **chat** updates in realtime for the creator (and optionally fans see each other’s messages).

**This is a different product shape than 1:1 Daily calls:**

| Piece | Typical approach |
|-------|------------------|
| Video | **Daily Prebuilt** “broadcast” / live-stream style room, **Mux Live**, **LiveKit**, or **100ms** — one publisher, many subscribers. |
| Paywall | **Stripe Checkout** one-time or price; webhook writes `liveStreamAccess/{streamId}/fans/{fanId}` or time-boxed claim. |
| Chat | **Firestore** onSnapshot (rate-limited), **Daily chat**, or **Ably/Pusher** for scale. |
| Creator UI | Start/stop stream, see chat moderation (optional). |

**Doable:** Yes, but it is **net-new engineering** (not a small toggle): data model for “events”, access checks, fan player page, abuse/rate limits, and ops (Daily minutes / egress costs).

---

## Suggested phasing (when you’re ready to build)

1. **Clarify monetization** — Rename **Video** toggle; add separate flags later: `liveOneOnOneEnabled`, `liveStreamEnabled`.
2. **1:1 sold sessions** — Fulfill `live_video_*` / `live_chat_*` purchases → session doc → fan + creator entry via existing Daily pipeline.
3. **Live rooms** — New `liveStreams` collection, checkout for “ticket”, broadcast token for viewers, Firestore chat subcollection.

This doc is the source of truth for scope when you prioritize the next sprint.
