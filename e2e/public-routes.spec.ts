import { test, expect } from "@playwright/test";

/**
 * Public legal/info routes (no auth). Runs on Vite preview in CI.
 */
test.describe("public routes", () => {
  const cases: { path: string; heading: RegExp }[] = [
    { path: "/privacy", heading: /Privacy Policy/i },
    { path: "/terms", heading: /Terms of Service/i },
    { path: "/faq", heading: /Frequently Asked Questions/i },
    { path: "/data-deletion", heading: /Data Deletion Instructions/i },
  ];

  for (const { path, heading } of cases) {
    test(`${path} shows expected heading`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.getByText("Loading...")).toBeHidden({ timeout: 25_000 }).catch(() => {});
      await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("body")).toBeVisible();
    });
  }

  test("/reset-password without oobCode shows invalid link message", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText(/invalid password reset link/i)).toBeVisible({ timeout: 15_000 });
  });
});
