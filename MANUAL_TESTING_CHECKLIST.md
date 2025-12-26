# Manual Testing Checklist

Use this checklist to test all critical features before opening to users.

## 🔐 Authentication & Onboarding

### Login
- [ ] **Test correct credentials** - Should log in successfully
- [ ] **Test wrong password** - Should show error: "Wrong email or password. Please check your credentials and try again."
- [ ] **Test wrong email** - Should show error: "Wrong email or password..."
- [ ] **Test invalid email format** - Should show error: "Invalid email address..."
- [ ] **Test empty fields** - Should prevent submission
- [ ] **Test Google sign-in** - Should work correctly
- [ ] **Test "Forgot password"** - Should send reset email

### Sign Up
- [ ] **Test new user signup** - Should create account and trigger onboarding
- [ ] **Test duplicate email** - Should show error: "This email is already registered..."
- [ ] **Test weak password** - Should show error about password strength
- [ ] **Test password mismatch** - Should show error: "Passwords do not match"
- [ ] **Test onboarding flow** - Should guide user through all steps

### Onboarding
- [ ] **Creator onboarding** - All 3 steps complete correctly
- [ ] **Business onboarding** - All 3 steps complete correctly
- [ ] **Onboarding data saves** - Niche/audience/business info persists
- [ ] **Skip onboarding** - Can't access app until onboarding complete

## 📝 Content Creation

### Compose Page
- [ ] **Create text post** - Can write caption and publish
- [ ] **Upload image** - Image uploads and displays correctly
- [ ] **Upload video** - Video uploads and displays correctly
- [ ] **Select multiple images** - Carousel post works
- [ ] **Select from media library** - Can select existing media
- [ ] **Generate caption** - AI caption generation works
- [ ] **Select platforms** - Can choose multiple platforms
- [ ] **Schedule post** - Can set date/time for scheduling
- [ ] **Publish immediately** - Post publishes to selected platforms
- [ ] **Save as draft** - Draft saves and appears in Approvals

### Strategy Page
- [ ] **Generate strategy** - AI strategy generation works
- [ ] **Select image from media library** - Single click selects image
- [ ] **Loading indicator** - Shows "Processing..." when selecting media
- [ ] **Upload media** - Can upload media to strategy items
- [ ] **Generate caption** - Caption generation works for strategy items
- [ ] **Add to calendar** - Creates single post (not multiple)
- [ ] **Save to draft** - Creates draft post correctly
- [ ] **Calendar date** - Uses selected date/time (not multiple dates)

### Media Library
- [ ] **Upload media** - Images and videos upload correctly
- [ ] **View media** - Can view uploaded media
- [ ] **Delete media** - Can delete media items
- [ ] **Organize in folders** - Can create folders and move items
- [ ] **Select for post** - Can select media for use in posts
- [ ] **No "Use in Post" hover** - Hover text removed (as requested)

## 📅 Calendar

### Calendar View
- [ ] **View scheduled posts** - All scheduled posts appear
- [ ] **View draft posts** - Draft posts appear on calendar
- [ ] **Mobile display** - Posts visible on mobile devices
- [ ] **Click post** - Can click to view/edit post details
- [ ] **Edit scheduled time** - Can change date/time
- [ ] **Delete post** - Can delete from calendar
- [ ] **Navigate months** - Previous/next month buttons work

### Calendar Scheduling
- [ ] **Schedule from compose** - Post appears on calendar
- [ ] **Schedule from strategy** - Creates single post at selected time
- [ ] **No duplicate posts** - Only one post created per action
- [ ] **Correct date/time** - Uses selected date, not calculated date

## 🤖 AI Features

### Caption Generation
- [ ] **Generate captions** - Works for images and videos
- [ ] **Multiple captions** - Can generate multiple options
- [ ] **Hashtags included** - Hashtags generated correctly
- [ ] **Platform-specific** - Hashtags match selected platforms
- [ ] **Tone customization** - Different tones produce different captions

### Strategy Generation
- [ ] **Generate strategy** - Creates multi-week content plan
- [ ] **Live trends** - Includes current trends (for Pro/Elite)
- [ ] **Save strategy** - Can save and reload strategies
- [ ] **Media suggestions** - Provides image/video ideas

