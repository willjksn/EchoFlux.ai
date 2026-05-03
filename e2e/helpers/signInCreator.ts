import type { Page } from "@playwright/test";

/**
 * Email/password sign-in from landing (Firebase). Caller must skip when env credentials are missing.
 */
export async function signInCreatorFromLanding(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator("#echoflux-login-email").fill(email);
  await page.locator("#echoflux-login-password").fill(password);
  await page.locator('button[type="submit"]').filter({ hasText: "Log In" }).click();

  const dashboard = page.getByRole("button", { name: "Dashboard" });
  const inviteRequired = page.getByRole("heading", { name: "Invite Required" });
  const memberShell = page.getByRole("heading", { name: "Member sign-in" });
  await dashboard.or(inviteRequired).or(memberShell).waitFor({ state: "visible", timeout: 45_000 });
}
