# How to Manually Grant Referral Rewards

## Overview

As an admin, you can manually grant referral rewards to any user. This is useful for:
- Special promotions
- Customer support compensation
- Beta tester rewards
- Contest winners
- Any other manual reward scenarios

## How to Grant Rewards

### Method 1: From User Management Modal

1. Go to **Admin Dashboard** → **Users** tab
2. Find the user you want to reward
3. Click **"Manage"** button next to the user
4. In the User Management Modal, click **"Grant Referral Reward"** button
5. Fill in the reward details:
   - **Reward Type**: Choose from:
     - Extra AI Generations
     - Free Month(s)
     - Storage Boost (GB)
   - **Amount**: Enter the quantity
   - **Reason** (Optional): Add a note explaining why (e.g., "Special promotion", "Customer support")
6. Click **"Grant Reward"**

### Method 2: Direct from Users Table

1. Go to **Admin Dashboard** → **Users** tab
2. Find the user you want to reward
3. Click **"Grant Reward"** button directly in the Actions column
4. Fill in the reward details and click **"Grant Reward"**

## Reward Types Explained

### 1. Extra AI Generations
- **What it does**: Reduces the user's monthly usage count (gives them free generations)
- **Example**: User has used 20/100 → Grant 50 → Now has -30/100 (effectively 70 remaining)
- **Best for**: Small rewards, encouraging content creation

### 2. Free Month(s)
- **What it does**: 
  - **Free users**: Upgrades to Pro plan for X months
  - **Paid users**: Extends current subscription by X months
- **Example**: Grant 1 month → User gets 1 free month added to their subscription
- **Best for**: Medium to large rewards, encouraging upgrades

### 3. Storage Boost
- **What it does**: Permanently increases the user's storage limit by X GB
- **Example**: Grant 5 GB → User's storage limit increases by 5 GB permanently
- **Best for**: Medium rewards, permanent value

## What Happens When You Grant a Reward

1. **Reward is applied immediately**:
   - Generations: Usage count reduced
   - Free Month: Subscription extended/upgraded
   - Storage: Limit increased

2. **Reward is tracked**:
   - Added to user's `manualReferralRewards` array in Firestore
   - Includes timestamp, admin ID, and reason
   - Can be viewed in user's document for audit purposes

3. **User is notified**:
   - Success message appears
   - User can see the reward in their account immediately

## Example Scenarios

### Scenario 1: Compensate for Bug
**Situation**: User reported a bug that caused them to lose 20 AI generations

**Action**: 
- Reward Type: Extra AI Generations
- Amount: 20
- Reason: "Compensation for bug report #123"

### Scenario 2: Beta Tester Reward
**Situation**: User helped test a new feature

**Action**:
- Reward Type: Free Month
- Amount: 1
- Reason: "Beta tester reward - Feature X testing"

### Scenario 3: Contest Winner
**Situation**: User won a social media contest

**Action**:
- Reward Type: Storage Boost
- Amount: 10
- Reason: "Contest winner - Instagram giveaway"

## Important Notes

- **Admin Only**: Only users with `role: "Admin"` can grant rewards
- **Immediate Effect**: Rewards are applied instantly, no approval needed
- **Audit Trail**: All manually granted rewards are logged with:
  - Timestamp
  - Admin user ID
  - Reason (if provided)
- **No Limits**: You can grant any amount of any reward type
- **Can't Undo**: Once granted, rewards cannot be automatically reversed (you'd need to manually adjust)

## Tracking Manual Rewards

To see all manually granted rewards for a user:
1. Check Firestore: `users/{userId}/manualReferralRewards` array
2. Each entry contains:
   ```javascript
   {
     rewardType: 'extra_generations',
     rewardAmount: 50,
     grantedAt: '2025-01-15T10:30:00Z',
     grantedBy: 'admin-user-id',
     reason: 'Special promotion'
   }
   ```

## Best Practices

1. **Always add a reason**: Helps with auditing and understanding why rewards were granted
2. **Be consistent**: Use similar reward amounts for similar situations
3. **Document special cases**: For large rewards, document the reason clearly
4. **Verify before granting**: Double-check the user and amount before clicking "Grant Reward"
5. **Monitor costs**: Track how many manual rewards you're granting to manage costs

## Troubleshooting

**Reward not applying?**
- Check browser console for errors
- Verify you're logged in as Admin
- Check Firestore for user document updates
- Verify API endpoint is working (`/api/adminGrantReferralReward`)

**Want to grant multiple rewards?**
- You can grant multiple rewards to the same user
- Each reward is tracked separately
- Rewards stack (e.g., grant 50 generations twice = 100 total)

**Need to reverse a reward?**
- Manually adjust the user's account in Firestore
- Or grant a negative reward (not recommended - better to adjust directly)
