// The light grid of the scan (DECISIONS D-077): lines that follow the face's 3D shape, drawn on a person's own
// face points. The shape comes from MediaPipe's canonical face model (src/data/canonical-face.json, Apache 2.0,
// see src/data/THIRD_PARTY.md), whose 468 vertices are the same 468 points the face model finds on a photo.
// Slicing the canonical face with planes and carrying each crossing onto the photo's own points gives lines that
// curve over the brow, nose and cheeks as light would. Pure geometry: no DOM, so it's tested and shared.

import canonical from "@/data/canonical-face.json";

export type Pt = [number, number];
/** A point on a grid line: x and y on the photo (0 to 1 each way), and how far across the face it sits (0 to 1). */
export type GridPt = [number, number, number];

const V = canonical.v as [number, number, number][];
const F = canonical.f as [number, number, number][];

export const FACE_POINT_COUNT = V.length;

/** Tilts that give the lines their curve: horizontal planes lean back a little, vertical ones turn a little. */
const TILT_H = -0.3;
const TILT_V = 0.18;

const along = (n: [number, number, number]) => V.map(([x, y, z]) => n[0] * x + n[1] * y + n[2] * z);
const H_VALS = along([0, Math.cos(TILT_H), Math.sin(TILT_H)]);
const V_VALS = along([Math.cos(TILT_V), 0, Math.sin(TILT_V)]);
const span = (a: number[]) => [Math.min(...a), Math.max(...a)] as const;
const [H_LO, H_HI] = span(H_VALS);
const [V_LO, V_HI] = span(V_VALS);
/** How far across the face each vertex sits, 0 at one side to 1 at the other. */
const ACROSS = V_VALS.map((v) => (v - V_LO) / (V_HI - V_LO));

/** A slice's shape: which mesh edges it crosses, in order, and where along each. Independent of any one face. */
type Chain = { i: number; j: number; s: number }[];

function sliceTopology(vals: number[], t: number): Chain[] {
  const key = (i: number, j: number) => (i < j ? i * 512 + j : j * 512 + i);
  const edges = new Map<number, { i: number; j: number; s: number }>();
  const adj = new Map<number, number[]>();
  const cross = (i: number, j: number) => {
    const k = key(i, j);
    if (!edges.has(k)) edges.set(k, { i, j, s: (vals[i] - t) / (vals[i] - vals[j]) });
    return k;
  };
  for (const [a, b, c] of F) {
    const hit: number[] = [];
    for (const [i, j] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const)
      if (vals[i] < t !== vals[j] < t) hit.push(cross(i, j));
    if (hit.length !== 2) continue;
    const [p, r] = hit;
    adj.set(p, [...(adj.get(p) ?? []), r]);
    adj.set(r, [...(adj.get(r) ?? []), p]);
  }
  const seen = new Set<number>();
  const chains: Chain[] = [];
  const walk = (start: number) => {
    const out = [start];
    seen.add(start);
    for (let at = start; ; ) {
      const next = (adj.get(at) ?? []).find((n) => !seen.has(n));
      if (next === undefined) break;
      seen.add(next);
      out.push(next);
      at = next;
    }
    return out.map((k) => edges.get(k)!);
  };
  // Open lines start at an end; closed ones (round an eye) start anywhere.
  for (const [k, n] of adj) if (n.length === 1 && !seen.has(k)) chains.push(walk(k));
  for (const k of adj.keys()) if (!seen.has(k)) chains.push(walk(k));
  return chains.filter((c) => c.length > 1);
}

/** Rounds off the mesh's corners so each slice reads as one smooth line. */
export function chaikin<T extends number[]>(line: T[]): T[] {
  const out: T[] = [line[0]];
  for (let i = 0; i < line.length - 1; i++) {
    const [a, b] = [line[i], line[i + 1]];
    out.push(a.map((v, k) => 0.75 * v + 0.25 * b[k]) as T, a.map((v, k) => 0.25 * v + 0.75 * b[k]) as T);
  }
  out.push(line[line.length - 1]);
  return out;
}

