# Stormijxo → EchoFlux: detailed execution checklist

**Purpose:** Move management of the Stormij project into EchoFlux while keeping **`stormijxo.com`** as the public domain, **preserving active fan subscriptions** (no loss of access), and matching **look and feel** as closely as possible.

**Audience:** You (operator) + anyone doing DNS/Stripe/Firebase work.

**Critical principle:** *Do not change DNS or production routing until subscriber identity (Firebase UID + Stripe subscription linkage) and webhook delivery are verified on EchoFlux.*

---

## How subscriber access works in EchoFlux (read this first)

Fans keep access when **all** of these stay consistent:

| Layer | What must stay true |
|--------|----------------------|
| **Firebase Auth** | Each fan keeps the **same account** (same email/UID) they used to subscribe, OR you run a controlled account merge (high risk—avoid unless necessary). |
| **Stripe** | The **subscription** remains valid in Stripe; **metadata** on the subscription includes `creatorId` and `fanId` matching Firestore. Webhooks update `creatorSubscribers`, `creatorEntitlements`, `creators/{creatorId}/fans`. |
| **Firestore** | Documents keyed by `creatorId` + `fanId` must not be orphaned: `creatorSubscribers/{creatorId}/subscribers/{fanId}`, `creatorEntitlements/{creatorId}/grants/{fanId}`, `creators/{creatorId}/fans/{fanId}`. |

**If** Stormij today uses a **different Firebase project** than EchoFlux, migration is not “flip DNS only”—you must **migrate or relink** subscriber and Stripe-related data into EchoFlux’s project without breaking Stripe’s subscription IDs.

**If** production already runs on the **same** Firebase + Stripe Connect as EchoFlux, the risk is lower: focus on domain, routing, and UI parity.

---

## Phase 0 — Inventory (do before any change)

### Task 0.1 — Document current production stack

- [ ] **Where is `stormijxo.com` hosted?** (Vercel, Netlify, Cloudflare Pages, other)
- [ ] **Which Firebase project** does the live Stormij app use? (project ID)
- [ ] **Is EchoFlux production using the same Firebase project** as live Stormij? (yes / no)
- [ ] **Stripe mode:** live vs test; **Connect** account ID for the creator
- [ ] **Exact fan-facing URLs today:** e.g. `https://stormijxo.com/project`, `https://www.stormijxo.com/...`
- [ ] **Checkout success/cancel URLs** configured in Stripe Dashboard or in code (note exact domains)

**Deliverable:** One page (Notion/doc) with URLs, project IDs, and “source of truth” for fans.

### Task 0.2 — Identify the EchoFlux `creatorId`

- [ ] In EchoFlux, the creator’s account UID = **`creators/{creatorId}`** document id.
- [ ] Confirm `creatorHandles/{handle}` exists for the public handle (e.g. `stormijxo`) and points to that `creatorId`.
- [ ] If handle is wrong or missing, plan a **handle update** via `api/updateCreatorStorefront` / My Page (avoid duplicate handles).

### Task 0.3 — Subscriber spot-check (non-destructive)

- [ ] In **Stripe Dashboard** → Subscriptions: filter by creator/metadata; export or note count of active subs.
- [ ] In **Firestore** (EchoFlux project): sample `creatorSubscribers/{creatorId}/subscribers/{fanId}` for a few known fans—confirm `stripeSubscriptionId`, `status`.
- [ ] Pick **one test fan** (you or internal) with a subscription: note UID, email, subscription id.

**Stop here if** you cannot verify where subscription data lives relative to EchoFlux.

---

## Phase 1 — Visual / UX parity (EchoFlux-managed, no DNS change yet)

Goal: **Same look and feel** when the page is served from EchoFlux (`echoflux.ai/{handle}` or preview), before pointing `stormijxo.com`.

### Task 1.1 — My Page Builder audit

- [ ] Open **Fan Hub → My Page** for the Stormij creator in EchoFlux.
- [ ] Match **theme** (primary, background, text, fonts) to live Stormijxo—use saved hex from current site or from migrated `site_config` (see `scripts/migrate-stormij.ts` site config mapping).
- [ ] Match **hero** images/video, taglines, sections order, toggles (feed, treats, tip, messages, about).
- [ ] Match **social links** (URLs + visibility).
- [ ] Match **legal** text if custom (`legal.termsText` / `legal.privacyText`).
- [ ] Compare **member** view (tabs, header logo/avatar) to Stormij—adjust `heroLayout`, `textStyles`, assets.

### Task 1.2 — CSS / branding parity

- [ ] If Stormij used custom classes (e.g. `.stormij-theme` in `styles/stormij-fanhub.css`), confirm Fan Storefront still applies the same wrapper/classes where needed (`FanStorefrontView`, `FanLandingPage`).
- [ ] Take **screenshots** of live Stormij vs EchoFlux staging URL for: landing, pricing/tip block, member home—pixel parity is ideal; document intentional differences.

