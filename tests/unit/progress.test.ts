import { describe, expect, it } from "vitest";
import { MAISON_VERRE } from "@/data/clinics";
import { SEED_PRODUCTS, SEED_TREATMENTS } from "@/data/menu";
import { SEED_STAFF } from "@/data/staff";
import type { CaptureQuality, Scan } from "@/lib/domain";
import { checkCopy } from "@/lib/copy/check";
import { buildDemoBundle } from "@/lib/demo/seed";
import { rankPriorities, statedConcerns } from "@/lib/plan/build";
import { buildProgress, progressSubhead } from "@/lib/report/progress";
import { PROGRESS_MOMENT_RAW_DELTA } from "@/lib/rebook/thresholds";
import type { ConcernKey } from "@/lib/skin/concerns";
import { normalizeResult } from "@/lib/skin/normalize";
import { fixtureRescanResult } from "@/lib/youcam/fixture";

const GATE_OK: CaptureQuality = {
  method: "camera", faceWidthRatio: 0.7, centerOffset: 0, yaw: 0, pitch: 0, roll: 0, luminance: 140,
  clippedShare: 0, evenness: 0.95, warmth: 1.2, sharpness: 900, eyesOpen: 0.95, passedGate: true,
};

/** A completed scan with the given ui and raw scores, days after the first. */
function scan(n: number, day: number, scores: Partial<Record<ConcernKey, [number, number]>>, over: Partial<Scan> = {}): Scan {
  const at = new Date(Date.UTC(2026, 9, 1) + day * 86_400_000).toISOString();
  return {
    id: `s${n}`, clientId: "c", sandboxId: "x", scanNumber: n, status: "complete", source: "live",
    imagePath: `p${n}.jpg`, imageWidth: 810, imageHeight: 1080, captureQuality: GATE_OK, landmarks: null,
    concernsRequested: [], providerTaskId: null, analysisStartedAt: at, errorCode: null, youcamRaw: null,
    result: {
      concerns: Object.entries(scores).map(([key, [ui, raw]]) => ({ key: key as ConcernKey, ui, raw, maskPath: null })),
      overall: null, skinAge: null, skinType: null,
    },
    comparisonConfidence: n === 1 ? null : "high", createdAt: at, completedAt: at, ...over,
  };
}

const KEYS: ConcernKey[] = ["texture", "age_spot", "pore"];

