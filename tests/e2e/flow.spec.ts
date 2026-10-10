import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { completeIntake, GOOD_QUALITY, syntheticLandmarks } from "./helpers";

test("a client moves from the scan page through consent and intake to the camera", async ({ page }) => {
  await completeIntake(page);
  await expect(page.getByRole("heading", { name: "One good photo is all it takes." })).toBeVisible();
  await page.getByRole("button", { name: "Open the camera" }).click();
  // Chromium's fake camera shows no face, so the gate should ask for one and keep capture disabled.
  await expect(page.locator("p[aria-live=polite]")).toHaveText("Bring your face into the oval", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Take photo" })).toBeDisabled();
});

test("the camera's face guide downloads during the questions, not after", async ({ page }) => {
  const model = page.waitForRequest((r) => r.url().endsWith("/mediapipe/face_landmarker.task"), { timeout: 15_000 });
  await page.goto("/c/maison-verre/consent");
  await page.locator("label[for=biometric]").click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("1 of 7")).toBeVisible();
  await model;
  await expect(page).toHaveURL(/\/intake$/);
});

test("the intake can't be skipped", async ({ page }) => {
  await page.goto("/c/maison-verre/capture");
  await expect(page).toHaveURL(/\/consent$/);
});

test("a visit left part way offers to pick up or start over", async ({ page }) => {
  await page.goto("/c/maison-verre/consent");
  await page.locator("label[for=biometric]").click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Texture" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("2 of 7")).toBeVisible();

  await page.goto("/c/maison-verre");
  await page.getByRole("link", { name: "Pick up where you left off" }).click();
  // The next question still to answer (the goal question is optional).
  await expect(page.getByRole("heading", { name: "Any event coming up?" })).toBeVisible();

  await page.goto("/c/maison-verre");
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByRole("heading", { name: "Your photo, your choice." })).toBeVisible();
  await page.goto("/c/maison-verre");
  await expect(page.getByRole("link", { name: "Begin" })).toBeVisible();
});

test("after a finished scan, Begin starts a new visit instead of reopening the old one", async ({ page }) => {
  test.setTimeout(120_000);
  await completeIntake(page);
  const photo = await sharp({ create: { width: 810, height: 1080, channels: 3, background: "#cbb8a6" } }).jpeg().toBuffer();
  const scan = await (
    await page.request.post("/api/scans", {
      data: { clinicSlug: "maison-verre", width: 810, height: 1080, quality: GOOD_QUALITY, landmarks: syntheticLandmarks() },
    })
  ).json();
  await page.request.put(scan.upload.url, { headers: scan.upload.headers, data: photo });
  await page.request.post(`/api/scans/${scan.scanId}/analyze`);
  await page.goto(`/c/maison-verre/processing?scan=${scan.scanId}`);
  await expect(page.getByRole("dialog", { name: "Your skin report is ready." })).toBeVisible({ timeout: 30_000 });

  await page.goto("/c/maison-verre");
  await page.getByRole("link", { name: "Begin" }).click();
  // Consent again, then the first question: not the old visit's last one.
  await expect(page.getByRole("heading", { name: "Your photo, your choice." })).toBeVisible();
  await page.locator("label[for=biometric]").click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("1 of 7")).toBeVisible();
  await expect(page.getByRole("button", { name: "Texture" })).toHaveAttribute("aria-pressed", "false");
});

test("an uploaded photo without a face is explained, not accepted", async ({ page }) => {
  await completeIntake(page, "tidewater");
  const wall = await sharp({ create: { width: 600, height: 800, channels: 3, background: "#d8d2c8" } }).jpeg().toBuffer();
  await page.locator("input[type=file]").setInputFiles({ name: "wall.jpg", mimeType: "image/jpeg", buffer: wall });
  await expect(page.locator("p[role=alert]")).toContainText("We couldn't find a face in this photo.", { timeout: 30_000 });
});

test("the Rebloom landing page offers both demo clinics", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Everyone sells the scan. Rebloom sells the result.");
  await expect(page.getByRole("link", { name: /Maison Verre/ })).toHaveAttribute("href", "/c/maison-verre");
  await expect(page.getByRole("link", { name: /Tidewater Skin Studio/ })).toHaveAttribute("href", "/c/tidewater");
});

