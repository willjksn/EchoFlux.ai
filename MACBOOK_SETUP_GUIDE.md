# EchoFlux MacBook Pro Setup Guide

Complete step-by-step guide to set up EchoFlux on your MacBook Pro for local development and deployment.

---

## Prerequisites

### 1. Install Homebrew (if not already installed)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Install Node.js (v20.x)
```bash
brew install node@20
```

Or use `nvm` (Node Version Manager) for better version control:
```bash
brew install nvm
nvm install 20
nvm use 20
```

### 3. Install Git (if not already installed)
```bash
brew install git
```

### 4. Install Vercel CLI
```bash
npm install -g vercel
```

---

## Getting the Code

### Option A: Git Clone (Recommended)
If your code is in a Git repository (GitHub, GitLab, etc.):

```bash
cd ~
git clone <your-repo-url> echoflux
cd echoflux
```

**Replace `<your-repo-url>` with your actual repository URL.**

### Option B: Transfer Folder from Windows
If you need to copy the folder from your Windows machine:

1. **Using a USB drive or cloud storage:**
   - Copy the entire `engagesuite.ai` folder to your MacBook
   - Place it in `~/Documents/echoflux` or `~/Projects/echoflux`

2. **Using AirDrop (if both devices are nearby):**
   - Compress the folder on Windows (right-click → Send to → Compressed folder)
   - AirDrop the `.zip` file to your MacBook
   - Extract it: `unzip echoflux.zip -d ~/Documents/`

3. **Using Git (if you can push to a repo from Windows first):**
   - On Windows, commit and push to your Git repo
   - On MacBook, clone it (Option A above)

---

## Initial Setup

### 1. Navigate to Project Directory
```bash
cd ~/echoflux  # or wherever you placed the folder
```

### 2. Install Dependencies
```bash
npm install
```

This installs all required packages (React, Firebase, Stripe, Vercel, etc.) as defined in `package.json`.

---

## Environment Variables Setup

### 1. Login to Vercel
```bash
vercel login
```

Follow the prompts to authenticate with your Vercel account.

### 2. Link Your Vercel Project
```bash
vercel link
```

When prompted:
- **Set up and deploy?** → **No**
- **Which scope?** → Select your account/team
- **Link to existing project?** → **Yes**
- **What’s the name of your existing project?** → `engagesuite-ai` (or your project name)

This creates a `.vercel` folder with your project link (already in `.gitignore`).

### 3. Pull Environment Variables
```bash
vercel env pull .env.local
```

This downloads all environment variables from Vercel into a local `.env.local` file.

**⚠️ Important:** `.env.local` is already in `.gitignore`, so it won't be committed to Git.

### 4. Verify Environment Variables
```bash
cat .env.local
```

You should see variables like:
- `VITE_FIREBASE_API_KEY=...`
- `VITE_FIREBASE_AUTH_DOMAIN=...`
- `VITE_FIREBASE_PROJECT_ID=...`
- `VITE_FIREBASE_STORAGE_BUCKET=...`
- `TAVILY_API_KEY=...`
- `GEMINI_API_KEY=...`
- `STRIPE_SECRET_KEY=...`
- `FIREBASE_SERVICE_ACCOUNT_KEY=...`
- etc.

**If any variables are missing:**
- Check Vercel Dashboard → Your Project → Settings → Environment Variables
- Add missing variables there, then run `vercel env pull .env.local` again

---

## Firebase Setup (Optional for Local Development)

If you want to test Firebase Admin operations locally (not required for basic development):

### 1. Install Firebase CLI
```bash
npm install -g firebase-tools
```

### 2. Login to Firebase
```bash
firebase login
```

### 3. Initialize Firebase (if needed)
```bash
firebase init
```

**Note:** Most Firebase operations (Auth, Firestore, Storage) work directly with your production Firebase project via the environment variables you already pulled. You typically don't need to set up a separate local Firebase project.

---

## Running Locally

### 1. Start Development Server
```bash
npm run dev
```

Or use Vercel's local dev server (recommended for API routes):
```bash
npm run dev:vercel
```

This starts the app at `http://localhost:5173` (Vite default) or the port Vercel assigns.

