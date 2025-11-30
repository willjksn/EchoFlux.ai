# Environment Variables Setup Guide

This guide explains how to set environment variables for both **local development** and **Vercel deployment**.

---

## 📁 Local Development Setup

### Step 1: Create `.env.local` file

Create a file named `.env.local` in the **root directory** of your project (same level as `package.json`).

**Important:** Never commit `.env.local` to git - it should be in `.gitignore` (it should already be there).

### Step 2: Add your environment variables

Copy this template into your `.env.local` file and fill in your actual values:

```env
# ============================================
# AI / Gemini API
# ============================================
GEMINI_API_KEY=your_gemini_api_key_here
# OR use GOOGLE_API_KEY (either works)
# GOOGLE_API_KEY=your_google_api_key_here

# ============================================
# Image Generation (OpenAI DALL-E 3)
# ============================================
OPENAI_API_KEY=your_openai_api_key_here

# ============================================
# Video Generation (Replicate)
# ============================================
REPLICATE_API_TOKEN=your_replicate_api_token_here

# ============================================
# Firebase (Backend - Admin SDK)
# ============================================
# This should be your Firebase service account JSON converted to base64
# See instructions below for how to convert
FIREBASE_SERVICE_ACCOUNT_KEY_BASE64=your_base64_encoded_service_account_json_here

# ============================================
# Firebase (Frontend - Client SDK)
# ============================================
# Note: Frontend vars must start with VITE_ prefix
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# ============================================
# Twitter/X OAuth
# ============================================
TWITTER_CLIENT_ID=your_twitter_client_id
TWITTER_CLIENT_SECRET=your_twitter_client_secret
# Alternative naming (either works):
# X_CLIENT_ID=your_twitter_client_id
# X_CLIENT_SECRET=your_twitter_client_secret

# ============================================
# Instagram OAuth
# ============================================
INSTAGRAM_CLIENT_ID=your_instagram_client_id
INSTAGRAM_CLIENT_SECRET=your_instagram_client_secret
```

---

## 🔧 How to Get Each Variable

### 1. **GEMINI_API_KEY** (Google AI Studio)
1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Click "Create API Key"
3. Copy the key and paste it into `.env.local`

### 2. **FIREBASE_SERVICE_ACCOUNT_KEY_BASE64**
This is your Firebase Admin SDK service account key, encoded as base64.

**Step A: Get Service Account JSON**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click the gear icon ⚙️ > Project Settings
4. Go to "Service accounts" tab
5. Click "Generate new private key"
6. Save the JSON file (e.g., `service-account.json`)

**Step B: Convert to Base64**
**On Windows (PowerShell):**
```powershell
$content = Get-Content -Path "service-account.json" -Raw
$bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
$base64 = [System.Convert]::ToBase64String($bytes)
$base64 | Out-File -FilePath "service-account-base64.txt"
```

**On Mac/Linux:**
```bash
base64 -i service-account.json -o service-account-base64.txt
```

Then copy the entire base64 string (it will be very long, all on one line) into `.env.local`:
```
FIREBASE_SERVICE_ACCOUNT_KEY_BASE64=<paste entire base64 string here>
```

### 3. **Firebase Frontend Variables (VITE_* prefix)**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click the gear icon ⚙️ > Project Settings
4. Scroll down to "Your apps" section
5. If you don't have a web app, click "Add app" > Web (</>) icon
6. Copy the `firebaseConfig` values and use them for the VITE_* variables

### 4. **TWITTER_CLIENT_ID & TWITTER_CLIENT_SECRET**
1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal)
2. Create a project/app
3. Go to your app's "Keys and tokens" section
4. Copy the "Client ID" and "Client Secret"
5. Add them to `.env.local`

### 5. **INSTAGRAM_CLIENT_ID & INSTAGRAM_CLIENT_SECRET**
1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create an app
3. Add Instagram Basic Display product
4. Go to "Basic Display" settings
5. Copy "App ID" (Client ID) and "App Secret" (Client Secret)
6. Add them to `.env.local`

---

## ☁️ Vercel Deployment Setup

