# EchoFlux Fan Hub ↔ Stormij_xo parity

Keep EchoFlux **Fan Hub** (feed, treats, storefront preview) visually aligned with **stormijxo.com** when you change the Stormij project.

## Source of truth (Stormij_xo)

| Area | Files to review when Stormij changes |
|------|--------------------------------------|
| **Design tokens** (colors, fonts, surfaces) | `styles.css` → `:root { --bg, --accent, … }` |
| **Member feed** | `member/member-feed.css` |
| **Member post cards** | `member/member-post.css` |
| **Treats store** | `member/treats.css` |
| **Member header** | `member/member-header.css` |
| **Global wiring** | `app/globals.css` (imports above) |

Typical Stormij token values (as of last sync):

| Token | Value |
|-------|--------|
| `--bg` | `#fff2f8` |
| `--text` | `#2f1a24` |
| `--text-muted` | `#7c5b68` |
| `--accent` | `#d4558b` |
| `--accent-hover` | `#bc3f74` |
| `--accent-soft` | `rgba(212, 85, 139, 0.16)` |
| `--border` | `#f3dbe5` |
| `--surface` / `--surface-2` | `#fff9fc` / `#fef0f7` |
| `--serif` | `"Cormorant Garamond", Georgia, serif` |
| `--sans` | `"DM Sans", system-ui, sans-serif` |

## EchoFlux implementation

| Item | Location |
|------|----------|
| **Scoped theme + feed/treat CSS** | `styles/stormij-fanhub.css` |
| **Import** | `index.css` (or main CSS entry) imports `stormij-fanhub.css` |
| **Wrapper** | Fan Hub content is wrapped with class `stormij-theme` in `OnlyFansStudio.tsx` (`mode === 'fanHub'`) |
| **Per-creator overrides** | Optional inline CSS variables on `.stormij-theme`: `--fan-primary`, `--fan-bg`, `--fan-text` |

## What to update after Stormij changes

1. **Tokens** — Copy `:root` values from Stormij `styles.css` into the `.stormij-theme { … }` block at the top of `stormij-fanhub.css`, and mirror `--fan-*` defaults if they should match the live site.
2. **Feed** — Diff `member/member-feed.css` against rules for `.member-feed-main`, `.feed-header`, `.feed-title`, `.feed-saved-link`, `.feed-view-toggle`, `.feed-card`, modals (e.g. likers).
3. **Treats** — Diff `member/treats.css` against `.treats-main`, `.treats-grid`, `.treat-card`, hover states, and any `.stormij-theme .treat-*` overrides in `stormij-fanhub.css`.
4. **Fonts** — If Stormij adds/changes Google Fonts, add the same families in `index.html` (font link) and update `--serif` / `--sans` in `.stormij-theme`.
5. **React markup** — If Stormij changes **class names** or DOM structure, update `FanHubFeed.tsx`, `TreatsStore.tsx`, `FanHubMyPage.tsx`, `StorefrontPreview.tsx`, `FanStorefrontView.tsx` to keep class parity.

## Recent sync (maintenance log)

| Date | Notes |
|------|--------|
| *(add rows when you sync)* | |

### Latest changes applied (this session)

- `.stormij-theme` defaults aligned to Stormij `:root` (pink palette, not generic indigo).
- Feed: `max-width` 480px, title serif + 1.6rem; saved link + view toggle use accent/border tokens like Stormij.
- Feed cards: gradient + shadows + borders aligned to `member-feed.css` `.feed-card`.
- Treat cards (creator + fan): pink gradients, accent bar, hover scale/shadow; prices/CTAs use `var(--accent)`.
- `treats-add-btn` uses accent instead of purple.
- Replaced remaining `var(--fan-primary, #6366f1)` fallbacks with `#d4558b` for consistency.

## Related docs

- `docs/STORMIJ_MIGRATION.md` — Firebase data migration Stormij → EchoFlux (separate from UI parity).
