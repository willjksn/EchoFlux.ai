# End-to-end (Playwright) tests

## Run locally

First-time setup (downloads Chromium):

```bash
npx playwright install chromium
```

Then:

```bash
npm run build
npm run test:e2e
```

Playwright starts `vite preview` on port **4173** unless something is already listening there (`reuseExistingServer` when not in CI).

## CI

The GitHub Actions workflow **CI** (`build-and-test`) runs `npm run build`, installs Chromium, then `playwright test`. Default coverage includes **always-on** checks (`e2e/smoke.spec.ts`, `e2e/public-routes.spec.ts`, `e2e/auth-modal.spec.ts`) plus tests that **skip** unless optional env vars are set.

For a manual run with repository **Secrets** / **Variables**, use workflow **E2E staging (optional)** (`.github/workflows/e2e-staging.yml`).

## Environment variables

| Variable | Purpose |
|----------|---------|
| `E2E_PUBLIC_HANDLE` | Optional. If set, the storefront smoke test requests `/{handle}` (must exist in your deployed/staging data). |
| `E2E_API_BASE` | Optional. Live site URL (e.g. `https://your-app.vercel.app`, no trailing slash). With `E2E_TREATS_CREATOR_ID`, runs the deployed **Treats products API** check in `e2e/smoke.spec.ts` (preview alone has no `/api`). |
| `E2E_TREATS_CREATOR_ID` | Optional. Creator Firebase Auth uid for `GET /api/products?creatorId=…&context=landing`. |
| `E2E_LOGIN_EMAIL` | Optional. With `E2E_LOGIN_PASSWORD`, runs `e2e/creator-login.spec.ts` and `e2e/authenticated-flows.spec.ts` (Firebase email/password on preview). Use a **dedicated test creator** with creator dashboard access — do not commit. |
| `E2E_LOGIN_PASSWORD` | Optional. Password for `E2E_LOGIN_EMAIL`. |
| `E2E_FAN_HUB_SMOKE` | Optional. Set to `1` or `true` (e.g. repo **Variable** in staging workflow) to run Fan Hub tab strip checks in `e2e/authenticated-flows.spec.ts` (account must have Pro/Elite Fan Hub access). |
| `E2E_FAN_HUB_MESSAGES_SMOKE` | Optional. Set to `1` or `true` to open Fan Hub with **Messages** tab in `e2e/authenticated-flows.spec.ts`. |
| `E2E_EXPECT_ADMIN` | Optional. Set to `1` or `true` only when `E2E_LOGIN_*` is an **Admin** account; asserts `/admin` shows **Admin Dashboard**. |

Deployed Stripe guest checkout still uses `e2e/stripe-treat-checkout.spec.ts` with `E2E_BASE_URL` / `E2E_PUBLIC_HANDLE` (see file header).

### Creator login test notes

- The app must not block the account (maintenance bypass, invite-only redemption, etc., depending on your env flags at **build** time).
- If invite-only mode is on and the user has not redeemed a code, the test still passes after auth when the **Invite Required** screen appears (Firebase sign-in succeeded).
- Preview uses `http://127.0.0.1:4173`; ensure that origin is allowed for your Firebase web API key / authorized domains.
- **Fan-only** accounts show **Member sign-in** and cannot drive dashboard/Fan Hub assertions — use a creator workspace test user.

## Guest checkout & member purchase

- **Guest treat checkout** (Stripe test mode, deployed app): `e2e/stripe-treat-checkout.spec.ts` and env vars documented in that file.
- **Member purchase / portal / webhooks** against preview still need Stripe test keys and redirect URLs compatible with `vite preview`; automate incrementally or keep as staging-only.

Extend `e2e/smoke.spec.ts` or add specs alongside `e2e/stripe-treat-checkout.spec.ts` when staging URLs and fixtures are stable.
