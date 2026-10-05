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
  tasks: { taskId: string; fileId: string; actions: string[]; outcome: string; polls: number; deleted: boolean; params?: Record<string, number>; cost?: number }[];
  events: { route: string; auth: boolean }[];
}
const mockState = async (request: APIRequestContext) => (await (await request.get(`${MOCK}/__mock/state`)).json()) as MockState;
const ourLedger = async (request: APIRequestContext) =>
  (await (await request.get("/api/youcam/check", { headers: CHECK_AUTH })).json()).budget.remainingByOurLog as number;

/** Live reports start a simulation as they open. Wait for it, so unit counts are settled. */
async function simulationShown(page: Page) {
  await expect(page.getByRole("region", { name: "What to expect" }).getByRole("img", { name: /An illustration of your skin/ })).toBeVisible({ timeout: 30_000 });
}

/** Creates a scan, uploads a flat photo of the given colour, starts analysis, opens the processing page. */
async function scanPhoto(page: Page, colour: string, size: [number, number] = [810, 1080]): Promise<string> {
  const [width, height] = size;
  const created = await page.request.post("/api/scans", {
    data: { clinicSlug: "maison-verre", width, height, quality: GOOD_QUALITY, landmarks: syntheticLandmarks() },
  });
  expect(created.ok()).toBe(true);
  const { scanId, upload } = await created.json();
  const photo = await sharp({ create: { width, height, channels: 3, background: colour } }).jpeg().toBuffer();
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

  // Real scores, no demo label. Priorities: the lowest score (eye bags, 58), then what matters most once the
  // client's goal is weighed in: they wrote "smoother" skin, so texture (74) comes before lower eyelid (63).
  await expect(page.getByText("Demo analysis.")).toHaveCount(0);
  const priorities = page.getByRole("heading", { level: 2, name: "Your three priorities" }).locator("xpath=..").getByRole("heading", { level: 3 });
  await expect(priorities).toHaveText(["Eye bags", "Texture", "Lower eyelid firmness"]);

  // Masks were copied into our storage, at the photo's exact size, and are served only through the report link.
  const mask = await page.request.get(`${page.url()}/mask/${scanId}/eye_bag`);
  expect(mask.headers()["content-type"]).toBe("image/png");
  const meta = await sharp(await mask.body()).metadata();
  expect([meta.width, meta.height, meta.hasAlpha]).toEqual([810, 1080, true]);

  // What YouCam saw: one JPEG upload with its own headers and no API key, 16 SD actions, then deletion.
  await simulationShown(page);
  const state = await mockState(page.request);
  const task = state.tasks.filter((t) => !t.taskId.startsWith("sim_")).at(-1)!;
  expect(task).toMatchObject({ outcome: "success", deleted: true });
  expect(task.actions).toHaveLength(16);
  expect(task.polls).toBeGreaterThanOrEqual(3); // a 503 blip and a "running" were both ridden out
  expect(state.files.find((f) => f.fileId === task.fileId)).toMatchObject({ uploaded: true, width: 810, height: 1080, format: "jpeg" });
  expect(state.events.filter((e) => e.route.startsWith("PUT /upload/")).every((e) => !e.auth)).toBe(true);

  // Units: the analysis cost 16, and our own ledger agrees with everything YouCam charged.
  expect(task.cost).toBe(16);
  expect(ledgerBefore - (await ourLedger(page.request))).toBe(unitsBefore - state.units);
});

test("a camera-size photo runs YouCam's HD analysis, at the HD unit price", async ({ page }) => {
  await completeIntake(page);
  const unitsBefore = (await mockState(page.request)).units;
  const ledgerBefore = await ourLedger(page.request);
  await scanPhoto(page, "#cbb8a6", [1080, 1440]);
  await unlockReport(page);

  await expect(page.getByText(/HD analysis/)).toBeVisible();
  await expect(page.getByText("Demo analysis.")).toHaveCount(0);
  await simulationShown(page);
  const state = await mockState(page.request);
  const task = state.tasks.filter((t) => !t.taskId.startsWith("sim_")).at(-1)!;
  expect(task.actions).toHaveLength(16);
  expect(task.actions.every((a) => a.startsWith("hd_"))).toBe(true);

  // HD costs 22 units for 16 actions, and our ledger agrees with everything YouCam charged.
  expect(task.cost).toBe(22);
  expect(ledgerBefore - (await ourLedger(page.request))).toBe(unitsBefore - state.units);
});

test("the report shows a labelled simulation of the plan, made once and kept privately", async ({ page }) => {
  await completeIntake(page);
  const before = await mockState(page.request);
  const simsBefore = before.tasks.filter((t) => t.taskId.startsWith("sim_")).length;
  const scanId = await scanPhoto(page, "#cbb8a6", [1080, 1440]);
  await unlockReport(page);
  const reportUrl = page.url();

  const expect_ = page.getByRole("region", { name: "What to expect" });
  await expect(expect_.getByRole("img", { name: /An illustration of your skin/ })).toBeVisible({ timeout: 30_000 });
  await expect(expect_.getByText("Not a guaranteed result.", { exact: false })).toBeVisible();
  if (process.env.SIMULATION_SCREENSHOT) await expect_.screenshot({ path: process.env.SIMULATION_SCREENSHOT });
  const image = await page.request.get(`${reportUrl}/simulation/${scanId}/image`);
  expect(image.headers()["content-type"]).toBe("image/jpeg");
  const meta = await sharp(await image.body()).metadata();
  expect([meta.width, meta.height]).toEqual([1080, 1440]);

  // YouCam got only concerns the plan works on, at moderate intensities, and the task was deleted after copying.
  const state = await mockState(page.request);
  const sims = state.tasks.filter((t) => t.taskId.startsWith("sim_"));
  expect(sims).toHaveLength(simsBefore + 1);
  const sim = sims.at(-1)!;
  expect(sim).toMatchObject({ deleted: true });
  expect(Object.keys(sim.params ?? {}).length).toBeGreaterThan(0);
  for (const v of Object.values(sim.params ?? {})) expect(v).toBeLessThanOrEqual(0.5);

  // Opening the report again reuses the stored image: no second task, no more units.
  await page.reload();
  await expect(expect_.getByRole("img", { name: /An illustration of your skin/ })).toBeVisible();
  const after = await mockState(page.request);
  expect(after.tasks.filter((t) => t.taskId.startsWith("sim_"))).toHaveLength(simsBefore + 1);
  // HD scan (22) plus one simulation (4 or 6), and nothing more.
  expect(before.units - after.units).toBe(22 + sim.cost!);
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
