/**
 * Rendered UI smoke for marketing/legal label updates (requires preview on :4173).
 * Run: npm run build && npm run preview -- --host 127.0.0.1 --port 4173
 *      npx tsx scripts/smoke-marketing-labels.ts
 */
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE?.trim() || "http://127.0.0.1:4173";

const checks: { path: string; texts: string[] }[] = [
  {
    path: "/",
    texts: [
      "EchoFlux & witme.io",
      "Plan",
      "EchoFlux assistant",
      "Post ideas & Drop plan",
      "Plan → Today",
    ],
  },
  {
    path: "/faq",
    texts: [
      "How does Plan work?",
      "Weekly monetization",
      "Post ideas and Drop plan",
      "What's the difference between Pro and Elite",
      "EchoFlux assistant",
    ],
  },
  {
    path: "/terms",
    texts: ["May 19, 2026", "Fan Hub"],
  },
  {
    path: "/privacy",
    texts: ["May 19, 2026", "Post ideas and Drop plan"],
  },
  {
    path: "/pricing",
    texts: ["Plan → Today", "Fan Hub → Posts", "Multi-week strategy"],
  },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const failures: string[] = [];

  for (const { path, texts } of checks) {
    const url = `${BASE}${path}`;
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    if (!res?.ok()) {
      failures.push(`${path}: HTTP ${res?.status() ?? "no response"}`);
      continue;
    }
    if (path === "/") {
      await page.locator("#features").scrollIntoViewIfNeeded();
    }
    if (path === "/faq") {
      await page.getByRole("button", { name: /How does Plan work/i }).click();
    }
    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    for (const text of texts) {
      if (!bodyText.includes(text.toLowerCase())) {
        failures.push(`${path}: missing "${text}"`);
      }
    }
  }

  await browser.close();

  if (failures.length) {
    console.error("smoke-marketing-labels: FAILED");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("smoke-marketing-labels: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
