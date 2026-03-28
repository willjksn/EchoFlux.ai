#!/usr/bin/env node
/**
 * GET /api/stripeHealth — no secrets returned. Use for smoke checks.
 *
 * Usage:
 *   node scripts/stripeHealthCheck.mjs
 *   node scripts/stripeHealthCheck.mjs https://your-preview.vercel.app
 *   STRIPE_HEALTH_URL=https://echoflux.ai/api/stripeHealth node scripts/stripeHealthCheck.mjs
 */
const base =
  process.argv[2]?.replace(/\/$/, "") ||
  process.env.STRIPE_HEALTH_URL?.replace(/\/api\/stripeHealth.*$/, "").replace(/\/$/, "") ||
  "https://echoflux.ai";
const url = base.includes("/api/stripeHealth") ? base : `${base}/api/stripeHealth`;

const res = await fetch(url);
const body = await res.text();
let json;
try {
  json = JSON.parse(body);
} catch {
  console.error("Non-JSON response:", res.status, body.slice(0, 500));
  process.exit(1);
}

console.log(JSON.stringify(json, null, 2));

if (!json.ok) {
  console.error("\nStripe is not configured (ok: false). Check Vercel env vars.");
  process.exit(1);
}

if (json.env && !json.env.webhookSecretConfigured) {
  console.error("\nWarning: STRIPE_WEBHOOK_SECRET not set — checkout webhooks will fail.");
  process.exit(1);
}

process.exit(0);
