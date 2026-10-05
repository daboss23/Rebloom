import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import sharp from "sharp";
import { completeIntake, GOOD_QUALITY, syntheticLandmarks } from "./helpers";

// Live mode, end to end, against the local YouCam stand-in (tests/e2e/mock-youcam.mjs).
// Run with `pnpm test:e2e:live`.

const MOCK = "http://localhost:3299";
const CHECK_AUTH = { authorization: "Bearer e2e-cron-secret" };

interface MockState {
  units: number;
  files: { fileId: string; uploaded: boolean; width: number; height: number; format: string }[];
  tasks: { taskId: string; fileId: string; actions: string[]; outcome: string; polls: number; deleted: boolean }[];
  events: { route: string; auth: boolean }[];
}
const mockState = async (request: APIRequestContext) => (await (await request.get(`${MOCK}/__mock/state`)).json()) as MockState;
const ourLedger = async (request: APIRequestContext) =>
  (await (await request.get("/api/youcam/check", { headers: CHECK_AUTH })).json()).budget.remainingByOurLog as number;

/** Creates a scan, uploads a flat photo of the given colour, starts analysis, opens the processing page. */
async function scanPhoto(page: Page, colour: string): Promise<string> {
  const created = await page.request.post("/api/scans", {
    data: { clinicSlug: "maison-verre", width: 810, height: 1080, quality: GOOD_QUALITY, landmarks: syntheticLandmarks() },
  });
  expect(created.ok()).toBe(true);
  const { scanId, upload } = await created.json();
  const photo = await sharp({ create: { width: 810, height: 1080, channels: 3, background: colour } }).jpeg().toBuffer();
  expect((await page.request.put(upload.url, { headers: upload.headers, data: photo })).status()).toBe(204);
  expect((await page.request.post(`/api/scans/${scanId}/analyze`)).ok()).toBe(true);
  await page.goto(`/c/maison-verre/processing?scan=${scanId}`);
  return scanId;
}

async function unlockReport(page: Page) {
  const gate = page.getByRole("dialog", { name: "Your skin report is ready." });
  await expect(gate).toBeVisible({ timeout: 45_000 });
  await gate.getByLabel("First name").fill("Amelia");
  await gate.getByLabel("Email", { exact: true }).fill("amelia@example.com");
  await gate.getByRole("button", { name: "Send my results" }).click();
  await page.getByRole("link", { name: "Open my report" }).click();
  await expect(page.getByRole("heading", { name: "Amelia, your skin is telling a clear story." })).toBeVisible();
}

test("the connection check reports a working key without spending units", async ({ request }) => {
  expect((await request.get("/api/youcam/check")).status()).toBe(404);
  const before = (await mockState(request)).units;
  const check = await (await request.get("/api/youcam/check", { headers: CHECK_AUTH })).json();
  expect(check).toMatchObject({ mode: "live", keySet: true, liveScans: true, connected: true, unitsInAccount: before });
  expect((await mockState(request)).units).toBe(before);
});

test("the setup page checks the connection in the browser, behind the password", async ({ page }) => {
  await page.goto("/setup/youcam");
  const password = page.getByLabel("Password (CRON_SECRET)");
  await password.fill("not-the-secret");
  await page.getByRole("button", { name: "Check connection" }).click();
  await expect(page.getByText("That password doesn't match CRON_SECRET on this site.")).toBeVisible();
  await expect(page.getByText("Connected to YouCam.")).toHaveCount(0);

  const units = (await mockState(page.request)).units;
  await password.fill(" e2e-cron-secret ");
  await page.getByRole("button", { name: "Check connection" }).click();
  await expect(page.getByRole("heading", { name: "Connected to YouCam." })).toBeVisible();
  await expect(page.getByText(units.toLocaleString("en-US"), { exact: true })).toBeVisible();
  await expect(page.getByText("On. Scans use YouCam.")).toBeVisible();
  expect(page.url()).not.toContain("e2e-cron-secret");
});

test("a live scan reads YouCam's scores, copies its masks, then deletes the photo at YouCam", async ({ page }) => {
  await completeIntake(page);
  const unitsBefore = (await mockState(page.request)).units;
  const ledgerBefore = await ourLedger(page.request);
  const scanId = await scanPhoto(page, "#cbb8a6");
  await unlockReport(page);

  // Real scores, no demo label. Priorities are the three lowest ui scores the API returned.
  await expect(page.getByText("Demo analysis.")).toHaveCount(0);
  const priorities = page.getByRole("heading", { level: 2, name: "Your three priorities" }).locator("xpath=..").getByRole("heading", { level: 3 });
  await expect(priorities).toHaveText(["Eye bags", "Lower eyelid firmness", "Moisture"]);

  // Masks were copied into our storage, at the photo's exact size, and are served only through the report link.
  const mask = await page.request.get(`${page.url()}/mask/${scanId}/eye_bag`);
  expect(mask.headers()["content-type"]).toBe("image/png");
  const meta = await sharp(await mask.body()).metadata();
  expect([meta.width, meta.height, meta.hasAlpha]).toEqual([810, 1080, true]);

  // What YouCam saw: one JPEG upload with its own headers and no API key, 16 SD actions, then deletion.
  const state = await mockState(page.request);
  const task = state.tasks.at(-1)!;
  expect(task).toMatchObject({ outcome: "success", deleted: true });
  expect(task.actions).toHaveLength(16);
  expect(task.polls).toBeGreaterThanOrEqual(3); // a 503 blip and a "running" were both ridden out
  expect(state.files.find((f) => f.fileId === task.fileId)).toMatchObject({ uploaded: true, width: 810, height: 1080, format: "jpeg" });
  expect(state.events.filter((e) => e.route.startsWith("PUT /upload/")).every((e) => !e.auth)).toBe(true);

  // Units: YouCam charged 16, and our own ledger agrees.
  expect(unitsBefore - state.units).toBe(16);
  expect(ledgerBefore - (await ourLedger(page.request))).toBe(16);
});

test("a photo YouCam can't read gets that error's own retake instruction, and costs nothing", async ({ page }) => {
  await completeIntake(page);
  const ledgerBefore = await ourLedger(page.request);
  await scanPhoto(page, "#121212");
  await expect(page.getByRole("heading", { name: "The light was too low for a reliable reading." })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Face a window or a bright, even light, then try again.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Take a new photo" })).toHaveAttribute("href", "/c/maison-verre/capture");
  expect(await ourLedger(page.request)).toBe(ledgerBefore);
  expect((await mockState(page.request)).tasks.at(-1)).toMatchObject({ outcome: "error_lighting_dark", deleted: true });
});

test("when YouCam won't start a task, the scan still finishes, clearly labelled as a demo", async ({ page }) => {
  await completeIntake(page);
  const ledgerBefore = await ourLedger(page.request);
  await scanPhoto(page, "#ff00ff");
  await unlockReport(page);
  await expect(page.getByText("Demo analysis.")).toBeVisible();
  expect(await ourLedger(page.request)).toBe(ledgerBefore);
});
