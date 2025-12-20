# Referral Rewards Configuration Guide

## Overview

The referral system supports multiple reward types that can be configured through the Admin Dashboard. Rewards are granted at specific referral milestones (e.g., 1 referral, 5 referrals, 10 referrals).

## How to Configure Rewards

### Option 1: Admin Dashboard (Recommended)

1. Go to **Admin Dashboard** → **Referral Rewards** tab
2. You'll see the current reward configuration
3. **Add/Edit/Remove** rewards:
   - **Milestone**: Number of referrals needed (e.g., 1, 3, 5, 10, 20)
   - **Reward Type**: Choose from:
     - `extra_generations` - Free AI caption generations
     - `free_month` - Free subscription months
     - `storage_boost` - Extra storage in GB
   - **Amount**: The quantity (e.g., 50 generations, 1 month, 5 GB)
   - **Description**: User-friendly description shown to users
4. Click **Save Configuration**

### Option 2: Direct Code Configuration

Edit the reward configuration in:
- `api/getReferralRewards.ts` - `DEFAULT_REWARDS` constant
- `api/claimReferralReward.ts` - `REWARD_CONFIG` constant
- `components/ReferralRewardsConfig.tsx` - `DEFAULT_REWARDS` constant

## Reward Types Explained

### 1. **Extra AI Generations** (`extra_generations`)

**How it works:**
- Reduces the user's `monthlyCaptionGenerationsUsed` count
- Example: If user has used 20/100 generations and gets 50 free, they now have -30/100 (effectively 70 remaining)

**Best for:**
- Small rewards (10-100 generations)
- Encouraging content creation
- Low-cost rewards

**Example:**
```javascript
{
  milestone: 1,
  type: 'extra_generations',
  amount: 50,
  description: '50 free AI generations'
}
```

---

### 2. **Free Month(s)** (`free_month`)

**How it works:**
- **For Free users**: Upgrades to Pro plan for the specified months
- **For paid users**: Extends their current subscription by the specified months
- Sets `subscriptionEndDate` to extend the subscription period

**Best for:**
- Medium to large rewards (1-3 months)
- Encouraging upgrades
- High-value rewards

**Example:**
```javascript
{
  milestone: 5,
  type: 'free_month',
  amount: 1,
  description: '1 free month of Pro plan'
}
```

**Note:** If user is on Free plan, they get upgraded to Pro. If already on a paid plan, their subscription is extended.

---

### 3. **Storage Boost** (`storage_boost`)

**How it works:**
- Permanently increases the user's `storageLimit` by the specified GB
- Amount is in GB (converted to MB internally: `amount * 1024`)

**Best for:**
- Medium rewards (1-10 GB)
- Users who upload lots of media
- Permanent value

**Example:**
```javascript
{
  milestone: 10,
  type: 'storage_boost',
  amount: 5,
  description: '5 GB extra storage'
}
```

---

## Default Reward Structure

The system comes with these default rewards:

| Milestone | Reward Type | Amount | Description |
|-----------|------------|--------|-------------|
| 1 referral | Extra Generations | 50 | 50 free AI generations |
| 3 referrals | Extra Generations | 100 | 100 free AI generations |
| 5 referrals | Free Month | 1 | 1 free month of Pro plan |
| 10 referrals | Storage Boost | 5 GB | 5 GB extra storage |
| 20 referrals | Free Month | 3 | 3 free months of Elite plan |

## Customizing Rewards

### Example: More Aggressive Rewards

```javascript
const REWARDS = [
  { milestone: 1, type: 'extra_generations', amount: 100, description: '100 free AI generations' },
  { milestone: 2, type: 'free_month', amount: 1, description: '1 free month of Pro' },
  { milestone: 5, type: 'storage_boost', amount: 10, description: '10 GB extra storage' },
  { milestone: 10, type: 'free_month', amount: 2, description: '2 free months of Elite' },
];
```

### Example: Conservative Rewards

```javascript
const REWARDS = [
  { milestone: 3, type: 'extra_generations', amount: 25, description: '25 free AI generations' },
  { milestone: 10, type: 'free_month', amount: 1, description: '1 free month of Pro' },
  { milestone: 25, type: 'storage_boost', amount: 2, description: '2 GB extra storage' },
];
```

## How Rewards Are Claimed

1. User reaches a milestone (e.g., 5 referrals)
2. Reward appears in their **Profile → Referral Program** section
3. User clicks **"Claim"** button
4. System applies the reward:
   - **Extra Generations**: Reduces usage count
   - **Free Month**: Extends/upgrades subscription
   - **Storage Boost**: Increases storage limit
5. Reward is marked as "Claimed" and cannot be claimed again

## Tracking Claimed Rewards

The system tracks claimed rewards in the user document:
```javascript
{
  claimedReferralRewards: [
    {
      milestone: 5,
      type: 'free_month',
      amount: 1,
      claimedAt: '2025-01-15T10:30:00Z'
    }
  ]
}
```

## Referee Rewards (People Who Use Referral Codes)

When someone signs up using a referral code, they automatically receive:
- **10 free AI generations** (configurable in `api/createReferral.ts`)

To change this, edit the `createReferral.ts` file:
```javascript
// Give extra AI generations as welcome bonus
await db.collection("users").doc(user.uid).update({
  monthlyCaptionGenerationsUsed: Math.max(0, (userData?.monthlyCaptionGenerationsUsed || 0) - 10),
});
```

## Admin Configuration

Admins can configure rewards through:
1. **Admin Dashboard** → **Referral Rewards** tab
2. Configuration is saved to Firestore: `admin/referral_rewards_config`
3. Changes take effect immediately for new reward calculations

## Best Practices

1. **Start Small**: Begin with smaller rewards and increase based on performance
2. **Mix Reward Types**: Combine different reward types for variety
3. **Clear Milestones**: Use round numbers (1, 5, 10, 20) for clarity
4. **Test First**: Test reward claiming with a test account before going live
5. **Monitor Costs**: Track reward costs in admin analytics
6. **Update Descriptions**: Make descriptions clear and exciting

## Cost Considerations

- **Extra Generations**: Low cost (just reduces usage counter)
- **Free Months**: Medium cost (extends subscription, may upgrade Free users)
- **Storage Boost**: Low ongoing cost (one-time storage increase)

## Troubleshooting

**Reward not appearing?**
- Check if user has reached the milestone
- Verify reward configuration in admin panel
- Check browser console for errors

**Reward not applying?**
- Check Firestore for user document updates
- Verify API endpoint is working (`/api/claimReferralReward`)
- Check user's current plan/storage limits

**Want to change existing rewards?**
- Update configuration in admin panel
- Existing claimed rewards remain unchanged
- New rewards apply to future milestones
