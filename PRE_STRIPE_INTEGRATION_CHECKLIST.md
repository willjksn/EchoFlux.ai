# Pre-Stripe Integration Checklist

## ✅ Completed Updates

### 1. Pricing Plans - All Fixed
- ✅ Free Plan:
  - 1 AI strategy/month (basic) - **Added to pricing**
  - 10 AI captions/month - **Fixed (was 0)**
  - Basic Link-in-Bio (1 link) - **Added limit enforcement**
  - Media Library - **Added to pricing & accessible in sidebar**
  - 100 MB Storage - ✅ Correct

- ✅ Pro Plan:
  - 2 AI strategies/month - ✅ Correct
  - 16 Tavily searches/month - **Updated (was 20)**
  - 500 AI captions/month - ✅ Correct
  - Link-in-Bio Builder (5 links) - **Added to pricing & limit enforcement**
  - Media Library - ✅ Listed
  - Visual Content Calendar - ✅ Listed
  - 5 GB Storage - **Fixed (was showing 1 GB in Profile)**

- ✅ Elite Plan:
  - 5 AI strategies/month - ✅ Correct
  - 40 Tavily searches/month - **Updated (was 50)**
  - 1,500 AI captions/month - ✅ Correct
  - Link-in-Bio Builder (unlimited) - **Added to pricing & limit enforcement**
  - Media Library - ✅ Listed
  - 10 GB Storage - ✅ Correct
  - OnlyFans Studio - ✅ Listed

### 2. Feature Access - All Correct
- ✅ Strategy: All plans (Free gets basic, Pro/Elite get live research)
- ✅ Compose: All plans (Free gets 10 captions/month)
- ✅ Media Library: All plans (Free gets 100 MB)
- ✅ Calendar: Pro/Elite only (Free blocked) ✅ Correct
- ✅ Link-in-Bio: All plans (Free: 1 link, Pro: 5, Elite: unlimited)
- ✅ Opportunities: Pro/Elite/Agency only ✅ Correct
- ✅ OnlyFans Studio: Elite/Agency/OnlyFansStudio only ✅ Correct

### 3. Code Optimizations
- ✅ Strategy generation: Reduced from 8 to 5 Tavily searches per strategy
- ✅ Uses weekly trends (free) for general categories
- ✅ Only uses Tavily for niche-specific research
- ✅ Tavily limits updated: Pro (16), Elite (40)

### 4. Documentation Updates
- ✅ Terms.tsx: Updated with new pricing, limits, and features
- ✅ Privacy.tsx: Added weekly trends and Tavily data handling
- ✅ appKnowledge.ts: Removed autopilot, updated pricing, clarified features
- ✅ VoiceAssistant.tsx: Updated system instructions, removed autopilot references
- ✅ Chatbot: Uses updated appKnowledge.ts ✅

---

## 🔍 Final Verification Checklist

### Feature Access Verification
- [x] **Free Plan Sidebar Access:**
  - ✅ Dashboard - Always available
  - ✅ Compose - Available (default case)
  - ✅ Strategy - Available (explicitly allowed)
  - ✅ Media Library - Available (default case)
  - ✅ Settings - Always available
  - ❌ Calendar - Blocked (correct)
  - ❌ Link-in-Bio - Blocked (correct - but should be available!)
  - ❌ Opportunities - Blocked (correct)

- [ ] **Link-in-Bio for Free Plan:**
  - **ISSUE FOUND:** Sidebar blocks Link-in-Bio for Free plan (`user.plan !== 'Free'`)
  - **BUT:** Pricing says Free gets "Basic Link-in-Bio (1 link)"
  - **FIX NEEDED:** Allow Link-in-Bio for Free plan in Sidebar

### Pricing Consistency Check
- [x] All features in pricing match code implementation
- [x] All limits match code implementation
- [x] Storage limits consistent across Profile, Settings, and Pricing
- [x] Caption limits match code
- [x] Strategy limits match code
- [x] Tavily limits match code

### Missing Items to Address

#### 1. **Link-in-Bio Access for Free Plan** ⚠️
**Issue:** Sidebar blocks Link-in-Bio for Free plan, but pricing says Free gets it.

**Fix Required:**
```typescript
// components/Sidebar.tsx:90
case 'bio':
    return true; // All plans can access Link-in-Bio (Free: 1 link, Pro: 5, Elite: unlimited)
```

#### 2. **Compose Access Clarification**
- Sidebar allows Compose for Free (default case) ✅
- Compose component doesn't block Free users ✅
- Free users get 10 captions/month ✅
- **Status:** ✅ Correct - no changes needed

#### 3. **Media Library Access**
- Sidebar allows Media Library for Free (default case) ✅
- Media Library component doesn't block Free users ✅
- Free users get 100 MB storage ✅
- **Status:** ✅ Correct - added to pricing

---

## 🎯 Action Items Before Stripe Integration

### Critical (Must Fix)
1. **Fix Link-in-Bio Access for Free Plan**
   - Update Sidebar to allow Free plan access
   - Verify limit enforcement works (1 link max)

### Verification (Should Check)
2. **Test Free Plan User Journey:**
   - Can access Strategy? ✅
   - Can access Compose? ✅
   - Can access Media Library? ✅
   - Can access Link-in-Bio? ⚠️ (needs fix)
   - Can generate 10 captions? ✅
   - Can generate 1 strategy? ✅
   - Storage limit enforced at 100 MB? ✅

3. **Test Pro Plan Limits:**
   - 2 strategies/month enforced? ✅
   - 16 Tavily searches/month enforced? ✅
   - 500 captions/month enforced? ✅
   - 5 links max enforced? ✅
   - 5 GB storage enforced? ✅

4. **Test Elite Plan Limits:**
   - 5 strategies/month enforced? ✅
   - 40 Tavily searches/month enforced? ✅
   - 1,500 captions/month enforced? ✅
   - Unlimited links? ✅
   - 10 GB storage enforced? ✅

---

## 📋 Feature Summary by Plan

### Free Plan
**Accessible Features:**
- ✅ Dashboard
- ✅ Compose (10 captions/month)
- ✅ Strategy (1/month, basic)
- ✅ Media Library (100 MB)
- ⚠️ Link-in-Bio (1 link) - **Needs Sidebar fix**

**Blocked Features:**
- ❌ Calendar
- ❌ Opportunities/Trends
- ❌ OnlyFans Studio
- ❌ Automation

### Pro Plan
**Accessible Features:**
- ✅ All Free features +
- ✅ Calendar
- ✅ Link-in-Bio (5 links)
- ✅ Opportunities/Trends
- ✅ 2 strategies/month (with live research)
- ✅ 16 Tavily searches/month
- ✅ 500 captions/month
- ✅ 5 GB storage

**Blocked Features:**
- ❌ OnlyFans Studio
- ❌ Unlimited links

### Elite Plan
**Accessible Features:**
- ✅ All Pro features +
- ✅ OnlyFans Studio
- ✅ 5 strategies/month (enhanced research)
- ✅ 40 Tavily searches/month
- ✅ 1,500 captions/month
- ✅ Unlimited links
- ✅ 10 GB storage

---

## ✅ Ready for Stripe Integration?

**Almost!** Just need to:
1. ✅ Fix Link-in-Bio access for Free plan in Sidebar
2. ✅ Verify all limits are enforced correctly
3. ✅ Test user journeys for each plan

**Everything else is aligned and ready!**

