# Stripe receipt & customer branding (creator checklist)

Stripe sends **payment receipts** and shows **customer portal** branding based on your **Stripe account** settings, not from EchoFlux email templates. Use this checklist so fans see your brand on receipts and in Stripe-hosted flows.

## Before you launch paid products

1. **Business details**  
   [Stripe Dashboard → Settings → Business settings](https://dashboard.stripe.com/settings/account)  
   - Legal business name, support email, and address (often shown on receipts).

2. **Public business information**  
   [Settings → Branding](https://dashboard.stripe.com/settings/branding) (or **Customer portal → Branding**, depending on your Stripe version)  
   - **Logo** — square image, clear on light backgrounds.  
   - **Brand color** — matches your Fan Hub / storefront primary where possible.  
   - **Icon** — optional; used in some Stripe UIs.

3. **Statement descriptor**  
   [Settings → Payments → Statement descriptors](https://dashboard.stripe.com/settings/public)  
   - **Short descriptor** (appears on card statements; character limits apply).  
   - Use something fans will recognize (e.g. your handle or brand name).

4. **Customer emails**  
   [Settings → Customer emails](https://dashboard.stripe.com/settings/emails)  
   - Confirm **Successful payments** / receipts are enabled if you want Stripe to email receipts.  
   - Customize text where Stripe allows (still subject to Stripe’s layout).

5. **Customer portal** (subscriptions / self-serve)  
   [Settings → Billing → Customer portal](https://dashboard.stripe.com/settings/billing/portal)  
   - Turn on and brand the portal so cancel/update flows match your business.

6. **Test mode vs Live**  
   Repeat logo, descriptor, and business info for **Test** and **Live** if you demo checkout in both modes.

## What EchoFlux controls

- Checkout session creation, product/price metadata, and success/cancel URLs.  
- In-app and product copy on your storefront.

## Support

If a fan says “I don’t recognize this charge,” point them to the **descriptor** on their statement and your **support email** from Stripe business settings.
