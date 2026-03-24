# Local development (EchoFlux)

## Full stack: `npm run dev` + `DEV_API_PROXY` (recommended)

1. **Deploy** (or use an existing) Vercel URL where this app already runs — e.g. `https://your-app.vercel.app` (no trailing slash).

2. In the **project root**, create or edit **`.env.local`**:

   ```env
   DEV_API_PROXY=https://your-app.vercel.app
   ```

   Use the same value you’d open in the browser for the live app (production or a Preview deployment).

3. **Restart** the dev server after any `.env.local` change:

   ```bash
   npm run dev
   ```

4. Open the **Local** URL from the terminal (often **http://localhost:5173/**). You should see (informational only — **do not paste into PowerShell**):

   ```text
   [vite] API proxy active: /api -> https://your-app.vercel.app
   ```

   If you see a warning about `localhost:3001`, `DEV_API_PROXY` was not loaded — check the variable name, spelling, and that the file is named `.env.local` next to `package.json`.

**PowerShell (one session, no file):**

```powershell
$env:DEV_API_PROXY = "https://your-app.vercel.app"
npm run dev
```

**Notes**

- Most `/api` routes use Firebase `Authorization: Bearer …` from the client; those work through the proxy. Cookie-only flows that depend on the deployment domain may not match `localhost`.
- Proxy timeout is **120s** to allow cold starts on Vercel.
- Template line: see **`.env.example`**.

### Firebase sign-in: `auth/requests-from-referer-http://localhost:5173-are-blocked`

Vite uses **port 5173** by default. If your **Google Cloud** browser API key (the one in `VITE_FIREBASE_API_KEY`) has **HTTP referrer** restrictions, each origin must be listed explicitly — e.g. `http://localhost:3000/*` does **not** cover port **5173**.

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials** → select the **Browser key** / Web client key used by Firebase.
2. Under **Application restrictions** → **HTTP referrers**, add:
   - `http://localhost:5173/*`
   - `http://127.0.0.1:5173/*`
   - (keep any existing entries such as `http://localhost:3000/*` if you still use that port.)
3. Save and wait a minute for propagation.
4. **Firebase Console** → **Authentication** → **Settings** → **Authorized domains**: ensure **`localhost`** is present (hostname only; no port).

---

## Vercel Preview: `manifest.json` 401, `/api` 500, Firestore “permission denied”

These are **three different causes**:

### 1. `manifest.json` / static assets → **401**

Usually **Vercel Deployment Protection** (password or Vercel login) on Preview deployments. The browser fetches `/manifest.json` **without** always sending the same auth as the page, so the request can return **401**.

**Fix (pick one):**

- **Vercel** → Project → **Settings** → *Deployment Protection* → allow **Protection Bypass for Automation** or disable protection for **Preview** (team policy permitting), **or**
- Sign in through Vercel’s access screen in the **same browser** so cookies apply, **or**
- Ignore the PWA manifest warning on Preview; production may be configured differently.

### 2. `/api/creatorOrders`, `/api/fanDmThreads`, … → **500**

Serverless routes need **Firebase Admin** (and any other secrets) in Vercel.

**Fix:** Vercel → Project → **Settings** → **Environment Variables** → ensure **Preview** has the same keys as Production, especially:

- `FIREBASE_SERVICE_ACCOUNT_KEY_BASE64` (or `FIREBASE_ADMIN_KEY`)

When adding a variable, tick **Preview** (and **Production** as needed). Redeploy the Preview after saving. The JSON response from `/api/fanDmThreads` may include a `hint` field explaining missing Admin config or a missing Firestore index.

**Note:** The browser console will **not** (and should not) contain `FIREBASE_SERVICE_ACCOUNT_KEY_BASE64`; that secret exists only on the server. A previous client warning about it was a false positive and has been removed from env validation.

### 3. Client `FirebaseError: Missing or insufficient permissions`

Rules did not allow the signed-in user to read that path. After updating **`firestore.rules`** (e.g. creator reading linked fans’ `users/{fanId}`), deploy rules:

```bash
firebase deploy --only firestore:rules
```

---

## `npm run dev:vercel` fails

### 1. Port already in use

If you see:

```text
NOTE: Requested port 3000 is already in use
NOTE: Requested port 3001 is already in use
```

Stop other dev servers (other terminals, old `vite` / `vercel` processes), then run again.

**Windows (PowerShell)** — see what is using a port:

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object OwningProcess
Get-Process -Id <pid>
```

### 2. `Invalid vercel.json - builds should NOT have more than 128 items`

This repo has **~200+** serverless entry files under `api/` (files not named with a leading `_`). The Vercel CLI builds a **separate build entry per route** for `vercel dev`, and **caps that list at 128**, so **`npm run dev:vercel` cannot succeed** until the route count drops below 128 or Vercel changes the CLI.

Repo `vercel.json` no longer uses a broad `functions: { "api/**/*.ts": … }` block (that duplicated work and didn’t fix the cap). **Production / Preview deployments** use a different pipeline and can still deploy this project; set **function duration** in the [Vercel project dashboard](https://vercel.com/docs/functions/configuring-functions/duration) if you need longer than the default timeout on Pro.

**Local full stack (recommended):**

| Approach | When to use |
|----------|-------------|
| **`npm run dev` + `DEV_API_PROXY=https://your-deployment.vercel.app`** | Full UI on localhost; `/api/*` hits your real Vercel backend (see top of this doc). |
| **Open the Preview / Production URL** | Full app + API on Vercel after `git push` or deploy. |
| **Long-term** | Fewer `api/*.ts` entrypoints (e.g. catch-all router) if you must run `vercel dev` locally. |

---

## Vite “ready” but console shows `ECONNREFUSED` (no `DEV_API_PROXY`)

`npm run dev` runs **Vite** on **http://localhost:3000** and proxies `/api` to **`http://localhost:3001`** by default. If nothing listens on 3001:

```text
[vite] http proxy error: /api/...
AggregateError [ECONNREFUSED]
```

Set **`DEV_API_PROXY`** as above, or ignore those errors if you only need UI + Firebase client SDK.

### `GET /api/creatorOrders … 404` or `502` on localhost

The route **exists** on Vercel (`api/creatorOrders.ts`). Plain `npm run dev` does not start those handlers unless you **proxy** `/api` to a deployment (`DEV_API_PROXY`). Without it, the Fan Hub Users page still loads members from Firestore, but **order-based spend** may show as empty.

---

## Firebase `auth/quota-exceeded` (securetoken.googleapis.com 400)

This usually means **too many forced ID token refreshes** (`getIdToken(true)`) in a short time, or a **project daily limit** in Firebase Console.

- The app avoids forcing refresh on every page load and on polling intervals; use a **cached** token (`getIdToken()`) unless you just changed custom claims.
- If you still hit the limit: wait for the quota window to reset, check **Firebase Console → Usage**, and ensure the **Web API key** is not over-restricted for your domain.

---

## Port 3000 already in use

`vite.config.ts` uses **`strictPort: false`**: if **3000** is busy, Vite picks the next free port (e.g. **3001**) and prints the URL in the terminal. Open that URL, or free 3000 if you need that port specifically.

---

## Typo: `num run dev`

Use **`npm run dev`** (with **m**).

---

## Build check

```bash
npm run build
```

If this fails, fix reported errors before worrying about dev servers.

---

## Vercel backend (production / preview)

1. **Project linked:** `vercel link` in the repo root (creates `.vercel/`).
2. **Environment variables** in the Vercel project (Settings → Environment Variables): at minimum whatever `api/_firebaseAdmin.ts` and Stripe/OpenAI routes need (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, etc.). Mirror values from `ENV_SETUP_GUIDE.md` if present.
3. **Deploy:** push to GitHub (if connected) or `vercel --prod`. Static app + `api/*` serverless are defined by `vercel.json` (`framework: vite`, `outputDirectory: dist`, rewrites to `/index.html` for non-API routes).
4. **Local serverless:** `npm run dev:vercel` is **not expected to work** here (too many API routes for the CLI’s 128-build cap). Use **`npm run dev` + `DEV_API_PROXY`** or test on a **Preview** URL instead.

---

## Fan storefront: preview vs live login

- **My Page → Live preview** uses `StorefrontPreview` (dummy Sign up / Log in). The **public** page at `/{handle}` uses the **same** layout with **working** Sign up / Log in — they open the branded **Fan auth** modal (`FanAuthModal`).
- **`?preview=member`** on `/{handle}?preview=member` skips the landing and shows the **member shell UI only** (no subscription check). Use that to preview tabs/layout; it does **not** log you in.
- **`?landing=1`** on `/{handle}?landing=1` **forces the public landing** even if you’re signed in and already a member (e.g. creators checking the page). Without it, subscribers go straight to the member hub—so the landing header / hero / treats block can look “missing” when you’re logged in.
- **My Page → Live preview** column scrolls back to the **top** when you switch Landing/Member or change handle so the header isn’t stuck off-screen.
- To test a **real** member session: open `/{handle}`, use **Sign up** or **Log in** on the landing header or pricing card, complete Firebase auth, then subscribe or use **Join free** if the creator enabled free access. Ensure **`DEV_API_PROXY`** is set if checkout/API calls run from localhost.
