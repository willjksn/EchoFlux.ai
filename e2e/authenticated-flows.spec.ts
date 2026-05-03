import { test, expect } from "@playwright/test";
import { signInCreatorFromLanding } from "./helpers/signInCreator";

function loginCredentials(): { email: string; password: string } | null {
  const email = process.env.E2E_LOGIN_EMAIL?.trim();
  const password = process.env.E2E_LOGIN_PASSWORD;
  if (!email || password == null || String(password).length === 0) return null;
  return { email, password: String(password) };
}

/**
 * Post-login flows against preview + Firebase. Requires a dedicated test creator account
 * with creator dashboard access (not fan-only) and 127.0.0.1:4173 authorized in Firebase.
 */
test.describe("authenticated creator flows (optional)", () => {
  test.beforeEach(() => {
    const creds = loginCredentials();
    test.skip(!creds, "Set E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD");
  });

  test("dashboard shows creator or admin shell after sign-in", async ({ page }) => {
    test.setTimeout(120_000);
    const creds = loginCredentials()!;

    await signInCreatorFromLanding(page, creds.email, creds.password);

    const inviteRequired = page.getByRole("heading", { name: "Invite Required" });
    if (await inviteRequired.isVisible().catch(() => false)) {
      test.skip(true, "Invite-only gate: use an invited or admin test account");
    }

    const memberShell = page.getByRole("heading", { name: "Member sign-in" });
    if (await memberShell.isVisible().catch(() => false)) {
      throw new Error(
        "E2E account is fan-only (no creator workspace). Use a creator test user with creatorApp access.",
      );
    }

    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: /Welcome back|Echoflux Command Center/i }).first(),
    ).toBeVisible({ timeout: 60_000 });
  });

  test("Fan Hub loads tab strip (My Page)", async ({ page }) => {
    test.skip(
      process.env.E2E_FAN_HUB_SMOKE !== "1" && process.env.E2E_FAN_HUB_SMOKE !== "true",
      "Set E2E_FAN_HUB_SMOKE=1 when the login account has Pro/Elite Fan Hub access",
    );
    test.setTimeout(120_000);
    const creds = loginCredentials()!;

    await signInCreatorFromLanding(page, creds.email, creds.password);

    const inviteRequired = page.getByRole("heading", { name: "Invite Required" });
    if (await inviteRequired.isVisible().catch(() => false)) {
      test.skip(true, "Invite-only gate");
    }

    const memberShell = page.getByRole("heading", { name: "Member sign-in" });
    if (await memberShell.isVisible().catch(() => false)) {
      test.skip(true, "Fan-only account cannot open Fan Hub in EchoFlux");
    }

    await page.goto("/fan-hub?tab=myPage");
    await expect(page.getByRole("button", { name: "My Page" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Messages" })).toBeVisible();
  });

  test("Fan Hub Messages tab opens (DM shell)", async ({ page }) => {
    test.skip(
      process.env.E2E_FAN_HUB_MESSAGES_SMOKE !== "1" && process.env.E2E_FAN_HUB_MESSAGES_SMOKE !== "true",
      "Set E2E_FAN_HUB_MESSAGES_SMOKE=1 for Messages-tab smoke",
    );
    test.setTimeout(120_000);
    const creds = loginCredentials()!;

    await signInCreatorFromLanding(page, creds.email, creds.password);

    const inviteRequired = page.getByRole("heading", { name: "Invite Required" });
    if (await inviteRequired.isVisible().catch(() => false)) {
      test.skip(true, "Invite-only gate");
    }

    const memberShell = page.getByRole("heading", { name: "Member sign-in" });
    if (await memberShell.isVisible().catch(() => false)) {
      test.skip(true, "Fan-only account");
    }

    await page.goto("/fan-hub?tab=messages");
    await expect(page).toHaveURL(/fan-hub/);
    await expect(page.getByRole("button", { name: "Messages" })).toBeVisible({ timeout: 60_000 });
  });

  test("admin route loads Admin Dashboard for Admin role", async ({ page }) => {
    test.skip(
      process.env.E2E_EXPECT_ADMIN !== "1" && process.env.E2E_EXPECT_ADMIN !== "true",
      "Set E2E_EXPECT_ADMIN=1 only when E2E_LOGIN_* is an Admin account",
    );
    test.setTimeout(120_000);
    const creds = loginCredentials()!;

    await signInCreatorFromLanding(page, creds.email, creds.password);

    const inviteRequired = page.getByRole("heading", { name: "Invite Required" });
    if (await inviteRequired.isVisible().catch(() => false)) {
      test.skip(true, "Invite-only gate");
    }

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible({ timeout: 60_000 });
  });
});