### Task 1.3 — Content parity

- [ ] Posts/feed: migrated or recreated; media URLs still valid (CDN/storage).
- [ ] Products/treats: prices, visibility, copy aligned.
- [ ] **Messages:** If you migrated Stormij conversations, run **`scripts/sync-conversations-to-fanDmThreads.ts`** (after migration) so Fan Hub Messages matches expectations—see `docs/ECHOFLUX_STORMIJ_PARITY_ACTION_PLAN.md`.

**Exit criteria:** Stakeholder sign-off that EchoFlux-hosted page is acceptable as the new Stormijxo experience.

---

## Phase 2 — Data migration (only if Stormij ≠ EchoFlux Firebase)

Skip or shorten this phase if live Stormij **already** uses EchoFlux’s Firebase and Stripe wiring.

### Task 2.1 — Prepare credentials (secure)

- [ ] Stormij Firebase **read-only** service account (JSON stored securely, not committed).
- [ ] EchoFlux Firebase **write** service account for migration.
- [ ] Set `ECHOFLUX_CREATOR_ID` to the **real** EchoFlux creator UID.
- [ ] Review `scripts/migrate-stormij.ts` collections: `posts`, `treats`, `members`, `purchases`, `conversations`, `site_config` (adjust flags if needed).

### Task 2.2 — Dry run

- [ ] Run:  
  `npx ts-node scripts/migrate-stormij.ts --dry-run --creator-id=<ECHOFLUX_CREATOR_ID>`
- [ ] Review logs: counts, errors, skipped rows.

### Task 2.3 — Ordered migration (example)

- [ ] Migrate **site_config** → storefront fields on `creators/{creatorId}` (merge).
- [ ] Migrate **posts** / fan content as per script.
- [ ] Migrate **treats/products** per script mapping.
- [ ] **Members/subscribers:**  
  - **Highest risk:** Stripe subscriptions were created under metadata pointing to old `creatorId`/project.  
  - You may need **engineering review** to ensure each fan’s `fanId` in EchoFlux matches the Stripe subscription’s `metadata.fanId`, or run a **Stripe metadata update** (batch) with extreme care—**do not** bulk-change without a spreadsheet + Stripe test mode rehearsal.

### Task 2.4 — Post-migration scripts

- [ ] Run `sync-conversations-to-fanDmThreads` if messages should appear in Fan Hub (see parity doc).
- [ ] Re-verify **getFanEntitlement** / storefront for a migrated fan account.

**Exit criteria:** Test fan can log into EchoFlux-facing experience and sees correct subscription state.

---

## Phase 3 — Stripe & webhooks (subscriber safety)

### Task 3.1 — Webhook endpoint

- [ ] Confirm production webhook URL (e.g. `https://echoflux.ai/api/stripeWebhook` or your deployed domain) is the one registered in **Stripe Dashboard** for Connect events.
- [ ] Secrets in Vercel: `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET` (if used) match the dashboard endpoints.
- [ ] Required events include at minimum: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, refunds/charges as you use—see `docs/ECHOFLUX_STORMIJ_PARITY_ACTION_PLAN.md`.

### Task 3.2 — Checkout session metadata

- [ ] Fan checkout created via EchoFlux must set **`metadata.creatorId`** and **`metadata.fanId`** on the subscription (already expected by `api/stripeWebhook.ts`).  
- [ ] After any migration, **spot-check** a new test subscription in Stripe → metadata.

### Task 3.3 — Fan cancel path

- [ ] Confirm **Cancel membership** on storefront calls `POST /api/fanCancelCreatorSubscription` with `{ creatorId }` and shows period end.
- [ ] When period ends, webhook sets canceled state—fan loses access as designed.

---

## Phase 4 — Domain: keep `stormijxo.com` (routing)

**Goal:** Visitors use `stormijxo.com` but the app is the EchoFlux deployment.

### Task 4.1 — Add domain to hosting (e.g. Vercel)

- [ ] Add **apex** `stormijxo.com` and **`www.stormijxo.com`** to the **same** Vercel project that serves EchoFlux.
- [ ] Obtain DNS instructions (A/ALIAS/CNAME) from Vercel.

### Task 4.2 — Firebase Auth authorized domains

- [ ] Firebase Console → Authentication → Settings → **Authorized domains**: add `stormijxo.com` and `www.stormijxo.com`.
- [ ] Without this, login/signup on the custom domain can fail (`auth/unauthorized-domain`).

### Task 4.3 — App routing for custom domain (implementation task when you approve code changes)

Today, storefront routing is handle-based (`/{handle}`). For **`stormijxo.com` only**, you typically want:

