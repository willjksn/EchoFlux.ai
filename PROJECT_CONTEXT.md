# EchoFlux Project Context

Reference for all development. Keep the app aligned with these rules.

## Product

- **EchoFlux** = creator app (Vite/React + Firebase Auth/Firestore + Stripe). Stable.
- **Fan monetization** (“Stormij experience”) = Fan Hub + storefront pages (echoflux.ai/{handle}).
- **stormijxo.com** = branded domain (single creator). Long-term: all creators get echoflux.ai/{handle}.

## Rules

### No social platform inbox

- **No** IG/TikTok/X DMs inside EchoFlux. Social Inbox is removed/disabled.
- **“Messages”** in the app = **fan DMs only** (fans ↔ creator), managed in **Fan Hub**.

### Storefront content (fan-facing pages)

- **Non-explicit “IG-like spicy”**: lingerie, bikini, implied nudity allowed.
- **Not allowed**: nipples/genitals discernible; explicit sex acts; sexting-services positioning.
- See `constants.ts` → `STOREFRONT_CONTENT_POLICY`.

### Payments

- **Creators** pay EchoFlux (Pro/Elite subscription).
- **Fans** pay creators via **Stripe Connect (Express)**.
- EchoFlux may take an optional platform fee later.

### Routing

- EchoFlux **does not use react-router**. Routing = `activePage` state + URL sync via `window.location` + `history` (see `UIContext.tsx`).

## Tiers

- **Pro** = Social Creator + Fan Hub (Strategy, Trends, Compose, Calendar, Vault, Fan Hub).
- **Elite** = Premium Studio + Fan Hub (adds Drops/PPV, DM Session Generator, Teaser Packs, Persona Builder, etc.).
- Premium Studio outputs → **Draft** / **ScheduledPost** / **Drop** / **MessageCampaign**, managed in Compose, Calendar, Fan Hub.
