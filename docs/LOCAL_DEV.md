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

4. Open **http://localhost:3000**. In the terminal you should see (informational only — **do not paste into PowerShell**):

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

This project defines **200+** serverless handlers under `api/**/*.ts`. The Vercel CLI turns each into a **build** entry for `vercel dev`, and validation **caps that list at 128**, so **`vercel dev` cannot start** for this repo as-is.

That does **not** mean production deploys are invalid (deployment uses a different pipeline), only that **local `vercel dev` hits this limit**.

**Workarounds:**

| Approach | When to use |
|----------|-------------|
| **`npm run dev` + `DEV_API_PROXY`** | Full UI + real `/api` against a deployed URL (see top of this doc). |
| **`npm run dev` only** | UI + Firebase in the browser; ignore `/api` errors in the console. |
| **Vercel Preview deployment** | Test the full app on the preview URL from a git push. |
| **Long-term** | Fewer top-level `api/` entrypoints (e.g. consolidate routes) or ask Vercel support about the dev limit. |

---

## Vite “ready” but console shows `ECONNREFUSED` (no `DEV_API_PROXY`)

`npm run dev` runs **Vite** on **http://localhost:3000** and proxies `/api` to **`http://localhost:3001`** by default. If nothing listens on 3001:

```text
[vite] http proxy error: /api/...
AggregateError [ECONNREFUSED]
```

Set **`DEV_API_PROXY`** as above, or ignore those errors if you only need UI + Firebase client SDK.

---

## Port 3000 already in use

`vite.config.ts` sets `strictPort: true`. If **3000** is taken, Vite **exits**.

Free the port or stop the other dev server, then run `npm run dev` again.

---

## Typo: `num run dev`

Use **`npm run dev`** (with **m**).

---

## Build check

```bash
npm run build
```

If this fails, fix reported errors before worrying about dev servers.
