# Promotions System Documentation

## Overview

The Promotions System allows administrators to create and manage discount codes, free trials, and limited-time offers for EngageSuite.ai subscriptions. The system automatically tracks usage, enforces limits, and applies discounts during the payment process.

## Features

- **Multiple Promotion Types**: Percentage discounts, fixed amount discounts, or free access
- **Plan-Specific Promotions**: Apply to specific plans or all plans
- **Usage Limits**: Set maximum total uses (e.g., "first 10 subscribers") and per-user limits
- **Date Range Control**: Set start and end dates for promotions
- **Automatic Tracking**: System tracks all promotion usage automatically
- **Real-Time Validation**: Promotions are validated in real-time during checkout

## Admin Dashboard Access

1. Log in as an Admin user
2. Navigate to **Admin Dashboard** from the sidebar
3. Click on the **Promotions** tab

## Creating a Promotion

### Step 1: Open the Create Modal

Click the **"Create Promotion"** button in the Promotions Management interface.

### Step 2: Fill in Promotion Details

#### Required Fields

- **Promotion Code**: Unique code users will enter (e.g., `SUMMER50`, `FIRST10FREE`)
  - Codes are automatically converted to uppercase
  - Must be unique across all promotions
  
- **Name**: Display name for the promotion (e.g., "Summer Sale 50% Off")
  - This is shown to users when the promotion is applied

#### Optional Fields

- **Description**: Additional details about the promotion
- **Type**: Choose from:
  - **Percentage Discount**: Discount based on percentage (0-100%)
  - **Fixed Amount Discount**: Fixed dollar amount discount
  - **Free Access**: Grants free access for a specified number of days

- **Discount Value**: 
  - For percentage: Enter 0-100 (e.g., `50` for 50% off)
  - For fixed: Enter dollar amount (e.g., `10` for $10 off)
  - For free: Enter number of free days (e.g., `30` for 30 free days)

- **Applicable Plans**: 
  - Select specific plans the promotion applies to
  - Leave empty to apply to all plans
  - Available plans: Free, Pro, Elite, Agency, Starter, Growth

- **Start Date**: When the promotion becomes active
- **End Date**: When the promotion expires (optional - leave empty for no expiration)

- **Max Uses**: Maximum number of times the promotion can be used total
  - Example: Set to `10` for "first 10 subscribers"
  - Leave empty for unlimited uses

- **Max Uses Per User**: How many times a single user can use this promotion
  - Default: `1`
  - Set higher if users can use the same code multiple times

- **Free Days**: Number of free days granted (for free promotions)
- **Discount Duration Days**: Number of days the discount applies for recurring subscriptions
  - Leave empty for one-time discount only
  - Example: Set to `30` to apply discount for 30 days on monthly subscriptions

### Step 3: Save the Promotion

Click **"Create Promotion"** to save. The promotion will appear in the promotions list.

## Promotion Status Indicators

Promotions display status badges:

- **Active**: Promotion is currently active and can be used
- **Scheduled**: Promotion hasn't started yet (start date is in the future)
- **Expired**: Promotion has passed its end date
- **Max Uses Reached**: Promotion has reached its maximum usage limit
- **Inactive**: Promotion has been manually deactivated by admin

## Managing Promotions

### Activate/Deactivate

Click the checkmark/X icon next to a promotion to toggle its active status. Inactive promotions cannot be used even if they meet other criteria.

### View Usage

Click the checkmark icon to view detailed usage statistics for a promotion.

### Delete Promotion

Click the trash icon to permanently delete a promotion. This action cannot be undone.

## User Experience

### Applying a Promotion Code

#### Option 1: On Pricing Page

1. Navigate to the **Pricing** page
2. Enter the promotion code in the input field
3. Click **"Apply"**
4. The code will be validated and applied when you proceed to checkout

#### Option 2: In Payment Modal

1. Select a plan and click to open the payment modal
2. Enter the promotion code in the promotion code field
3. Click **"Apply"**
4. The promotion will be validated immediately
5. If valid, you'll see:
   - Original price (crossed out)
   - Discounted price
   - Discount amount saved
   - Option to remove the promotion

### Promotion Validation

The system validates promotions in real-time and checks:

- ✅ Promotion code exists and is active
- ✅ Current date is within promotion date range
- ✅ Promotion applies to the selected plan
- ✅ Maximum uses limit hasn't been reached
- ✅ User hasn't exceeded per-user usage limit

### Invalid Promotion Codes

If a promotion code is invalid, users will see an error message explaining why:
- "Promotion code not found or inactive"
- "Promotion has not started yet"
- "Promotion has expired"
- "Promotion does not apply to this plan"
- "Promotion has reached maximum uses"
- "You have already used this promotion X time(s)"

## Use Cases

### Example 1: Limited-Time Sale

**Goal**: Offer 50% off for first 100 subscribers

