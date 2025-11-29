# Analytics Backend Integration - Testing Guide

## What Was Changed

1. **New API Endpoint**: `api/getAnalytics.ts`
   - Aggregates real data from Firestore (posts, messages)
   - Calculates metrics like response rate, follower growth, sentiment
   - Supports date ranges (7d, 30d, 90d) and platform filtering

2. **Service Function**: Added `getAnalytics()` to `src/services/geminiService.ts`
   - Calls the new API endpoint with authentication

3. **Component Update**: Updated `components/Analytics.tsx`
   - Now fetches real data instead of using mock/empty data
   - Added error handling with user-friendly messages

## Testing Checklist

### Prerequisites
- ✅ Make sure you're logged in (required for API authentication)
- ✅ Have some test data: posts, messages in Firestore (or use existing data)

### Test Steps

1. **Navigate to Analytics Page**
   - Go to the Analytics page in the sidebar
   - Should see loading skeleton briefly

2. **Verify Data Loading**
   - Check browser console for any errors
   - Analytics should load with real data from your Firestore

3. **Test Date Range Filter**
   - Try switching between 7d, 30d, 90d
   - Data should refresh based on the selected range

4. **Test Platform Filter**
   - Select different platforms or "All"
   - Metrics should filter accordingly

5. **Test Error Handling**
   - Check what happens with no data (empty collections)
   - Should show empty state gracefully

### What to Look For

**Success Indicators:**
- ✅ Analytics page loads without errors
- ✅ Real data appears in charts and metrics
- ✅ Response rate, follower growth, sentiment data shows up
- ✅ Date/platform filters work

**Potential Issues:**
- ❌ 401 Unauthorized errors → Check authentication
- ❌ 500 Server errors → Check Firestore permissions
- ❌ Empty data → Normal if no posts/messages exist yet
- ❌ Date filtering issues → Check Firestore Timestamp format

### Console Commands to Check

Open browser DevTools Console and look for:
- `Failed to fetch analytics:` → API error
- `Analytics: User not authenticated` → Auth issue
- Any 401/500 errors in Network tab

### Next Steps After Testing

Once verified working:
1. Connect Dashboard metrics to real data
2. Add social media stats aggregation
3. Implement actual post publishing

---

## Debug Information

If you see errors, check:
1. **Authentication**: User must be logged in
2. **Firestore Rules**: Must allow read access to `users/{userId}/posts` and `users/{userId}/messages`
3. **API Route**: `/api/getAnalytics` should be accessible
4. **Environment**: Firebase Admin SDK credentials must be configured

