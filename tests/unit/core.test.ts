import { describe, expect, it } from "vitest";
import { MAISON_VERRE, TIDEWATER } from "@/data/clinics";
import { SEED_PRODUCTS, SEED_TREATMENTS } from "@/data/menu";
import { contrastRatio, onAccent } from "@/lib/brand";
import { formatLongDate, isoDateInZone, splitOffset, virtualNow } from "@/lib/clock";
import { nextOpening, offsetTo } from "@/lib/demo/next-opening";
import { checkCopy, stripEmDashes } from "@/lib/copy/check";
import { CONCERNS, SCORED_CONCERNS } from "@/lib/skin/concerns";
import { normalizeResult, priorities } from "@/lib/skin/normalize";
import { FIXTURE_PROFILES, fixtureResult, rawFromUi } from "@/lib/youcam/fixture";
import { sdUnitCost } from "@/lib/youcam/units";

describe("clinic theming", () => {
  it("picks readable text on every demo accent", () => {
    for (const clinic of [MAISON_VERRE, TIDEWATER]) {
      expect(contrastRatio(clinic.accentHex, onAccent(clinic.accentHex))).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("uses porcelain text on a dark accent", () => {
    expect(onAccent("#1F3B57")).toBe("#F7F4EF");
  });
});

describe("virtual clock", () => {
  const real = new Date("2026-11-10T18:30:00Z");
  it("uses real time by default", () => {
    expect(virtualNow({}, real).toISOString()).toBe(real.toISOString());
  });
  it("pins the demo day and keeps the time of day", () => {
    expect(virtualNow({ demoToday: "2026-12-29" }, real).toISOString()).toBe("2026-12-29T18:30:00.000Z");
  });
  it("moves forward with time travel", () => {
    expect(virtualNow({ demoToday: "2026-12-29", offsetDays: 7 }, real).toISOString().slice(0, 10)).toBe("2027-01-05");
  });
  it("adds the minutes from a jump to the next opening", () => {
    expect(virtualNow({ offsetDays: 1, offsetMinutes: 90 }, real).toISOString()).toBe("2026-11-11T20:00:00.000Z");
    expect(splitOffset(1530)).toEqual({ days: 1, minutes: 90 });
    expect(splitOffset(45)).toEqual({ days: 0, minutes: 45 });
  });
  it("jumps to the next opening, in the clinic's zone", () => {
    const clinic = { timezone: "America/Los_Angeles", hours: { days: { 2: { open: "10:00", close: "18:00" }, 6: { open: "10:00", close: "18:00" } }, slotMinutes: 30 } };
    // Friday 8:57pm in Los Angeles: closed for the night, so Saturday at ten.
    expect(nextOpening(new Date("2026-10-10T03:57:00Z"), clinic)?.toISOString()).toBe("2026-10-10T17:00:00.000Z");
    // Saturday at eight: later the same morning.
    expect(nextOpening(new Date("2026-10-10T15:00:00Z"), clinic)?.toISOString()).toBe("2026-10-10T17:00:00.000Z");
    // Saturday at noon, already open: the next open day is Tuesday.
    expect(nextOpening(new Date("2026-10-10T19:00:00Z"), clinic)?.toISOString()).toBe("2026-10-13T17:00:00.000Z");
    expect(nextOpening(new Date(), { timezone: "America/Los_Angeles", hours: { days: {}, slotMinutes: 30 } })).toBeNull();
    // The offset lands on the opening, rounded up to the minute.
    const base = new Date("2026-10-10T03:57:30Z");
    const { days, minutes } = offsetTo(new Date("2026-10-10T17:00:00Z"), base);
    expect(virtualNow({ offsetDays: days, offsetMinutes: minutes }, base).getTime()).toBeGreaterThanOrEqual(Date.parse("2026-10-10T17:00:00Z"));
    expect({ days, minutes }).toEqual({ days: 0, minutes: 783 });
  });
  it("formats US dates in the clinic's zone", () => {
    expect(formatLongDate("2026-10-05T18:00:00Z", "America/Los_Angeles")).toBe("October 5, 2026");
    expect(isoDateInZone(new Date("2026-10-06T02:00:00Z"), "America/Los_Angeles")).toBe("2026-10-05");
  });
});

describe("menu and concerns", () => {
  it("only references concerns we can measure", () => {
    for (const t of SEED_TREATMENTS) for (const c of t.concerns) expect(SCORED_CONCERNS).toContain(c);
    for (const p of SEED_PRODUCTS) for (const c of p.concerns) expect(SCORED_CONCERNS).toContain(c);
  });
  it("gives every concern a friendly name that isn't the API name", () => {
    for (const key of SCORED_CONCERNS) expect(CONCERNS[key].label).not.toBe(key);
  });
  it("marks aggressive treatments as off-limits in the two weeks before an event", () => {
    const peel = SEED_TREATMENTS.find((t) => t.name === "Signature Peel Series")!;
    expect(peel.minDaysBeforeEvent).toBeGreaterThanOrEqual(14);
  });
});

describe("YouCam units", () => {
  it("matches the brief's price table", () => {
    expect([1, 4, 5, 8, 9, 12, 13, 16].map(sdUnitCost)).toEqual([9, 9, 12, 12, 14, 14, 16, 16]);
    expect(() => sdUnitCost(17)).toThrow();
  });
});

describe("fixtures", () => {
  it("are deterministic per scan", () => {
    expect(fixtureResult("scan-a", SCORED_CONCERNS)).toEqual(fixtureResult("scan-a", SCORED_CONCERNS));
  });
  it("reproduce Amelia's scan 01 priorities", () => {
    const result = normalizeResult(fixtureResult("amelia", SCORED_CONCERNS, 0));
    expect(priorities(result).map((c) => [c.key, c.ui])).toEqual([
      ["texture", 58],
      ["age_spot", 61],
      ["pore", 66],
    ]);
    expect(FIXTURE_PROFILES[0].ui.texture).toBe(58);
  });
  it("keep raw scores below ui scores, rising together", () => {
    expect(rawFromUi(58)).toBeLessThan(58);
    expect(rawFromUi(71)).toBeGreaterThan(rawFromUi(58));
  });
});

describe("copy rules", () => {
  it("rejects banned words and em dashes", () => {
    expect(checkCopy("A flawless glow up, guaranteed.").map((i) => i.rule).sort()).toEqual(["flawless", "glow up", "guaranteed"]);
    expect(checkCopy("Calm \u2014 precise")[0].rule).toBe("em dash");
    expect(checkCopy("We can treat acne.").map((i) => i.rule)).toContain("treat a condition");
  });
  it("allows the required footer and the word treatment", () => {
    expect(checkCopy("This is a cosmetic assessment of visible skin, not a medical diagnosis.")).toEqual([]);
    expect(checkCopy("Your first treatment is a peel.")).toEqual([]);
    expect(checkCopy("An illustration of likely improvement. Not a guaranteed result.")).toEqual([]);
  });
  it("strips em dashes", () => {
    expect(stripEmDashes("Calm \u2014 precise")).toBe("Calm, precise");
  });
});
