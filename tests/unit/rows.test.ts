import { describe, expect, it } from "vitest";
import { MAISON_VERRE, TIDEWATER } from "@/data/clinics";
import { SEED_TREATMENTS } from "@/data/menu";
import type { Scan } from "@/lib/domain";
import { clinicFromRow, fromRow, menuItemFromRow, toRow } from "@/lib/store/rows";

describe("database row mapping", () => {
  it("maps camelCase fields to snake_case columns and back", () => {
    const row = toRow({ clientId: "c", imagePath: "a.jpg", analysisStartedAt: null, youcamRaw: { all: 1 } });
    expect(row).toEqual({ client_id: "c", image_path: "a.jpg", analysis_started_at: null, youcam_raw: { all: 1 } });
    expect(fromRow<Partial<Scan>>(row)).toEqual({ clientId: "c", imagePath: "a.jpg", analysisStartedAt: null, youcamRaw: { all: 1 } });
  });

  it("leaves undefined fields out, so a patch only touches what it names", () => {
    expect(toRow({ status: "complete", result: undefined })).toEqual({ status: "complete" });
  });

  it("keeps JSON columns as they are", () => {
    const quality = { faceWidthRatio: 0.7, passedGate: true };
    expect(toRow({ captureQuality: quality }).capture_quality).toBe(quality);
  });

  it("normalises Postgres timestamps to the ISO form the app writes", () => {
    const scan = fromRow<Scan>({ created_at: "2026-10-05T17:00:00+00:00", completed_at: null, event_date: "2026-12-01" });
    expect(scan.createdAt).toBe("2026-10-05T17:00:00.000Z");
    expect(scan.completedAt).toBeNull();
    expect((scan as unknown as { eventDate: string }).eventDate).toBe("2026-12-01");
  });

  it("round-trips the seed clinics, dropping database-only columns", () => {
    for (const clinic of [MAISON_VERRE, TIDEWATER]) {
      const row = toRow({ monogramUrl: null, lockupUrl: null, ...clinic, createdAt: "2026-10-05T00:00:00.000Z" });
      expect(clinicFromRow(row)).toEqual(clinic);
    }
  });

  it("round-trips treatments, dropping the menu position", () => {
    const t = SEED_TREATMENTS[0];
    expect(menuItemFromRow(toRow({ ...t, position: 3 }))).toEqual(t);
  });
});
