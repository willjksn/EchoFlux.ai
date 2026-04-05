import { test, expect } from "@playwright/test";

/**
 * Lightweight smoke: no Stripe, no auth.
 * Full guest checkout + member purchase flows need test keys, a test creator, and scripted login — see docs/E2E.md.
 */
test.describe("app smoke", () => {
  test("home loads", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/EchoFlux/i);
    await expect(page.locator("body")).toBeVisible();
  });

  test("pricing route loads", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("public storefront (optional)", () => {
  test("creator handle page loads when E2E_PUBLIC_HANDLE is set", async ({ page }) => {
    const handle = process.env.E2E_PUBLIC_HANDLE?.trim();
    test.skip(!handle, "Set E2E_PUBLIC_HANDLE to a published handle to run this test");

    const res = await page.goto(`/${handle!}`);
    expect(res?.ok() ?? false).toBeTruthy();
    await expect(page.locator("body")).toBeVisible();
  });
});

/**
 * Hits a **deployed** origin (Vite preview has no `/api`). Use after deploy to verify Treats API.
 *
 * PowerShell:
 *   $env:E2E_API_BASE="https://your-app.vercel.app"
 *   $env:E2E_TREATS_CREATOR_ID="yourAuthUid"
 *   npx playwright test e2e/smoke.spec.ts -g "Treats products API"
 */
test.describe("Treats products API (deployed)", () => {
  test("GET /api/products returns JSON list", async ({ request }) => {
    const base = process.env.E2E_API_BASE?.trim().replace(/\/$/, "");
    const creatorId = process.env.E2E_TREATS_CREATOR_ID?.trim();
    test.skip(!base, "Set E2E_API_BASE to a live site URL (no trailing slash)");
    test.skip(!creatorId, "Set E2E_TREATS_CREATOR_ID to a real creator Auth uid");

    const url = `${base}/api/products?creatorId=${encodeURIComponent(creatorId!)}&context=landing`;
    const res = await request.get(url);
    expect(
      res.status(),
      `Expected 200 from ${url}, got ${res.status()}. Body: ${(await res.text()).slice(0, 500)}`
    ).toBe(200);
    const data = (await res.json()) as { products?: unknown };
    expect(Array.isArray(data.products)).toBeTruthy();
  });
});
