import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

process.env.REBLOOM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "rebloom-test-"));

const now = new Date("2026-10-05T17:00:00Z");
let store: typeof import("@/lib/store/local").localStore;

beforeAll(async () => {
  store = (await import("@/lib/store/local")).localStore;
});

describe("local store", () => {
  it("finalises a scan exactly once, even when two polls race", async () => {
    const clinic = (await store.getClinicBySlug("maison-verre"))!;
    const client = await store.createClient({ clinicId: clinic.id, sandboxId: "sb", now });
    const scan = await store.createScan(
      { clientId: client.id, sandboxId: "sb", imagePath: "a.jpg", imageWidth: 810, imageHeight: 1080, captureQuality: null, landmarks: null, concernsRequested: [] },
      now,
    );
    await store.updateScan(scan.id, { status: "analyzing" });
    const [a, b] = await Promise.all([
      store.transitionScan(scan.id, ["analyzing"], { status: "finalizing" }),
      store.transitionScan(scan.id, ["analyzing"], { status: "finalizing" }),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("deletes a client's personal data and keeps only an anonymous event", async () => {
    const clinic = (await store.getClinicBySlug("tidewater"))!;
    const client = await store.createClient({ clinicId: clinic.id, sandboxId: "sb2", now });
    await store.saveIntake(client.id, { goalText: "smoother skin" }, now);
    const report = await store.getOrCreateReport(client.id, now);
    const { storagePaths } = await store.deleteClientData(client.id, now);
    expect(storagePaths).toEqual([]);
    expect(await store.getClient(client.id)).toBeNull();
    expect(await store.getIntake(client.id)).toBeNull();
    expect(await store.getReportByToken(report.token)).toBeNull();
  });

  it("issues unguessable report tokens", async () => {
    const clinic = (await store.getClinicBySlug("maison-verre"))!;
    const client = await store.createClient({ clinicId: clinic.id, sandboxId: "sb3", now });
    const report = await store.getOrCreateReport(client.id, now);
    expect(report.token.length).toBeGreaterThanOrEqual(32);
    expect((await store.getOrCreateReport(client.id, now)).token).toBe(report.token);
  });
});
