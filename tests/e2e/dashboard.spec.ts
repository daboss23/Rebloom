import { expect, test } from "@playwright/test";

// The clinic dashboard in demo mode. Each test gets a fresh browser, so a fresh sandbox and its own
// copy of the twelve demo clients (DECISIONS D-014).

test.beforeEach(async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard\/enter$/);
  await page.getByRole("button", { name: "Enter demo as Dana" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("Today says who to contact and why, and a reviewed email moves to the outbox", async ({ page }) => {
  const count = page.getByRole("listitem").filter({ hasText: "people to contact" });
  await expect(count).toContainText("7");
  const sofia = page.getByRole("listitem").filter({ hasText: "Sofia Morales" });
  await expect(sofia).toContainText("Progress moment");
  await expect(sofia).toContainText(/Wrinkles improved \d+ points since the first scan/);

  await sofia.getByRole("button", { name: "Review & send" }).click();
  const sheet = page.getByRole("dialog", { name: "Review & send" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("Subject")).toHaveValue("Real change on your latest scan, Sofia");
  await sheet.getByLabel("Message").fill("Hi Sofia,\n\nYour latest scan shows real change. Shall I hold a time next week?\n\nDana");
  await sheet.getByRole("button", { name: "Send email" }).click();

  await expect(page.getByText("Sent to Sofia. Logged in the outbox, not emailed (demo).")).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("listitem").filter({ hasText: "Wrinkles improved" })).toHaveCount(0);
  // The morning's numbers follow: one fewer person to contact.
  await expect(count).toContainText("6");

  await page.goto("/dashboard/rebook");
  const sent = page.locator("details").filter({ hasText: "Sofia Morales" });
  await expect(sent).toContainText("Real change on your latest scan, Sofia");
  await sent.locator("summary").click();
  await expect(sent).toContainText("Shall I hold a time next week?");
});

test("Chloe has no email consent, so the queue offers a call instead", async ({ page }) => {
  const chloe = page.getByRole("listitem").filter({ hasText: "Chloe Bennett" });
  await expect(chloe.getByRole("link", { name: /Call/ })).toHaveAttribute("href", /^tel:/);
  await expect(chloe.getByRole("button", { name: "Review & send" })).toHaveCount(0);
  await chloe.getByRole("button", { name: "Mark as called" }).click();
  await expect(page.getByText("Called. Moved to done.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Done" })).toBeVisible();
  // One click too many is easy to take back.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Chloe Bennett" }).getByRole("button", { name: "Mark as called" })).toBeVisible();
});

test("closing the sheet keeps Dana's edits, and focus goes back to the row", async ({ page }) => {
  const priya = page.getByRole("listitem").filter({ hasText: "Priya Shah" });
  const open = priya.getByRole("button", { name: "Review & send" });
  await open.click();
  const sheet = page.getByRole("dialog", { name: "Review & send" });
  await sheet.getByLabel("Message").fill("Hi Priya, a quick note from Dana.");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(open).toBeFocused();
  await open.click();
  await expect(page.getByRole("dialog", { name: "Review & send" }).getByLabel("Message")).toHaveValue("Hi Priya, a quick note from Dana.");
});

test("moving the clock forward brings Isabel's follow-up", async ({ page }) => {
  await expect(page.getByRole("listitem").filter({ hasText: "Isabel Navarro" })).toHaveCount(0);
  const clock = page.getByRole("group", { name: "Move the demo clock forward" }).filter({ visible: true });
  await clock.getByRole("button", { name: "+1 day" }).click();
  await expect(page.getByText("+1 days").filter({ visible: true })).toBeVisible();
  await clock.getByRole("button", { name: "+1 day" }).click();
  await expect(page.getByText("+2 days").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Isabel Navarro" })).toContainText("New lead");
});

test("the practitioner brief confirms the plan the report suggests", async ({ page }) => {
  await page.goto("/dashboard/clients");
  await page.getByRole("link", { name: /Marcus Thompson/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Marcus T.");
  await expect(page.getByText("In Marcus's words")).toBeVisible();
  await expect(page.getByText("Suggested plan")).toBeVisible();
  await page.getByRole("button", { name: "Confirm plan with client" }).click();
  await expect(page.getByText("Confirmed plan")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm plan with client" })).toHaveCount(0);
});

test("the note Dana writes is saved for the client's report", async ({ page }) => {
  await page.goto("/dashboard/clients");
  await page.getByRole("link", { name: /Priya Shah/ }).click();
  const note = page.getByLabel("Your note on their report");
  await note.fill("Lovely to meet you, Priya. Start with the peel series and we'll see how your skin settles.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Note saved. It shows on the client's report.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Your note on their report")).toHaveValue(/Lovely to meet you, Priya/);
});

test("Insights shows four numbers and one chart, all from the data", async ({ page }) => {
  await page.goto("/dashboard/insights");
  await expect(page.getByRole("heading", { name: "Revenue kept through rebooking" })).toBeVisible();
  for (const term of ["Rebook rate", "Reports that became bookings", "Clients at risk"]) await expect(page.getByText(term, { exact: true })).toBeVisible();
  await expect(page.locator("table caption", { hasText: "Revenue kept through rebooking, by month" })).toHaveCount(1);
});
