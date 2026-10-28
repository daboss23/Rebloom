// The README's screenshots (docs/screenshots), taken from a running app: `pnpm dev`, then
//   node scripts/screenshots.mjs [baseUrl]
// Needs Playwright's browser once: `npx playwright install chromium`. Enters the demo as Dana, so it makes one demo.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const out = path.join(import.meta.dirname, "..", "docs", "screenshots");
const base = process.argv[2] ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (page, name) => page.screenshot({ path: path.join(out, name), type: "jpeg", quality: 82 });

const browser = await chromium.launch();
const log = (...a) => console.log(...a);

// The dev server's own badge isn't part of the product.
const hideDevBadge = (ctx) =>
  ctx.addInitScript(() => {
    const style = () => {
      const el = document.createElement("style");
      el.textContent = "nextjs-portal{display:none!important}";
      document.head.appendChild(el);
    };
    if (document.head) style();
    else document.addEventListener("DOMContentLoaded", style);
  });

// ---------- Desktop ----------
const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
await hideDevBadge(desk);
const page = await desk.newPage();

await page.goto(`${base}/`, { waitUntil: "networkidle" });
await wait(2500);
await shot(page, "landing.jpg");
log("landing");

await page.goto(`${base}/dashboard/enter`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Enter demo as Dana" }).click();
await page.waitForURL(/\/dashboard$/, { timeout: 60_000 });
await page.waitForLoadState("networkidle");
await wait(3500);
await shot(page, "today.jpg");
log("today");

// The queue, scrolled to its heading.
await page.locator("#contact").scrollIntoViewIfNeeded();
await page.evaluate(() => {
  document.querySelector("#contact").scrollIntoView({ block: "start" });
  window.scrollBy(0, -40);
});
await wait(1500);
await shot(page, "queue.jpg");
log("queue");

// Sofia's brief.
await page.goto(`${base}/dashboard/clients`, { waitUntil: "networkidle" });
const sofia = await page.locator('a[href*="/dashboard/clients/"]', { hasText: "Sofia" }).first().getAttribute("href");
await page.goto(`${base}${sofia}`, { waitUntil: "networkidle" });
await wait(3000);
await shot(page, "brief.jpg");
const report = await page.locator('a[href^="/r/"]', { hasText: /report/i }).first().getAttribute("href");
log("brief", report);

await page.goto(`${base}/dashboard/insights`, { waitUntil: "networkidle" });
await wait(3000);
await shot(page, "insights.jpg");
log("insights");

// ---------- Phone ----------
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
});
await hideDevBadge(phone);
const p = await phone.newPage();

await p.goto(`${base}/c/maison-verre`, { waitUntil: "networkidle" });
await wait(2000);
await shot(p, "phone-clinic.jpg");
log("phone clinic");

await p.goto(`${base}${report}`, { waitUntil: "networkidle" });
await wait(3500);
await shot(p, "phone-report.jpg");
log("phone report");

const toHeading = async (text) => {
  await p.evaluate((t) => {
    const h = [...document.querySelectorAll("h2")].find((x) => x.textContent.includes(t));
    h?.scrollIntoView({ block: "start" });
    window.scrollBy(0, -80);
  }, text);
  await wait(1800);
};
await toHeading("What's changed");
await shot(p, "phone-progress.jpg");
log("phone progress");
await toHeading("Your latest scan, mapped");
await shot(p, "phone-facemap.jpg");
log("phone facemap");

await browser.close();
