# Stripe Promotional Codes Guide

## How Promotional Codes Work with Stripe

**You do NOT need to create separate prices for each promotional code.** Stripe handles discounts automatically through **Coupons** and **Promotion Codes**.

## Current Setup

Your app has **two ways** to handle promotional codes:

### 1. Stripe Native Promotion Codes (Already Enabled)
- **Status**: ✅ Already configured
- **How it works**: Users can enter promotion codes directly in Stripe Checkout
- **Location**: `api/createCheckoutSession.ts` line 108: `allow_promotion_codes: true`

### 2. Custom Firestore Promotions (Optional)
- **Status**: ✅ Code exists but needs Stripe integration
- **How it works**: Validates promotions stored in Firestore, then passes to Stripe
- **Location**: `api/validatePromotion.ts` and `components/PaymentModal.tsx`

## How to Set Up Promotional Codes in Stripe

### Option A: Use Stripe's Native Promotion Codes (Recommended)

**Steps:**

1. **Create a Coupon in Stripe Dashboard:**
   - Go to Stripe Dashboard → Products → Coupons
   - Click "Create coupon"
   - Choose discount type:
     - **Percentage off**: e.g., 20% off
     - **Amount off**: e.g., $10 off
   - Set duration:
     - **Once**: Applies to first payment only
     - **Forever**: Applies to all future payments
     - **Repeating**: Applies for X months, then stops
   - Save the coupon

2. **Create a Promotion Code:**
   - Go to Stripe Dashboard → Products → Promotion codes
   - Click "Create promotion code"
   - Select the coupon you created
   - Enter a user-friendly code (e.g., "SUMMER2024", "WELCOME20")
   - Set restrictions (optional):
     - Max redemptions
     - Expiration date
     - First-time customers only
   - Save the promotion code

3. **Users can now:**
   - Enter the code directly in Stripe Checkout (already enabled)
   - OR enter it in your PaymentModal before checkout

**No code changes needed** - this already works!

### Option B: Map Firestore Promotions to Stripe Coupons

If you want to use your custom Firestore promotion system:

1. **Create Coupons in Stripe** (same as Option A, step 1)

2. **Store Stripe Coupon ID in Firestore:**
   - When creating a promotion in Firestore, add a `stripeCouponId` field
   - Example Firestore document:
   ```json
   {
     "code": "SUMMER2024",
     "name": "Summer Sale",
     "type": "percentage",
     "discountValue": 20,
     "stripeCouponId": "cou_1234567890", // Add this field
     "isActive": true,
     ...
   }
   ```

3. **Update `validatePromotion.ts`** to return the Stripe Coupon ID:
   ```typescript
   return res.status(200).json({
     valid: true,
     promotion: {
       id: promotion.id,
       code: promotion.code,
       name: promotion.name,
       type: promotion.type,
       stripeCouponId: promotionData.stripeCouponId, // Add this
     },
     ...
   });
   ```

4. **Update `PaymentModal.tsx`** to pass Stripe Coupon ID:
   ```typescript
   promoCode: appliedPromotion?.promotion?.stripeCouponId || promoCode || undefined,
   ```

## Important Notes

### ✅ What You DON'T Need:
- ❌ Separate prices for each promotional code
- ❌ Different Price IDs for discounted plans
- ❌ Manual discount calculations

### ✅ What Stripe Handles Automatically:
- ✅ Discount calculation (percentage or fixed amount)
- ✅ Applying discounts to subscriptions
- ✅ Tracking coupon usage
- ✅ Expiration dates
- ✅ Usage limits
- ✅ First-time customer restrictions

### Current Code Behavior:

1. **If user enters code in PaymentModal:**
   - Code validates against Firestore promotions
   - If valid, calculates discount and shows preview
   - Passes code to Stripe (but needs Stripe Coupon ID, not Firestore ID)

2. **If user enters code in Stripe Checkout:**
   - Stripe validates the code directly
   - Applies discount automatically
   - Works immediately (no code changes needed)

## Recommended Approach

**Use Stripe's native promotion codes** because:
- ✅ Already enabled in your code
- ✅ No additional code changes needed
- ✅ Stripe handles all validation and tracking
- ✅ Users can enter codes in Stripe Checkout
- ✅ Easier to manage in Stripe Dashboard

**Steps:**
1. Create coupons in Stripe Dashboard
2. Create promotion codes that reference those coupons
3. Share the promotion codes with users
4. Users enter codes in Stripe Checkout (or PaymentModal if you update it)

## Example: Creating a 20% Off Coupon

1. **Stripe Dashboard → Products → Coupons:**
   - Name: "20% Off First Month"
   - Discount: 20% off
   - Duration: Once (first payment only)
   - Save

2. **Stripe Dashboard → Products → Promotion codes:**
   - Code: "WELCOME20"
   - Coupon: Select the coupon you just created
   - Max redemptions: 100 (optional)
   - Save

3. **Users can now use "WELCOME20" in checkout!**

## Testing

1. Create a test coupon in Stripe (Test mode)
2. Create a test promotion code
3. Go through checkout flow
4. Enter the promotion code
5. Verify discount is applied correctly

## Troubleshooting

**Issue**: "No such coupon" error
- **Solution**: Make sure you're using the Stripe Coupon ID (starts with `cou_`) or Promotion Code, not a Firestore promotion ID

**Issue**: Discount not applying
- **Solution**: Check that the coupon is active and not expired in Stripe Dashboard

**Issue**: Code works in Stripe but not in PaymentModal
- **Solution**: Update PaymentModal to pass Stripe Coupon ID instead of Firestore promotion ID



