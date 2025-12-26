# EchoFlux.ai - Pre-Production Testing Checklist

**Status:** Ready for Testing Phase  
**Last Updated:** January 2025  
**Purpose:** Comprehensive checklist to ensure app is production-ready before user testing

---

## 🚨 CRITICAL - Must Complete Before Testing

### 1. Environment Variables & API Keys

#### Required for Core Functionality
- [ ] **GEMINI_API_KEY** or **GOOGLE_API_KEY**
  - ✅ Verify in Vercel production environment
  - ✅ Test AI caption generation works
  - ✅ Test strategy generation works
  - [ ] Check API quota/limits
  - [ ] Monitor usage during testing

#### Firebase Configuration (Backend)
- [ ] **FIREBASE_SERVICE_ACCOUNT_KEY_BASE64**
  - ✅ Verify encoded correctly (base64)
  - ✅ Test Firestore reads/writes
  - ✅ Test Storage uploads
  - [ ] Verify service account has correct permissions
  - [ ] Check Firebase project quotas

#### Firebase Configuration (Frontend)
- [ ] **VITE_FIREBASE_API_KEY**
- [ ] **VITE_FIREBASE_AUTH_DOMAIN**
- [ ] **VITE_FIREBASE_PROJECT_ID**
- [ ] **VITE_FIREBASE_STORAGE_BUCKET**
- [ ] **VITE_FIREBASE_MESSAGING_SENDER_ID** (optional)
- [ ] **VITE_FIREBASE_APP_ID** (optional)
  - ✅ Verify all loaded in browser console
  - ✅ Test authentication (sign up/login)
  - ✅ Test Firestore client reads
  - ✅ Test Storage uploads from browser

#### Stripe Payment Integration
- [ ] **STRIPE_SECRET_KEY_LIVE** (production)
- [ ] **STRIPE_SECRET_KEY_Test** (if using test mode)
- [ ] **STRIPE_WEBHOOK_SECRET**
- [ ] **STRIPE_USE_TEST_MODE** (set to false for production)
- [ ] **STRIPE_PRICE_PRO_MONTHLY_LIVE**
- [ ] **STRIPE_PRICE_PRO_ANNUALLY_LIVE**
- [ ] **STRIPE_PRICE_ELITE_MONTHLY_LIVE**
- [ ] **STRIPE_PRICE_ELITE_ANNUALLY_LIVE**
  - ✅ Test Pro monthly checkout ($29)
  - ✅ Test Pro annual checkout ($276/year)
  - ✅ Test Elite monthly checkout ($59)
  - ✅ Test Elite annual checkout ($564/year)
  - ✅ Verify webhook receives events
  - ✅ Verify plan upgrades work correctly
  - ✅ Test payment failures handled gracefully
  - [ ] Verify refund process (if needed)

#### Tavily API (Pro/Elite Trend Research)
- [ ] **TAVILY_API_KEY**
  - ✅ Test trend search in Strategy (Pro/Elite)
  - ✅ Test Voice Assistant web search (Elite)
  - [ ] Monitor usage limits (16/month Pro, 40/month Elite)
  - [ ] Verify usage tracking works

#### Optional APIs (Currently Disabled in UI)
- [ ] **OPENAI_API_KEY** (for future image generation)
- [ ] **REPLICATE_API_TOKEN** (for future video generation)

---

### 2. Firebase Setup & Configuration

#### Firestore Database
- [ ] **Security Rules Configured**
  - ✅ Review `firestore.rules`
  - ✅ Test authenticated user access
  - ✅ Test plan-based feature access
  - ✅ Test admin-only collections
  - [ ] Verify rules prevent unauthorized access
  - [ ] Test with different user plans (Free, Pro, Elite)

- [ ] **Firestore Indexes**
  - ✅ Review `firestore.indexes.json`
  - ✅ Verify indexes deployed
  - [ ] Test queries that require indexes
  - [ ] Monitor for missing index errors

#### Firebase Storage
- [ ] **Storage Rules Configured**
  - ✅ Test file uploads work
  - ✅ Test file size limits enforced (by plan)
  - ✅ Test file type validation
  - [ ] Verify users can only access their own files
  - [ ] Test storage quota limits (100 MB Free, 5 GB Pro, 10 GB Elite)

#### Firebase Authentication
- [ ] **Auth Methods Enabled**
  - ✅ Email/Password enabled
  - ✅ OAuth providers configured (optional for offline mode)
  - [ ] Test sign up flow
  - [ ] Test login flow
  - [ ] Test password reset (if implemented)
  - [ ] Test email verification (if required)

---

### 3. Stripe Payment Setup

