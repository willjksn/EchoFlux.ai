# Echoflux: Stripe and messages — full behavior

This document defines the full behavior the Echoflux agent must follow for **Stripe Connect / fan monetization** and **fan–creator messages (DMs, blocking, reporting)**. Treat it as the source of truth for implementation and consistency.

---

## Part 1 – Stripe Connect and fan monetization

### Overview

- **Express accounts**: Creators onboard via Stripe Express; `stripeConnectAccountId` is stored on `creators/{creatorId}`.
- **Fan payments**: Subscriptions and one-time products use Stripe Checkout; payments go to the creator’s Connect account. Webhooks keep Firestore in sync.

### Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY_LIVE` / `STRIPE_SECRET_KEY_Test` | Yes | Platform secret key; same key used for Connect API. |
| `STRIPE_WEBHOOK_SECRET` | Yes | Signing secret for platform webhooks. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Optional | Signing secret for Connect webhook (if separate endpoint in Dashboard). |
| `STRIPE_USE_TEST_MODE` | Optional | `true` = test keys/mode. |
| `NEXT_PUBLIC_APP_URL` | Optional | Origin for success/cancel and Connect return/refresh URLs (e.g. `https://echoflux.ai`). |

### API routes (behavior)

| Route | Method | Behavior |
|-------|--------|----------|
| **api/stripeConnectOnboard** | POST | Create or reuse Express account; create account link; persist `stripeConnectAccountId` on `creators/{creatorId}`. Return `{ url, accountId }`. |
| **api/stripeConnectStatus** | GET | Return `stripeConnectAccountId`, `chargesEnabled`, `payoutsEnabled`, `detailsSubmitted` for the authenticated creator. |
| **api/createFanCheckoutSession** | POST | Body: `creatorId`, `type: 'subscription' \| 'product' \| 'tip' \| 'post_unlock' \| 'live_stream_ticket'`, `productId?` (product), `postId?` (post unlock), `streamId?` (live stream ticket), `amountCents?` (tip), `subscriptionPriceCents?`, `successUrl?`, `cancelUrl?`, etc. Create Stripe Checkout Session; payments go to creator’s Connect account. Return `{ url, sessionId }`. **Must return 400** if creator has not connected Stripe or `charges_enabled` is false; **must return 403** if fan is blocked. |
| **api/stripeWebhook** | POST | Raw body required for signature verification. Verify with `STRIPE_WEBHOOK_SECRET` first, then `STRIPE_CONNECT_WEBHOOK_SECRET` if set. When `event.account` is present, run Connect logic only (no double-processing). |

### Connect webhook events (required behavior)

| Event | Action |
|-------|--------|
| **checkout.session.completed** (Connect) | If `metadata.type === 'subscription'`: create/update `creatorSubscribers/{creatorId}/subscribers/{fanId}`; set `creatorEntitlements/{creatorId}/grants/{fanId}.subscription = true`. If `metadata.type === 'product'`: create `orders` doc; add `productId` to grant’s `unlockedProductIds`; update `creatorStats/{creatorId}` (totalRevenueCents, totalOrders). If `metadata.type === 'post_unlock'`: order + append `postId` to `unlockedFanPostIds`. If `metadata.type === 'live_stream_ticket'`: order + append `streamId` to `unlockedLiveStreamIds`. Tips and other types: see `api/stripeWebhook` (`processFanHubCheckoutSessionCompleted`). |
| **customer.subscription.updated** (Connect) | Update `creatorSubscribers` and `creatorEntitlements` from `subscription.metadata.creatorId` / `fanId`. |
| **customer.subscription.deleted** (Connect) | Set subscriber status to canceled; grant `subscription = false`. **Ignore** the event when `subscription.id` does not match the stored `stripeSubscriptionId` (failed first checkout + successful retry). |
| **customer.subscription.updated** (Connect, non-active) | Same stale-sub guard as deleted when revoking access. |
| **POST reconcileFanCreatorSubscription** | Fan auth: if Stripe has active/trialing/past_due membership but Firestore is stale, repair subscriber + grant + fan row (used on login before auto-checkout). |
| **charge.refunded** (Connect) | Find order by `stripePaymentIntentId`; set order `status = 'refunded'`; remove `productId` from grant’s `unlockedProductIds`; decrement `creatorStats` revenue and order count. |

### Firestore (Stripe-related)

- **creators**: `stripeConnectAccountId` (set by onboarding).
- **creatorSubscribers**, **creatorEntitlements**: Updated by Connect webhooks (subscription lifecycle, product unlocks).
- **orders**: One doc per product payment; `stripePaymentIntentId` used for refund lookup.
- **creatorStats**: `totalRevenueCents`, `totalOrders`; updated on product payment and refund.

See `docs/STRIPE_CONNECT.md` and `docs/CREATORS_SCHEMA.md` for full schema and test plans.

---

## Part 2 – Fan–creator messages and safety

### Overview

Fan–creator DMs, report message, block fan, and bans are **server-only**: all reads/writes use Firebase Admin SDK in API routes. No client Firestore rules are required for these collections; default deny is correct.

### Collections

| Collection | Purpose |
|------------|---------|
| **fanDmThreads** | One doc per creator–fan pair. Fields: `creatorId`, `fanId`, `lastMessageAt`, `lastMessagePreview`, `createdAt`, `updatedAt`. Doc ID = `[creatorId, fanId].sort().join('_')`. |
| **fanDmThreads/{threadId}/messages** | Messages. Fields: `senderId`, `content`, `createdAt`, optional `read` (recipient opened thread), `reported`, `reportId`. |
| **creatorBlocks/{creatorId}/blocked/{fanId}** | Block list; doc exists = fan is banned (cannot message or purchase). |
| **reports** | Admin queue. Fields: `creatorId`, `fanId`, `threadId`, `messageId`, `reporterId`, `reason`, `status` (pending \| reviewed \| dismissed), `createdAt`, `reviewedAt`, `reviewedBy`. |

### Required behavior

- **Blocked fans**: Must not be able to send DMs or complete checkout. APIs (e.g. fanDmSend, createFanCheckoutSession) must check `creatorBlocks/{creatorId}/blocked/{fanId}` and return **403** when blocked.
- **fanDmSend**: Enforce ban (blocked → 403). Rate limit: 30/min per user (Upstash).
- **reportMessage**: 10/hour per user; create report doc and set message `reported` / `reportId`.
- **blockFan**: Creator-only; add/remove doc under `creatorBlocks/{creatorId}/blocked/{fanId}`.
- **Indexes**: `fanDmThreads` — (creatorId ASC, lastMessageAt DESC), (fanId ASC, lastMessageAt DESC). Subcollection messages: `createdAt` for ordering.

See `docs/FAN_DM_SAFETY.md` for security rule recommendations and admin reports handling.

---

## Summary for the agent

- **Stripe**: Follow Part 1 for onboarding, checkout, webhooks, Firestore updates, and edge cases (no Connect → 400; blocked fan → 403).
- **Messages**: Follow Part 2 for threads, blocking, reporting, and enforcement of blocks across DMs and purchases.
- When changing code, preserve this behavior and refer to `docs/STRIPE_CONNECT.md` and `docs/FAN_DM_SAFETY.md` for detailed schema and tests.
