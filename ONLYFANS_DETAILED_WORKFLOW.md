# OnlyFans Detailed Workflow - Complete User Guide

## Overview

**OnlyFans is a Manual Workflow Platform** - EchoFlux.ai provides all content creation, planning, and organization tools, but users manually upload content to OnlyFans (no API connection).

---

## Key Points

### ✅ What EchoFlux Provides
- AI captions optimized for OnlyFans
- Content planning and calendars
- Media organization
- **One-click export packages** (ZIP downloads)
- Reminders for scheduled uploads
- Workflow guides

### ❌ What EchoFlux Does NOT Provide
- **No OAuth connection** - OnlyFans cannot be "connected" like other platforms
- **No automatic posting** - All uploads are manual
- **No inbox/messaging** - No API access for DMs
- **No analytics** - No API access for stats

---

## Complete Workflow: From Creation to Upload

### Step 1: Create Content in EchoFlux

1. **Go to Compose Page**
   - Click "Compose" in sidebar
   - Select "OnlyFans" as platform
   - See "Manual Workflow" badge/tooltip

2. **Upload Media**
   - Drag & drop or click to upload images/videos
   - Media is stored securely in Firebase
   - Supports: JPG, PNG, MP4, MOV

3. **Generate AI Caption**
   - Click "Generate Caption" button
   - AI creates OnlyFans-optimized caption:
     - Creator-focused and personal
     - Sales-oriented (promotes exclusivity)
     - Engaging and authentic
     - Includes relevant hashtags
   - User can edit/refine caption

4. **Add to Calendar (Optional)**
   - Set scheduled date/time
   - This creates a **reminder** (not auto-post)
   - Calendar shows "Manual Upload" badge

---

### Step 2: Export Package (One-Click)

1. **Click "Export for OnlyFans" Button**
   - Located in Compose page (when OnlyFans is selected)
   - Also available in Calendar (click on scheduled post)

2. **Package Generation**
   - EchoFlux creates a ZIP file containing:
     ```
     onlyfans-export-{postId}-{timestamp}.zip
     ├── media/
     │   ├── image-1.jpg
     │   ├── image-2.jpg
     │   └── video-1.mp4
     ├── caption.txt
     ├── hashtags.txt
     ├── metadata.json
     └── README.txt
     ```

3. **Download Starts Automatically**
   - Browser downloads ZIP file
   - File saved to Downloads folder
   - Success toast: "Export package downloaded!"

---

### Step 3: Extract & Prepare

1. **Extract ZIP File**
   - Navigate to Downloads folder
   - Right-click ZIP → "Extract All"
   - Creates folder with all files