#### Price IDs Configuration
- [ ] **All Price IDs Set in Vercel**
  - [ ] Pro Monthly: `STRIPE_PRICE_PRO_MONTHLY_LIVE`
  - [ ] Pro Annual: `STRIPE_PRICE_PRO_ANNUALLY_LIVE`
  - [ ] Elite Monthly: `STRIPE_PRICE_ELITE_MONTHLY_LIVE`
  - [ ] Elite Annual: `STRIPE_PRICE_ELITE_ANNUALLY_LIVE`
  - [ ] Verify prices match: $29/$276 (Pro), $59/$564 (Elite)

#### Webhook Configuration
- [ ] **Stripe Webhook Endpoint**
  - ✅ URL: `https://engagesuite.ai/api/stripeWebhook`
  - ✅ Events enabled:
    - `checkout.session.completed`
    - `customer.subscription.updated`
    - `customer.subscription.deleted`
    - `invoice.payment_succeeded`
    - `invoice.payment_failed`
  - ✅ Verify webhook secret matches `STRIPE_WEBHOOK_SECRET`
  - [ ] Test webhook receives events
  - [ ] Test webhook updates user plans correctly

#### Payment Flow Testing
- [ ] **Free Plan**
  - [ ] Sign up → Select Free → Complete onboarding
  - [ ] Verify Free plan features accessible
  - [ ] Verify paid features blocked

- [ ] **Pro Plan (Monthly)**
  - [ ] Select Pro → Monthly → Stripe checkout
  - [ ] Complete payment with test card
  - [ ] Verify redirect back to app
  - [ ] Verify onboarding starts for Pro
  - [ ] Verify Pro plan features accessible
  - [ ] Verify webhook updates plan in Firestore

- [ ] **Pro Plan (Annual)**
  - [ ] Select Pro → Annual → Stripe checkout
  - [ ] Verify amount due today shows $276
  - [ ] Complete payment
  - [ ] Verify plan activates correctly

- [ ] **Elite Plan (Monthly)**
  - [ ] Select Elite → Monthly → Stripe checkout
  - [ ] Complete payment
  - [ ] Verify OnlyFans Studio accessible
  - [ ] Verify Elite plan features accessible

- [ ] **Elite Plan (Annual)**
  - [ ] Select Elite → Annual → Stripe checkout
  - [ ] Verify amount due today shows $564
  - [ ] Complete payment
  - [ ] Verify plan activates correctly

- [ ] **Edge Cases**
  - [ ] Test payment cancellation
  - [ ] Test failed payment handling
  - [ ] Test subscription renewal
  - [ ] Test plan downgrade (Elite → Pro → Free)

---

### 4. Core Feature Testing

#### User Onboarding Flow
- [ ] **Sign Up**
  - [ ] Email/password sign up works
  - [ ] Validation errors display correctly
  - [ ] Account created in Firebase Auth
  - [ ] User document created in Firestore

- [ ] **Plan Selection**
  - [ ] Plan selector modal displays
  - [ ] All 3 plans shown (Free, Pro, Elite)
  - [ ] Billing cycle toggle works (monthly/annual)
  - [ ] Annual pricing shows correctly (20% discount)
  - [ ] Free plan → Direct onboarding
  - [ ] Paid plan → Stripe checkout → Onboarding

- [ ] **Onboarding Modal**
  - [ ] All steps complete correctly
  - [ ] Free plan: 3 steps (niche, audience, goal)
  - [ ] Pro plan: All steps + features overview
  - [ ] Elite plan: All steps + OnlyFans Studio details
  - [ ] Modal scrollable on mobile/iPad
  - [ ] "Next" buttons work correctly
  - [ ] Onboarding data saved to user profile

#### Dashboard
- [ ] **Loads Correctly**
  - [ ] Dashboard displays for all plans
  - [ ] "AI Content Studio mode" banner shows
  - [ ] Today's Planning Snapshot loads
  - [ ] Quick actions work (Strategy, Compose, Calendar)

#### AI Content Strategist
- [ ] **Free Plan**
  - [ ] Basic strategy generation works
  - [ ] Uses weekly trends only (no Tavily)
  - [ ] 1 strategy per month limit enforced
  - [ ] Upgrade prompt shows when limit reached

- [ ] **Pro Plan**
  - [ ] Strategy generation with Tavily research works
  - [ ] 2 strategies per month limit enforced
  - [ ] Advanced options available

- [ ] **Elite Plan**
  - [ ] Enhanced strategy generation works
  - [ ] 5 strategies per month limit enforced
  - [ ] Advanced options + OnlyFans Studio integration

