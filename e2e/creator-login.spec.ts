import { test, expect } from "@playwright/test";
import { signInCreatorFromLanding } from "./helpers/signInCreator";

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

    await signInCreatorFromLanding(page, email!, String(password));

    const dashboard = page.getByRole("button", { name: "Dashboard" });
    const inviteRequired = page.getByRole("heading", { name: "Invite Required" });
    await expect(dashboard.or(inviteRequired)).toBeVisible({ timeout: 45_000 });
  });
});
