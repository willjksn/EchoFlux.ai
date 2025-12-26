# How to Get Stripe Price IDs

## Step-by-Step Instructions

### 1. Go to Stripe Dashboard
1. Log in to https://dashboard.stripe.com
2. Make sure you're in **Test mode** first (toggle in top right) to test safely
3. Navigate to **Products** in the left sidebar

### 2. Create Your First Product (Example: Caption Pro)

1. Click **"+ Add product"**
2. Fill in:
   - **Name**: `Caption Pro`
   - **Description**: `Perfect for caption writing`
   - Leave **Pricing model** as "Standard pricing"
3. Click **"Save product"**

### 3. Add Monthly Price

1. On the product page, click **"+ Add another price"**
2. Fill in:
   - **Price**: `$9.00`
   - **Billing period**: `Monthly`
   - **Currency**: `USD`
3. Click **"Add price"**
4. **Copy the Price ID** - It will look like: `price_1ABC123xyz...`
   - This is what you'll paste into `STRIPE_PRICE_CAPTION_MONTHLY`

### 4. Add Annual Price

1. Still on the same product page, click **"+ Add another price"**
2. Fill in:
   - **Price**: `$7.00` (or $84/year if you want to show annual total)
   - **Billing period**: `Yearly` or `Every 12 months`
   - **Currency**: `USD`
3. Click **"Add price"**
4. **Copy the Price ID** - It will look like: `price_1DEF456abc...`
   - This is what you'll paste into `STRIPE_PRICE_CAPTION_ANNUALLY`

### 5. Repeat for All Plans

Create products and prices for:

| Plan | Monthly Price | Annual Price | Monthly Price ID Var | Annual Price ID Var |
|------|--------------|--------------|---------------------|---------------------|
| Caption Pro | $9 | $7 | `STRIPE_PRICE_CAPTION_MONTHLY` | `STRIPE_PRICE_CAPTION_ANNUALLY` |
| OnlyFans Studio | $24 | $19 | `STRIPE_PRICE_ONLYFANS_MONTHLY` | `STRIPE_PRICE_ONLYFANS_ANNUALLY` |
| Pro | $29 | $23 | `STRIPE_PRICE_PRO_MONTHLY` | `STRIPE_PRICE_PRO_ANNUALLY` |
| Elite | $59 | $47 | `STRIPE_PRICE_ELITE_MONTHLY` | `STRIPE_PRICE_ELITE_ANNUALLY` |
| Agency | $299 | $239 | `STRIPE_PRICE_AGENCY_MONTHLY` | `STRIPE_PRICE_AGENCY_ANNUALLY` |

### 6. Add to Vercel Environment Variables

1. Go to Vercel Dashboard > Your Project > Settings > Environment Variables
2. For each Price ID, click **"Add New"**
3. Enter:
   - **Key**: `STRIPE_PRICE_CAPTION_MONTHLY` (for example)
   - **Value**: `price_1ABC123xyz...` (the actual Price ID from Stripe)
   - **Environment**: Select all (Production, Preview, Development)
4. Click **"Save"**
5. Repeat for all 10 Price IDs

### Example Environment Variables

After setup, your Vercel environment variables should look like:

```
STRIPE_SECRET_KEY=sk_live_... (or sk_test_...)
STRIPE_PUBLISHABLE_KEY=pk_live_... (or pk_test_...)
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_APP_URL=https://engagesuite.ai

STRIPE_PRICE_CAPTION_MONTHLY=price_1ABC123xyz...
STRIPE_PRICE_CAPTION_ANNUALLY=price_1DEF456abc...
STRIPE_PRICE_ONLYFANS_MONTHLY=price_1GHI789def...
STRIPE_PRICE_ONLYFANS_ANNUALLY=price_1JKL012ghi...
STRIPE_PRICE_PRO_MONTHLY=price_1MNO345jkl...
STRIPE_PRICE_PRO_ANNUALLY=price_1PQR678mno...
STRIPE_PRICE_ELITE_MONTHLY=price_1STU901pqr...
STRIPE_PRICE_ELITE_ANNUALLY=price_1VWX234stu...
STRIPE_PRICE_AGENCY_MONTHLY=price_1YZA567vwx...
STRIPE_PRICE_AGENCY_ANNUALLY=price_1BCD890yza...
```

## Important Notes

- **Price IDs start with `price_`** - If you see something starting with `prod_`, that's the Product ID, not the Price ID
- **Test vs Live**: Create products in Test mode first, then create the same products in Live mode
- **Price IDs are different** between Test and Live mode
- **After adding environment variables**, you need to **redeploy** your Vercel project for them to take effect

## Quick Checklist

- [ ] Created all 5 products in Stripe Dashboard
- [ ] Added monthly price for each product (5 prices)
- [ ] Added annual price for each product (5 prices)
- [ ] Copied all 10 Price IDs
- [ ] Added all 10 environment variables to Vercel
- [ ] Redeployed Vercel project
- [ ] Tested checkout with test card: `4242 4242 4242 4242`

## Where to Find Price IDs

1. **In Stripe Dashboard**: Products > [Your Product] > Prices section
2. **Price ID format**: `price_1ABC123xyz...` (starts with `price_`)
3. **Click the price** to see full details, or hover to see copy button

## Troubleshooting

**"Price ID not configured" error:**
- Make sure you added the environment variable
- Make sure you redeployed after adding the variable
- Check that the Price ID is correct (starts with `price_`)
- Verify you're using the correct mode (test vs live) Price IDs

**"Invalid price" error:**
- Make sure the Price ID exists in your Stripe account
- Check that you're using the correct Stripe account (test vs live)
- Verify the price is active (not archived)