### 2. Open in Browser
Open `http://localhost:5173` in your browser.

You should see the EchoFlux app running locally with:
- ✅ Authentication (via Firebase)
- ✅ Database access (Firestore)
- ✅ Storage (Firebase Storage)
- ✅ API routes (via Vercel dev server)

---

## Building for Production

### Build Locally (Test)
```bash
npm run build
```

This creates a `dist` folder with production-ready files.

### Preview Production Build
```bash
npm run preview
```

Opens the production build locally to test before deploying.

---

## Deploying to Vercel

### Deploy to Production
```bash
vercel --prod --yes
```

Or deploy to preview (staging):
```bash
vercel --yes
```

**Note:** This uses the same command as your Windows machine. The deployment goes to your existing Vercel project, so it will update the live site.

---

## Troubleshooting

### Issue: `npm install` fails
**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Issue: `vercel env pull` fails
**Solution:**
```bash
# Make sure you're logged in and linked
vercel login
vercel link

# Try pulling again
vercel env pull .env.local
```

### Issue: Firebase authentication doesn't work locally
**Solution:**
- Check that `VITE_FIREBASE_*` variables are in `.env.local`
- Make sure your Firebase project allows `localhost` as an authorized domain
- Go to Firebase Console → Authentication → Settings → Authorized domains → Add `localhost`

### Issue: API routes return errors
**Solution:**
- Use `npm run dev:vercel` instead of `npm run dev` (Vercel dev server handles API routes)
- Check that server-side env vars (like `TAVILY_API_KEY`, `STRIPE_SECRET_KEY`) are in Vercel Dashboard → Environment Variables (not just `.env.local`)

### Issue: Port already in use
**Solution:**
```bash
# Find what's using the port (e.g., 5173)
lsof -i :5173

# Kill the process
kill -9 <PID>

# Or specify a different port
npm run dev -- --port 3000
```

---

## Daily Workflow

### Starting Work
```bash
cd ~/echoflux
npm run dev:vercel  # Start local development server
```

### Making Changes
- Edit files in your code editor
- Changes auto-reload in the browser (hot module replacement)

### Deploying Changes
```bash
# Commit changes
git add .
git commit -m "Your commit message"
git push

# Deploy to production
vercel --prod --yes
```

---

## Project Structure Overview

```
echoflux/
├── api/              # Serverless API routes (Vercel functions)
├── components/       # React components
├── src/              # Source utilities and services
├── public/           # Static assets
├── firebaseConfig.ts # Firebase client config
├── firestore.rules   # Firestore security rules
├── vercel.json       # Vercel configuration (cron jobs, etc.)
├── package.json      # Dependencies and scripts
└── .env.local        # Environment variables (local only, not in Git)
```

---

## Environment Variables Reference

### Required for Local Development
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

### Required for API Routes (Vercel)
- `TAVILY_API_KEY`
- `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- `STRIPE_SECRET_KEY`
- `FIREBASE_SERVICE_ACCOUNT_KEY` (or base64 variant)
- `CRON_SECRET` (for weekly trends job)
- `SENTRY_DSN` (optional, for error tracking)

---

## Next Steps

1. ✅ **Test local development**: Run `npm run dev:vercel` and verify everything works
2. ✅ **Make a test change**: Edit a component and see it hot-reload
3. ✅ **Deploy a test**: Run `vercel --yes` to deploy to preview URL
4. ✅ **Verify production**: Deploy with `vercel --prod --yes` and check your live site

---

## Additional Resources

- **Vercel Docs**: https://vercel.com/docs
- **Firebase Docs**: https://firebase.google.com/docs
- **Vite Docs**: https://vitejs.dev
- **React Docs**: https://react.dev

---

## Quick Reference Commands

```bash
# Start development
npm run dev:vercel

# Build for production
npm run build

# Deploy to production
vercel --prod --yes

# Pull latest env vars
vercel env pull .env.local

# Check Vercel project status
vercel ls

# View deployment logs
vercel logs <deployment-url>
```

---

**You're all set!** You can now develop and deploy EchoFlux from your MacBook Pro just like on Windows.


