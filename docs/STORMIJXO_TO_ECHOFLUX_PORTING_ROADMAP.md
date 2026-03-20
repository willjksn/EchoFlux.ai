# Stormijxo → EchoFlux: full porting roadmap (Fan Hub parity)

**Context:** Stormijxo is a **Next.js** app (`app/(member)/…`, `lib/…`). EchoFlux is a **Vite + React** app (`components/Fan*…`, `api/*.ts`). You **do not merge repos**; you **port behavior** into EchoFlux.

**Stormij reference:** remote `stormij`, branch `stormij/main` (after `git fetch stormij`).

**Suggested working branch:** `feature/stormij-updates` (or similar).

---

## How to use this list

1. Work **top to bottom** — later items often depend on earlier ones.
2. For each row: open the **Stormij file(s)** (`git show stormij/main:path`) and implement the same rules/UX in the **EchoFlux target(s)**.
3. Check off **Verify** when you’ve tested on a real fan account + creator.

---

## Phase A — Identity, names & rules (do first)

| # | Topic | Stormij source (reference) | EchoFlux target (implement / verify) | Verify |
|---|--------|----------------------------|----------------------------------------|--------|
| A1 | **Member usernames** (unique handle, validation) | `lib/username.ts` | **Done (EchoFlux):** `src/lib/memberUsername.ts`, `api/claimMemberUsername.ts`, `usernames/{lowercase}` + `users/{uid}.username`, denorm on `creators/.../fans/{fanId}`; gate: `MemberUsernameGateModal` + `FanStorefrontView` + `getFanEntitlement` (`memberUsernameRequired`); Stripe: `stripeWebhook.ts` merges username into fan doc | Fan can set username; duplicate blocked; format errors clear |
| A2 | **Firestore security rules** for usernames + fan writes | `firestore.rules` (Stormij) | **Done (EchoFlux):** `usernames` public read / no client write; restricted `users.*username*`; **`creators/{id}`** subcollections: `fanPosts` / `posts` (creator CRUD; authed read published), `fans` (creator + self fan read), `fanUsers`, `treatGrants`, `liveVideoChats`. See `docs/FIRESTORE_RULES_AND_INDEXES.md` | Deploy rules; spot-check feed + composer + Fan Hub users tools |
| A3 | **Fan display labels** (no raw email as name in UI) | `lib/fan-hub-display.ts` | **Done:** `src/lib/fanHubDisplay.ts` (+ server mirror `api/_fanHubDisplay.ts`); `api/fanDmThreads.ts` (creator thread list); `FanHubUsers` / `FanHubAnalytics` / `FanHubPurchases`; `OnlyFansSextingSession` fan picker loads `users/{uid}.username` | Primary: @handle or name; email only as secondary where needed |
| A4 | **Auth / post-login flows** (username prompt if missing) | `app/components/AuthModal.tsx`, `app/components/RequireAuth.tsx` | **Storefront:** `FanStorefrontView` + `MemberUsernameGateModal` when required. **Creators:** page handle in Fan Hub / My Page. No main-app banner | Member @username on creator member pages only |

---

## Phase B — Locked content & feed presentation

| # | Topic | Stormij source | EchoFlux target | Verify |
|---|--------|----------------|-----------------|--------|
| B1 | **Locked post preview image** (`previewMediaIndex`) | `lib/locked-post-media.ts`, usage in `app/(member)/home/page.tsx`, `grid/page.tsx`, `post/[id]/page.tsx` | **Done:** `src/lib/lockedPostMedia.ts`; `FanMemberFeed` / `FanMemberSaved` (blur + lock overlay); `FanHubPosts` saves `previewMediaIndex`; feed reads `creators/.../fanPosts` then `posts` | Multi-image locked post shows **one** public image + blur/lock on rest |
| B2 | **Post / locked content model** | `lib/posts.ts` (Stormij) | **Done:** `types.ts` — `FanHubPostLockedContent` / `CreatorFanHubPostFirestore`; `FanHubFeed` uses `LockedPostContent`; `hideLikeCounts` on `FeedPost`; `api/addCommentToPost` resolves `creators/.../fanPosts` first and syncs comments to all existing mirrors | Locked shape consistent; fan comments work on `fanPosts` |
| B3 | **Admin post editor** (locked + preview) | `app/admin/(authenticated)/posts/page.tsx` | **Done:** Premium **Send to Fan Hub** → `creators/{uid}/fanPosts` (`premiumStudioSendTo.sendToDrop`, `SendToPanel` preview index + `lockedContent`). **Fan Hub feed** merges `users/.../posts` + `creators/.../fanPosts` in `FanHubFeed`; delete / publish toggle / pin sync all mirror paths where docs exist | Same fields as Stormij for parity |

