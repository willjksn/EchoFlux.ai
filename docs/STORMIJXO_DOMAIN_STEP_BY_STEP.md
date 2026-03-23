# stormijxo.com — step-by-step (Firestore, Vercel, local dev)

Use this with **`docs/STORMIJXO_DOMAIN_PREFLIGHT.md`** (what the code expects). Replace `stormijxo.com` / handles with your real values.

### Fan count on EchoFlux vs the old Stormij site

**`creatorDomains` does not import or sync fans.** It only maps **`stormijxo.com` → handle** so the EchoFlux app loads her page.

If **new members exist on Stormij** but not in EchoFlux, re-run **member migration** (no need for them to “join again” on the storefront for **data**):

```bash
npm run migrate:stormij:dry -- --creator-id=HER_UID --collection=members
```

**Logging in** is separate: Firestore `fans` rows don’t create Firebase Auth users. To avoid fans creating a second account, use **Auth user import** from Stormij → EchoFlux or align UIDs — see **`docs/MIGRATED_FANS_AUTH.md`**.

```bash
npm run report:fans-missing-auth -- --creator-id=HER_UID
```

---

## A. Firestore: `creatorDomains/stormijxo.com`

This tells the app **which My Page handle** to load when someone visits **`https://stormijxo.com/`** (no `/{handle}` in the URL). The `handle` **must** match:

- The handle saved in **Fan Hub → My Page**, and  
- The document **`creatorHandles/{handle}`** in Firestore (created when the handle is saved / updated via the app).

### A1. Find her current handle (before creating the doc)

1. Sign in to EchoFlux as the creator (or use Firebase Console → **Firestore** → `creators` → open her `creators/{creatorId}` doc).
2. Note the **`handle`** field (lowercase, e.g. `stormijxo`).  
3. In Firestore, open **`creatorHandles`** and confirm a document with **ID = that exact handle** exists and **`creatorId`** is her uid.

If there is no `creatorHandles/{handle}` yet, **save My Page** in the app with the final handle first, or the public storefront lookup can fail.

### A2. Create `creatorDomains` (Console **or** script)

Firestore **creates the `creatorDomains` collection automatically** when you add the first document — you don’t create an empty collection first.

#### Option A — Script (recommended)

From the repo root, with **`echoflux-service-account.json`** (or `ECHOFLUX_SERVICE_ACCOUNT`):

```bash
# Preview (no write)
npm run upsert:creator-domain -- --host=stormijxo.com --handle=stormijxo --creator-id=ZY2JlmlsNmNkAe0LdRXYycDvHSi2

# Write
npm run upsert:creator-domain -- --host=stormijxo.com --handle=stormijxo --creator-id=ZY2JlmlsNmNkAe0LdRXYycDvHSi2 --apply
```

Optional: also write **`www.stormijxo.com`** with the same mapping:

```bash
npm run upsert:creator-domain -- --host=stormijxo.com --handle=stormijxo --creator-id=ZY2JlmlsNmNkAe0LdRXYycDvHSi2 --apply --www
```

This writes **`creatorDomains/{hostname}`** with fields **`handle`**, **`creatorId`**, **`updatedAt`**.

#### Option B — Firebase Console (manual)