### Image/Video Generation
- [ ] **Generate image** - AI image generation works
- [ ] **Generate video** - AI video generation works
- [ ] **Save to media library** - Generated media saves correctly

## 📱 Mobile Testing

### Responsive Design
- [ ] **Mobile layout** - All pages display correctly on mobile
- [ ] **Calendar on mobile** - Posts visible and clickable
- [ ] **Media library on mobile** - Can select media
- [ ] **Compose on mobile** - Can create posts
- [ ] **Navigation** - Sidebar/menu works on mobile
- [ ] **Touch interactions** - Buttons and inputs work correctly

## 🌐 Cross-Browser Testing

Test in:
- [ ] **Chrome** - All features work
- [ ] **Firefox** - All features work
- [ ] **Safari** - All features work
- [ ] **Edge** - All features work
- [ ] **Mobile Safari** - All features work
- [ ] **Mobile Chrome** - All features work

## 🔒 Security Testing

### Input Validation
- [ ] **XSS attempts** - Script tags are sanitized
- [ ] **SQL injection** - No SQL queries (Firestore only)
- [ ] **File upload** - Only allowed file types accepted
- [ ] **File size limits** - Large files rejected
- [ ] **URL validation** - Invalid URLs rejected

### Authentication
- [ ] **Protected routes** - Can't access without login
- [ ] **Session timeout** - Session expires correctly
- [ ] **Token refresh** - Auth tokens refresh properly

## ⚠️ Error Scenarios

### Network Errors
- [ ] **Offline mode** - App handles offline gracefully
- [ ] **Slow connection** - Loading states show correctly
- [ ] **API failures** - Error messages display correctly

### User Errors
- [ ] **Invalid inputs** - Clear error messages shown
- [ ] **Missing required fields** - Validation prevents submission
- [ ] **Rate limiting** - Too many requests show appropriate message

## 📊 Analytics & Data

### Dashboard
- [ ] **Stats load** - Analytics data displays
- [ ] **Charts render** - Visualizations work correctly
- [ ] **Data accuracy** - Numbers are correct

### Social Media Integration
- [ ] **Connect accounts** - OAuth flows work
- [ ] **Disconnect accounts** - Can disconnect platforms
- [ ] **Publish to platforms** - Posts publish successfully
- [ ] **Inbox sync** - Messages load correctly

## 🎨 UI/UX

### Navigation
- [ ] **Page transitions** - Smooth navigation between pages
- [ ] **Breadcrumbs** - Can navigate back easily
- [ ] **Sidebar** - All links work correctly

### Loading States
- [ ] **Loading indicators** - Show during async operations
- [ ] **Skeleton screens** - Show while data loads
- [ ] **Progress bars** - Show for long operations

### Error Messages
- [ ] **Clear messages** - Errors are user-friendly
- [ ] **Actionable** - Errors suggest solutions
- [ ] **Not technical** - No stack traces shown to users

## 📄 Legal Pages

- [ ] **Terms of Service** - Page loads and displays correctly
- [ ] **Privacy Policy** - Page loads and displays correctly
- [ ] **Links work** - All links in footer/navigation work
- [ ] **Content complete** - All sections have content

## 💰 Pricing

- [ ] **Plans display** - All tiers shown correctly
- [ ] **Billing toggle** - Monthly/Annual switch works
- [ ] **Current plan** - User's plan highlighted
- [ ] **Upgrade flow** - Can navigate to payment

## ✅ Final Checks

- [ ] **No console errors** - Browser console is clean
- [ ] **No 404s** - All routes work
- [ ] **No broken images** - All images load
- [ ] **Performance** - Pages load quickly
- [ ] **Accessibility** - Keyboard navigation works

---

## 🐛 Bug Reporting Template

When you find issues, document them:

```
**Page/Feature**: [e.g., Strategy Page]
**Steps to Reproduce**:
1. 
2. 
3. 

**Expected Behavior**: 
**Actual Behavior**: 
**Browser/Device**: 
**Screenshot** (if applicable):
```

---

**Testing Priority**: Focus on Authentication, Onboarding, Compose, Strategy, and Calendar first - these are the core user flows.

