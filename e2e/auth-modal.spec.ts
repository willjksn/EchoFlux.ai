import { test, expect } from "@playwright/test";

/** Login modal wiring — no Firebase credentials required. */
test.describe("auth modal", () => {
  test("Sign in opens welcome-back modal with email field", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: /Build your brand/i })).toBeVisible();

    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.locator("#echoflux-login-email")).toBeVisible();
    await expect(page.locator("#echoflux-login-password")).toBeVisible();
  });
});
