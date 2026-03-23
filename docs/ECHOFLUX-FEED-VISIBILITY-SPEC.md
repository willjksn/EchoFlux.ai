# EchoFlux Fan Hub — Feed Visibility Spec

This spec defines how **feed visibility settings** work for the Fan Hub feed in EchoFlux: where they are stored, who they apply to, and how per-post overrides work.

---

## 1. Visibility settings (creator-controlled)

The creator can set three global feed visibility options. These control what **fans** see on the feed (creator view is for management and may show full UI).

| Setting            | Effect for fans                                                                 |
|--------------------|----------------------------------------------------------------------------------|
| **Hide like counts** | Like button is still shown; the number next to it (e.g. "42") is hidden.        |
| **Hide comments**   | Comment count, comment button, and comments section are hidden for the feed.   |
| **Hide likes**      | Like button and like count are hidden entirely for the feed.                    |

- **Where:** Creator sets these in **Fan Hub → Feed** → header **Visibility** button → popover (checkboxes).
- **Scope:** Global for the creator’s feed (applies to all posts unless overridden per post).

---

## 2. Per-post overrides

Individual posts can override visibility:

- **hideComments** (boolean on post): If `true`, comments are hidden for that post even if feed-level “Hide comments” is off.
- **hideLikes** (boolean on post): If `true`, likes are hidden for that post even if feed-level “Hide likes” is off.
- **hideLikeCounts** (boolean on post, optional): If `true`, the like count is hidden for that post.

**Effective visibility for fans:** For each post, hide a feature if **either** the feed-level setting **or** the post-level override is true (OR logic).

Examples:

- Feed “Hide comments” = on → comments hidden on all posts.
- Feed “Hide comments” = off, post A “hideComments” = on → comments hidden only on post A.
- Feed “Hide likes” = off, post B “hideLikes” = on → likes hidden only on post B.

---

## 3. Storage and sync

- **Creator’s own UI (Visibility popover):**
  - **Read:** `users/{creatorId}.fanHubFeedSettings` → `hideLikeCounts`, `hideComments`, `hideLikes` (and Elite-only `autoReplyAI`, `autoReplyChance`).
  - **Write:** On save, update **both**:
    - `users/{creatorId}.fanHubFeedSettings`
    - `creators/{creatorId}.feedSettings`
  so the public storefront and APIs see the same values.

- **Fan-facing storefront:**
  - **Read:** `creators/{creatorId}.feedSettings` via API `getCreatorByHandle?handle=...`. Response includes `feedSettings: { hideLikeCounts, hideComments, hideLikes }`.
  - **Use:** Storefront passes `creator.feedSettings` into the fan feed component(s).

- **Posts:** Post documents (e.g. `users/{creatorId}/posts/{postId}`, `creators/{creatorId}/posts/{postId}`, and `posts/{postId}` where used) may include `hideComments`, `hideLikes`, `hideLikeCounts` for per-post overrides.

---

## 4. Where visibility is applied

- **Creator view (Fan Hub → Feed):** Visibility toggles only **save** the global settings. Cards can show full UI for management (per-post overrides still apply if the UI uses them for preview).
- **Fan view (storefront feed):** Visibility **must** be applied:
  - Use `feedSettings` from the creator payload.
  - For each post, use effective visibility = feed-level OR post-level (as in §2).
  - Hide like count when `feedSettings.hideLikeCounts || post.hideLikeCounts`.
  - Hide comments when `feedSettings.hideComments || post.hideComments`.
  - Hide likes when `feedSettings.hideLikes || post.hideLikes`.

---

## 5. API contract

**getCreatorByHandle** (e.g. `GET /api/getCreatorByHandle?handle=...`):

- Must read `feedSettings` from `creators/{creatorId}.feedSettings`.
- Response must include:
  ```json
  "feedSettings": {
    "hideLikeCounts": boolean,
    "hideComments": boolean,
    "hideLikes": boolean
  }
  ```
  (or omit `feedSettings` if not set; clients treat missing as false.)

---

## 6. Elite-only settings (same Visibility popover)

These are stored with the same `fanHubFeedSettings` / `feedSettings` object but are **Elite-only** and do not affect visibility of likes/comments:

- **autoReplyAI** (boolean): Enable AI auto-reply to feed comments.
- **autoReplyChance** (number 0–100): Reply chance for non-tipper comments; tippers/buyers are always prioritized.

They are not returned by `getCreatorByHandle` for fans; they are only used server-side when deciding whether to add an AI reply to a new comment.

---

## 7. Summary checklist

- [ ] Creator can set Hide like counts / Hide comments / Hide likes in Feed → Visibility.
- [ ] Settings are saved to both `users/{uid}.fanHubFeedSettings` and `creators/{uid}.feedSettings`.
- [ ] `getCreatorByHandle` returns `feedSettings` from `creators/{creatorId}`.
- [ ] Storefront passes `creator.feedSettings` into the fan feed component.
- [ ] Fan feed hides like count when `feedSettings.hideLikeCounts || post.hideLikeCounts`.
- [ ] Fan feed hides comments when `feedSettings.hideComments || post.hideComments`.
- [ ] Fan feed hides likes when `feedSettings.hideLikes || post.hideLikes`.
- [ ] Per-post `hideComments` / `hideLikes` / `hideLikeCounts` override or add to feed-level (OR logic).