---

## Phase C — DMs & messaging UX

| # | Topic | Stormij source | EchoFlux target | Verify |
|---|--------|----------------|-----------------|--------|
| C1 | **DM thread behavior** | `lib/dms.ts` | **EchoFlux:** `api/fanDmMessages.ts` orders by `createdAt` **asc**; responses normalize `createdAt` to ISO. Read receipts still optional / future | Send/receive; no regressions |
| C2 | **Mobile composer** (autosize textarea, scroll) | `lib/use-autosize-textarea.ts`, `app/(member)/dms/page.tsx`, `app/admin/(authenticated)/dms/page.tsx` | **Done:** `src/hooks/useAutosizeTextarea.ts`; **creator** `FanHubMessages` + **fan** `FanStorefrontView` — textarea, Enter send / Shift+Enter newline, scroll-to-latest, short timestamps (`formatDmShortTime`) | Long messages usable on phone |
| C3 | **Studio fan selectors** (labels) | `app/features/premium-studio/components/FanDropdown.tsx`, `FanSelector.tsx`, `SextingSessionPanel.tsx` | **Done:** `FanSelector` enriches from `users/{fanId}` + `formatFanDisplayLabel` (same rules as A3) | Same labeling as A3 |

---

## Phase D — Checkout & money paths

| # | Topic | Stormij source | EchoFlux target | Verify |
|---|--------|----------------|-----------------|--------|
| D1 | **Treat checkout** (legacy URLs / forwards) | `api/treat-checkout.js` | **EchoFlux:** fan purchases flow through **`api/createFanCheckoutSession`** (`product` mode) + **`api/stripeWebhook.ts`**. Add **Vercel rewrites** only if you must preserve legacy Stormij path names | Purchase completes; webhooks update entitlements |
| D2 | **Tip / unlock checkout** | `api/tip-checkout.js`, `api/unlock-checkout.js`, `app/api/unlock-checkout/route.ts` | **EchoFlux:** **`createFanCheckoutSession`** supports tip / product paths; verify storefront **`FanStorefrontView`** call sites match API contract | Same as today + parity with Stormij edge cases |
| D3 | **Subscription / landing checkout** | `api/subscription-checkout.js`, `api/landing-subscription.js`, `api/landing-tip.js` | **EchoFlux:** **`createFanCheckoutSession`** + **`joinFreeMembership`** / entitlement APIs; success URLs from session creation | Success/cancel URLs correct per domain |
| D4 | **Stripe webhook** | `api/stripe-webhook.js` | **`api/stripeWebhook.ts`** — extend only when Stripe objects/metadata differ from Stormij | Webhook dashboard clean; subs sync |
| D5 | **Success page after checkout** | `app/success/SuccessContent.tsx` | **EchoFlux:** SPA **`verifyCheckoutSession`** / return URLs in checkout creation; storefront return to creator page | Fan lands in sensible state |

---

## Phase E — Member navigation & pages (fan-facing)

Stormij routes live under `app/(member)/…`. EchoFlux uses **tabs** inside `FanStorefrontView` + `FanMemberFeed`, etc. Port **behavior**, not file paths.

| # | Topic | Stormij source | EchoFlux target | Verify |
|---|--------|----------------|-----------------|--------|
| E1 | **Member layout / header** | `app/(member)/layout.tsx`, `app/components/MemberHeader.tsx`, `member/*.css` | **EchoFlux:** `FanStorefrontView` + `styles/stormij-fanhub.css` / `fan-landing-feed.css` — iterate vs Stormij screenshots | Nav matches Stormij intent |
| E2 | **Home feed** | `app/(member)/home/page.tsx` | **`FanMemberFeed`** — aligned with B1/B2 (`fanPosts` + locked preview) | Parity with B1/B2 |
| E3 | **Grid** | `app/(member)/grid/page.tsx` | **EchoFlux:** grid tab in storefront if enabled; else **out of scope** — document in product spec | — |
| E4 | **Post detail** | `app/(member)/post/[id]/page.tsx`, `post/page.tsx` | **EchoFlux:** deep-link / expanded post in **`FanMemberFeed`** (post id fetch paths) — add dedicated route later if needed | Locked state + preview |
| E5 | **Saved** | `app/(member)/saved/page.tsx` | **`FanMemberSaved`** | Saves match |
| E6 | **Tag filter** | `app/(member)/tag/[tag]/page.tsx` | Not implemented — add if product requires | — |
| E7 | **Treats** | `app/(member)/treats/page.tsx`, `treats-data.ts` | Storefront treats tab + creator tools | Catalog + purchase |
| E8 | **Tip** | `app/(member)/tip/page.tsx` | Storefront tip section | — |
| E9 | **Profile** | `app/(member)/profile/page.tsx` | Username gate + profile / membership UI on storefront | — |
| E10 | **Chat session** | `app/(member)/chat-session/page.tsx` | **EchoFlux:** live video / instant call flows where wired (`VideoCallRoom`, APIs) | — |
| E11 | **Notifications** | `app/components/NotificationBell.tsx`, `lib/notifications.ts` | Optional / future for fan app | — |

