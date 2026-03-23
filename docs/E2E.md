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

## Guest checkout & member purchase (not automated yet)

Those flows need:

- Stripe **test** keys and webhook or success redirect URLs pointing at your preview URL.
- A **test creator** with at least one visible store product.
- For the member path: Firebase **test** auth (email/password or custom token) — avoid committing secrets; use GitHub Actions secrets and a dedicated test account.

Extend `e2e/smoke.spec.ts` or add `e2e/checkout.spec.ts` once those are available.