2. **Review Contents**
   - **media/** folder: All images/videos (ready to upload)
   - **caption.txt**: Copy this text for OnlyFans caption
   - **hashtags.txt**: Copy hashtags if needed
   - **metadata.json**: Post info (optional reference)
   - **README.txt**: Quick instructions

---

### Step 4: Upload to OnlyFans (Manual)

1. **Log into OnlyFans**
   - Go to onlyfans.com
   - Log into your creator account

2. **Create New Post**
   - Click "Create Post" or "Add Media"
   - OnlyFans upload interface opens

3. **Upload Media Files**
   - Click "Upload" or drag files
   - Select all files from `media/` folder
   - Wait for upload to complete

4. **Add Caption**
   - Open `caption.txt` from exported package
   - Copy entire caption text
   - Paste into OnlyFans caption field

5. **Add Hashtags (Optional)**
   - Open `hashtags.txt`
   - Copy hashtags
   - Add to caption or tags field

6. **Set Price (If Paid Post)**
   - Choose "Free" or set price
   - Configure other post settings

7. **Publish**
   - Click "Publish" or "Post"
   - Content goes live on OnlyFans

---

### Step 5: Mark as Uploaded (Optional)

1. **Return to EchoFlux**
   - Go to Calendar or Compose
   - Find the post you just uploaded

2. **Mark as "Uploaded"**
   - Click on post
   - Toggle "Uploaded" status
   - This tracks what's been posted

---

## Export Package Details

### What's Included

#### 1. Media Files (`media/` folder)
- **All images/videos** from your post
- **Formatted and optimized** for OnlyFans
- **Original filenames** preserved (or renamed for clarity)
- **Ready to upload** - no conversion needed

#### 2. Caption (`caption.txt`)
```
Plain text file containing:
- Full caption text
- Formatted for easy copy/paste
- No special characters that might break
```

#### 3. Hashtags (`hashtags.txt`)
```
#hashtag1 #hashtag2 #hashtag3
Space-separated hashtags
Ready to copy/paste
```

#### 4. Metadata (`metadata.json`)
```json
{
  "postId": "abc123",
  "createdAt": "2025-01-15T10:00:00Z",
  "caption": "Full caption text...",
  "hashtags": ["#hashtag1", "#hashtag2"],
  "mediaFiles": [
    {
      "filename": "image-1.jpg",
      "type": "image",
      "size": 2048576
    }
  ],
  "scheduledDate": "2025-01-16T18:00:00Z",
  "platform": "OnlyFans"
}
```

#### 5. README (`README.txt`)
```
Step-by-step instructions:
1. Extract this ZIP file
2. Log into OnlyFans
3. Create new post
4. Upload media files
5. Copy/paste caption
6. Add hashtags
7. Publish

For detailed guide: [link to workflow guide]
```

---

## Calendar Integration

### How It Works

1. **Schedule Post**
   - User sets date/time in Calendar
   - Post appears on calendar with OnlyFans icon
   - Shows "Manual Upload" badge

2. **Reminder System**
   - **Push Notification**: "Time to upload your OnlyFans post!"
   - **Email Reminder**: Includes export link
   - **Calendar Alert**: Browser notification

3. **Export from Calendar**
   - Click on scheduled post
   - Click "Export for OnlyFans"
   - Download package
   - Upload to OnlyFans

4. **Mark as Uploaded**
   - After uploading, mark post as "Uploaded"
   - Calendar updates status
   - Tracks completion

---

## Quick Upload Process

### Is It Quick?

**Yes!** The export package makes it very quick:

1. **One Click** → Export package downloads
2. **Extract ZIP** → Takes 2 seconds
3. **Copy Caption** → Open `caption.txt`, copy all
4. **Upload to OnlyFans** → Drag media files, paste caption
5. **Publish** → Done!

**Total Time: ~2-3 minutes** (vs. 10-15 minutes manually creating captions, organizing files, etc.)

### What Makes It Fast

- ✅ **Pre-formatted caption** - No need to write/edit
- ✅ **Organized media** - All files in one folder
- ✅ **Hashtags ready** - Copy/paste, no research needed
- ✅ **No file conversion** - Media already optimized
- ✅ **Clear instructions** - README tells you exactly what to do

---

## Workflow Comparison

### Without EchoFlux (Traditional)
1. Create caption manually (5-10 min)
2. Research hashtags (3-5 min)
3. Organize media files (2-3 min)
4. Upload to OnlyFans (2-3 min)
5. Copy/paste caption (1 min)
6. **Total: 13-22 minutes**

### With EchoFlux (Export Package)
1. Generate AI caption (10 seconds)
2. Click "Export" (1 second)
3. Extract ZIP (2 seconds)
4. Upload to OnlyFans (2-3 min)
5. Copy/paste caption (10 seconds)
6. **Total: ~3-4 minutes**

**Time Saved: 10-18 minutes per post!**

---

## Reminder System

### Push Notifications

1. **Permission Request**
   - First time: Browser asks for notification permission
   - User grants permission

2. **Scheduled Reminders**
   - Set when post is scheduled
   - Notification appears at scheduled time
   - Click notification → Opens EchoFlux → Export package

### Email Reminders

1. **Automatic Emails**
   - Sent 1 hour before scheduled time
   - Includes:
     - Post preview
     - Direct export link
     - Quick instructions

2. **Email Content**
   ```
   Subject: Time to upload your OnlyFans post!
   
   Hi [Name],
   
   Your post is scheduled for [Time]:
   - Caption: [Preview]
   - Media: [Count] files
   
   [Export Package] ← Click to download
   
   Quick steps:
   1. Download package
   2. Extract ZIP
   3. Upload to OnlyFans
   ```

---

## Settings & Preferences

### OnlyFans Settings Page

1. **Reminder Preferences**
   - Enable/disable push notifications
   - Enable/disable email reminders
   - Set reminder time (1 hour before, 30 min before, etc.)

2. **Export Preferences**
   - Default file naming
   - Include/exclude metadata
   - ZIP compression level

3. **Workflow Guide**
   - Link to detailed instructions
   - Video tutorials
   - Best practices

---

## FAQ

### Q: Can I connect OnlyFans like other platforms?
**A:** No. OnlyFans has no official API, so we cannot connect it. We provide a manual workflow with export packages.

### Q: Will EchoFlux automatically post to OnlyFans?
**A:** No. All uploads are manual. We provide the content package, you upload it.

### Q: How long does the export take?
**A:** Instant! The ZIP file downloads immediately when you click "Export".

### Q: Can I schedule posts?
**A:** Yes, but it creates a **reminder**, not an auto-post. You'll get a notification to export and upload.

### Q: What if I need to edit the caption?
**A:** You can edit the caption in EchoFlux before exporting, or edit `caption.txt` after exporting.

### Q: Can I export multiple posts at once?
**A:** Yes! Select multiple posts in Calendar and click "Batch Export" (coming soon).

### Q: Is my content secure?
**A:** Yes! All media is stored in Firebase with encryption. Export packages are generated on-demand and not stored.

---

## Summary

**OnlyFans Workflow = Create → Export → Upload**

1. **Create** content in EchoFlux (AI captions, planning)
2. **Export** one-click package (ZIP with everything)
3. **Upload** manually to OnlyFans (2-3 minutes)

**Time Saved: 10-18 minutes per post**
**Compliance: 100% - No API violations**
**Value: Professional workflow without the risk**
