# Vercel Build Optimization Guide

## Why You're Seeing 4 Builds at Once

The most common reasons for multiple simultaneous Vercel builds:

### 1. **Multiple Branches Auto-Deploying**
Vercel automatically creates preview deployments for every branch you push to. If you have multiple branches with recent commits, each one triggers a build.

**Your current situation:**
- You have many branches (I can see 20+ branches)
- Recent commits to `main` trigger production builds
- Other branches with recent commits trigger preview builds
- If you pushed to 2 different branches recently, that's 2 builds
- If Vercel is building both production and preview for each, that could be 4 builds

### 2. **Multiple Commits in Quick Succession**
If you pushed multiple commits quickly (like we just did with the Free Resources changes), Vercel might queue multiple builds.

### 3. **Production + Preview Builds**
Each branch can trigger:
- **Production build** (for `main` branch only)
- **Preview builds** (for all other branches)

## How to Reduce Builds and Costs (IMMEDIATE FIX)

### **Option 1: Disable Preview Deployments (Recommended for Cost Savings)**

**In Vercel Dashboard:**
1. Go to your project → **Settings** → **Git**
2. Scroll down to **"Preview Deployments"**
3. Change from **"All branches"** to **"Only build production branch"**
4. This will **only build `main` branch** and stop all preview builds

**Result:** You'll go from 4 builds → 1 build (75% cost reduction)

### **Option 2: Cancel Current Running Builds**

**Right now, to stop the 4 builds:**
1. Go to Vercel Dashboard → Your Project
2. Click on each deployment that's building
3. Click **"Cancel"** button to stop unnecessary builds
4. Only keep the `main` branch build running

### **Option 3: Delete Unused Branches**

You have many branches that might be triggering builds. Clean them up:

```bash
# List all remote branches
git branch -r

# Delete remote branches you don't need (example)
git push origin --delete feature/free-resources-and-referral-enhancements
git push origin --delete feature/remove-free-plan
# ... etc for branches you've merged and don't need
```

**Note:** Only delete branches that have been merged and you don't need anymore.

### **Option 4: Configure Branch Ignore Patterns**

**In Vercel Dashboard:**
1. Go to **Settings** → **Git** → **"Ignored Build Step"**
2. Add this to skip builds when only certain files change:
   ```
   git diff HEAD^ HEAD --quiet . && echo "skip" || echo "build"
   ```
3. Or ignore specific branches by adding them to **"Ignored Branches"**

## Recommended Settings for Cost Optimization

**Best practice for your situation:**
1. ✅ **Keep production builds** (main branch) - Enable
2. ❌ **Disable preview builds** - Set to "Only build production branch"
3. ✅ **Delete merged branches** - Clean up old feature branches
4. ✅ **Use ignore build step** - Skip builds when only docs/config files change

## Quick Action Plan

**Do this right now:**
1. Go to Vercel Dashboard → Your Project → Settings → Git
2. Set **Preview Deployments** to **"Only build production branch"**
3. Cancel any running preview builds
4. This will immediately stop 3 out of 4 builds

**Long-term:**
- Delete merged feature branches you don't need
- Only push to `main` when ready for production
- Use feature branches locally but don't push them unless you need previews

## Understanding Vercel Build Costs

- **Production builds** (main branch): Always needed
- **Preview builds** (other branches): Optional, can be disabled
- **Each build** uses build minutes from your plan
- **4 simultaneous builds** = 4x the cost

By disabling preview builds, you'll only pay for production builds when you push to `main`.