- [ ] **Root** `/` → Stormij creator storefront **without** requiring `/stormijxo` in the path.
- [ ] **`/terms`** and **`/privacy`** on the custom domain → same legal pages as `/{handle}/terms` on echoflux.ai.
- [ ] **Legacy path** `/project` (if fans bookmarked it): **301 redirect** to `/` or to the canonical storefront path—**must not** break Stripe return URLs (verify Stripe success/cancel URLs).

This requires **Firestore `creatorDomains` mapping** (or equivalent) + small changes to `App.tsx` and `FanStorefrontView`—track as a separate implementation ticket.

### Task 4.4 — Stripe return URLs after domain change

- [ ] List every place that builds checkout `success_url` / `cancel_url` (e.g. `createFanCheckoutSession`).
- [ ] Decide canonical domain for redirects: **`https://stormijxo.com/...`** vs echoflux.ai.
- [ ] Update Stripe Checkout creation so new checkouts return fans to **stormijxo.com** if that’s the public URL (avoid mixed-domain confusion).

### Task 4.5 — SEO / bookmarks

- [ ] If URL shape changes (`/project` → `/`), add **redirects** in `vercel.json` or hosting config.
- [ ] Optional: `canonical` link to preferred URL.

---

## Phase 5 — Cutover strategy (minimize fan impact)

### Option A — Recommended: soft launch before DNS

- [ ] Deploy EchoFlux + domain mapping code to production.
- [ ] Test storefront on `echoflux.ai/{handle}` with real creator data.
- [ ] Add **staging** custom domain (e.g. `preview.stormijxo.com`) first if possible—full E2E test.
- [ ] Only then point **production** DNS for `stormijxo.com` to Vercel.

### Option B — DNS cutover with fast rollback

- [ ] Lower DNS TTL **24–48 hours** before change (if your DNS provider allows).
- [ ] Change DNS to Vercel.
- [ ] Monitor errors (Vercel logs, Sentry, Stripe webhook dashboard) for 2–4 hours peak traffic.
- [ ] **Rollback:** revert DNS to previous host (old IPs/CNAME); fans return to old site until fixed.

---

## Phase 6 — Verification matrix (run after cutover)

### Auth

- [ ] New fan: sign up on `stormijxo.com`, complete checkout, sees member area.
- [ ] Existing fan: log in on `stormijxo.com`, **still subscribed**, feed/treats/messages as expected.

### Payments

- [ ] New subscription purchase succeeds; webhook fires; Firestore subscriber doc exists.
- [ ] Cancel at period end; access until period end; after deletion event, access revoked.

### Deep links

- [ ] Old bookmark `stormijxo.com/project` redirects correctly.
- [ ] `stormijxo.com/terms` and `/privacy` load.

### Parity

- [ ] Side-by-side screenshots: critical sections match approved design.

---

## Phase 7 — Rollback & incident response

- [ ] **DNS rollback** documented (previous A/CNAME values saved).
- [ ] **Feature flag** (if implemented): disable custom-domain storefront resolver → EchoFlux default behavior.
- [ ] **Stripe:** webhook endpoint unchanged or reverted in Dashboard if you switch deployment URL.
- [ ] **Communication:** template message to fans only if outage or login issue (rare if checklist followed).

---

## Risk register (what makes people “lose access”)

| Risk | Mitigation |
|------|------------|
| Wrong Firebase project / fan UID mismatch | Verify UIDs and subscriber docs before DNS; test real fan account. |
| Stripe metadata `creatorId`/`fanId` wrong after migration | Do not bulk-edit Stripe without a script review; test one subscription. |
| Webhooks not delivered to production | Stripe Dashboard → webhook logs; fix secrets/URL. |
| Custom domain not in Firebase authorized domains | Add domain before go-live. |
| Checkout success URL points to old domain | Update session URLs to stormijxo.com. |

---

## Related docs / scripts in this repo

- `scripts/migrate-stormij.ts` — Stormij → EchoFlux Firestore (read-only on Stormij).
- `scripts/sync-conversations-to-fanDmThreads.ts` — Messages parity after migration.
- `docs/ECHOFLUX_STORMIJ_PARITY_ACTION_PLAN.md` — Messages + Stripe cancel + webhooks.
- `docs/CREATORS_SCHEMA.md` — Creator / handle / storefront fields.
- `api/getCreatorByHandle.ts` — Storefront resolution by handle.
- `api/updateCreatorStorefront.ts` — Handle + storefront updates.

---

## Sign-off block (fill before DNS cutover)

| Item | Owner | Date | OK |
|------|--------|------|-----|
| EchoFlux visual parity approved | | | ☐ |
| Test fan subscription works end-to-end | | | ☐ |
| Stripe webhooks verified (live) | | | ☐ |
| Firebase authorized domains updated | | | ☐ |
| DNS / redirect plan documented | | | ☐ |
| Rollback steps tested or written | | | ☐ |

---

*This checklist is operational guidance, not legal advice. For contract/compliance questions (billing, refunds), consult your counsel.*
