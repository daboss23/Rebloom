import { describe, expect, it } from "vitest";
import { MAISON_VERRE } from "@/data/clinics";
import { SEED_PRODUCTS, SEED_TREATMENTS } from "@/data/menu";
import type { Intake, ScanResult } from "@/lib/domain";
import { checkCopy } from "@/lib/copy/check";
import { buildPlan, formatPrice, nextOpenDay, statedConcerns } from "@/lib/plan/build";
import { mentions, planRationale, priorityMeaning, subhead } from "@/lib/report/personal";
import { priorities } from "@/lib/skin/normalize";
import type { ConcernKey } from "@/lib/skin/concerns";

const treatments = SEED_TREATMENTS.filter((t) => t.clinicId === MAISON_VERRE.id);
const products = SEED_PRODUCTS.filter((p) => p.clinicId === MAISON_VERRE.id);

function result(scores: Partial<Record<ConcernKey, number>>): ScanResult {
  const all: Record<ConcernKey, number> = {
    texture: 90, pore: 90, age_spot: 90, redness: 90, wrinkle: 90, firmness: 90, acne: 90, moisture: 90, radiance: 90,
    oiliness: 90, dark_circle_v2: 90, eye_bag: 90, droopy_upper_eyelid: 90, droopy_lower_eyelid: 90, tear_trough: 90,
    ...scores,
  };
  return {
    concerns: Object.entries(all).map(([key, ui]) => ({ key: key as ConcernKey, ui, raw: ui, maskPath: null })),
    overall: null,
    skinAge: null,
    skinType: null,
  };
}

function intake(over: Partial<Intake>): Intake {
  return {
    clientId: "c", concerns: [], concernsOther: null, goalText: null, hasEvent: false, eventType: null, eventDate: null,
    pastTreatments: ["none"], budgetBand: null, screening: {}, sensitivitiesNote: null, completedAt: null, updatedAt: "",
    ...over,
  };
}

const plan = (r: ScanResult, i: Intake | null, from = "2026-10-05") =>
  buildPlan({ result: r, intake: i, treatments, products, clinic: MAISON_VERRE, from });

// The first live scan, October 5 (scores as YouCam returned them).
const liveScan = result({
  texture: 99, pore: 73, age_spot: 96, redness: 94, wrinkle: 90, firmness: 78, acne: 96, moisture: 83, radiance: 92,
  oiliness: 92, dark_circle_v2: 77, eye_bag: 79, droopy_upper_eyelid: 79, droopy_lower_eyelid: 82, tear_trough: 85,
});
const liveIntake = intake({
  concerns: ["firmness", "uneven_tone"],
  goalText: "Uneven skin tone and dark circles under the eyes.",
  budgetBand: "500_1000",
  screening: { sun_exposure: "yes" },
});

describe("what the client asked about", () => {
  it("reads ticked concerns and their own words", () => {
    const stated = statedConcerns(liveIntake);
    expect(stated.get("dark_circle_v2")).toBe("dark circles");
    expect(stated.get("age_spot")).toBe("uneven tone");
    expect(stated.get("firmness")).toBe("firmness");
  });
});

