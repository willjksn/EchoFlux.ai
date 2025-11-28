# Business Starter Plan - Feature Analysis

## 📋 Currently Advertised Features (from Pricing page)
Based on `components/Pricing.tsx`, Business Starter lists:
- ✅ 3 Social Accounts
- ✅ 1,000 AI Replies / month
- ✅ AI Marketing Manager
- ✅ Business Analytics
- ✅ Social CRM & Lead Gen

---

## 🔍 Current Implementation Status

### ✅ **Available Features** (Currently Working)

1. **Dashboard** - ✓ Always available
2. **Compose** - ✓ Available (plan !== 'Free')
   - **Captions**: ✓ Full access (1,000/month limit)
   - **Image Generation**: ✗ Shows upgrade prompt (Growth/Agency only)
   - **Video Generation**: ✗ Shows upgrade prompt (Growth/Agency only)
3. **Marketing Manager (Autopilot)** - ✓ Available (all Business plans)
4. **Strategy (AI Content Strategist)** - ✓ Available (plan !== 'Free')
5. **Calendar** - ✓ Available (plan !== 'Free')
6. **Link in Bio** - ✓ Available (plan !== 'Free')
7. **Automation** - ✓ Available (plan !== 'Free')
8. **Analytics** - ✓ Available (plan !== 'Free')
   - **Overview Tab**: ✓ Available
   - **Social Listening Tab**: ✗ Currently requires Pro/Elite/Agency
   - **Competitor Analysis Tab**: ✗ Currently requires Pro/Elite/Agency

### ❌ **Missing/Restricted Features** (Need Discussion)

1. **Opportunities/Trends** - ✗ Currently requires Pro/Elite/Agency
   - Pricing page mentions "Business Analytics" - does this include trends?

2. **Social CRM** - ⚠️ Mentioned in pricing but access unclear
   - Currently seems to work for all paid plans
   - Need to verify if Starter has full CRM access

3. **Approvals** - ✗ Currently Elite/Agency only
   - Not advertised for Starter, so likely correct

4. **Team Management** - ✗ Agency only
   - Not advertised for Starter, so likely correct

5. **Clients** - ✗ Agency only
   - Not advertised for Starter, so likely correct

---

## ❓ **Questions to Clarify**

### 1. **Analytics Tabs**
- Should Starter have:
  - ✅ Overview/Basic Analytics? (Currently: YES)
  - ❓ Social Listening? (Currently: NO - requires Pro/Elite/Agency)
  - ❓ Competitor Analysis? (Currently: NO - requires Pro/Elite/Agency)

**Suggestion**: Starter should have Overview only. Social Listening & Competitor Analysis should be Growth/Agency features.

---

### 2. **Opportunities/Trends**
- Currently: Requires Pro/Elite/Agency
- Pricing says: "Business Analytics" (unclear if this includes trends)

**Suggestion**: Starter should have basic trend detection. Advanced trend analysis for Growth/Agency.

---

### 3. **Social CRM**
- Currently: Works for all paid plans
- Pricing says: "Social CRM & Lead Gen" is included

**Suggestion**: ✅ Starter should have full CRM access (currently working correctly).

---

### 4. **Image/Video Generation**
- Currently: Shows upgrade prompt (Growth/Agency only)
- Pricing: Not mentioned for Starter

**Suggestion**: ✅ Correct - Starter should NOT have Image/Video (as currently implemented).

---

### 5. **Caption Generation Limits**
- Currently: 1,000/month (matches pricing page)
- ✅ This is correct.

---

## 🎯 **Recommended Starter Feature Set**

### **Core Features (Included):**
- ✅ Dashboard
- ✅ Compose (Captions only - 1,000/month)
- ✅ AI Marketing Manager
- ✅ AI Content Strategist
- ✅ Calendar
- ✅ Link in Bio
- ✅ Automation
- ✅ Analytics (Overview/Basic Analytics only)
- ✅ Social CRM & Lead Gen
- ✅ Opportunities/Trends (basic trend detection)

### **Excluded Features (Upgrade to Growth/Agency):**
- ❌ Image Generation
- ❌ Video Generation
- ❌ Social Listening (Analytics tab)
- ❌ Competitor Analysis (Analytics tab)
- ❌ Approvals Workflow
- ❌ Team Management
- ❌ Client Management

---

## 🔧 **Changes Needed**

1. **Analytics Component**: Update to restrict Social Listening & Competitor Analysis tabs for Starter
2. **Opportunities Component**: Update to allow Starter Business users (currently Pro/Elite/Agency only)
3. **Verify Social CRM**: Confirm it's working for Starter (should be ✅)

