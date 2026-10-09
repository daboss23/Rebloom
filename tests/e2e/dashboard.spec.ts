import { expect, test } from "@playwright/test";

// The clinic dashboard in demo mode. Each test gets a fresh browser, so a fresh sandbox and its own
// copy of the twelve demo clients (DECISIONS D-014).

test.beforeEach(async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard\/enter$/);
  await page.getByRole("button", { name: "Enter demo as Dana" }).click();
  // The first sign-in on a fresh dev server also compiles the dashboard and copies the demo clients.
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
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

test("Sofia said yes to texts, so Dana can text her instead, and the way out stays in", async ({ page }) => {
  const sofia = page.getByRole("listitem").filter({ hasText: "Sofia Morales" });
  await sofia.getByRole("button", { name: "Review & send" }).click();
  const sheet = page.getByRole("dialog", { name: "Review & send" });
  await expect(sheet.getByRole("radio", { name: "Email" })).toBeChecked();
  await sheet.getByRole("radio", { name: "Text" }).click();

  const text = sheet.getByRole("textbox", { name: "Text" });
  await expect(text).toHaveValue(/^Hi Sofia, it's Dana at Maison Verre\. .* Reply STOP to opt out\.$/);
  await expect(sheet.getByText("On Sofia's phone")).toBeVisible();
  await expect(sheet).toContainText(/To Sofia Morales · \(\d{3}\) 555-\d{4}/);
  await expect(sheet).toContainText(/characters, sent as (one text|2 parts)\./);

  await text.fill("Hi Sofia, shall I hold a time next week?");
  // The preview follows the edit, as it will land on her phone.
  await expect(sheet.getByRole("figure")).toContainText("Hi Sofia, shall I hold a time next week?");
  await sheet.getByRole("button", { name: "Send text" }).click();
  await expect(sheet.getByRole("alert")).toHaveText('Keep "Reply STOP to opt out." at the end of the text.');

  await text.fill("Hi Sofia, shall I hold a time next week? Reply STOP to opt out.");
  await sheet.getByRole("button", { name: "Send text" }).click();
  await expect(page.getByText("Texted Sofia. Logged in the outbox, not sent (demo).")).toBeVisible();
  await expect(sheet).toBeHidden();

  await page.goto("/dashboard/rebook");
  const sent = page.locator("details").filter({ hasText: "Sofia Morales" });
  await expect(sent).toContainText("Text · Hi Sofia, shall I hold a time next week?");
});

test("Daniel's text waited 18 days: Dana answers it from his brief, and it leaves Today", async ({ page }) => {
  const waiting = page.getByRole("region", { name: "Waiting on your answer" });
  await expect(waiting).toContainText("Daniel Walsh");
  await expect(waiting).toContainText("Priya Shah");
  // The queue warns before a pre-written message talks past him.
  await expect(page.getByRole("listitem").filter({ hasText: "The second peel was due" })).toContainText("Wrote back:");

  await waiting.getByRole("link", { name: /Daniel Walsh/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/clients\/.+#conversation$/);
  const conversation = page.getByRole("region", { name: "Daniel wrote back" });
  await expect(conversation).toContainText("Could I come in on a Saturday morning?");
  await expect(conversation).toContainText("Waiting on you · 18 days");
  // He texted, so the answer starts as a text.
  await expect(conversation.getByRole("radio", { name: "Text" })).toBeChecked();

  await conversation.getByRole("textbox", { name: "Answer Daniel" }).fill("Saturday at 10 works. Shall I hold it for you?");
  await conversation.getByRole("button", { name: "Send text" }).click();
  await expect(page.getByText("Texted Daniel. Logged here, not sent (a sample client).")).toBeVisible();
  const done = page.getByRole("region", { name: "Conversation" });
  await expect(done).toContainText("Saturday at 10 works. Shall I hold it for you?");
  await expect(done).not.toContainText("Waiting on you");

  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "Waiting on your answer" })).not.toContainText("Daniel Walsh");
});

test("a reply that needs no answer is marked handled, and Undo brings it back", async ({ page }) => {
  await page.getByRole("region", { name: "Waiting on your answer" }).getByRole("link", { name: /Priya Shah/ }).click();
  const conversation = page.getByRole("region", { name: "Priya wrote back" });
  await expect(conversation).toContainText("Is there any downtime after the first session?");
  await expect(conversation).toContainText("Re: Your skin report from Maison Verre");
  await conversation.getByRole("button", { name: "No answer needed" }).click();
  await expect(page.getByText("Marked as handled.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Conversation" })).toContainText("Marked as handled by Dana.");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Waiting on your answer again.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Priya wrote back" })).toContainText("Waiting on you");
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

test("a stalled plan's brief offers the review itself, not a link back to the same page", async ({ page }) => {
  await page.goto("/dashboard/clients");
  await page.getByRole("link", { name: /Grace L/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Grace L.");
  const flag = page.getByRole("region", { name: "In the queue" });
  await expect(flag.getByRole("link", { name: "Open brief" })).toHaveCount(0);
  await flag.getByRole("button", { name: "Mark as reviewed" }).click();
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
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
