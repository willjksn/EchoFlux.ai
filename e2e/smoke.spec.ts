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
