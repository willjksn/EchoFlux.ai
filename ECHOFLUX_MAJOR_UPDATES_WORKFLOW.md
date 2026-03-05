# EchoFlux Major Updates Workflow

Use this workflow to make major changes while keeping **echoflux.ai** live. Only `main` deploys to production, so you develop and test elsewhere, then move everything to the site in one step.

---

## 1. Work on a feature branch (site stays live)

Create a branch and do all changes there. Production stays on `main`.

```bash
git checkout main
git pull origin main
git checkout -b feature/echoflux-major-updates
```

Do all your EchoFlux updates on this branch. Commit often.

---

## 2. Test locally

- **Dev server (hot reload):**  
  `npm run dev`  
  Test at http://localhost:5173 (or the port Vite shows).

- **Production-like build:**  
  `npm run build` then `npm run preview`  
  Catches build errors and mimics production.

- **Typecheck:**  
  `npm run typecheck`  
  Run before merging.

Use the same Firebase/API keys as production in `.env.local` so behavior matches the live site (see APPLICATION_DOCUMENTATION.md for required vars).

---

## 3. (Optional) Test on a live-like URL

If you want a real URL (e.g. for mobile or sharing):

**Option A – One-time preview deploy**

1. Push your branch:  
   `git push origin feature/echoflux-major-updates`
2. In **Vercel Dashboard → Project → Settings → Git**, temporarily set **Preview Deployments** to **All branches** (or enable the specific branch).
3. Vercel will build your branch and give you a preview URL (e.g. `echoflux-xxx.vercel.app`).
4. Test there, then set Preview Deployments back to **Only build production branch** if you want to avoid future preview builds.

**Option B – Second Vercel project (staging)**

1. Create a new Vercel project linked to the **same repo**.
2. Set its **Production Branch** to your feature branch (e.g. `feature/echoflux-major-updates`) or a permanent `staging` branch.
3. Use that project's URL as your staging site. Your existing project stays pointed at `main` (echoflux.ai).

---

## 4. Move everything to the live site

When you're happy with testing:

```bash
git checkout main
git pull origin main
git merge feature/echoflux-major-updates
git push origin main
```

Vercel will deploy `main` to production (echoflux.ai). No need to run `vercel --prod` if the project is connected to Git.

---

## 5. (Optional) Maintenance window

If you want to limit access during the first minutes after deploy:

1. In **Vercel → Settings → Environment Variables**, add (or set):  
   `VITE_MAINTENANCE_MODE=true` and `VITE_ALLOWED_EMAIL=your@email.com`
2. Redeploy (or trigger deploy from `main`).
3. After you've verified the site, set `VITE_MAINTENANCE_MODE=false` (or remove it) and redeploy.

See **MAINTENANCE_MODE.md** for details.

---

## Quick reference

| Goal                     | Action |
|--------------------------|--------|
| Keep site live           | Don't merge to `main` until you're ready |
| Develop safely           | Work on a feature branch |
| Test locally             | `npm run dev`; `npm run build` && `npm run preview` |
| Test on a URL             | Push branch and use Vercel preview, or a second Vercel project |
| Go live                  | Merge branch into `main` and push |

Your current `vercel.json` only deploys `main`, so pushing or merging to other branches does **not** change echoflux.ai until you merge into `main` and push.