**Settings**:
- Code: `LAUNCH50`
- Type: Percentage Discount
- Discount Value: `50`
- Max Uses: `100`
- Start Date: Today
- End Date: 30 days from now
- Applicable Plans: All plans

### Example 2: Free Trial for New Users

**Goal**: Give first 10 new users 30 days free

**Settings**:
- Code: `FIRST10FREE`
- Type: Free Access
- Free Days: `30`
- Max Uses: `10`
- Max Uses Per User: `1`
- Start Date: Today
- End Date: (empty - no expiration)
- Applicable Plans: Pro, Elite

### Example 3: Fixed Discount for Specific Plan

**Goal**: $20 off Starter plan for 50 users

**Settings**:
- Code: `STARTER20`
- Type: Fixed Amount Discount
- Discount Value: `20`
- Max Uses: `50`
- Start Date: Today
- End Date: 60 days from now
- Applicable Plans: Starter only

### Example 4: Recurring Discount

**Goal**: 25% off for first 3 months of subscription

**Settings**:
- Code: `QUARTER25`
- Type: Percentage Discount
- Discount Value: `25`
- Discount Duration Days: `90` (3 months)
- Max Uses: `200`
- Start Date: Today
- End Date: (empty)
- Applicable Plans: All plans

## Technical Details

### Firestore Collections

#### `promotions`
Stores all promotion configurations:
```typescript
{
  id: string;
  code: string;
  name: string;
  description?: string;
  type: 'percentage' | 'fixed' | 'free';
  discountValue: number;
  applicablePlans: Plan[];
  startDate: string; // ISO timestamp
  endDate: string; // ISO timestamp (empty = no expiration)
  maxUses?: number;
  currentUses: number;
  maxUsesPerUser?: number;
  isActive: boolean;
  createdAt: string;
  createdBy: string; // Admin user ID
  freeDays?: number;
  discountDurationDays?: number;
}
```

#### `promotion_usages`
Tracks each promotion usage:
```typescript
{
  id: string;
  promotionId: string;
  userId: string;
  userEmail: string;
  plan: Plan;
  originalPrice: number;
  discountedPrice: number;
  discountAmount: number;
  usedAt: string; // ISO timestamp
  expiresAt?: string; // ISO timestamp (for free days or discount duration)
}
```

### API Endpoints

#### `POST /api/validatePromotion`
Validates a promotion code before application.

**Request**:
```json
{
  "code": "SUMMER50",
  "plan": "Pro",
  "price": 49
}
```

**Response**:
```json
{
  "valid": true,
  "promotion": {
    "id": "promo123",
    "code": "SUMMER50",
    "name": "Summer Sale 50% Off",
    "type": "percentage"
  },
  "originalPrice": 49,
  "discountedPrice": 24.5,
  "discountAmount": 24.5,
  "expiresAt": "2024-08-01T00:00:00Z",
  "freeDays": null,
  "discountDurationDays": null
}
```

#### `POST /api/applyPromotion`
Records promotion usage after successful payment.

**Request**:
```json
{
  "promotionId": "promo123",
  "plan": "Pro",
  "originalPrice": 49,
  "discountedPrice": 24.5,
  "discountAmount": 24.5,
  "expiresAt": "2024-08-01T00:00:00Z"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Promotion applied successfully"
}
```

## Best Practices

1. **Use Clear, Memorable Codes**: Make codes easy to remember and type (e.g., `SUMMER50` vs `SMR202450OFF`)

2. **Set Reasonable Limits**: Don't set max uses too high if you want to limit exposure

3. **Monitor Usage**: Regularly check promotion usage to see which campaigns are most effective

4. **Test Before Launch**: Create a test promotion and verify it works before announcing publicly

5. **Set Expiration Dates**: Always set end dates for time-sensitive promotions to avoid accidental long-term discounts

6. **Plan-Specific Promotions**: Use plan-specific promotions to target specific user segments

7. **Track Performance**: Review promotion usage data to understand which promotions drive conversions

## Troubleshooting

### Promotion Not Working

1. **Check Status**: Ensure promotion is marked as "Active"
2. **Verify Dates**: Confirm current date is within start/end date range
3. **Check Limits**: Verify max uses hasn't been reached
4. **Plan Match**: Ensure promotion applies to the selected plan
5. **User Limit**: Check if user has exceeded per-user usage limit

### Promotion Shows as "Max Uses Reached"

- The promotion has been used the maximum number of times
- Create a new promotion with a different code if you want to continue offering discounts

### Users Can't Apply Promotion

- Verify the promotion code is spelled correctly (codes are case-insensitive but displayed in uppercase)
- Check that the promotion is active and within date range
- Ensure the promotion applies to the plan the user is selecting

## Support

For issues or questions about the promotions system, contact your system administrator or refer to the technical documentation.

