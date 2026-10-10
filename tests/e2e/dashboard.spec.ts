import { createHash, createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

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

/** A demo client's brief link, from the client list. */
async function briefOf(page: Page, name: string): Promise<string> {
  await page.goto("/dashboard/clients");
  const href = await page.locator('a[href^="/dashboard/clients/"]').filter({ hasText: name }).first().getAttribute("href");
  return href!;
}

/** The signed token in a client's unsubscribe link, made as the server makes it (D-086). The dev server's secret. */
const unsubscribeToken = (clientId: string) => {
  const hex = clientId.replace(/-/g, "");
  const secret = `${process.env.IP_HASH_SALT || "rebloom-local-development-secret"}:unsubscribe`;
  return hex + createHmac("sha256", secret).update(hex).digest("hex").slice(0, 16);
};

/**
 * The signed token in a link that carries a demo to another device, made as the server makes it (D-088, D-090):
 * sandbox, subject (a client, or a clinic to scan in at), expiry. Each purpose signs with its own key.
 */
const HANDOFF_KEYS = { answer: "dashboard-handoff", brief: "handoff:brief", scan: "handoff:scan" } as const;
const handoffToken = (sandboxId: string, subjectId: string, { purpose = "answer", secondsLeft = 14 * 86_400 }: { purpose?: keyof typeof HANDOFF_KEYS; secondsLeft?: number } = {}) => {
  const expires = Buffer.alloc(4);
  expires.writeUInt32BE(Math.floor(Date.now() / 1000) + secondsLeft);
  const payload = Buffer.concat([Buffer.from(sandboxId.replace(/-/g, ""), "hex"), Buffer.from(subjectId.replace(/-/g, ""), "hex"), expires]);
  const secret = `${process.env.IP_HASH_SALT || "rebloom-local-development-secret"}:${HANDOFF_KEYS[purpose]}`;
  return Buffer.concat([payload, createHmac("sha256", secret).update(payload).digest().subarray(0, 12)]).toString("base64url");
};

/** Maison Verre's id, as the seed data makes it (stableId). */
const MAISON_VERRE_ID = (() => {
  const h = createHash("sha1").update("rebloom:clinic:maison-verre").digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
})();

test("Sofia unsubscribes from the link in an email: the queue texts her instead, and her brief says so", async ({ page, request }) => {
  const brief = await briefOf(page, "Sofia Morales");
  const token = unsubscribeToken(brief.split("/").pop()!);

  await page.goto(`/c/maison-verre/unsubscribe/${token}`);
  await expect(page.getByRole("heading", { name: "Stop emails from Maison Verre?" })).toBeVisible();
  await expect(page.getByText("Rebloom demo: Sofia is a sample client.")).toBeVisible();
  await page.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(page.getByRole("heading", { name: "You're unsubscribed." })).toBeVisible();
  // She said yes to texts, so the page says how to stop those too.
  await expect(page.getByText("Reply STOP to any text from us")).toBeVisible();
  // A reload shows where she stands; it never presses anything again.
  await page.reload();
  await expect(page.getByRole("heading", { name: "You're unsubscribed." })).toBeVisible();

  await page.goto("/dashboard");
  const row = page.getByRole("listitem").filter({ hasText: "Sofia Morales" });
  await expect(row).toContainText("Unsubscribed from emails, so a text.");
  await page.goto(brief);
  await expect(page.getByRole("region", { name: "About the client" })).toContainText("Unsubscribed");
  await expect(page.getByRole("region", { name: "Conversation" })).toContainText("Unsubscribed from emails, from the link in an email.");

  // Unsubscribed by mistake: one press brings emails back.
  await page.goto(`/c/maison-verre/unsubscribe/${token}`);
  await page.getByRole("button", { name: "Keep getting emails" }).click();
  await expect(page.getByRole("heading", { name: "You'll keep hearing from us." })).toBeVisible();

  // A mail app's own Unsubscribe button posts straight to the link in the email's headers (RFC 8058).
  const posted = await request.post(`/api/unsubscribe/${token}`, { form: { "List-Unsubscribe": "One-Click" } });
  expect(posted.status()).toBe(200);
  await page.goto(brief);
  await expect(page.getByRole("region", { name: "Conversation" })).toContainText("Unsubscribed from emails, from their mail app.");
  expect((await request.post(`/api/unsubscribe/${token.slice(0, -1)}0`)).status()).toBe(404);
});

test("Amelia asked to stop emails: Dana records it on her brief", async ({ page }) => {
  await page.goto(await briefOf(page, "Amelia"));
  const about = page.getByRole("region", { name: "About the client" });
  await expect(about).toContainText("Reminders on");
  await about.getByRole("button", { name: "Stop emails" }).click();
  await expect(about).toContainText("Only when Amelia asks.");
  await about.getByRole("group", { name: "Stop emails to Amelia" }).getByRole("button", { name: "Stop emails" }).click();
  await expect(about).toContainText("Unsubscribed");
  await expect(about.getByRole("button", { name: "Stop emails" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Conversation" })).toContainText("Emails stopped by Dana, at their request.");
});

test("Settings says where reply alerts go, and checks the address", async ({ page }) => {
  await page.goto("/dashboard/settings#replies");
  const replies = page.getByRole("region", { name: "Replies" });
  const email = replies.getByLabel("Email alerts to");
  const phone = replies.getByLabel("Text alerts to");
  const save = replies.getByRole("button", { name: "Save" });
  await expect(save).toBeDisabled();

  await email.fill("dana@maisonverre");
  await save.click();
  await expect(replies.getByRole("status")).toHaveText("That email address doesn't look right.");
  await email.fill("Dana@MaisonVerre.test");
  await phone.fill("310 555 0142");
  await save.click();
  await expect(replies.getByRole("status")).toHaveText("Saved. Replies are sent to dana@maisonverre.test and (310) 555-0142 as they land.");

  await page.reload();
  await expect(email).toHaveValue("dana@maisonverre.test");
  await expect(phone).toHaveValue("(310) 555-0142");
  await email.fill("");
  await phone.fill("");
  await save.click();
  await expect(replies.getByRole("status")).toHaveText("Reply alerts are off.");
});

test("news that lands while the dashboard is open rises in: a reply, then someone who scanned in", async ({ page }) => {
  // Daniel and Priya were already waiting when Dana came in: Today lists them, the menu counts them, nothing pops up.
  await expect(page.getByRole("link", { name: /^Today.*2 replies waiting/ }).first()).toBeVisible();
  const sofia = (await briefOf(page, "Sofia Morales")).split("/").pop()!;
  const priya = (await briefOf(page, "Priya Shah")).split("/").pop()!;
  await page.goto("/dashboard");
  await expect(page.getByRole("article")).toHaveCount(0);

  // Sofia writes back while the dashboard is open (the webhook's side is covered by the unit tests).
  const reply = { id: "e2e-reply", clientId: sofia, name: "Sofia Morales", first: "Sofia", channel: "email", body: "Is Thursday free?", at: new Date().toISOString() };
  const live: { waiting: unknown[]; arrivals: unknown[] } = { waiting: [reply], arrivals: [] };
  await page.route("**/api/dashboard/live", (route) => route.fulfill({ json: live }));
  const notice = page.getByRole("article", { name: "Sofia wrote back" });
  // Coming back to the tab checks at once, rather than at the next tick. Once the page is live, that is.
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(notice).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(notice).toContainText("Sofia Morales · By email · Just now");
  await expect(notice).toContainText("Is Thursday free?");
  await notice.getByRole("link", { name: "Answer Sofia" }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/clients/${sofia}#conversation$`));
  await expect(notice).toHaveCount(0);

  // Seen once, shown once: the next check doesn't bring it back.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("article", { name: "Sofia wrote back" })).toHaveCount(0);

  // Someone scans themselves in on their phone, from the dashboard's code (D-090).
  live.arrivals = [{ clientId: priya, name: "Joshua Reed", first: "Joshua", at: new Date().toISOString() }];
  const arrival = page.getByRole("article", { name: "Joshua just scanned" });
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(arrival).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(arrival).toContainText("Joshua Reed · First scan · Just now");
  await arrival.getByRole("link", { name: "Open Joshua's brief" }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/clients/${priya}$`));
});

test("the dashboard's code carries the demo to a phone, to scan in as a new client", async ({ page, browser }) => {
  const scanIn = page.getByRole("region", { name: "Scan yourself in" });
  const code = scanIn.getByRole("img", { name: "Code to scan yourself in to Maison Verre on your phone" });
  // On a phone already, no code to point a phone at: the scan starts right here.
  await expect(scanIn.getByRole("link", { name: "Start a scan" })).toHaveAttribute("href", "/c/maison-verre");
  await expect(code).toBeHidden();
  // On a laptop, the code.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(code).toBeVisible();
  await expect(scanIn.getByRole("link", { name: "Or scan on this device" })).toHaveAttribute("href", "/c/maison-verre");
  const sandbox = (await page.context().cookies()).find((c) => c.name === "rb_sandbox")!.value;

  // The phone joins this demo and opens the clinic's scan page; what it scans lands in this dashboard.
  const phone = await browser.newContext();
  const tab = await phone.newPage();
  await tab.goto(`/scan/${handoffToken(sandbox, MAISON_VERRE_ID, { purpose: "scan" })}`);
  await expect(tab).toHaveURL(/\/c\/maison-verre$/);
  expect((await phone.cookies()).find((c) => c.name === "rb_sandbox")?.value).toBe(sandbox);

  // A code made for something else opens the scan page in a demo of its own.
  const stranger = await browser.newContext();
  const other = await stranger.newPage();
  await other.goto(`/scan/${handoffToken(sandbox, MAISON_VERRE_ID, { purpose: "brief" })}`);
  await expect(other).toHaveURL(/\/#try$/);
  expect((await stranger.cookies()).some((c) => c.name === "rb_sandbox")).toBe(false);
  await Promise.all([phone.close(), stranger.close()]);
});

test("a reply alert's Answer link opens the same demo on another device, and nothing else", async ({ page, browser }) => {
  const brief = await briefOf(page, "Sofia Morales");
  const sandbox = (await page.context().cookies()).find((c) => c.name === "rb_sandbox")!.value;

  // The phone: a browser that has never seen this demo.
  const phone = await browser.newContext();
  const tab = await phone.newPage();
  await tab.goto(`/dashboard/open/${handoffToken(sandbox, brief.split("/").pop()!)}`);
  await expect(tab).toHaveURL(new RegExp(`${brief}#conversation$`));
  await expect(tab.getByRole("heading", { level: 1 })).toContainText("Sofia");
  expect((await phone.cookies()).find((c) => c.name === "rb_sandbox")?.value).toBe(sandbox);

  // A token that's been altered, or has run out, goes to the front door with no demo joined.
  const stranger = await browser.newContext();
  const door = await stranger.newPage();
  const token = handoffToken(sandbox, brief.split("/").pop()!);
  await door.goto(`/dashboard/open/${token.slice(0, -2)}${token.endsWith("AA") ? "BB" : "AA"}`);
  await expect(door).toHaveURL(/\/dashboard\/enter$/);
  await door.goto(`/dashboard/open/${handoffToken(sandbox, brief.split("/").pop()!, { secondsLeft: -60 })}`);
  await expect(door).toHaveURL(/\/dashboard\/enter$/);
  expect((await stranger.cookies()).some((c) => c.name === "rb_sandbox")).toBe(false);
  await Promise.all([phone.close(), stranger.close()]);
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
