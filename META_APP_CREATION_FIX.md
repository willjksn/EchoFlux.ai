# Fix: Meta Horizon Store Popup Issue

If you're seeing a popup asking about "Meta Horizon Store" or "Link PC VR" when trying to create an app, here's how to fix it:

## Problem
Meta's developer portal is showing VR app creation options, but you need a regular Meta App for Instagram/Facebook OAuth.

## Solution Options

### Option 1: Close the Popup and Look for "Other" or "Consumer"

1. **Close or cancel** the popup (don't select Horizon Store or Link PC VR)
2. Look for these options:
   - **"Other"** or **"None of these"**
   - **"Consumer"** app type
   - **"Business"** app type
3. Select one of these (Consumer is preferred for Instagram/Facebook)

### Option 2: Use Direct App Creation Link

1. Go directly to this URL:
   ```
   https://developers.facebook.com/apps/creation/
   ```
2. You should see app type options - choose **"Consumer"**

### Option 3: Add Product to Existing App

If you already have a Meta app (even if it's a different type):

1. Go to **"My Apps"** in the Meta Developer Dashboard
2. Select an existing app (or create one using Option 1 or 2)
3. Once in the app dashboard, go to **"Add Products"**
4. Look for **"Instagram Basic Display"** and click **"Set Up"**

### Option 4: Navigate Through Settings

1. In the Meta Developer Dashboard, go to **Settings → Basic**
2. You can configure your app type here
3. Make sure it's set to **"Consumer"** or **"Business"**

## What You Need

For Instagram/Facebook OAuth, you need:
- ✅ **Consumer** app type OR
- ✅ **Business** app type
- ❌ **NOT** Meta Horizon Store
- ❌ **NOT** Link PC VR
- ❌ **NOT** Gaming app

## If You Still Can't Find It

1. Try using an incognito/private browser window
2. Make sure you're logged into the correct Meta/Facebook developer account
3. Check if you have multiple Meta developer accounts - you might be in the wrong one
4. Try accessing: https://developers.facebook.com/apps/ and see if you can create from there

## Once You Have the Right App Type

After successfully creating a Consumer/Business app, continue with the rest of the setup guide:
- Add Instagram Basic Display product
- Configure redirect URIs
- Add testers
- Get your App ID and App Secret
