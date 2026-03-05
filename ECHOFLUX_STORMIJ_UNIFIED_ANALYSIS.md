# EchoFlux + Stormij: Unified Creator App with Fan Sites

## Current State

### EchoFlux (echoflux.ai / engagesuite.ai)
- **Role:** Creator tool for planning and content creation.
- **Users:** Creators (pay EchoFlux subscription: Free / Pro / Elite).
- **Features:** Dashboard, compose, captions, OnlyFans Studio, plan-my-week, strategy, media library, **bio link page**.
- **Bio link page:** Public URL = `echoflux.ai/{username}` (or `/u/{username}`, `/link/{username}`). Shows creator’s links, teasers, optional email capture. **No fan payments.**
- **Payments:** Only creator → EchoFlux (Stripe subscription). EchoFlux does not process fan money.

### Stormij (stormijxo.com)
- **Role:** Fan-facing subscription site (OnlyFans + Instagram style).
- **Users:** One creator (admin) + many fans (members).
- **Features:** Landing page, fan signup, **Stripe subscription**, member feed, treats store, tips, post unlocks, DMs, voice notes, paid chat time.
- **Payments:** All fan money (subscriptions, tips, treats, unlocks) goes to **one Stripe account** (env: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_MONTHLY`). Single-tenant: one Firestore “site,” no creatorId/siteId.
- **URL:** Single domain (stormijxo.com). No per-creator paths.

---

## Goal

- **EchoFlux** = the one app creators subscribe to (EchoFlux keeps earning from creator subscriptions).
- **Creator’s fan site** = replace “bio link page” with a full Stormij-style experience at **echoflux.ai/{creatorHandle}** (or a subdomain like **creatorHandle.echoflux.ai**).
- Fans go to that URL → landing → subscribe → feed, store, chat, unlocks.
- **Critical:** Fan payments (sub, tips, treats, unlocks) must go **to the creator**, not to EchoFlux.

So: one product (EchoFlux), two revenue streams — creator subscriptions (EchoFlux) and fan payments (creator).

---

## Is It Possible?

**Yes.** The main work is:

1. **Multi-tenant fan experience** inside EchoFlux (one codebase, data scoped by creator).
2. **Payment routing** so fan checkout uses the **creator’s** Stripe, not EchoFlux’s.

---

## Payment: How Creators Get Fan Money

EchoFlux already gets paid by creators. Fan payments should go to creators. Two main approaches:

### Option A: Stripe Connect (recommended)

- EchoFlux is the **platform**; each creator **connects** their own Stripe account (Stripe Connect Express or Standard).
- When a fan pays on **echoflux.ai/stormijxo** (or echoflux.ai/creatorHandle):
  - Checkout is created on the **creator’s connected account** (e.g. `stripe_account: acct_xxx` or Connect Session).
  - Money goes to the **creator’s** Stripe balance; Stripe pays out to the creator’s bank.
- **EchoFlux can:**
  - Take **0%** of fan revenue (only charge creator subscription), or
  - Take a small **platform fee** (e.g. 5–10%) via `application_fee_amount` so EchoFlux earns from fan payments too.
- **Pros:** Standard, compliant, Stripe handles payouts and tax (1099-K). One webhook endpoint; route by `account` or metadata.
- **Cons:** Creator onboarding (Connect onboarding flow), and Stripe platform agreement.

### Option B: Creator-owned Stripe keys

- Each creator stores their **own** Stripe secret key in EchoFlux (encrypted, e.g. in Firestore or Vault).
- Checkout on echoflux.ai/creatorHandle uses that creator’s Stripe to create the session → 100% to creator.
- **Pros:** No Connect; creator keeps full control of their Stripe.
- **Cons:** EchoFlux must store and use creator secrets securely; webhooks must be routed per creator (one endpoint that dispatches by metadata, or more complex setup). Higher security and ops burden.

**Recommendation:** Use **Stripe Connect** so EchoFlux never holds creator payout credentials and payouts stay between Stripe and the creator.

---

## High-Level Architecture

### 1. URL and routing

- **Creator’s fan site:** `echoflux.ai/{creatorHandle}` (or subdomain `{creatorHandle}.echoflux.ai`).
- Same pattern as today’s bio page: first path segment = creator handle. If it’s a known app route (e.g. `/dashboard`), use app; otherwise treat as creator handle and show **fan site** (landing → subscribe → feed/store/chat).

### 2. Data model (multi-tenant)

- **Existing:** EchoFlux already has users (creators) and bio page per `username`.
- **Add:** Fan-site data scoped by creator (e.g. `creatorId` or `creatorHandle`):
  - `posts` (feed)
  - `members` (fans with active subscription)
  - `treats`, `purchases`, `tips`, `postUnlocks`, `mediaUnlocks`
  - DMs, conversations, paid chat sessions
- Either:
  - **Single Firestore project:** All collections include `creatorId` (or `siteId`), and security rules + APIs filter by it, or
  - **Separate project per creator** (heavier; usually not worth it).

Stormij today is single-tenant (no creatorId). Migrating its logic into EchoFlux means adding `creatorId` (or equivalent) everywhere and resolving it from the URL (creatorHandle → creatorId).

### 3. Fan flows (reuse Stormij logic)

- **Landing:** echoflux.ai/creatorHandle → landing page (like Stormij’s landing), with “Subscribe” CTA.
- **Subscribe:** Button → API that creates Stripe Checkout Session for **that creator’s Connect account** (subscription price can be per-creator or a shared product with metadata).
- **After login:** Redirect to echoflux.ai/creatorHandle/feed (or /home), member-only.
- **Feed, store, tips, unlocks, DMs:** Same concepts as Stormij, but every read/write and every Stripe call is scoped to the creator (and optionally to the fan’s membership).

### 4. Creator onboarding (EchoFlux)

- In EchoFlux dashboard: “Enable fan site” or “Set up your page.”
- Step 1: Pick handle (e.g. stormijxo) → echoflux.ai/stormijxo.
- Step 2: **Connect Stripe** (Stripe Connect onboarding). After completion, EchoFlux stores the connected account id for that creator.
- Step 3: Configure subscription price, landing copy, etc. (reuse/adapt Stormij’s admin content and settings).

### 5. Content creation (unchanged)

- Creator uses **EchoFlux** (compose, captions, OnlyFans Studio, calendar, etc.) to create content.
- New: “Publish to my fan site” or “Post to echoflux.ai/stormijxo” — i.e. write to the **fan-site** `posts` (and related) collections for that creator, instead of (or in addition to) external platforms.

So: EchoFlux remains the place where the creator creates; the fan site is just another destination, owned and monetized by the creator.

---

## How Hard?

| Piece | Effort | Notes |
|-------|--------|--------|
| **URL routing** | Low | Reuse bio-page pattern: `/:handle` = fan site when not a known app route. |
| **Multi-tenant data** | Medium–High | Add creatorId everywhere (posts, members, treats, tips, unlocks, DMs). Migrate Stormij’s Firestore shape and security rules. |
| **Stripe Connect** | Medium | Onboarding flow, store `stripeAccountId` per creator, create Checkout Sessions (and other Stripe calls) on the connected account. Webhook routing by account/metadata. |
| **Fan UI** | Medium | Reuse Stormij’s landing, feed, store, profile, DMs, etc., but inside EchoFlux’s app and styled/routed as echoflux.ai/:handle. |
| **Auth** | Medium | Fans sign up / log in in context of a creator (e.g. “Join stormijxo”); membership and access checks scoped to that creator. |
| **Migration** | Optional | Existing Stormij (stormijxo.com) can stay as-is; new creators get fan sites on EchoFlux. Or you migrate Stormij’s single-tenant data into EchoFlux as “creator stormijxo” and later retire stormijxo.com. |

Overall: **feasible and well-defined**, but non-trivial (multi-tenant + payments). Rough order of magnitude: **2–4 months** for a small team, depending on how much of Stormij you reuse and whether you migrate the existing Stormij site.

---

## Summary

- **EchoFlux** = creator app (subscription from creator → EchoFlux). **Stormij** = fan site (subscription + tips + store + unlocks → today one Stripe account).
- **Unified product:** EchoFlux is the main app; creator’s fan site lives at **echoflux.ai/{creatorHandle}**, replacing the current bio link with a full Stormij-like experience.
- **Payments:** Use **Stripe Connect** so fan payments go to the **creator’s** connected Stripe account (and optionally a small platform fee to EchoFlux). EchoFlux does not need to “hold” fan money; Stripe pays out to the creator.
- **Content:** Creators keep using EchoFlux to create; they “post to my fan site” so content appears on echoflux.ai/theirHandle. No change to the fact that EchoFlux is for production; Stormij-style site is just the destination and monetization layer.

If you want to go deeper next, the most impactful steps are: (1) design the multi-tenant Firestore schema and (2) implement Stripe Connect onboarding and checkout for one creator flow (e.g. subscription only), then expand to tips, treats, and unlocks.
