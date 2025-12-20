# How to Configure Referral Rewards

## Quick Answer

You can configure different referral rewards in **two ways**:

### Method 1: Admin Dashboard (Easiest) ⭐

1. Go to **Admin Dashboard** (you need Admin role)
2. Click the **"Referral Rewards"** tab
3. Add/Edit/Remove rewards:
   - Set **Milestone** (e.g., 1, 5, 10 referrals)
   - Choose **Reward Type**: 
     - `extra_generations` - Free AI caption generations
     - `free_month` - Free subscription months
     - `storage_boost` - Extra storage in GB
   - Set **Amount** (e.g., 50 generations, 1 month, 5 GB)
   - Add **Description** (shown to users)
4. Click **"Save Configuration"**

### Method 2: Edit Code Directly

Edit these files and update the reward arrays:

1. **`api/getReferralRewards.ts`** - Line 7-13 (DEFAULT_REWARDS)
2. **`api/claimReferralReward.ts`** - Line 6-21 (REWARD_CONFIG)
3. **`components/ReferralRewardsConfig.tsx`** - Line 10-16 (DEFAULT_REWARDS)

---

## Reward Types & How They Work

### 1. **Extra AI Generations** (`extra_generations`)

**What it does:**
- Reduces user's `monthlyCaptionGenerationsUsed` count
- Example: User has used 20/100 → Gets 50 free → Now has -30/100 (effectively 70 remaining)

**Configuration:**
```javascript
{
  milestone: 1,
  type: 'extra_generations',
  amount: 50,  // Number of free generations
  description: '50 free AI generations'
}
```

**Best for:** Small rewards, encouraging content creation

---

### 2. **Free Month(s)** (`free_month`)

**What it does:**
- **Free users**: Upgrades to Pro plan for X months
- **Paid users**: Extends current subscription by X months
- Sets `subscriptionEndDate` to extend the period

**Configuration:**
```javascript
{
  milestone: 5,
  type: 'free_month',
  amount: 1,  // Number of free months
  description: '1 free month of Pro plan'
}
```

**Best for:** Medium to large rewards, encouraging upgrades

**Note:** If user is on Free plan, they get upgraded to Pro. If already paid, subscription is extended.

---

### 3. **Storage Boost** (`storage_boost`)

**What it does:**
- Permanently increases `storageLimit` by X GB
- Amount is in GB (converted to MB: `amount * 1024`)

**Configuration:**
```javascript
{
  milestone: 10,
  type: 'storage_boost',
  amount: 5,  // Number of GB to add
  description: '5 GB extra storage'
}
```

**Best for:** Medium rewards, permanent value

---

## Example Configurations

### Aggressive Rewards (More Generous)
```javascript
[
  { milestone: 1, type: 'extra_generations', amount: 100, description: '100 free AI generations' },
  { milestone: 2, type: 'free_month', amount: 1, description: '1 free month of Pro' },
  { milestone: 5, type: 'storage_boost', amount: 10, description: '10 GB extra storage' },
  { milestone: 10, type: 'free_month', amount: 2, description: '2 free months of Elite' },
]
```

### Conservative Rewards (Cost-Conscious)
```javascript
[
  { milestone: 3, type: 'extra_generations', amount: 25, description: '25 free AI generations' },
  { milestone: 10, type: 'free_month', amount: 1, description: '1 free month of Pro' },
  { milestone: 25, type: 'storage_boost', amount: 2, description: '2 GB extra storage' },
]
```

### Balanced (Current Default)
```javascript
[
  { milestone: 1, type: 'extra_generations', amount: 50, description: '50 free AI generations' },
  { milestone: 3, type: 'extra_generations', amount: 100, description: '100 free AI generations' },
  { milestone: 5, type: 'free_month', amount: 1, description: '1 free month of Pro plan' },
  { milestone: 10, type: 'storage_boost', amount: 5, description: '5 GB extra storage' },
  { milestone: 20, type: 'free_month', amount: 3, description: '3 free months of Elite plan' },
]
```

---

## How Users Claim Rewards

1. User reaches milestone (e.g., 5 referrals)
2. Reward appears in **Profile → Referral Program** section
3. Shows as "Available" with green badge
4. User clicks **"Claim"** button
5. Reward is applied immediately:
   - Generations: Usage count reduced
   - Free Month: Subscription extended/upgraded
   - Storage: Limit increased
6. Reward marked as "Claimed" (can't claim twice)

---

## Changing Referee Rewards (People Who Use Codes)

When someone signs up using a referral code, they get:
- **10 free AI generations** (automatic)

To change this, edit `api/createReferral.ts` around line 90:
```javascript
// Change the amount (currently 10)
updates.monthlyCaptionGenerationsUsed = Math.max(0, (userData?.monthlyCaptionGenerationsUsed || 0) - 10);
```

You could also give them:
- A free month
- Storage boost
- Different amount of generations

---

## Testing Rewards

1. Create a test account
2. Manually add referrals in Firestore: `referrals` collection
3. Check if rewards appear in Profile → Referral Program
4. Claim a reward and verify it applies correctly
5. Check user document in Firestore to confirm updates

---

## Cost Tracking

Track reward costs in:
- Admin Dashboard → Model Usage Analytics
- Firestore: `referrals` collection
- User documents: `claimedReferralRewards` array

---

## Need Help?

- See `REFERRAL_REWARDS_GUIDE.md` for detailed documentation
- Check Admin Dashboard → Referral Rewards for current configuration
- Review `api/claimReferralReward.ts` for reward application logic