test("report links are private: a made-up token shows nothing", async ({ page }) => {
  const res = await page.goto("/r/this-is-not-a-real-report-token-at-all");
  expect(res?.status()).toBe(404);
});

test("a scan runs end to end in fixture mode, and Delete my data removes it", async ({ page }) => {
  // The whole journey, intake to deletion, compiling each page on first visit: about a minute on the dev server.
  test.setTimeout(120_000);
  await completeIntake(page);
  const created = await page.request.post("/api/scans", {
    data: { clinicSlug: "maison-verre", width: 810, height: 1080, quality: GOOD_QUALITY, landmarks: syntheticLandmarks() },
  });
  expect(created.ok()).toBe(true);
  const { scanId, upload } = await created.json();

  const photo = await sharp({ create: { width: 810, height: 1080, channels: 3, background: "#cbb8a6" } }).jpeg().toBuffer();
  expect((await page.request.put(upload.url, { headers: upload.headers, data: photo })).status()).toBe(204);
  expect((await page.request.post(`/api/scans/${scanId}/analyze`)).ok()).toBe(true);

  await page.goto(`/c/maison-verre/processing?scan=${scanId}`);
  // Once the analysis is in, the report is put together on screen before the gate opens.
  await expect(page.getByRole("heading", { name: "Putting your report together." })).toBeVisible({ timeout: 30_000 });

  // The report gate: a panel over the blurred report. No report link or real score reaches the page yet.
  const gate = page.getByRole("dialog", { name: "Your skin report is ready." });
  await expect(gate).toBeVisible({ timeout: 20_000 });
  expect(await page.content()).not.toContain("/r/");
  const preview = await page.request.get(`/api/scans/${scanId}/preview`);
  expect(preview.headers()["content-type"]).toBe("image/jpeg");
  await gate.getByLabel("First name").fill("Amelia");
  await gate.getByLabel("Last name").fill("Test");
  await gate.getByLabel("Primary email").fill("amelia@example.com");
  // Texts are their own yes, and need a number to reach (D-080).
  await gate.getByRole("checkbox", { name: /Text me reminders and progress updates from Maison Verre/ }).check();
  await gate.getByRole("button", { name: "Send my results" }).click();
  await expect(gate.getByText("Please add your mobile number for texts, or untick the box.")).toBeVisible();
  await gate.getByLabel(/^Phone/).fill("(310) 555-0199");
  await gate.getByRole("button", { name: "Send my results" }).click();

  // Confirmation, in place. Email isn't live yet, so it must not claim anything was sent.
  await expect(page.getByRole("heading", { name: "Amelia, your report is ready." })).toBeVisible();
  await expect(page.getByText("Thank you for completing your skin consultation with Maison Verre.")).toBeVisible();
  await expect(page.getByText("Demo: email isn't connected yet, so nothing was sent to amelia@example.com.")).toBeVisible();
  await expect(page.getByText("on their way")).toHaveCount(0);
  await page.getByRole("link", { name: "Open my report" }).click();

  await expect(page.getByRole("heading", { name: "Amelia, your skin is telling a clear story." })).toBeVisible();
  await expect(page.getByText("Demo analysis.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your three priorities" })).toBeVisible();
  const reportUrl = page.url();

  // A plan from the menu, timed to the wedding, priced in code.
  await expect(page.getByRole("heading", { name: "Your path to June 1" })).toBeVisible();
  await expect(page.getByText(/^Consultation and /)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your investment" })).toBeVisible();
  await expect(page.getByText("Estimated total")).toBeVisible();
  // Booking is online now (DECISIONS D-065), from the next real open time; the phone stays one tap away.
  await expect(page.getByText(/^First open time/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Book your first session" })).toHaveAttribute("href", `${new URL(reportUrl).pathname}/book`);
  await expect(page.getByRole("link", { name: "Call (310) 555-0142" })).toHaveAttribute("href", "tel:+13105550142");
  if (process.env.REPORT_SCREENSHOT) await page.screenshot({ path: process.env.REPORT_SCREENSHOT, fullPage: true });

  // Masks were drawn and are served only through the report link.
  const mask = await page.request.get(`${reportUrl}/mask/${scanId}/texture`);
  expect(mask.headers()["content-type"]).toBe("image/png");

  await page.getByRole("button", { name: "Delete my data" }).click();
  await page.getByRole("button", { name: "Yes, delete everything" }).click();
  await expect(page.getByRole("heading", { name: "Deleted." })).toBeVisible();
  expect((await page.request.get(reportUrl)).status()).toBe(404);
});

test("a progress scan from the report link, on another device, turns the report into the progress view", async ({ page, browser }) => {
  // Two full scans, one after the other.
  test.setTimeout(150_000);
  await completeIntake(page);
  const photo = await sharp({ create: { width: 810, height: 1080, channels: 3, background: "#cbb8a6" } }).jpeg().toBuffer();
  const first = await (
    await page.request.post("/api/scans", {
      data: { clinicSlug: "maison-verre", width: 810, height: 1080, quality: GOOD_QUALITY, landmarks: syntheticLandmarks() },
    })
  ).json();
  await page.request.put(first.upload.url, { headers: first.upload.headers, data: photo });
  await page.request.post(`/api/scans/${first.scanId}/analyze`);
  await page.goto(`/c/maison-verre/processing?scan=${first.scanId}`);
  const gate = page.getByRole("dialog", { name: "Your skin report is ready." });
  await expect(gate).toBeVisible({ timeout: 30_000 });
  await gate.getByLabel("First name").fill("Nora");
  await gate.getByLabel("Last name").fill("Test");
  await gate.getByLabel("Primary email").fill("nora@example.com");
  await gate.getByRole("button", { name: "Send my results" }).click();
  await page.getByRole("link", { name: "Open my report" }).click();
  await expect(page.getByRole("heading", { name: "Your three priorities" })).toBeVisible();
  const report = new URL(page.url()).pathname;
  const token = report.split("/")[2];

  // The emailed link on another phone: a fresh browser, no cookies. The report link is the only key (D-073).
  const phone = await (await browser.newContext()).newPage();
  await phone.goto(`${report}/rescan`);
  await expect(phone.getByRole("heading", { name: "Same steps as your first scan." })).toBeVisible();
  const created = await phone.request.post(`/api/reports/${token}/scans`, {
    data: { width: 810, height: 1080, quality: GOOD_QUALITY, landmarks: syntheticLandmarks() },
  });
  expect(created.ok()).toBe(true);
  const rescan = await created.json();
  await phone.request.put(rescan.upload.url, { headers: rescan.upload.headers, data: photo });
  expect((await phone.request.post(`/api/scans/${rescan.scanId}/analyze?report=${token}`)).ok()).toBe(true);
  // Without the report link, someone else's browser can't reach the scan.
  expect((await phone.request.get(`/api/scans/${rescan.scanId}/status`)).status()).toBe(404);

  await phone.goto(`${report}/rescan?scan=${rescan.scanId}`);
  await expect(phone).toHaveURL(new RegExp(`${report}$`), { timeout: 30_000 });
  // The same face minutes later: demo mode holds steady rather than inventing progress.
  await expect(phone.getByRole("heading", { name: "Nora, here's your progress." })).toBeVisible();
  await expect(phone.getByRole("heading", { name: "What's changed" })).toBeVisible();
  await expect(phone.getByText("Same light, same angle. Verified at capture.")).toBeVisible();
  await expect(phone.getByRole("heading", { name: "Your three priorities" })).toHaveCount(0);
});

test("a demo client can't be rescanned: their portrait isn't a scan", async ({ page }) => {
  await page.goto("/dashboard/enter");
  await page.getByRole("button", { name: "Enter demo as Dana" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
  await page.goto("/dashboard/clients");
  await page.getByRole("link", { name: /Amelia/ }).first().click();
  const href = await page.locator('a[href^="/r/"]').first().getAttribute("href");
  const report = `/r/${href!.split("/")[2]}`;
  await page.goto(report);
  await expect(page.getByRole("heading", { name: "Amelia, your skin has moved." })).toBeVisible();
  await page.goto(`${report}/rescan`);
  await expect(page.getByRole("heading", { name: "This is a sample client." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Take your own scan" })).toHaveAttribute("href", "/c/maison-verre");
});