---

## Phase F — Landing (public) parity

| # | Topic | Stormij source | EchoFlux target | Verify |
|---|--------|----------------|-----------------|--------|
| F1 | Landing composition | `app/components/Landing*.tsx`, `landing-config-client.ts` | **EchoFlux:** `FanLandingPage.tsx`, `MyPageBuilder.tsx` / storefront config — compare to Stormij | Visual + copy parity |
| F2 | Legal display | `lib/legal-defaults.ts`, `lib/legal-display.ts` | **EchoFlux:** `constants.ts` defaults + creator `legal` + storefront legal subpages | Terms/privacy render |

---

## Phase G — Admin / creator tools (Stormij admin → EchoFlux dashboard)

Only if creators used Stormij **admin** for things EchoFlux doesn’t have yet.

| # | Topic | Stormij source | EchoFlux target | Verify |
|---|--------|----------------|-----------------|--------|
| G1 | Posts admin | `app/admin/(authenticated)/posts/page.tsx` | **EchoFlux:** `FanHubPosts` + `FanHubFeed` | |
| G2 | DMs admin | `app/admin/(authenticated)/dms/page.tsx` | **EchoFlux:** `FanHubMessages` | |
| G3 | Users / member cards | `app/admin/.../users`, `MemberProfileCard.tsx` | **EchoFlux:** `FanHubUsers.tsx` | |
| G4 | Treats admin | `app/admin/.../treats` | **EchoFlux:** treats / storefront product tools | |

---

## Phase H — Infra & ops

| # | Task | Notes |
|---|------|--------|
| H1 | **Domain / Firebase Auth** | Authorized domains for `stormijxo.com` when you cut over |
| H2 | **Env vars** | Vercel: Stripe, Firebase admin, webhook secrets — match production needs |
| H3 | **Indexes** | **`firestore.indexes.json`** + deploy; `fanPosts` orderBy is usually auto single-field — add composite only if you combine `where` + `orderBy` (console link). See `docs/FIRESTORE_RULES_AND_INDEXES.md` |
| H4 | **Data migration** | If Stormij used **different Firebase project** — subscribers must exist in EchoFlux project (separate checklist: `STORMIJXO_ECHOFLUX_MIGRATION_CHECKLIST.md`) |

---

## Suggested order for your two starters

1. **A1 + A2 + A3** together (usernames + rules + display names) — **highest fan-visible impact**, unlocks consistent labels everywhere.  
2. **B1 + B2** (locked preview + post model) — **clear, testable** UI win.

**Progress:** **A** (mostly code-complete — deploy **rules** for A2), **B**, **C** done in EchoFlux. **D–H** — verify checkout URLs + webhooks in staging, then visual **E1** pass, DNS/migration **H** at cutover. See Phase D/E rows above for file pointers.

---

## Quick reference: read Stormij file without merging

```bash
git show stormij/main:lib/username.ts
git show stormij/main:lib/fan-hub-display.ts
git show stormij/main:lib/locked-post-media.ts
git show stormij/main:firestore.rules
```

---

## Related docs

- `docs/FIRESTORE_RULES_AND_INDEXES.md` — deploy rules/indexes; creators subcollection matrix  
- `docs/STORMIJXO_ECHOFLUX_MIGRATION_CHECKLIST.md` — DNS, subscribers, Stripe, no access loss  
- `docs/ECHOFLUX_STORMIJ_PARITY_ACTION_PLAN.md` — messages + webhooks + cancel membership  
- `docs/ECHOFLUX-FAN-HUB-PARITY.md` — CSS/markup alignment notes  

---

*Update this checklist as you confirm “in scope / out of scope” for EchoFlux.*
