import { expect, test, type Page } from "@playwright/test";

// Booking from the report (DECISIONS D-065, D-066), with the deposit taken by a local stand-in for Stripe
// (tests/e2e/mock-stripe.mjs). Each test is a fresh browser, so a fresh sandbox and its own demo clients.

const STRIPE = `http://localhost:${process.env.MOCK_STRIPE_PORT ?? 3298}`;

/** Enters the demo and returns Priya's report link: a lead with a report and nothing booked. */
async function priyasReport(page: Page): Promise<string> {
  await page.goto("/dashboard/enter");
  await page.getByRole("button", { name: "Enter demo as Dana" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
  await page.goto("/dashboard/clients");
  await page.getByRole("link", { name: /Priya Shah/ }).first().click();
  const href = await page.locator('a[href^="/r/"]').first().getAttribute("href");
  return `/r/${href!.split("/")[2]}`;
}

/** Settings: turns deposits off, clicking only while the switch still reads on (a click before the page is interactive does nothing). */
async function switchDepositsOff(page: Page) {
  const toggle = page.getByRole("switch", { name: "Take a $50 deposit at booking" });
  await expect(async () => {
    if ((await toggle.getAttribute("aria-checked")) === "true") await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false", { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByText("Deposits are off.")).toBeVisible({ timeout: 10_000 });
}

/** From the report, picks the second open day's first time. Returns the time's label. */
async function chooseTime(page: Page, report: string): Promise<string> {
  await page.goto(report);
  await page.getByRole("link", { name: /Book your first session/ }).click();
  await expect(page).toHaveURL(new RegExp(`${report}/book$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Consultation and");
  // Click until the page shows the choice: a click that lands before the page is interactive does nothing.
  const day = page.locator('ul[aria-labelledby="days-label"] button').nth(1);
  await expect(async () => {
    await day.click();
    await expect(day).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  const time = page.locator('section[aria-labelledby="times-label"] button').first();
  const label = (await time.textContent())!.trim();
  await expect(async () => {
    await time.click();
    await expect(time).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  return label;
}

test("a lead books her first session with a $50 test deposit, then cancels it for a full refund", async ({ page, request }) => {
  const report = await priyasReport(page);
  await chooseTime(page, report);
  await expect(page.getByText("A $50 deposit holds your time")).toBeVisible();
  await page.getByRole("button", { name: "Pay $50 deposit and book" }).click();

  // Stripe's page, then back to the confirmation.
  await expect(page).toHaveURL(new RegExp(`^${STRIPE}/pay/`));
  await page.getByRole("link", { name: "Pay" }).click();
  await expect(page).toHaveURL(new RegExp(`${report}/book/done$`), { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "You're booked, Priya." })).toBeVisible();
  await expect(page.getByText("$50 paid · goes toward your visit")).toBeVisible();
  await expect(page.getByText("Session 1 of 3")).toBeVisible();

  // The report now shows the visit, and the clinic sees her as booked.
  await page.goto(report);
  await expect(page.getByRole("heading", { name: "See you soon." })).toBeVisible();
  await page.goto("/dashboard/clients");
  await expect(page.getByRole("row", { name: /Priya Shah/ })).toContainText("Booked");

  // Cancel: the deposit is refunded through Stripe and the time opens again.
  await page.goto(`${report}/book`);
  await page.getByRole("button", { name: "Cancel this visit" }).click();
  await expect(page.getByText("Cancel this visit? Your $50 deposit comes back to you in full.")).toBeVisible();
  await page.getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(page.getByText("Your visit is cancelled and your deposit is on its way back.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Consultation and");
  const state = await (await request.get(`${STRIPE}/__state`)).json();
  expect(state.refunds.length).toBeGreaterThan(0);
});

test("leaving Stripe without paying gives the time back", async ({ page }) => {
  const report = await priyasReport(page);
  const time = await chooseTime(page, report);
  await page.getByRole("button", { name: "Pay $50 deposit and book" }).click();
  await expect(page).toHaveURL(new RegExp(`^${STRIPE}/pay/`));
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(new RegExp(`${report}/book$`), { timeout: 20_000 });
  const day = page.locator('ul[aria-labelledby="days-label"] button').nth(1);
  await expect(async () => {
    await day.click();
    await expect(day).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.locator('section[aria-labelledby="times-label"] button').first()).toHaveText(time);
  // Nothing was booked: the report still offers the first session.
  await page.goto(report);
  await expect(page.getByRole("link", { name: /Book your first session/ })).toBeVisible();
});

test("with deposits switched off in Settings, a time is booked at once with no payment", async ({ page }) => {
  const report = await priyasReport(page);
  await page.goto("/dashboard/settings");
  const toggle = page.getByRole("switch", { name: "Take a $50 deposit at booking" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await switchDepositsOff(page);
  await expect(page.getByText("Deposits are off. Clients book with no payment.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Take a $50 deposit at booking" })).toHaveAttribute("aria-checked", "false");

  await chooseTime(page, report);
  await expect(page.getByText("A $50 deposit holds your time")).toHaveCount(0);
  await page.getByRole("button", { name: "Book this time" }).click();
  await expect(page).toHaveURL(new RegExp(`${report}/book/done$`), { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "You're booked, Priya." })).toBeVisible();
  await expect(page.getByText("$50 paid")).toHaveCount(0);
});

test("the calendar invite downloads for a booked visit", async ({ page, request }) => {
  const report = await priyasReport(page);
  await page.goto("/dashboard/settings");
  await switchDepositsOff(page);
  await chooseTime(page, report);
  await page.getByRole("button", { name: "Book this time" }).click();
  await expect(page).toHaveURL(/\/book\/done$/, { timeout: 20_000 });
  const ics = await request.get(`${report}/book/visit.ics`);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  const text = await ics.text();
  expect(text).toContain("BEGIN:VEVENT");
  expect(text).toContain("Signature Peel Series");
});
