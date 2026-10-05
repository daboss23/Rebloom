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

test("the intake can't be skipped", async ({ page }) => {
  await page.goto("/c/maison-verre/capture");
  await expect(page).toHaveURL(/\/consent$/);
});

test("an uploaded photo without a face is explained, not accepted", async ({ page }) => {
  await completeIntake(page, "tidewater");
  const wall = await sharp({ create: { width: 600, height: 800, channels: 3, background: "#d8d2c8" } }).jpeg().toBuffer();
  await page.locator("input[type=file]").setInputFiles({ name: "wall.jpg", mimeType: "image/jpeg", buffer: wall });
  await expect(page.locator("p[role=alert]")).toContainText("We couldn't find a face in this photo.", { timeout: 30_000 });
});

test("the Rebloom landing page offers both demo clinics", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Everyone sells the scan. Rebloom sells the second visit.");
  await expect(page.getByRole("link", { name: /Maison Verre/ })).toHaveAttribute("href", "/c/maison-verre");
  await expect(page.getByRole("link", { name: /Tidewater Skin Studio/ })).toHaveAttribute("href", "/c/tidewater");
});

test("report links are private: a made-up token shows nothing", async ({ page }) => {
  const res = await page.goto("/r/this-is-not-a-real-report-token-at-all");
  expect(res?.status()).toBe(404);
});

test("a scan runs end to end in fixture mode, and Delete my data removes it", async ({ page }) => {
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
  // The report gate: blurred report behind an opt-in. No report link or real score reaches the page yet.
  await expect(page.getByRole("heading", { name: "Your report is ready." })).toBeVisible({ timeout: 30_000 });
  expect(await page.content()).not.toContain("/r/");
  const preview = await page.request.get(`/api/scans/${scanId}/preview`);
  expect(preview.headers()["content-type"]).toBe("image/jpeg");
  await page.getByLabel("First name").fill("Amelia");
  await page.getByLabel("Email", { exact: true }).fill("amelia@example.com");
  await page.getByRole("button", { name: "See my report" }).click();

  await expect(page.getByRole("heading", { name: "Amelia, your skin is telling a clear story." })).toBeVisible();
  await expect(page.getByText("Demo analysis.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your three priorities" })).toBeVisible();
  const reportUrl = page.url();

  // Masks were drawn and are served only through the report link.
  const mask = await page.request.get(`${reportUrl}/mask/${scanId}/texture`);
  expect(mask.headers()["content-type"]).toBe("image/png");

  await page.getByRole("button", { name: "Delete my data" }).click();
  await page.getByRole("button", { name: "Yes, delete everything" }).click();
  await expect(page.getByRole("heading", { name: "Deleted." })).toBeVisible();
  expect((await page.request.get(reportUrl)).status()).toBe(404);
});
