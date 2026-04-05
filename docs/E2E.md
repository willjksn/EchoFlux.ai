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

The GitHub Actions workflow runs `npm run build`, installs Chromium, then `playwright test`.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `E2E_PUBLIC_HANDLE` | Optional. If set, the storefront smoke test requests `/{handle}` (must exist in your deployed/staging data). |
| `E2E_API_BASE` | Optional. Live site URL (e.g. `https://your-app.vercel.app`, no trailing slash). With `E2E_TREATS_CREATOR_ID`, runs the deployed **Treats products API** check in `e2e/smoke.spec.ts` (preview alone has no `/api`). |
| `E2E_TREATS_CREATOR_ID` | Optional. Creator Firebase Auth uid for `GET /api/products?creatorId=…&context=landing`. |
| `E2E_LOGIN_EMAIL` | Optional. With `E2E_LOGIN_PASSWORD`, runs `e2e/creator-login.spec.ts`: email/password sign-in from the landing page (Firebase). Use a **dedicated test account**; set via shell or CI secrets — do not commit. |
| `E2E_LOGIN_PASSWORD` | Optional. Password for `E2E_LOGIN_EMAIL`. |

### Creator login test notes

- The app must not block the account (maintenance bypass, invite-only redemption, etc., depending on your env flags at **build** time).
- If invite-only mode is on and the user has not redeemed a code, the test still passes after auth when the **Invite Required** screen appears (Firebase sign-in succeeded).
- Preview uses `http://127.0.0.1:4173`; ensure that origin is allowed for your Firebase web API key / authorized domains.

## Guest checkout & member purchase (not automated yet)

Those flows need:

- Stripe **test** keys and webhook or success redirect URLs pointing at your preview URL.
- A **test creator** with at least one visible store product.
- For the member path: Firebase **test** auth (email/password or custom token) — avoid committing secrets; use GitHub Actions secrets and a dedicated test account.

Extend `e2e/smoke.spec.ts` or add `e2e/checkout.spec.ts` once those are available.
