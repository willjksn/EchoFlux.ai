# stormijxo.com — pre-DNS checklist (steps 1–5)

Do these **before** pointing DNS at EchoFlux so the custom domain serves her storefront at `/` without surprises.

**Detailed walkthrough (Firestore Console, Vercel DNS/SSL/redirects, `.env.local`):**  
→ **`docs/STORMIJXO_DOMAIN_STEP_BY_STEP.md`**

---

## 1. Custom domain → creator routing (code + data)

**Implemented in this repo:**

- **`VITE_CUSTOM_STOREFRONT_HOSTS`** — Comma-separated hostnames that use the fan storefront rules (e.g. `stormijxo.com,www.stormijxo.com`). Set in **Vercel** → Project → Settings → Environment Variables (and in `.env.local` for local testing).
- **`creatorDomains` (Firestore)** — One document per normalized hostname (use **apex without `www`**, e.g. `stormijxo.com`):
  - `handle` (string, required) — Must match My Page handle / `creatorHandles/{handle}`.
  - `creatorId` (string, optional) — Denormalized for debugging; resolution uses `handle` + `getCreatorByHandle`.
- **API** — `GET /api/resolveStorefrontDomain?host=stormijxo.com` reads `creatorDomains/{host}` and returns `{ handle }`.
- **App routing** — `App.tsx` sends those paths on configured hosts to `FanStorefrontView`: `/`, `/terms`, `/privacy`, `/{handle}` (slug pattern `[a-z0-9_]+`).

**You must:**

1. Deploy the build with `VITE_CUSTOM_STOREFRONT_HOSTS` set (Production + Preview if needed).
2. Create **`creatorDomains/stormijxo.com`** in Firestore (Firebase Console or script) with at least `{ "handle": "her_handle" }`.
3. Optionally duplicate **`creatorDomains/www.stormijxo.com`** with the same fields, or rely on normalization (API strips `www.` — prefer **one doc per apex** and ensure Vercel redirects `www` → apex or both hit the same mapping).

---

## 2. Firebase Auth — authorized domains

In **Firebase Console** → Authentication → Settings → **Authorized domains**, add:

- `stormijxo.com`
- `www.stormijxo.com` (if you use www)

Without this, sign-in on the custom host can fail with `auth/unauthorized-domain`.

---

## 3. Stripe return URLs

Fan checkout uses `req.headers.origin` / `Referer` for defaults (`api/createFanCheckoutSession.ts`). Once fans pay on **`https://stormijxo.com`**, success/cancel URLs will use that origin if the request comes from that host.

**You should:**

- In **Stripe Dashboard** → Developers → **Webhook** endpoint: ensure your production URL can receive events (unchanged if webhooks stay on `echoflux.ai` / same deployment).
- Add any **allowed domains** or **Brand** settings if you use Stripe Customer Portal with fixed return URLs.
- After cutover, run one **test checkout** from `stormijxo.com` and confirm return lands on the same host.

---

## 4. SSL + apex/www on Vercel

1. Vercel → Project → **Domains** → add `stormijxo.com` and `www.stormijxo.com`.
2. At the registrar, set DNS per Vercel (A/CNAME/ALIAS).
3. Wait for **certificate issued** (green check).
4. Choose **canonical** host (usually apex **or** www) and add a **redirect** in Vercel so only one is primary.

---

## 5. QA before DNS cutover (staging)

Recommended order:

1. **Preview deployment** with `VITE_CUSTOM_STOREFRONT_HOSTS` including a **test subdomain** you add to Vercel (e.g. `preview-stormij.echoflux.ai` is *not* enough — use something like `test.stormijxo.com` **after** a TXT/CNAME proves ownership, or use Vercel’s domain on a test host).
2. Or: point **`staging.stormijxo.com`** at staging first, verify `/` loads storefront, `/terms` / `/privacy`, login, join, one purchase.
3. **Production smoke** after apex goes live: `/`, feed, treats, tip, messages (if enabled), legal links, mobile.

---

## Quick reference — env vars

| Variable | Where | Example |
|----------|--------|---------|
| `VITE_CUSTOM_STOREFRONT_HOSTS` | Vercel + `.env.local` | `stormijxo.com,www.stormijxo.com` |

---

## Firestore document example

**Collection:** `creatorDomains`  
**Document ID:** `stormijxo.com`

```json
{
  "handle": "stormijxo",
  "creatorId": "<optional Firebase uid for this creator>"
}
```

Deploy rules so `creatorDomains` is **public read**, **no client write** (already in `firestore.rules`).

---

## Related

- `docs/STORMIJXO_ECHOFLUX_MIGRATION_CHECKLIST.md` — Phase 4 domain notes
- `src/lib/storefrontCustomDomain.ts` — host/path rules
- `api/resolveStorefrontDomain.ts` — domain lookup API
