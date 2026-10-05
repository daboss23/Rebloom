// The Supabase store against the live project: `pnpm test:supabase`.
// Everything it writes lives in one throwaway sandbox, deleted at the end with its photos.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ObjectStorage, Store } from "@/lib/store/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const sandboxId = randomUUID();
// Created "in the past" so the expiry test can find it.
const sandboxCreated = new Date("2020-01-01T00:00:00Z");
const now = new Date("2026-10-05T17:00:00Z");
const photoPath = `clients/integration-${sandboxId}/scans/photo.jpg`;
const maskPath = `clients/integration-${sandboxId}/scans/photo/masks/texture.png`;

let store: Store;
let storage: ObjectStorage;

describe.skipIf(!url || !secret)("Supabase store (live project)", () => {
  beforeAll(async () => {
    const mod = await import("@/lib/store/supabase");
    store = mod.supabaseStore;
    storage = mod.supabaseObjectStorage;
    await store.createSandbox(sandboxId, sandboxCreated);
  });

  afterAll(async () => {
    if (!store) return;
    await storage.remove([photoPath, maskPath]).catch(() => undefined);
    await store.deleteSandboxes([sandboxId]).catch(() => undefined);
    // Test usage rows are the one thing deleteSandboxes keeps on purpose.
    await createClient(url!, secret!, { auth: { persistSession: false } }).from("api_usage").delete().eq("sandbox_id", sandboxId);
  });

  it("reads the seeded clinics and menus", async () => {
    const clinics = await store.listClinics();
    expect(clinics.map((c) => c.slug)).toEqual(["maison-verre", "tidewater"]);
    const mv = (await store.getClinicBySlug("maison-verre"))!;
    expect(mv.hours.slotMinutes).toBe(30);
    expect((await store.getClinic(mv.id))?.name).toBe("Maison Verre");
    const treatments = await store.listTreatments(mv.id);
    expect(treatments[0].name).toBe("Signature Peel Series");
    expect(treatments.find((t) => t.name === "Hydrating Infusion Facial")?.sessionsTypical).toBeNull();
    expect((await store.listProducts(mv.id)).length).toBeGreaterThan(0);
  });

  it("treats ids that aren't UUIDs as not found instead of failing", async () => {
    expect(await store.getClient("not-a-uuid")).toBeNull();
    expect(await store.getScan("../../etc")).toBeNull();
    expect(await store.getSandbox("")).toBeNull();
  });

  it("creates a sandbox once, even when asked twice", async () => {
    const again = await store.createSandbox(sandboxId, now);
    expect(again.createdAt).toBe(sandboxCreated.toISOString());
  });

  let clientId: string;

  it("stores a client's consent and intake, and two intake steps saved at once both stick", async () => {
    const clinic = (await store.getClinicBySlug("tidewater"))!;
    const client = await store.createClient({ clinicId: clinic.id, sandboxId, now });
    clientId = client.id;
    expect(client.status).toBe("started");
    await store.addConsent({ clientId, type: "biometric", grantedAt: now.toISOString(), textVersion: "test", ipHash: "h", userAgent: "ua" });
    expect((await store.listConsents(clientId)).map((c) => c.type)).toEqual(["biometric"]);

    await Promise.all([
      store.saveIntake(clientId, { goalText: "smoother skin" }, now),
      store.saveIntake(clientId, { concerns: ["texture", "redness"], screening: { retinoid: "yes" } }, now),
    ]);
    const intake = (await store.getIntake(clientId))!;
    expect(intake.goalText).toBe("smoother skin");
    expect(intake.concerns).toEqual(["texture", "redness"]);
    expect(intake.screening).toEqual({ retinoid: "yes" });
    expect(intake.pastTreatments).toEqual([]);

    const updated = await store.updateClient(clientId, { firstName: "Test", email: "test@example.com", status: "lead" });
    expect(updated.status).toBe("lead");
  });

  let scanId: string;

  it("finalises a scan exactly once when two polls race", async () => {
    const scan = await store.createScan(
      {
        clientId,
        sandboxId,
        imagePath: photoPath,
        imageWidth: 810,
        imageHeight: 1080,
        captureQuality: null,
        landmarks: [[0.5, 0.5]],
        concernsRequested: ["texture"],
      },
      now,
    );
    scanId = scan.id;
    expect(scan.scanNumber).toBe(1);
    expect(scan.createdAt).toBe(now.toISOString());
    await store.updateScan(scanId, { status: "analyzing" });
    const [a, b] = await Promise.all([
      store.transitionScan(scanId, ["analyzing"], { status: "finalizing" }),
      store.transitionScan(scanId, ["analyzing"], { status: "finalizing" }),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);

    const result = { concerns: [{ key: "texture" as const, ui: 58, raw: 35, maskPath }], overall: null, skinAge: 33, skinType: "dry" };
    const done = await store.updateScan(scanId, { status: "complete", result, completedAt: now.toISOString() });
    expect(done.result).toEqual(result);
    expect((await store.listScans(clientId)).map((s) => s.id)).toEqual([scanId]);
  });

  it("gives one report per client, even when two requests create it at once", async () => {
    const [a, b] = await Promise.all([store.getOrCreateReport(clientId, now), store.getOrCreateReport(clientId, now)]);
    expect(a.token).toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(32);
    expect((await store.getReportByToken(a.token))?.clientId).toBe(clientId);
  });

  it("sums usage in the database", async () => {
    const usage = { provider: "anthropic" as const, feature: "integration_test", taskId: null, sandboxId, ipHash: "ip", createdAt: new Date().toISOString() };
    await store.logUsage({ ...usage, units: 3 });
    await store.logUsage({ ...usage, units: 4 });
    expect(await store.sumUsage({ provider: "anthropic", since: new Date(Date.now() - 60_000), sandboxId })).toEqual({ units: 7, count: 2 });
  });

  it("uploads a photo through a one-time signed URL, as the browser does", async () => {
    const jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#c9b79c" } }).jpeg().toBuffer();
    const target = await storage.createUploadUrl(photoPath, "image/jpeg");
    expect(target.url.startsWith(url!)).toBe(true);
    const put = await fetch(target.url, { method: target.method, headers: target.headers, body: new Uint8Array(jpeg) });
    expect(put.ok).toBe(true);
    const file = (await storage.get(photoPath))!;
    expect(file.contentType).toBe("image/jpeg");
    expect(Buffer.compare(file.bytes, jpeg)).toBe(0);
  });

  it("refuses uploads that aren't images", async () => {
    const target = await storage.createUploadUrl(`clients/integration-${sandboxId}/scans/note.txt`, "text/plain");
    const put = await fetch(target.url, { method: "PUT", headers: { "content-type": "text/plain" }, body: "hello" });
    expect(put.ok).toBe(false);
  });

  it("stores masks written by the server", async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: "#ffffff00" } }).png().toBuffer();
    await storage.put(maskPath, png, "image/png");
    expect((await storage.get(maskPath))?.contentType).toBe("image/png");
  });

  it.skipIf(!anonKey)("shows nothing to the public key: no rows, no photos", async () => {
    const anon = createClient(url!, anonKey!, { auth: { persistSession: false } });
    for (const table of ["clinics", "clients", "scans", "reports", "api_usage"]) {
      const { data } = await anon.from(table).select("*").limit(1);
      expect(data ?? []).toEqual([]);
    }
    const { data } = await anon.storage.from("scans").download(photoPath);
    expect(data).toBeNull();
    const { error } = await anon.rpc("usage_totals", { p_provider: "youcam", p_since: new Date(0).toISOString() });
    expect(error).not.toBeNull();
  });

  it("deletes a client's data and returns every file to remove", async () => {
    const { storagePaths } = await store.deleteClientData(clientId, now);
    expect(storagePaths.sort()).toEqual([maskPath, photoPath].sort());
    expect(await store.getClient(clientId)).toBeNull();
    expect(await store.getScan(scanId)).toBeNull();
    expect(await store.getIntake(clientId)).toBeNull();
  });

  it("finds this sandbox once it's 30 days old, and deletes it", async () => {
    const { ids } = await store.expiredSandboxes(new Date(Date.now() - 30 * 86_400_000), 1000);
    expect(ids).toContain(sandboxId);
    await store.deleteSandboxes([sandboxId]);
    expect(await store.getSandbox(sandboxId)).toBeNull();
  });
});
