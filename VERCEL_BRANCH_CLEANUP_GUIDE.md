# Vercel Branch Cleanup Guide

## What You Can Delete in Vercel

### ✅ **Safe to Delete: Preview Deployments**
- All preview deployments for feature branches (e.g., `feature/free-resources-and-referral-enhancements`, `fix/payment-checkout-flow`, etc.)
- These are just Vercel deployments, not your actual git branches
- Deleting them won't affect your git repository

### ✅ **Keep: Production Deployment**
- **DO NOT DELETE** the production deployment for `main` branch
- This is your live site

## Two Options:

### **Option 1: Delete Individual Preview Deployments (One-time cleanup)**

**In Vercel Dashboard:**
1. Go to your project → **Deployments** tab
2. You'll see a list of all deployments
3. For each preview deployment (not the `main` branch one):
   - Click the three dots (⋯) menu
   - Click **"Delete"**
   - Confirm deletion

**This removes old preview deployments but new ones will still be created when you push branches.**

### **Option 2: Disable Preview Deployments Entirely (Recommended - Prevents Future Builds)**

**This is the better long-term solution:**

1. Go to Vercel Dashboard → Your Project → **Settings** → **Git**
2. Scroll down to **"Preview Deployments"**
3. Change from **"All branches"** to **"Only build production branch"**
4. Click **Save**

**Result:**
- ✅ Only `main` branch will trigger builds
- ✅ No more preview deployments for feature branches
- ✅ Saves build minutes and costs
- ✅ Your git branches stay intact (you can still use them locally)

## What Happens to Your Git Branches?

**Nothing!** Your git branches are separate from Vercel deployments:
- Git branches = Code in your repository (stays)
- Vercel deployments = Built/compiled versions of your app (can be deleted)

You can:
- Keep all your git branches
- Use them locally for development
- Merge them when ready
- They just won't trigger Vercel builds anymore (saving you money)

## Recommended Action Plan

**Right Now:**
1. Go to Vercel → Settings → Git → Preview Deployments
2. Set to **"Only build production branch"**
3. This stops all future preview builds

**Optional Cleanup:**
1. Go to Deployments tab
2. Delete old preview deployments (they're just taking up space)
3. Keep the `main` branch deployment

**Your Git Branches:**
- Keep them in git (they're useful for development)
- They just won't trigger Vercel builds anymore
- You can delete git branches later if you want, but it's not necessary

## Summary

- **Vercel Preview Deployments:** Safe to delete (they're just built versions)
- **Vercel Production Deployment (main):** Keep this - it's your live site
- **Git Branches:** Keep them - they're your code history and useful for development
- **Best Solution:** Disable preview deployments in settings to prevent future builds
