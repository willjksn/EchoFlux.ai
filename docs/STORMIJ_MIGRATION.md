# Stormij to Echoflux Migration Guide

This guide walks you through migrating data from Stormijxo.com to Echoflux.

## Overview

The migration copies data from Stormij's Firebase to Echoflux's Firebase:
- **Posts** (feed content)
- **Treats** (store products)
- **Members** (subscribers)
- **Purchases** (transaction history)
- **Conversations** (DMs with all messages)
- **Site Config** (colors, settings)

**Important:** This is a ONE-WAY READ-ONLY migration. Stormij's data is NOT modified or deleted.

---

## Prerequisites

1. **Node.js** installed (v18+)
2. **Firebase Admin access** to both projects
3. **Service account JSON files** for both Firebase projects

---

## Step 1: Get Firebase Service Accounts

### Stormij Service Account

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select the **Stormij** project
3. Click ⚙️ **Project Settings** → **Service Accounts**
4. Click **"Generate new private key"**
5. Save the file as `stormij-service-account.json`
6. Move it to `c:\Projects\engagesuite.ai\scripts\`

### Echoflux Service Account

1. In Firebase Console, select the **Echoflux** project
2. Click ⚙️ **Project Settings** → **Service Accounts**
3. Click **"Generate new private key"**
4. Save the file as `echoflux-service-account.json`
5. Move it to `c:\Projects\engagesuite.ai\scripts\`

---

## Step 2: Get Your Echoflux Creator ID

The Creator ID is the Firebase Auth UID of your wife's account in Echoflux.

**Option A: From Firebase Console**
1. Go to Echoflux project → **Authentication** → **Users**
2. Find her email
3. Copy the **User UID** (e.g., `abc123xyz...`)

**Option B: From the App**
1. Log in as her account
2. Open browser DevTools (F12) → Console
3. Type: `firebase.auth().currentUser.uid`
4. Copy the result

---

## Step 3: Run the Migration (Dry Run First)

Open a terminal in the project folder:

```bash
cd c:\Projects\engagesuite.ai
```

### Install Dependencies (if needed)

```bash
npm install firebase-admin
npm install -D ts-node
```

### Dry Run (Preview Only)

This shows what would be migrated WITHOUT actually writing anything:

```bash
npx ts-node scripts/migrate-stormij.ts --dry-run --creator-id=YOUR_CREATOR_ID
```

Replace `YOUR_CREATOR_ID` with the UID from Step 2.

**Example output:**
```
╔════════════════════════════════════════════════════════════════╗
║         STORMIJ → ECHOFLUX MIGRATION SCRIPT                    ║
╚════════════════════════════════════════════════════════════════╝

🔍 DRY RUN MODE - No data will be written

Creator ID: abc123xyz...
Handle: stormijxo
Collections: posts, treats, members, purchases, conversations, site_config

✓ Connected to both Firebase projects

📝 Migrating Posts...
   Found 47 posts in Stormij
   [DRY RUN] Would migrate posts to fanPosts collection

🎁 Migrating Treats...
   Found 10 treats in Stormij
   [DRY RUN] Would migrate treats to products collection
...
```

---

## Step 4: Run the Actual Migration

Once you're satisfied with the dry run:

```bash
npx ts-node scripts/migrate-stormij.ts --creator-id=YOUR_CREATOR_ID
```

This will copy all data to Echoflux.

---

## Step 5: Verify the Migration

### Check Firebase Console

1. Go to Echoflux project → **Firestore Database**
2. Verify these collections have data:
   - `creators/{creatorId}/fanPosts`
   - `creators/{creatorId}/fans`
   - `creators/{creatorId}/conversations`
   - `products`
   - `purchases`

### Test the Page

1. Go to `http://localhost:3000/stormijxo` (local dev)
2. Or `https://echoflux.ai/stormijxo` (production)
3. Verify:
   - Landing page loads with correct colors
   - Feed shows migrated posts
   - Treats store shows products

---

## Step 6: Upload Images

The migration copies data but **NOT image files**. Images stay hosted where they are (Stormij's Firebase Storage). However, you should upload fresh versions through the Page Builder:

1. Go to **Fan Hub** → **My Page**
2. Upload:
   - **Avatar** (profile pic for feed posts)
   - **Logo** (header logo)
   - **Hero Image** (landing page portrait)
3. Click **Save Changes**

**Note:** Existing post images will continue to work because they're served from Stormij's storage URLs.

---

## Step 7: Domain Setup (Later)

When you're ready to point stormijxo.com to Echoflux:

### Option A: Keep Both Running
- stormijxo.com → Stormij (original)
- echoflux.ai/stormijxo → Echoflux (new)

### Option B: Redirect Domain
1. In your DNS provider, add a CNAME record:
   - Name: `stormijxo.com`
   - Value: `echoflux.ai` (or your Vercel domain)
2. In Vercel, add the custom domain
3. Configure the app to recognize stormijxo.com → stormijxo handle

---

## Troubleshooting

### "Service account not found"
Make sure the JSON files are in `scripts/` folder:
- `scripts/stormij-service-account.json`
- `scripts/echoflux-service-account.json`

### "Permission denied"
Your service account needs Firestore read access (Stormij) and write access (Echoflux).

### "No creator ID specified"
Pass the creator ID as an argument:
```bash
npx ts-node scripts/migrate-stormij.ts --creator-id=abc123xyz
```

### Posts not showing
1. Check the collection path: `creators/{creatorId}/fanPosts`
2. Verify the `creatorId` matches what the app expects
3. Check the `status` field is `"published"`

### Images broken
Post images reference Stormij's storage URLs. These will work as long as:
1. Stormij's Firebase project stays active
2. Storage rules allow public read

For permanent migration, you'd need to copy the storage files too (not included in this script).

---

## Migrate Specific Collections Only

To migrate only certain data:

```bash
# Only posts and treats
npx ts-node scripts/migrate-stormij.ts --creator-id=abc123 --collection=posts,treats

# Only conversations
npx ts-node scripts/migrate-stormij.ts --creator-id=abc123 --collection=conversations
```

Available collections:
- `posts`
- `treats`
- `members`
- `purchases`
- `conversations`
- `site_config`

---

## What Gets Migrated

| Stormij Collection | Echoflux Location | Notes |
|-------------------|-------------------|-------|
| `posts` | `creators/{id}/fanPosts` | All fields preserved |
| `treats` | `products` | Price converted to cents |
| `members` | `creators/{id}/fans` | Subscriber list |
| `purchases` | `purchases` | Transaction history |
| `conversations` | `creators/{id}/conversations` | Includes all messages |
| `site_config/content` | `creators/{id}` | Storefront settings |

---

## Rollback

If something goes wrong, the migrated data in Echoflux can be deleted without affecting Stormij:

```bash
# In Firebase Console → Echoflux → Firestore
# Delete: creators/{creatorId} and its subcollections
```

Stormijxo.com will continue working normally since it uses its own database.

---

## Support

- Check the migration script output for specific errors
- Review Firebase Console for data verification
- The script adds `migratedFrom: 'stormij'` to all migrated docs for tracking
