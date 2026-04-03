/**
 * Legacy Stripe Dashboard URL path (Stormij / older deployments used kebab-case).
 * EchoFlux canonical handler: `/api/stripeWebhook` (see `stripeWebhook.ts`).
 * Keep this file so `POST https://your-domain/api/stripe-webhook` hits the same logic.
 */
export { default, config } from "./stripeWebhook.js";
