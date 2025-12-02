# Ad Generator Testing Guide

## ✅ Setup Complete

The Ad Generator is fully connected and ready for testing:

### Frontend Components
- ✅ `components/AdGenerator.tsx` - Main UI component
- ✅ Added to `App.tsx` routing (`case 'ads'`)
- ✅ Added to sidebar navigation
- ✅ Service function in `src/services/geminiService.ts`

### Backend API
- ✅ `api/generateAd.ts` - API endpoint
- ✅ Plan-based access control
- ✅ Usage tracking
- ✅ Error handling

### Features
- ✅ Text ad generation
- ✅ Video ad prompt generation
- ✅ Plan-based limits
- ✅ Conditional options (sexy tones for Creators/Agency)
- ✅ "Increase Followers/Fans" goal for Creators/Agency

---

## 🧪 Testing Steps

### 1. Access the Feature
1. Open your app in the browser
2. Look for **"Ad Generator"** in the sidebar (between "Strategy" and "Opportunities")
3. Click on it

### 2. Test Text Ad Generation

**For Creators/Agency:**
1. Select **"Text Ad"** tab
2. Fill in:
   - Product/Service: "Fitness App"
   - Target Audience: "Fitness enthusiasts aged 25-40"
   - Campaign Goal: Select "Increase Followers/Fans"
   - Platform: "Instagram"
   - Tone: Try "Sexy/Bold" or "Sexy/Explicit"
   - Call to Action: "Download Now"
3. Click **"Generate Text Ad"**
4. Verify results appear in the right panel

**For Business (Starter/Growth):**
1. Select **"Text Ad"** tab
2. Fill in:
   - Product/Service: "Consulting Services"
   - Target Audience: "Small business owners"
   - Campaign Goal: Select "Brand Awareness" (no Followers/Fans option)
   - Platform: "LinkedIn"
   - Tone: Select "Professional" (no sexy options)
   - Call to Action: "Learn More"
3. Click **"Generate Text Ad"**
4. Verify results appear

### 3. Test Video Ad Generation

1. Select **"Video Ad"** tab
2. Fill in the same fields
3. Set duration (15-60 seconds)
4. Click **"Generate Video Ad"**
5. Verify video prompt and scene breakdown appear

### 4. Test Usage Limits

1. Check the usage counter at the top
2. Generate multiple ads
3. Verify counter decreases
4. When limit reached, verify error message appears

### 5. Test Copy Functionality

1. Generate an ad
2. Click "Copy" buttons next to each section
3. Verify text is copied to clipboard
4. Paste to verify content

---

## 🔍 What to Check

### Visual Checks
- [ ] "Ad Generator" appears in sidebar
- [ ] Form loads correctly
- [ ] Toggle between Text/Video works
- [ ] Results panel displays properly
- [ ] Copy buttons work

### Functional Checks
- [ ] API calls succeed (check browser Network tab)
- [ ] Results are formatted correctly
- [ ] Usage counter updates
- [ ] Error messages show when limit reached
- [ ] Conditional options show/hide correctly based on user type

### Conditional Features
- [ ] Creators see "Sexy/Bold" and "Sexy/Explicit" tones
- [ ] Creators see "Increase Followers/Fans" goal
- [ ] Business Starter/Growth DON'T see sexy tones
- [ ] Business Starter/Growth DON'T see Followers/Fans goal

---

## 🐛 Troubleshooting

### If "Ad Generator" doesn't appear in sidebar:
- Check browser console for errors
- Verify user plan (should be Pro, Elite, Growth, Starter, or Agency)
- Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

### If generation fails:
- Check browser console for API errors
- Verify `GEMINI_API_KEY` is set in environment variables
- Check Vercel function logs for errors

### If results don't appear:
- Check browser Network tab - look for `/api/generateAd` request
- Verify response status is 200
- Check response JSON structure

---

## 📝 Test Cases

### Test Case 1: Creator Text Ad
- **User Type:** Creator
- **Plan:** Pro
- **Goal:** Increase Followers/Fans
- **Tone:** Sexy/Bold
- **Expected:** Ad generated with provocative but tasteful copy

### Test Case 2: Business Text Ad
- **User Type:** Business
- **Plan:** Starter
- **Goal:** Brand Awareness
- **Tone:** Professional
- **Expected:** Professional ad copy, no sexy options available

### Test Case 3: Video Ad
- **User Type:** Creator
- **Plan:** Elite
- **Ad Type:** Video
- **Duration:** 30 seconds
- **Expected:** Video prompt with scene breakdown

### Test Case 4: Usage Limit
- **User Type:** Creator
- **Plan:** Pro (50 text ads/month)
- **Action:** Generate 51st ad
- **Expected:** Error message about limit reached

---

## 🚀 Ready to Test!

Everything is connected and ready. Just:
1. Open the app
2. Navigate to "Ad Generator" in sidebar
3. Start generating ads!

