# Fan Hub Feed — Reference (Stormij_xo)

Review of **Stormij_xo** `app/(member)/home/page.tsx` and `member/member-feed.css` for implementing **Fan Hub → Feed** in EchoFlux.

---

## Overall layout

- **Container:** `member-main member-feed-main` — max-width 480px, margin auto, padding 1rem 0 4rem.
- **Header:** `feed-header` — flex, space-between: Grid view toggle (icon link), “Saved Posts (N)” link.
- **List:** `feed-list` — flex column, gap 1.5rem; each item is a `FeedCard`.

---

## FeedCard structure (per post)

1. **Card header** (`feed-card-header`)
   - Creator avatar (38px circle, optional image or fallback).
   - Creator username (bold, accent color).
   - Relative time (e.g. “2 hrs”, “Just now”).
   - Pinned badge (if pinned).
   - (Admin only) Three-dots menu: Edit, Pin/Unpin.

2. **Media** (if `mediaUrls[0]` exists)
   - Wrapper: `feed-card-media-wrap` — aspect-ratio 4/4.6, overflow hidden.
   - **Image:** link to post page, img with `feed-card-media`; optional caption overlay (static / scroll-up / scroll-across / dissolve).
   - **Video:** same wrapper, video element; play overlay (icon) when paused; click to play/pause.
   - Multi-media: badge bottom-right (“X images”, “Y videos”) with small icons.
   - **Locked:** `feed-card-media-locked` (blur + scale), overlay with “Unlock for $X” button.

3. **Audio** (if `audioUrls`): one or more `<audio controls>` in card body.

4. **Actions row** (`feed-card-actions`)
   - Like: heart (outline/filled toggle) + count.
   - Comments: comment icon + count (opens comments modal).
   - Send tip: “$” + “SEND TIP” (opens tip modal).
   - Bookmark: bookmark icon (save/unsave); aligned end (margin-left auto).

5. **Body** (`feed-card-body`)
   - Caption: **username** + body text.
   - Optional poll: question + options + vote counts + progress bars.
   - Optional tip goal: description, progress bar (raised/target), “SEND TIP” button.
   - “View all X comments” (opens modal).
   - First 2 comments (preview).
   - “View post” link.

6. **Text-only posts** (no media): same header and body; actions row in a footer (`feed-card-text-only-footer`) with “View post”.

7. **Comments modal**
   - Backdrop; dialog with: title “Comments”, close button.
   - Content: grid — left: media (image/video), right: scrollable comment list + compose (input, emoji trigger, “Post”).
   - Emoji picker: search, category tabs, grid of emojis.

8. **Tip modal**
   - Preset amounts, custom amount input, CTA button.

---

## Data model (Stormij_xo)

- **Posts:** Firestore `posts` — query `orderBy("createdAt", "desc")`, limit 50; filter `status === "published"`.
- **Post fields:** id, body, mediaUrls[], mediaTypes[] (image|video), audioUrls[], createdAt, likeCount, likedBy[], comments[], captionStyle, overlayTextSize, hideComments, hideLikes, showTipButton, poll, tipGoal, lockedContent.
- **User:** `users/{uid}` — savedPostIds[], pinnedPostIds[], unlockedPostIds[].

---

## Styling (member-feed.css)

- **Theme:** Pink/rose accent: `var(--accent)`, rgba(201, 112, 130), soft gradients (#fff → #fef8f9 → #fdf4f6).
- **Card:** Gradient background, border 1px solid rgba(201,112,130,0.2), border-radius 16px, box-shadow; hover: translateY(-2px), stronger shadow.
- **Header:** Gradient bg, border-bottom.
- **Media:** object-fit contain, object-position center top; inset box-shadow for glow.
- **Locked media:** filter blur(16px) saturate(0.85); overlay with dark gradient and pill “Unlock” button.
- **Actions:** Icons 24px; liked/bookmarked use filled icon and accent color.
- **Comments modal:** Two-column grid on desktop; single column on small; rounded panels, same pink/white gradient.

---

## EchoFlux adaptation (Fan Hub → Feed)

- **Scope:** Feed is **creator-scoped** (posts for the storefront’s creator). Use Firestore `posts` (or equivalent) filtered by `creatorId`, or a dedicated `creatorPosts/{creatorId}/posts` subcollection.
- **Routing:** No Next.js; use app’s existing navigation (e.g. open post in a modal or push state).
- **Theme:** Use storefront theme (primary, background, text) from creator doc so the feed matches the rest of the storefront.
- **APIs:** List posts for creator; like/save/unlock via existing or new APIs; comments and tips can be stubbed or wired to existing patterns.
- **Components:** Implement `FanHubFeed` (list + header) and `FanHubFeedCard` (single post) in EchoFlux, reusing the structure and class names from this reference so the same CSS (ported or in Tailwind) can be applied for a matching look.