describe("treatment plan", () => {
  it("begins with the lowest score", () => {
    const p = plan(liveScan, liveIntake);
    expect(p.recommended.lines[0].covers).toContain("pore");
  });

  it("picks menu treatments that work on this scan's focus", () => {
    const p = plan(liveScan, liveIntake);
    expect(p.focus.map((f) => f.key)).toContain("dark_circle_v2");
    expect(p.recommended.lines.length).toBeGreaterThan(0);
    for (const line of p.recommended.lines) {
      expect(treatments.map((t) => t.id)).toContain(line.treatment.id);
      expect(line.covers.length).toBeGreaterThan(0);
    }
  });

  it("changes when the scores change", () => {
    const a = plan(result({ age_spot: 55, redness: 60 }), null);
    const b = plan(result({ firmness: 60, droopy_upper_eyelid: 62 }), null);
    expect(a.recommended.lines[0].treatment.name).toBe("IPL Photofacial");
    expect(b.recommended.lines[0].treatment.name).toBe("RF Skin Tightening");
  });

  it("computes every total from menu prices", () => {
    const p = plan(liveScan, liveIntake);
    for (const line of p.recommended.lines) expect(line.totalCents).toBe(line.treatment.priceCents * line.sessions);
    expect(p.recommended.totalCents).toBe(p.recommended.lines.reduce((n, l) => n + l.totalCents, 0));
  });

  it("offers a plan inside the budget band when the full plan goes over", () => {
    const p = plan(liveScan, liveIntake);
    expect(p.recommended.totalCents).toBeGreaterThan(100_000);
    expect(p.withinBudget).not.toBeNull();
    expect(p.withinBudget!.totalCents).toBeLessThanOrEqual(100_000);
    expect(p.withinBudget!.lines[0].covers).toContain("pore");
  });

  it("offers no alternative when the plan already fits", () => {
    const p = plan(liveScan, { ...liveIntake, budgetBand: "2000_plus" });
    expect(p.withinBudget).toBeNull();
  });

  it("keeps aggressive sessions out of the two weeks before an event", () => {
    const amelia = intake({ concerns: ["uneven_tone", "texture"], hasEvent: true, eventType: "wedding", eventDate: "2027-01-11", budgetBand: "1000_2000" });
    const p = plan(result({ texture: 58, age_spot: 61, pore: 66 }), amelia);
    const sessions = p.timeline.filter((s) => s.kind === "session");
    expect(sessions.length).toBeGreaterThan(0);
    for (const s of sessions) {
      if (s.kind !== "session") continue;
      const gap = (Date.parse("2027-01-11") - Date.parse(s.date)) / 86_400_000;
      expect(gap).toBeGreaterThanOrEqual(s.treatment.minDaysBeforeEvent);
    }
    expect(p.timeline[p.timeline.length - 1]).toMatchObject({ kind: "event", date: "2027-01-11" });
  });

  it("prices exactly the sessions on the timeline", () => {
    const soon = intake({ hasEvent: true, eventType: "wedding", eventDate: "2026-12-01", budgetBand: "2000_plus" });
    const p = plan(result({ texture: 58, age_spot: 61, pore: 62 }), soon);
    for (const line of p.recommended.lines) {
      const booked = p.timeline.filter((s) => s.kind === "session" && s.treatment.id === line.treatment.id);
      expect(booked.length).toBe(line.sessions);
      for (const s of booked) expect(Date.parse("2026-12-01") - Date.parse(s.date)).toBeGreaterThanOrEqual(line.treatment.minDaysBeforeEvent * 86_400_000);
    }
  });

  it("cuts sessions to fit when the event is close", () => {
    const soon = intake({ hasEvent: true, eventType: "holiday", eventDate: "2026-11-10" });
    const p = plan(result({ texture: 58, age_spot: 61 }), soon);
    expect(p.shortenedForEvent).toBe(true);
  });

  it("books only on days the clinic is open, a week or more apart", () => {
    const p = plan(liveScan, liveIntake);
    const days = p.timeline.filter((s) => s.kind === "session").map((s) => s.date);
    for (let i = 1; i < days.length; i++) expect(Date.parse(days[i]) - Date.parse(days[i - 1])).toBeGreaterThanOrEqual(7 * 86_400_000);
    for (const d of days) expect(nextOpenDay(d, MAISON_VERRE.hours)).toBe(d);
  });

  it("adds sun protection when the plan includes light or resurfacing", () => {
    const p = plan(result({ age_spot: 55, redness: 60 }), null);
    expect(p.homeCare.map((h) => h.product.name)).toContain("Mineral SPF 40");
    expect(p.homeCare.length).toBeLessThanOrEqual(2);
  });
});

describe("personal wording", () => {
  it("follows the copy rules", () => {
    for (const [r, i] of [
      [liveScan, liveIntake],
      [result({ texture: 58, age_spot: 61, pore: 66 }), intake({ concerns: ["texture"] })],
      [result({}), null],
    ] as const) {
      const p = plan(r, i);
      const stated = statedConcerns(i);
      const top = priorities(r, 3);
      const text = [
        subhead(r),
        planRationale(p),
        ...top.map((c, n) => priorityMeaning(n, c, top.slice(0, n), stated, p)),
        ...mentions(r, stated, top, p).map((m) => m.text),
        ...p.homeCare.map((h) => h.reason),
      ].join("\n");
      expect(checkCopy(text)).toEqual([]);
    }
  });

  it("answers what the client asked about, even when it isn't a priority", () => {
    const stated = statedConcerns(liveIntake);
    const m = mentions(liveScan, stated, priorities(liveScan, 3), plan(liveScan, liveIntake));
    expect(m.find((x) => x.phrase === "uneven tone")?.text).toMatch(/stronger areas/);
    // Firmness is a priority, so the priority line answers it, not a mention.
    expect(m.find((x) => x.phrase === "firmness")).toBeUndefined();
  });

  it("formats prices in whole dollars", () => {
    expect(formatPrice(184_500)).toBe("$1,845");
  });
});