describe("the progress view", () => {
  it("is not shown until there's a second scan", () => {
    expect(buildProgress([scan(1, 0, { texture: [58, 40] })], KEYS)).toBeNull();
  });

  it("badges only a change the raw scores confirm, and the arithmetic matches the screen", () => {
    const p = buildProgress(
      [
        scan(1, 0, { texture: [58, 40], age_spot: [61, 44], pore: [66, 50] }),
        scan(2, 42, { texture: [64, 43], age_spot: [64, 46], pore: [67, 50] }),
        scan(3, 84, { texture: [71, 40 + PROGRESS_MOMENT_RAW_DELTA + 4], age_spot: [70, 47], pore: [69, 51] }),
      ],
      KEYS,
    )!;
    const [texture, tone, pores] = p.items;
    expect(texture).toMatchObject({ from: 58, to: 71, uiDelta: 13, verdict: "improved", badge: "+13", series: [58, 64, 71] });
    expect(texture.line).toMatch(/^Your biggest change\. Texture has moved 13 points/);
    // Up 9 on screen but only 3 raw: moving, not a badge.
    expect(tone).toMatchObject({ uiDelta: 9, verdict: "improving", badge: null });
    expect(pores).toMatchObject({ verdict: "steady", badge: null });
    expect(tone.line).toBe("Up 9 points and moving the right way. Change here often builds over the next few sessions.");
    expect(pores.line).toBe("Pores are within 3 points of your first scan. Some concerns take longer than others to show visible change.");
    expect(p).toMatchObject({ weeks: 12, verified: true, confident: true, moved: true });
    expect(progressSubhead(p)).toBe("12 weeks in. Here's what's changed since your first scan.");
  });

  it("goes neutral when the shown and measured scores disagree", () => {
    const p = buildProgress([scan(1, 0, { texture: [58, 40] }), scan(2, 28, { texture: [62, 38] })], ["texture"])!;
    expect(p.items[0]).toMatchObject({ verdict: "steady", badge: null });
    expect(p.moved).toBe(false);
    expect(progressSubhead(p)).toBe("4 weeks in. Here's where things stand since your first scan.");
  });

  it("claims nothing from a photo taken in different light", () => {
    const p = buildProgress(
      [scan(1, 0, { texture: [58, 40] }), scan(2, 28, { texture: [75, 60] }, { comparisonConfidence: "lower" })],
      ["texture"],
    )!;
    expect(p.items[0]).toMatchObject({ verdict: "unconfirmed", badge: null });
    expect(p).toMatchObject({ verified: false, confident: false, moved: false });
  });

  it("doesn't say verified unless both photos passed the capture gate", () => {
    const loose = { ...GATE_OK, passedGate: false };
    const p = buildProgress([scan(1, 0, { texture: [58, 40] }), scan(2, 28, { texture: [70, 50] }, { captureQuality: loose })], ["texture"])!;
    expect(p.verified).toBe(false);
    expect(p.items[0].badge).toBe("+12");
  });

  it("names a real drop gently, never as a failure", () => {
    const p = buildProgress([scan(1, 0, { texture: [70, 50] }), scan(2, 28, { texture: [62, 42] })], ["texture"])!;
    expect(p.items[0].verdict).toBe("lower");
    expect(checkCopy(p.items[0].line)).toEqual([]);
  });

  it("never invents progress from a demo-mode rescan: same face, a point either way at most", () => {
    const first = scan(1, 0, { texture: [58, 40], age_spot: [61, 44], pore: [66, 50] });
    for (const id of ["a", "b", "c", "d"]) {
      const result = normalizeResult(fixtureRescanResult(id, first.result!));
      for (const c of result.concerns) {
        const before = first.result!.concerns.find((x) => x.key === c.key)!;
        expect(Math.abs(c.ui - before.ui)).toBeLessThanOrEqual(1);
        expect(c.raw - before.raw).toBe(c.ui - before.ui);
      }
      const p = buildProgress([first, scan(2, 0, {}, { source: "live", result })], KEYS)!;
      expect(p.moved).toBe(false);
    }
  });

  it("tells the demo clients' stories: Amelia and Sofia moved, Grace held steady", () => {
    const bundle = buildDemoBundle({
      clinic: MAISON_VERRE,
      treatments: SEED_TREATMENTS.filter((t) => t.clinicId === MAISON_VERRE.id),
      products: SEED_PRODUCTS.filter((p) => p.clinicId === MAISON_VERRE.id),
      staff: SEED_STAFF,
      sandboxId: "sandbox",
      today: "2026-12-29",
    });
    const progressOf = (key: string) => {
      const client = bundle.clients.find((c) => c.demoKey === key)!;
      const scans = bundle.scans.filter((s) => s.clientId === client.id);
      const intake = bundle.intakes.find((i) => i.clientId === client.id) ?? null;
      const keys = rankPriorities(scans[0].result!, statedConcerns(intake)).map((c) => c.key);
      return buildProgress(scans, keys)!;
    };
    expect(progressOf("amelia").moved).toBe(true);
    expect(progressOf("sofia").moved).toBe(true);
    expect(progressOf("grace").moved).toBe(false);
    // Three steady priorities: each states its own number, and the reassurance is said once.
    const lines = progressOf("grace").items.map((i) => i.line);
    expect(new Set(lines).size).toBe(lines.length);
    expect(lines.filter((l) => l.includes("take longer"))).toHaveLength(1);
    for (const key of ["amelia", "sofia", "grace"]) {
      for (const i of progressOf(key).items) expect(checkCopy(i.line)).toEqual([]);
    }
  });
});