- [ ] **Strategy Features**
  - [ ] Generate multi-week roadmap
  - [ ] Save strategy
  - [ ] Load saved strategies
  - [ ] Update strategy status
  - [ ] Upload media to posts
  - [ ] Generate captions from strategy
  - [ ] Add to calendar

#### Compose (Caption Generation)
- [ ] **Free Plan**
  - [ ] 10 captions per month limit enforced
  - [ ] Platform selection works
  - [ ] Captions generated correctly
  - [ ] Upgrade prompt when limit reached

- [ ] **Pro Plan**
  - [ ] 500 captions per month limit enforced
  - [ ] All platforms available
  - [ ] Platform-optimized captions work

- [ ] **Elite Plan**
  - [ ] 1,500 captions per month limit enforced
  - [ ] All features available

- [ ] **Content Gap Analysis**
  - [ ] "Analyze Content Gaps" button works
  - [ ] Analysis runs correctly
  - [ ] Results saved to history
  - [ ] History shared between Dashboard and Compose
  - [ ] View and manage history items

#### Calendar
- [ ] **Displays Correctly**
  - [ ] Month/week/day views work
  - [ ] Posts from Strategy appear
  - [ ] Posts from Compose appear
  - [ ] Drag-and-drop works (if implemented)
  - [ ] Click to edit content works
  - [ ] Visual organization correct

#### Media Library
- [ ] **Upload Works**
  - [ ] Image uploads work
  - [ ] Video uploads work (if enabled)
  - [ ] File size limits enforced
  - [ ] File type validation works
  - [ ] Storage quota tracked correctly

- [ ] **Organization**
  - [ ] Folders work (if implemented)
  - [ ] Search/filter works
  - [ ] Delete works
  - [ ] Link to posts works

- [ ] **Storage Limits**
  - [ ] Free: 100 MB limit enforced
  - [ ] Pro: 5 GB limit tracked
  - [ ] Elite: 10 GB limit tracked
  - [ ] Upgrade prompts when limit reached

#### Link-in-Bio Builder
- [ ] **Free Plan**
  - [ ] 1 link limit enforced
  - [ ] Builder works correctly
  - [ ] Mobile preview correct

- [ ] **Pro Plan**
  - [ ] 5 links limit enforced
  - [ ] All builder features work

- [ ] **Elite Plan**
  - [ ] Unlimited links work
  - [ ] All features available

#### OnlyFans Studio (Elite Only)
- [ ] **Content Brain**
  - [ ] AI Captions tab works
  - [ ] "Analyze Content Gaps" works (OnlyFans-specific)
  - [ ] "Predict Performance" works
  - [ ] "Repurpose Content" works
  - [ ] History section works
  - [ ] History separate from main app

- [ ] **Studio Calendar**
  - [ ] Calendar loads correctly
  - [ ] OnlyFans content scheduled correctly

- [ ] **Media Vault**
  - [ ] Media uploads work
  - [ ] Organization works

- [ ] **Export Hub**
  - [ ] Export functionality works
  - [ ] Content packages download correctly

- [ ] **Access Control**
  - [ ] OnlyFans Studio hidden for Free/Pro
  - [ ] OnlyFans Studio accessible for Elite
  - [ ] Plan upgrade grants access immediately

---

### 5. Admin Features Testing

#### Admin Dashboard Access
- [ ] **Admin Authentication**
  - [ ] Admin role check works
  - [ ] Non-admins cannot access admin dashboard
  - [ ] Admin user set up correctly in Firestore

#### Admin Dashboard Tabs
- [ ] **Overview Tab**
  - [ ] Total users count displays
  - [ ] Simulated MRR calculates correctly
  - [ ] New users (30 days) accurate
  - [ ] Plan distribution chart works
  - [ ] Top users by generations displays
  - [ ] Recent activity feed loads

- [ ] **Users Tab**
  - [ ] User list loads
  - [ ] Search functionality works
  - [ ] Edit user details works
  - [ ] Change user plan works
  - [ ] View usage statistics works
  - [ ] Grant referral rewards works

- [ ] **Referral Rewards Tab**
  - [ ] Configure rewards works
  - [ ] Manual reward granting works

- [ ] **Announcements Tab**
  - [ ] Create announcement works
  - [ ] Edit announcement works
  - [ ] Delete announcement works
  - [ ] Activate/deactivate works
  - [ ] Public banner toggle works
  - [ ] Banner display works
  - [ ] Plan targeting works
  - [ ] User ID targeting works
  - [ ] Date scheduling works (Starts At/Ends At)
  - [ ] Bulk grant rewards works
  - [ ] Promo cohort grants work