const topologyCache = new Map<string, { lats: Chain[][]; lons: Chain[][] }>();
function topology(lats: number, lons: number) {
  const id = `${lats}x${lons}`;
  let t = topologyCache.get(id);
  if (!t) {
    t = {
      lats: Array.from({ length: lats - 1 }, (_, k) => sliceTopology(H_VALS, H_HI - ((k + 1) / lats) * (H_HI - H_LO))),
      lons: Array.from({ length: lons - 1 }, (_, k) => sliceTopology(V_VALS, V_LO + ((k + 1) / lons) * (V_HI - V_LO))),
    };
    topologyCache.set(id, t);
  }
  return t;
}

const place = (chain: Chain, points: Pt[]): GridPt[] =>
  chain.map(({ i, j, s }) => [
    points[i][0] + s * (points[j][0] - points[i][0]),
    points[i][1] + s * (points[j][1] - points[i][1]),
    ACROSS[i] + s * (ACROSS[j] - ACROSS[i]),
  ]);

/** The light grid on a face: lines across (latitudes) and lines down (longitudes), each a smooth polyline. */
export function faceGrid(points: Pt[], { lats = 30, lons = 24 }: { lats?: number; lons?: number } = {}) {
  if (points.length < FACE_POINT_COUNT) return { lats: [] as GridPt[][], lons: [] as GridPt[][] };
  const t = topology(lats, lons);
  const smooth = (chains: Chain[][]) => chains.flat().map((c) => chaikin(place(c, points)));
  return { lats: smooth(t.lats), lons: smooth(t.lons) };
}

// The face model's outlines (MediaPipe Face Mesh), each once round.
const RINGS = {
  oval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
  eyeA: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  eyeB: [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
  lips: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
  lipsInner: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191],
} as const;
const NOSE = [129, 98, 97, 2, 326, 327, 358];

/** The outlines the scan lights: the face, the eyes, the lips and the base of the nose. */
export function faceFeatures(points: Pt[]) {
  const at = (i: number): GridPt => [points[i][0], points[i][1], ACROSS[i]];
  const ring = (ids: readonly number[]) => chaikin(chaikin([...ids, ids[0]].map(at)));
  return {
    oval: ring(RINGS.oval),
    features: [ring(RINGS.eyeA), ring(RINGS.eyeB), ring(RINGS.lips), ring(RINGS.lipsInner), chaikin(chaikin(NOSE.map(at)))],
  };
}

/** Where the scan's target settles, in order: an eye, the other eye, the nose, the lips, a cheek. */
export function faceTargets(points: Pt[]): { at: Pt; label: string }[] {
  const mid = (ids: readonly number[]): Pt => [
    ids.reduce((s, i) => s + points[i][0], 0) / ids.length,
    ids.reduce((s, i) => s + points[i][1], 0) / ids.length,
  ];
  return [
    { at: mid(RINGS.eyeA), label: "Eye area" },
    { at: mid(RINGS.eyeB), label: "Eye area" },
    { at: points[1], label: "Nose" },
    { at: mid(RINGS.lips), label: "Lips" },
    { at: points[205], label: "Cheek" },
    { at: points[151], label: "Forehead" },
  ];
}

/** Points that catch the light as the scan passes: cheekbones, brow ends, chin, temples. */
export const SPARKLE_POINTS = [50, 280, 105, 334, 152, 234, 454, 10, 205, 425, 4, 168];

/** The canonical face itself, seen from the front, as 0 to 1 points: the scan's face when there's no photo. */
export function canonicalFace(): Pt[] {
  const xs = V.map((v) => v[0]);
  const ys = V.map((v) => v[1]);
  const [x0, x1] = span(xs);
  const [y0, y1] = span(ys);
  const size = Math.max(x1 - x0, y1 - y0);
  // Centred, the face about 60% of the frame's width, in a 3:4 frame.
  return V.map(([x, y]) => [0.5 + ((x - (x0 + x1) / 2) / size) * 0.62, 0.47 - ((y - (y0 + y1) / 2) / size) * 0.62 * 0.75]);
}
