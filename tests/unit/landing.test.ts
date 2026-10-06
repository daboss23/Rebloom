import { describe, expect, it } from "vitest";
import { checkCopy } from "@/lib/copy/check";
import { landingPreview } from "@/lib/landing/preview";

// The landing page shows the demo clinic as a fresh sandbox sees it (DECISIONS D-059).
describe("the landing preview", () => {
  // Includes a Sunday and a Monday (the clinic is closed): the hackathon's submission and deadline days.
  const days = ["2026-10-06", "2026-10-09", "2026-11-01", "2026-11-02", "2026-11-03", "2027-01-12"];

  it("always has a morning worth showing", () => {
    for (const day of days) {
      const p = landingPreview(new Date(`${day}T17:00:00Z`));
      expect(p.today, day).toBe(day);
      expect(p.rows.length, day).toBeGreaterThanOrEqual(3);
      expect(p.rows[0].kind, day).toBe("progress_moment");
      expect(p.rows.some((r) => r.atRisk), day).toBe(true);
      expect(p.readyCents, day).toBe(p.rows.reduce((n, r) => n + (r.valueCents ?? 0), 0));
      expect(p.keptCents, day).toBeGreaterThan(0);
      expect(p.atRisk, day).toBe(p.rows.filter((r) => r.atRisk).length);
      expect(p.clientCount, day).toBe(12);
      // Never "0 visits today" on a closed day: the figure looks ahead to the day the clinic opens.
      expect(p.visits.count, day).toBeGreaterThan(0);
    }
    expect(landingPreview(new Date("2026-11-01T17:00:00Z")).visits.day).toBe("Tuesday");
    expect(landingPreview(new Date("2026-11-03T17:00:00Z")).visits.day).toBe("today");
  });

  it("tells the fullest progress story, from the first scan's own scores", () => {
    const p = landingPreview(new Date("2026-10-06T17:00:00Z"));
    expect(p.story).toMatchObject({ name: "Amelia Reyes", label: "Texture", series: [58, 62, 67, 71], delta: 13, weeks: 12 });
    // Progress is judged on the raw measurement underneath, which moved further than the display score.
    expect(p.story!.raw.to - p.story!.raw.from).toBeGreaterThanOrEqual(5);
    expect(p.report?.priorities).toHaveLength(3);
    expect(p.report?.priorities[0]).toEqual({ label: "Texture", score: 58 });
    expect(p.report).toMatchObject({
      treatments: [
        { name: "Signature Peel Series", sessions: 3 },
        { name: "Microneedling", sessions: 1 },
      ],
      totalCents: 3 * 19500 + 39500,
    });
  });

  it("never puts a client's private report link on a public page", () => {
    const p = landingPreview(new Date("2026-10-06T17:00:00Z"));
    expect(p.moment?.paragraphs.length).toBeGreaterThan(1);
    for (const text of [p.moment!.subject, ...p.moment!.paragraphs]) {
      expect(text).not.toMatch(/\/r\/|https?:/);
      expect(checkCopy(text)).toEqual([]);
    }
  });

  it("prices the signature course from the menu", () => {
    expect(landingPreview(new Date("2026-10-06T17:00:00Z")).course).toEqual({ name: "Signature Peel Series", sessions: 3, priceCents: 19500 });
  });
});