#### Announcements System
- [ ] **Public Banners**
  - [ ] Display on landing page for non-users
  - [ ] Dismissible banners work
  - [ ] Dismiss state persists per browser

- [ ] **In-App Banners**
  - [ ] Display for logged-in users
  - [ ] Plan targeting works
  - [ ] Dismissible banners work
  - [ ] Action buttons work

- [ ] **Reminders Dropdown**
  - [ ] Announcements appear in reminders
  - [ ] Usage alerts appear (Free/Pro/Elite)
  - [ ] Bell icon visibility correct

---

### 6. Security & Authentication

#### Authentication Security
- [ ] **Auth Token Verification**
  - [ ] All protected API endpoints verify tokens
  - [ ] Invalid tokens rejected
  - [ ] Expired tokens rejected
  - [ ] Token refresh works

- [ ] **Plan-Based Access Control**
  - [ ] Free plan features accessible
  - [ ] Pro plan features blocked for Free
  - [ ] Elite plan features blocked for Free/Pro
  - [ ] OnlyFans Studio blocked for Free/Pro
  - [ ] Usage limits enforced on backend

#### Firestore Security Rules
- [ ] **User Data Access**
  - [ ] Users can only read/write their own data
  - [ ] Plan-based collections protected
  - [ ] Admin-only collections protected
  - [ ] Announcements readable by all authenticated users
  - [ ] Announcements writable only by admins

#### Input Validation
- [ ] **API Endpoints**
  - [ ] All inputs validated
  - [ ] SQL injection prevention (if applicable)
  - [ ] XSS prevention
  - [ ] File upload validation
  - [ ] Size limits enforced

---

### 7. Error Handling & User Experience

#### Error Messages
- [ ] **User-Friendly Errors**
  - [ ] API errors display helpful messages
  - [ ] Network errors handled gracefully
  - [ ] Loading states show during async operations
  - [ ] Toast notifications work correctly

#### Edge Cases
- [ ] **Network Issues**
  - [ ] Offline handling works
  - [ ] Retry logic works
  - [ ] Error boundaries catch React errors

- [ ] **Rate Limits**
  - [ ] Usage limit reached messages clear
  - [ ] Upgrade prompts appear correctly
  - [ ] Limits reset correctly monthly

- [ ] **Empty States**
  - [ ] Empty media library displays correctly
  - [ ] No strategies message shows
  - [ ] Empty calendar displays correctly

---

### 8. Browser & Device Testing

#### Desktop Browsers
- [ ] **Chrome** (latest)
  - [ ] All features work
  - [ ] Dark mode works
  - [ ] Responsive design correct

- [ ] **Firefox** (latest)
  - [ ] All features work
  - [ ] Dark mode works

- [ ] **Safari** (latest)
  - [ ] All features work
  - [ ] Dark mode works

- [ ] **Edge** (latest)
  - [ ] All features work
  - [ ] Dark mode works

#### Mobile Devices
- [ ] **iOS Safari** (iPhone)
  - [ ] All features work
  - [ ] Responsive design correct
  - [ ] Touch interactions work
  - [ ] Dark scrollbars work (from recent fix)

- [ ] **Chrome Mobile** (Android)
  - [ ] All features work
  - [ ] Responsive design correct
  - [ ] Touch interactions work

#### Tablet Devices
- [ ] **iPad Safari**
  - [ ] All features work
  - [ ] Responsive design correct
  - [ ] Dark scrollbars work
  - [ ] Modal scrolling works

- [ ] **Android Tablet**
  - [ ] All features work
  - [ ] Responsive design correct

#### Responsive Design
- [ ] **Breakpoints Tested**
  - [ ] Mobile (< 640px)
  - [ ] Tablet (640px - 1024px)
  - [ ] Desktop (> 1024px)
  - [ ] Sidebar collapse works on mobile
  - [ ] Header responsive

---

### 9. Performance Testing

#### Load Times
- [ ] **Initial Load**
  - [ ] First contentful paint < 2s
  - [ ] Time to interactive < 5s
  - [ ] Bundle size reasonable

- [ ] **Feature Load Times**
  - [ ] Strategy generation < 30s
  - [ ] Caption generation < 10s
  - [ ] Media uploads reasonable
  - [ ] Calendar loads quickly

#### API Performance
- [ ] **Response Times**
  - [ ] API endpoints respond < 5s
  - [ ] Error responses quick
  - [ ] Retry logic works

#### Optimization
- [ ] **Code Splitting**
  - [ ] Lazy loading works
  - [ ] Bundle sizes optimized