1. Open **[Firebase Console](https://console.firebase.google.com/)** → your EchoFlux project.
2. Go to **Build** → **Firestore Database**.
3. If you don’t see **creatorDomains** yet, click **Start collection** (or **Add collection**):
   - Collection ID: **`creatorDomains`**
4. **Add document**:
   - **Document ID:** type exactly: **`stormijxo.com`**  
     - Use the **apex** hostname (no `https://`, no path, no `www.`).
   - **Field 1**
     - Field name: **`handle`**
     - Type: **string**
     - Value: her handle, e.g. **`stormijxo`** (same as My Page / `creatorHandles`, lowercase).
   - **Field 2** (optional but useful for debugging)
     - Field name: **`creatorId`**
     - Type: **string**
     - Value: her Firebase Auth uid (same as `creators/{creatorId}` document id).

5. Click **Save**.

### A3. Rules reminder

`creatorDomains` should allow **public read** and **no client writes** (already in **`firestore.rules`** in this repo). After any rules change:

```bash
firebase deploy --only firestore:rules
```

(Only if you use Firebase CLI and this project is linked.)

### A4. Quick verification (optional)

- **Production API** (after deploy): open in a browser (replace host if needed):

  `https://YOUR-ECHFLUX-DOMAIN.vercel.app/api/resolveStorefrontDomain?host=stormijxo.com`

  You should see JSON like: `{ "handle": "stormijxo" }` (and optionally `creatorId`).

- **404** → doc id typo, wrong project, or rules blocking read.

---

## B. Vercel: add domain, DNS, SSL, www vs apex redirect

Do this on the **same Vercel project** that builds EchoFlux (the one with this repo).

### B1. Add `stormijxo.com` and `www.stormijxo.com` in Vercel

1. **[Vercel Dashboard](https://vercel.com)** → select the **EchoFlux** project.
2. **Settings** → **Domains**.
3. Enter **`stormijxo.com`** → **Add**.
4. Enter **`www.stormijxo.com`** → **Add**.

Vercel will show **what DNS records to create** at your registrar (where the domain is purchased: GoDaddy, Namecheap, Cloudflare, etc.).

### B2. DNS at your registrar (typical patterns)

**Important:** Use the **exact** records Vercel shows for your project — they can differ (apex vs subdomain).

Common setups:

| Goal | Often looks like |
|------|------------------|
| **Apex** `stormijxo.com` | **A** record to Vercel’s IPs **or** **ALIAS/ANAME** (if your DNS supports it) |
| **www** `www.stormijxo.com` | **CNAME** to `cname.vercel-dns.com` (or the hostname Vercel displays) |

Steps (generic):

1. Log in to **your domain registrar** (or **Cloudflare** if DNS is hosted there).
2. Open **DNS** for `stormijxo.com`.
3. Add/replace records **exactly** as Vercel lists (name/host, type, value).
4. Save. **Propagation** can take a few minutes to 48 hours (often &lt; 1 hour).

### B3. Wait for SSL

- In Vercel → **Domains**, each hostname should show **Valid Configuration** and a **certificate** once DNS is correct.
- If it’s stuck on “Invalid Configuration,” double-check DNS (no old A records conflicting, TTL expired).

### B4. Pick canonical: apex **or** www + redirect the other

You want **one** primary URL (SEO + bookmarks), e.g.:

- **Canonical = apex:** `https://stormijxo.com`  
  → redirect **`https://www.stormijxo.com/*`** → **`https://stormijxo.com/*`**

or

- **Canonical = www:** `https://www.stormijxo.com`  
  → redirect apex → www.

**In Vercel (UI):**

1. **Settings** → **Domains**.
2. For the hostname that should **redirect**, open the **⋯** menu → choose **Redirect to** (or **Edit** and set redirect) to the **canonical** domain.  
   - Exact labels vary by Vercel UI version; look for **Redirect** / **Primary domain**.

**Alternative:** Some teams do redirects in **`vercel.json`** (`redirects` array). Only add that if you’re comfortable maintaining it; the Vercel Domains UI is usually enough.

### B5. EchoFlux env: `VITE_CUSTOM_STOREFRONT_HOSTS`

After the app code that reads this is deployed:

1. Vercel → Project → **Settings** → **Environment Variables**.
2. Add (Production, and Preview if you test Preview):

   - **Name:** `VITE_CUSTOM_STOREFRONT_HOSTS`  
   - **Value:** `stormijxo.com,www.stormijxo.com`  
     (comma-separated, no spaces required after commas but you can use them.)

3. **Redeploy** (env vars starting with `VITE_` are baked in at **build** time).

### B6. Firebase Auth authorized domains

1. Firebase Console → **Authentication** → **Settings** → **Authorized domains**.
2. Add:
   - `stormijxo.com`
   - `www.stormijxo.com`

Save. Otherwise sign-in on those hosts can fail with **`auth/unauthorized-domain`**.

---

## C. Local dev: custom domain env + `DEV_API_PROXY`

Local Vite **does not** run serverless `/api` unless you use **`vercel dev`** or **proxy** to a deployed deployment.

### C1. Create or edit `.env.local` (repo root, next to `package.json`)

Add **both** lines (use your real Vercel app URL, **no** trailing slash):

```env
# Hostnames that should use storefront-at-root logic when you test (must match Firestore creatorDomains)
VITE_CUSTOM_STOREFRONT_HOSTS=stormijxo.com,www.stormijxo.com

# Forward /api/* to your deployed EchoFlux (so resolveStorefrontDomain, getCreatorByHandle, etc. work)
DEV_API_PROXY=https://your-deployment.vercel.app
```

Replace `https://your-deployment.vercel.app` with:

- Production: e.g. `https://echoflux.ai` or `https://your-app.vercel.app`, **or**
- A **Preview** URL if you’re testing a branch (same APIs + Firestore as that deployment’s env).

### C2. Restart the dev server

Stop **`npm run dev`**, start it again. In the terminal you should see something like:

```text
[vite] API proxy active: /api -> https://your-deployment.vercel.app
```

If you see a warning about **`localhost:3001`**, `DEV_API_PROXY` was not loaded — check filename **`.env.local`**, spelling, and restart.

### C3. What you can and can’t test on localhost

| Test | Works? |
|------|--------|
| **`http://localhost:3000`** with **`VITE_CUSTOM_STOREFRONT_HOSTS` set** | The **code paths** for “custom host” use **`window.location.hostname`**, which will be **`localhost`**, **not** `stormijxo.com`. So **custom-domain-at-root** behavior **does not** mirror production on plain localhost. |
| **`/api/*` from localhost | **Yes**, if **`DEV_API_PROXY`** points to a deployment that has **`api/resolveStorefrontDomain`** and Firestore data. |

**Practical options:**

1. **Test custom domain behavior on the real host** after DNS: open `https://stormijxo.com/` (or a **staging** subdomain you add to Vercel + `creatorDomains` + env).
2. **Edit `/etc/hosts` (advanced)** to map `stormijxo.com` → `127.0.0.1` and run Vite with **`host: true`** — only if you know how to avoid breaking other tools; not required for most flows.
3. **Local:** still use **`DEV_API_PROXY`** so any screen that calls **`/api/resolveStorefrontDomain`** from **`localhost`** returns data — but **`FanStorefrontView`** won’t treat localhost as a custom storefront unless you add `localhost` to `VITE_CUSTOM_STOREFRONT_HOSTS` **and** add **`creatorDomains/localhost`** in Firestore (usually **not** worth it).

### C4. PowerShell one-liner (no `.env.local`)

```powershell
$env:VITE_CUSTOM_STOREFRONT_HOSTS = "stormijxo.com,www.stormijxo.com"
$env:DEV_API_PROXY = "https://your-deployment.vercel.app"
npm run dev
```

---

## D. Order of operations (recommended)

1. Deploy code + **`VITE_CUSTOM_STOREFRONT_HOSTS`** + Firestore **`creatorDomains`** + rules deployed.  
2. Verify **`/api/resolveStorefrontDomain?host=stormijxo.com`** on the **Vercel URL** first.  
3. Add **Vercel domains** + **DNS** + **SSL**.  
4. Add **Firebase authorized domains**.  
5. Set **canonical redirect** (www ↔ apex).  
6. End-to-end test checkout + login on **`https://stormijxo.com`**.

---

## Related docs

- **`docs/STORMIJXO_DOMAIN_PREFLIGHT.md`** — checklist overview  
- **`docs/LOCAL_DEV.md`** — `DEV_API_PROXY` details  
- **`docs/CREATORS_SCHEMA.md`** — `creatorDomains` schema  
