import { describe, expect, it } from "vitest";
import { demoFace } from "@/lib/demo/landmarks";
import { FACE_POINT_COUNT, canonicalFace, faceFeatures, faceGrid, faceTargets } from "@/lib/face/grid";

// The scan's light grid follows a person's own face points (DECISIONS D-077).
describe("the face grid", () => {
  const face = demoFace("amelia")!.slice(0, FACE_POINT_COUNT) as [number, number][];
  const xs = face.map((p) => p[0]);
  const ys = face.map((p) => p[1]);
  const inside = ([x, y]: number[]) => x >= Math.min(...xs) - 1e-6 && x <= Math.max(...xs) + 1e-6 && y >= Math.min(...ys) - 1e-6 && y <= Math.max(...ys) + 1e-6;

  it("draws lines across and down the face, and only on it", () => {
    const { lats, lons } = faceGrid(face, { lats: 30, lons: 24 });
    expect(lats.length).toBeGreaterThanOrEqual(29);
    expect(lons.length).toBeGreaterThanOrEqual(23);
    for (const line of [...lats, ...lons]) {
      expect(line.length).toBeGreaterThan(2);
      for (const p of line) {
        expect(inside(p)).toBe(true);
        expect(p[2]).toBeGreaterThanOrEqual(0);
        expect(p[2]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("follows the face it's given: moving the face moves every line with it", () => {
    const moved = face.map(([x, y]) => [x * 0.5 + 0.2, y * 0.5 + 0.1] as [number, number]);
    const [a, b] = [faceGrid(face).lats[10], faceGrid(moved).lats[10]];
    expect(b).toHaveLength(a.length);
    b.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(a[i][0] * 0.5 + 0.2, 6);
      expect(p[1]).toBeCloseTo(a[i][1] * 0.5 + 0.1, 6);
    });
  });

  it("outlines the face and its features, and names where the target settles", () => {
    const { oval, features } = faceFeatures(face);
    expect(oval.length).toBeGreaterThan(36);
    expect(features).toHaveLength(5);
    expect(faceTargets(face).map((t) => t.label)).toEqual(["Eye area", "Eye area", "Nose", "Lips", "Cheek", "Forehead"]);
  });

  it("has a face of its own for when there's no photo", () => {
    const own = canonicalFace();
    expect(own).toHaveLength(FACE_POINT_COUNT);
    expect(own.every(([x, y]) => x > 0 && x < 1 && y > 0 && y < 1)).toBe(true);
    expect(faceGrid(own).lats.length).toBeGreaterThan(20);
  });

  it("draws nothing without a whole face", () => {
    expect(faceGrid(face.slice(0, 100))).toEqual({ lats: [], lons: [] });
  });
});
