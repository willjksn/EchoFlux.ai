import { test, expect, type Page } from "@playwright/test";

/**
 * End-to-end guest treat purchase against a real deployment (Stripe test mode).
 *
 * Prerequisites:
 * - Vercel (or other) URL with working `/api/createFanCheckoutSession` and Stripe **test** keys
 * - Creator handle with member store enabled and at least one visible product with `showInMemberStore`
 * - Creator has Stripe Connect complete **or** is in PLATFORM_OWNER_CREATOR_IDS (platform checkout)
 *
 * Run:
 *   E2E_BASE_URL=https://your-app.vercel.app E2E_PUBLIC_HANDLE=yourhandle npx playwright test e2e/stripe-treat-checkout.spec.ts
 *
 * Full pay + return (optional, flaky on Stripe UI changes):
 *   E2E_STRIPE_COMPLETE=1 npx playwright test e2e/stripe-treat-checkout.spec.ts
 */

const baseURL = (process.env.E2E_BASE_URL || "").replace(/\/$/, "");
const publicHandle = (process.env.E2E_PUBLIC_HANDLE || "").trim();
const runComplete = process.env.E2E_STRIPE_COMPLETE === "1" || process.env.E2E_STRIPE_COMPLETE === "true";

async function fillStripeHostedCheckout(page: Page): Promise<void> {
  // Stripe Checkout UI varies (region, A/B). Try common patterns.
  const email = page.locator('input[type="email"], input#email, input[name="email"]').first();
  if (await email.isVisible({ timeout: 8000 }).catch(() => false)) {
    await email.fill("e2e-stripe-treat@example.com");
  }

  // "Pay with card" expansion (some sessions)
  const cardTab = page.getByRole("button", { name: /card/i });
  if (await cardTab.isVisible({ timeout: 4000 }).catch(() => false)) {
    await cardTab.click();
  }

  // Payment Element: card fields often live inside iframes
  const stripeFrameCount = await page.locator('iframe[name^="__privateStripeFrame"]').count();
  if (stripeFrameCount > 0) {
    const frame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();
    const numberField = frame
      .locator(
        'input[name="cardnumber"], input[autocomplete="cc-number"], [data-elements-stable-field-name="cardNumber"]'
      )
      .first();
    await numberField.waitFor({ state: "visible", timeout: 25_000 });
    await numberField.fill("4242424242424242");

    const exp = frame.locator('input[name="exp-date"], input[autocomplete="cc-exp"]').first();
    if (await exp.isVisible({ timeout: 3000 }).catch(() => false)) {
      await exp.fill("12/34");
    } else {
      const expMonth = frame.locator('input[placeholder*="MM" i], input[name="expiry"]').first();
      if (await expMonth.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expMonth.fill("1234");
      }
    }

    const cvc = frame.locator('input[name="cvc"], input[autocomplete="cc-csc"]').first();
    if (await cvc.isVisible({ timeout: 5000 }).catch(() => false)) {
      await cvc.fill("123");
    }

    const zip = frame.locator('input[name="postal"], input[autocomplete="postal-code"]').first();
    if (await zip.isVisible({ timeout: 3000 }).catch(() => false)) {
      await zip.fill("94107");
    }
  } else {
    // Older / alternate single-page layout
    const cardNumber = page.locator('[autocomplete="cc-number"], input[name="cardnumber"]').first();
    await cardNumber.waitFor({ state: "visible", timeout: 20_000 });
    await cardNumber.fill("4242424242424242");
    const exp = page.locator('[autocomplete="cc-exp"]').first();
    if (await exp.isVisible({ timeout: 3000 }).catch(() => false)) {
      await exp.fill("12 / 34");
    }
    const cvc = page.locator('[autocomplete="cc-csc"]').first();
    if (await cvc.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cvc.fill("123");
    }
  }

  const submit = page.getByTestId("hosted-payment-submit-button").or(page.getByRole("button", { name: /pay/i }));
  await submit.first().click({ timeout: 15_000 });
}

test.describe("Stripe guest treat (deployed app)", () => {
  test.beforeEach(() => {
    test.skip(!baseURL, "Set E2E_BASE_URL (e.g. https://your-deployment.vercel.app)");
    test.skip(!publicHandle, "Set E2E_PUBLIC_HANDLE to a published creator handle");
  });

  test("guest treat flow reaches Stripe Checkout (test mode)", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto(`${baseURL}/${encodeURIComponent(publicHandle)}`);
    await expect(page.locator("body")).toBeVisible();

    const openStore = page.getByRole("button", { name: /open treat store/i });
    await openStore.click({ timeout: 45_000 });

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    const buy = dialog.getByRole("button", { name: /^buy$/i }).first();
    await expect(buy).toBeEnabled({ timeout: 45_000 });
    await buy.click();

    await page.waitForURL(/checkout\.stripe\.com\/c\/pay\//, { timeout: 90_000 });
    await expect(page).toHaveURL(/checkout\.stripe\.com/);
  });

  test("guest treat completes test payment and returns with treat_success", async ({ page }) => {
    test.skip(!runComplete, "Set E2E_STRIPE_COMPLETE=1 to run full card entry (may break on Stripe UI updates)");
    test.setTimeout(180_000);

    await page.goto(`${baseURL}/${encodeURIComponent(publicHandle)}`);
    await page.getByRole("button", { name: /open treat store/i }).click({ timeout: 45_000 });
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
    const buy = page.getByRole("dialog").getByRole("button", { name: /^buy$/i }).first();
    await expect(buy).toBeEnabled({ timeout: 45_000 });
    await buy.click();

    await page.waitForURL(/checkout\.stripe\.com\/c\/pay\//, { timeout: 90_000 });
    await fillStripeHostedCheckout(page);

    await page.waitForURL((url) => url.searchParams.get("treat_success") === "1", { timeout: 120_000 });
    expect(page.url()).toContain("treat_success=1");
  });
});