### Step 1: Go to Vercel Dashboard
1. Visit [vercel.com](https://vercel.com) and log in
2. Select your project

### Step 2: Add Environment Variables
1. Click on your project
2. Go to **Settings** tab
3. Click **Environment Variables** in the sidebar
4. Add each variable:

**For Production Environment:**
- Click "Add New"
- Enter the variable name (e.g., `GEMINI_API_KEY`)
- Enter the value
- Select **Production** (and optionally Development/Preview)
- Click "Save"
- Repeat for all variables

### Step 3: Redeploy
After adding variables, you need to redeploy:
1. Go to **Deployments** tab
2. Click the "⋯" menu on the latest deployment
3. Click **Redeploy**
4. Or push a new commit to trigger automatic redeployment

---

## ✅ Quick Checklist

**Required for Basic Functionality:**
- [ ] `GEMINI_API_KEY` (or `GOOGLE_API_KEY`)
- [ ] `FIREBASE_SERVICE_ACCOUNT_KEY_BASE64`
- [ ] `VITE_FIREBASE_API_KEY`
- [ ] `VITE_FIREBASE_AUTH_DOMAIN`
- [ ] `VITE_FIREBASE_PROJECT_ID`
- [ ] `VITE_FIREBASE_STORAGE_BUCKET`

**Required for OAuth Features:**
- [ ] `TWITTER_CLIENT_ID` & `TWITTER_CLIENT_SECRET` (for Twitter/X)
- [ ] `INSTAGRAM_CLIENT_ID` & `INSTAGRAM_CLIENT_SECRET` (for Instagram)

**Optional but Recommended:**
- [ ] `VITE_FIREBASE_MESSAGING_SENDER_ID`
- [ ] `VITE_FIREBASE_APP_ID`
- [ ] `VITE_FIREBASE_MEASUREMENT_ID` (for Analytics)

---

## 🔍 Verify Environment Variables are Loaded

### Local Development
After adding variables to `.env.local`:
1. **Restart your dev server** (`npm run dev`)
2. Environment variables are automatically loaded by Vite

### Check if variables are loaded:
Add a temporary log in your code:
```typescript
// In any API route file
console.log('GEMINI_API_KEY loaded:', !!process.env.GEMINI_API_KEY);
```

---

## ⚠️ Important Notes

1. **Never commit `.env.local`** - It should be in `.gitignore`
2. **Frontend variables must have `VITE_` prefix** - Only these are exposed to the browser
3. **Backend variables** (in `api/` folder) use `process.env.*` directly
4. **Restart server after changes** - Environment variables are loaded at startup
5. **Vercel secrets** - For sensitive data, consider using Vercel's secrets feature

---

## 🐛 Troubleshooting

**"Missing GEMINI_API_KEY" error:**
- Check `.env.local` file exists in root directory
- Verify variable name is exactly `GEMINI_API_KEY` (case-sensitive)
- Restart dev server after adding variables

**"Missing FIREBASE_SERVICE_ACCOUNT_KEY_BASE64" error:**
- Verify the base64 string is complete (should be very long)
- Check for any line breaks or spaces
- Make sure it's all on one line

**Variables not working in Vercel:**
- Make sure you selected the correct environment (Production/Preview/Development)
- Redeploy after adding variables
- Check variable names match exactly (case-sensitive)

**Frontend variables not working:**
- Must start with `VITE_` prefix
- Restart dev server
- Check browser console for errors

---

## 📝 Example `.env.local` File Structure

```env
# AI Services
GEMINI_API_KEY=AIzaSyC...

# Firebase Backend (Base64 encoded service account)
FIREBASE_SERVICE_ACCOUNT_KEY_BASE64=ewogICJ0eXBlIjoic2VydmljZV9hY2NvdW50IiwKICAicHJvamVjdF9pZCI6InlvdXItcHJvamVjdC1pZCIsCiAg...

# Firebase Frontend
VITE_FIREBASE_API_KEY=AIzaSyD...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com

# OAuth
TWITTER_CLIENT_ID=your_client_id
TWITTER_CLIENT_SECRET=your_client_secret
INSTAGRAM_CLIENT_ID=your_instagram_id
INSTAGRAM_CLIENT_SECRET=your_instagram_secret
```

---

## 🔐 Security Best Practices

1. ✅ **Use `.env.local` for local development** (already in `.gitignore`)
2. ✅ **Never commit secrets to git**
3. ✅ **Use Vercel Environment Variables for production**
4. ✅ **Rotate keys periodically**
5. ✅ **Use different keys for development and production**
6. ✅ **Limit API key permissions** (scopes/roles) to minimum required

---

Need help? Check the error logs or verify each variable is set correctly!

