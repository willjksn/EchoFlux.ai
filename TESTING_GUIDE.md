# Local Testing Guide

## ✅ Step 1: Verify You're on the Correct Commit

Before testing, always verify you're on commit `a41b16d`:

```powershell
# Quick check
git rev-parse HEAD
# Should output: a41b16dc64008ab89b8e9f408f88192cfadef4a9

# Or run the verification script
.\verify-commit.ps1

# See commit details
git log -1 --oneline
# Should show: a41b16d feat(rate-limit): apply distributed limiter to more endpoints
```

## 🚀 Step 2: Start Local Development Server

### Option A: Frontend Only (Vite)
For testing the frontend/UI:
```powershell
npm run dev
```
- Opens at: `http://localhost:5173`
- Fast hot-reload for UI changes
- Good for testing landing page, UI components

### Option B: Full Stack (Vercel Dev)
For testing with API routes and backend:
```powershell
npm run dev:vercel
```
- Includes API routes (`/api/*`)
- Closer to production environment
- Better for testing full functionality

## 👀 Step 3: What to Check on Landing Page

After starting the dev server, verify the landing page matches the working Vercel deployment:

1. **Logo & Branding**
   - Logo shows "EchoFlux.ai" in blue (#2563eb)
   - Header navigation works

2. **Hero Section**
   - Main headline and description are correct
   - Background image displays properly

3. **Features Section**
   - All feature cards render correctly
   - Icons display properly

4. **Pricing Section**
   - Pricing tiers are visible and correct

5. **Footer**
   - Links work correctly

## 🔍 Quick Verification Checklist

- [ ] Commit hash matches `a41b16dc64008ab89b8e9f408f88192cfadef4a9`
- [ ] Landing page loads without errors
- [ ] No console errors in browser dev tools
- [ ] UI matches the working Vercel deployment you saw earlier
- [ ] Navigation works correctly

## ⚠️ If Something Looks Wrong

1. **Check your current commit:**
   ```powershell
   git log -1
   ```

2. **Reset to correct commit if needed:**
   ```powershell
   git reset --hard a41b16d
   ```

3. **Clear cache and reinstall:**
   ```powershell
   Remove-Item -Recurse -Force node_modules
   npm install
   npm run dev
   ```

## 📝 Before Pushing to GitHub

✅ Always verify:
- You're on commit `a41b16d` (or you've made intentional changes from it)
- Local build works: `npm run build`
- Landing page looks correct locally
- No console errors

Then push:
```powershell
git status                    # Check what you're about to push
git push origin main          # Push to GitHub (triggers Vercel deployment)
```