- [ ] **Images/Media**
  - [ ] Images optimized
  - [ ] Lazy loading works
  - [ ] Storage efficient

---

### 10. Content & Copy Review

#### Legal Pages
- [ ] **Terms of Service**
  - [ ] Updated for offline mode
  - [ ] Age requirements clear
  - [ ] Plan descriptions accurate

- [ ] **Privacy Policy**
  - [ ] Data collection clear
  - [ ] GDPR/CCPA compliant
  - [ ] Cookie policy included

- [ ] **Data Deletion**
  - [ ] Process clear
  - [ ] Functionality works

#### UI Copy
- [ ] **Onboarding**
  - [ ] All copy accurate
  - [ ] Plan-specific messaging correct
  - [ ] OnlyFans Studio details clear

- [ ] **Feature Descriptions**
  - [ ] Accurate for offline mode
  - [ ] No promises of auto-posting
  - [ ] Manual workflow clear

- [ ] **Error Messages**
  - [ ] User-friendly
  - [ ] Actionable
  - [ ] Consistent tone

---

### 11. Monitoring & Analytics Setup

#### Error Tracking (Recommended)
- [ ] **Sentry or Similar**
  - [ ] Error tracking configured
  - [ ] Source maps uploaded
  - [ ] Alerts configured
  - [ ] Error grouping works

#### Analytics (Recommended)
- [ ] **Google Analytics or Similar**
  - [ ] Tracking configured
  - [ ] Events tracked (sign ups, upgrades, feature usage)
  - [ ] Conversion funnels set up

#### Logging
- [ ] **Vercel Logs**
  - [ ] API logs accessible
  - [ ] Error logs monitored
  - [ ] Usage logs reviewed

#### Usage Monitoring
- [ ] **AI Usage**
  - [ ] Gemini API usage tracked
  - [ ] Cost monitoring set up
  - [ ] Alerts for high usage

- [ ] **Firebase Usage**
  - [ ] Firestore reads/writes monitored
  - [ ] Storage usage tracked
  - [ ] Quota alerts set up

---

### 12. Backup & Recovery

#### Data Backup
- [ ] **Firestore Backup**
  - [ ] Automated backups configured (if available)
  - [ ] Backup strategy documented
  - [ ] Recovery process tested

#### Disaster Recovery
- [ ] **Recovery Plan**
  - [ ] Process documented
  - [ ] Recovery tested (if possible)

---

### 13. Final Pre-Testing Checklist

#### Before Opening to Test Users
- [ ] **All Critical Items Complete**
  - [ ] Environment variables set
  - [ ] Stripe payments tested
  - [ ] All features tested on Free/Pro/Elite
  - [ ] Browser compatibility verified
  - [ ] Mobile responsiveness verified

- [ ] **Admin Access**
  - [ ] Admin user created
  - [ ] Admin dashboard accessible
  - [ ] Announcements system tested

- [ ] **Documentation**
  - [ ] User guides ready (if needed)
  - [ ] Support email/contact set up
  - [ ] FAQ page reviewed

- [ ] **Support Prepared**
  - [ ] Support email monitored
  - [ ] Common issues documented
  - [ ] Response process ready

---

## Testing Workflow Recommendation

### Phase 1: Internal Testing (You/Team)
1. Complete all Critical items (Section 1-6)
2. Test all core features (Section 4)
3. Verify security (Section 6)
4. Fix critical bugs

### Phase 2: Limited Beta (5-10 users)
1. Invite small group
2. Monitor for issues
3. Gather feedback
4. Fix issues

### Phase 3: Open Testing (Public)
1. Announce testing phase
2. Monitor usage
3. Collect feedback
4. Iterate

---

## Quick Start Testing Order

**Day 1-2: Setup**
- Environment variables
- Firebase configuration
- Stripe setup

**Day 3-4: Core Features**
- Authentication
- Plan selection & payments
- Strategy generation
- Caption generation

**Day 5-6: Additional Features**
- Calendar
- Media Library
- OnlyFans Studio
- Admin features

**Day 7: Polish**
- Browser testing
- Mobile testing
- Error handling
- Content review

---

## Emergency Rollback Plan

If critical issues found:
1. **Immediate:** Set maintenance mode (already implemented)
2. **Revert:** Use `git revert` for recent commits
3. **Redeploy:** `vercel --prod` after fixes

**Safe Commit Points:**
- Current baseline: `d5380e2` (annual pricing fix)
- Previous: `14edf6d` (cohort grants)
- Previous: `6c09d80` (scrollbar fix)

---

**Document Version:** 1.0  
**Status:** Ready for Testing  
**Next Steps:** Complete Critical items, then proceed to Phase 1 testing
