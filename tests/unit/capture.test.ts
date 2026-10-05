import { describe, expect, it } from "vitest";
import { failingChecks, instructionFor, lightMatch, type FrameMetrics } from "@/lib/capture/gate";
import {
  boundingBox,
  cropAroundFace,
  eulerFromMatrix,
  laplacianVariance,
  lumaStats,
  portraitCrop,
  toCropSpace,
  unevenness,
} from "@/lib/capture/metrics";

const deg = Math.PI / 180;

/** Column-major 4x4 for R = Ry(yaw) · Rx(pitch) · Rz(roll). */
function matrix(yaw: number, pitch: number, roll: number): number[] {
  const [cy, sy, cx, sx, cz, sz] = [Math.cos(yaw * deg), Math.sin(yaw * deg), Math.cos(pitch * deg), Math.sin(pitch * deg), Math.cos(roll * deg), Math.sin(roll * deg)];
  const r = [
    [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx],
    [cx * sz, cx * cz, -sx],
    [-sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx],
  ];
  const m = new Array(16).fill(0);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) m[col * 4 + row] = r[row][col];
  m[15] = 1;
  return m;
}

const good: FrameMetrics = {
  faceCount: 1,
  shortSide: 1080,
  faceWidthRatio: 0.7,
  centerX: 0.5,
  centerY: 0.47,
  yaw: 2,
  pitch: -1,
  roll: 0,
  luminance: 140,
  clippedShare: 0,
  unevenness: 0.05,
  warmth: 1.4,
  sharpness: 900,
  eyeBlink: 0.05,
  jawOpen: 0.02,
  movement: 0.002,
};

describe("head pose from the transformation matrix", () => {
  it("recovers yaw, pitch and roll", () => {
    const p = eulerFromMatrix(matrix(12, -7, 4));
    expect(p.yaw).toBeCloseTo(12, 5);
    expect(p.pitch).toBeCloseTo(-7, 5);
    expect(p.roll).toBeCloseTo(4, 5);
  });
  it("reads a frontal face as zero", () => {
    const p = eulerFromMatrix(matrix(0, 0, 0));
    expect(Math.abs(p.yaw) + Math.abs(p.pitch) + Math.abs(p.roll)).toBeLessThan(1e-9);
  });
});

describe("crops", () => {
  it("takes the largest centred 3:4 portrait from a landscape webcam", () => {
    expect(portraitCrop(1280, 720)).toEqual({ x: 370, y: 0, w: 540, h: 720 });
  });
  it("takes the largest centred 3:4 portrait from a tall phone stream", () => {
    expect(portraitCrop(1080, 1920)).toEqual({ x: 0, y: 240, w: 1080, h: 1440 });
  });
  it("crops uploads so the face fills about 70% of the width, inside the image", () => {
    const c = cropAroundFace({ x: 400, y: 300, w: 280, h: 360 }, 1200, 1600);
    expect(c.w).toBe(400);
    expect(c.h).toBe(533);
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x + c.w).toBeLessThanOrEqual(1200);
  });
  it("maps landmarks into crop space, optionally mirrored", () => {
    const [p] = toCropSpace([{ x: 0.5, y: 0.5 }], 1280, 720, { x: 370, y: 0, w: 540, h: 720 }, true);
    expect(p.x).toBeCloseTo(0.5);
    expect(boundingBox([{ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.9 }])).toEqual({ x: 0.2, y: 0.1, w: 0.6000000000000001, h: 0.8 });
  });
});

describe("image statistics", () => {
  it("measures zero sharpness on a flat image and high sharpness on a checkerboard", () => {
    const flat = new Float32Array(32 * 32).fill(128);
    const checker = Float32Array.from({ length: 32 * 32 }, (_, i) => ((i % 32) + Math.floor(i / 32)) % 2 ? 255 : 0);
    expect(laplacianVariance(flat, 32, 32)).toBe(0);
    expect(laplacianVariance(checker, 32, 32)).toBeGreaterThan(10_000);
  });
  it("computes luma, clipping and warmth", () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba.set([255, 255, 255, 255], i);
    const s = lumaStats(rgba, 4, { x: 0, y: 0, w: 4, h: 4 });
    expect(s.mean).toBeCloseTo(255);
    expect(s.clippedShare).toBe(1);
    expect(s.warmth).toBe(1);
    expect(unevenness(100, 80)).toBeCloseTo(0.2);
  });
});

describe("the quality gate", () => {
  it("passes a good frame", () => {
    expect(failingChecks(good)).toEqual([]);
    expect(instructionFor([])).toBe("That's it. Hold still");
  });
  it("asks for one thing at a time, most important first", () => {
    const f = failingChecks({ ...good, faceWidthRatio: 0.5, luminance: 50, eyeBlink: 0.9 });
    expect(f[0]).toBe("too_far");
    expect(instructionFor(f)).toBe("Move a little closer");
  });
  it("stops at no face or several faces", () => {
    expect(failingChecks({ ...good, faceCount: 0 })).toEqual(["no_face"]);
    expect(failingChecks({ ...good, faceCount: 2 })).toEqual(["multiple_faces"]);
  });
  it("flags pose, light, eyes, mouth and blur", () => {
    expect(failingChecks({ ...good, yaw: 15 })).toContain("pose");
    expect(failingChecks({ ...good, clippedShare: 0.1 })).toContain("bright");
    expect(failingChecks({ ...good, unevenness: 0.3 })).toContain("uneven");
    expect(failingChecks({ ...good, eyeBlink: 0.8 })).toContain("eyes");
    expect(failingChecks({ ...good, jawOpen: 0.6 })).toContain("mouth");
    expect(failingChecks({ ...good, sharpness: 5 })).toContain("blurry");
    expect(failingChecks({ ...good, shortSide: 400 })).toContain("resolution");
  });
  it("ignores movement for still photos", () => {
    expect(failingChecks({ ...good, movement: 0.2 })).toContain("moving");
    expect(failingChecks({ ...good, movement: 0.2 }, { still: true })).toEqual([]);
  });
  it("guides rescans toward scan 01's light without blocking", () => {
    expect(lightMatch({ luminance: 140, warmth: 1.4 }, { luminance: 142, warmth: 1.45 }).matches).toBe(true);
    const darker = lightMatch({ luminance: 140, warmth: 1.4 }, { luminance: 110, warmth: 1.4 });
    expect(darker.matches).toBe(false);
    expect(darker.hint).toMatch(/brighter/);
  });
});