describe.skipIf(!process.env.SHOW_PLANS)("printout", () => {
  it("shows plans for the real October 5 clients", () => {
    const joshua = result({ texture: 61, pore: 68, age_spot: 58, redness: 71, wrinkle: 86, firmness: 85, acne: 90, moisture: 71, radiance: 73, oiliness: 78, dark_circle_v2: 67, eye_bag: 81, droopy_upper_eyelid: 87, droopy_lower_eyelid: 84, tear_trough: 83 });
    const joshuaIntake = intake({ concerns: ["texture", "redness"], goalText: "Smoother skin and get rid of dark circles under eye", budgetBand: "500_1000" });
    const amelia = intake({ concerns: ["uneven_tone", "texture"], hasEvent: true, eventType: "wedding", eventDate: "2027-01-11", budgetBand: "1000_2000" });
    for (const [name, r, i] of [["Samantha (live)", liveScan, liveIntake], ["Joshua (demo)", joshua, joshuaIntake], ["Amelia (brief)", result({ texture: 58, age_spot: 61, pore: 66 }), amelia]] as const) {
      const p = plan(r, i);
      const stated = statedConcerns(i);
      const top = priorities(r, 3);
      console.log(`\n=== ${name}\n${subhead(r)}\nfocus: ${p.focus.map((f) => `${f.key} ${f.ui}${f.stated ? "*" : ""}`).join(", ")}`);
      top.forEach((c, n) => console.log(`  ${c.key} ${c.ui}: ${priorityMeaning(n, c, top.slice(0, n), stated, p)}`));
      mentions(r, stated, top, p).forEach((m) => console.log(`  mention: ${m.text}`));
      console.log(planRationale(p));
      p.recommended.lines.forEach((l) => console.log(`  ${l.treatment.name} x${l.sessions} ${formatPrice(l.totalCents)}`));
      console.log(`  total ${formatPrice(p.recommended.totalCents)}`);
      if (p.withinBudget) console.log(`  within budget: ${p.withinBudget.lines.map((l) => `${l.treatment.name} x${l.sessions}`).join(" + ")} = ${formatPrice(p.withinBudget.totalCents)}`);
      p.timeline.forEach((s) => console.log(`  ${s.date} ${s.kind}${s.kind === "session" ? ` ${s.treatment.name} ${s.session}/${s.of}` : ""}`));
      p.homeCare.forEach((h) => console.log(`  home: ${h.product.name}: ${h.reason}`));
    }
  });
});

describe("HD detail in the wording", () => {
  it("says where on the face a wrinkle or pore priority shows most", async () => {
    const { mostVisibleArea } = await import("@/lib/report/personal");
    expect(mostVisibleArea({ key: "wrinkle", ui: 60, raw: 50, maskPath: null, areas: { forehead: 85, crowfeet: 60 } })).toBe(
      "Most visible at the crow's feet.",
    );
    expect(mostVisibleArea({ key: "wrinkle", ui: 60, raw: 50, maskPath: null })).toBeNull();
    // Area names we can't put into words are never shown.
    expect(mostVisibleArea({ key: "pore", ui: 60, raw: 50, maskPath: null, areas: { zone_7: 40, zone_9: 50 } })).toBeNull();
  });
});

describe("what-to-expect simulation (DECISIONS D-047)", () => {
  it("simulates only what the plan works on, gently, and in YouCam's names", async () => {
    const { simulationIntensities, MAX_INTENSITY } = await import("@/lib/simulation/intensity");
    const p = plan(result({ texture: 58, age_spot: 61, pore: 66 }), intake({ budgetBand: "2000_plus" }));
    const intensities = simulationIntensities(p);
    const covered = new Set(p.recommended.lines.flatMap((l) => l.covers));
    expect(intensities.texture).toBe(MAX_INTENSITY);
    // Pigmentation is "spot" to YouCam's simulation.
    if (covered.has("age_spot")) expect(intensities.spot).toBeDefined();
    expect(intensities.age_spot).toBeUndefined();
    for (const v of Object.values(intensities)) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(MAX_INTENSITY);
    }
  });

  it("shows less when fewer sessions than a full course are booked", async () => {
    const { simulationIntensities, MAX_INTENSITY } = await import("@/lib/simulation/intensity");
    const p = plan(result({ texture: 58 }), null);
    const shortened = { ...p, recommended: { ...p.recommended, lines: p.recommended.lines.map((l) => ({ ...l, sessions: 1 })) } };
    expect(simulationIntensities(shortened).texture).toBeLessThan(MAX_INTENSITY);
  });

  it("leaves out concerns YouCam can't simulate", async () => {
    const { simulationIntensities } = await import("@/lib/simulation/intensity");
    const p = plan(result({ firmness: 55, droopy_upper_eyelid: 58 }), null);
    expect(Object.keys(simulationIntensities(p))).not.toContain("firmness");
  });

  it("dates the illustration to the progress scan", async () => {
    const { illustratedWeek } = await import("@/lib/simulation/intensity");
    const p = plan(liveScan, liveIntake);
    const progress = p.timeline.find((s) => s.kind === "progress")!;
    expect(illustratedWeek(p, "2026-10-05")).toBe(Math.round((Date.parse(progress.date) - Date.parse("2026-10-05")) / (7 * 86_400_000)));
  });

  it("charges what YouCam's docs say", async () => {
    const { simulationUnitCost } = await import("@/lib/youcam/units");
    expect([1, 4, 5, 10].map(simulationUnitCost)).toEqual([4, 4, 6, 6]);
    expect(() => simulationUnitCost(11)).toThrow();
  });

  it("finds the result image wherever YouCam puts it", async () => {
    process.env.YOUCAM_API_KEY ||= "test-key";
    const { findImageUrl } = await import("@/lib/youcam/client");
    expect(findImageUrl({ url: "https://s3.test/a.jpg" })).toBe("https://s3.test/a.jpg");
    expect(findImageUrl({ output: [{ type: "simulation", url: "https://s3.test/b.jpg" }] })).toBe("https://s3.test/b.jpg");
    expect(findImageUrl({ note: "none" })).toBeNull();
  });
});
