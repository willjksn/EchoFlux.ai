import { test, expect } from "@playwright/test";

/**
 * Optional: Firebase email/password sign-in for the EchoFlux creator app (landing → LoginModal).
 * Requires a real test user in your Firebase project and a build whose auth domain allows the preview origin (localhost).
 *
 * @see docs/E2E.md
 */
test.describe("creator email login (optional)", () => {
  test("signs in from landing", async ({ page }) => {
    const email = process.env.E2E_LOGIN_EMAIL?.trim();
    const password = process.env.E2E_LOGIN_PASSWORD;
    test.skip(
      !email || password == null || String(password).length === 0,
      "Set E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD to run this test",
    );

    test.setTimeout(90_000);

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: /Build your brand/i })).toBeVisible();

    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

    await page.locator("#echoflux-login-email").fill(email!);
    await page.locator("#echoflux-login-password").fill(String(password));

    await page.locator('button[type="submit"]').filter({ hasText: "Log In" }).click();

    const dashboard = page.getByRole("button", { name: "Dashboard" });
    const inviteRequired = page.getByRole("heading", { name: "Invite Required" });
    await expect(dashboard.or(inviteRequired)).toBeVisible({ timeout: 45_000 });
  });
});
