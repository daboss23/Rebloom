import "server-only";
// Demo masks drawn inside real facial regions, from the landmarks MediaPipe found at capture
// (DECISIONS D-020). Output: white-on-transparent PNGs, tinted by the report UI.
// Only used in fixture mode. Live scans use YouCam's own detection masks.

import { createHash } from "node:crypto";
import sharp from "sharp";
import { CONCERNS, type ConcernKey, type FaceRegion, type MaskPattern } from "./concerns";

type P = [number, number];

interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angle: number;
}

const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const mid = (a: P, b: P): P => lerp(a, b, 0.5);
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Region ellipses in pixel space, from normalised landmarks. */
/** Where a concern shows, as a point on the photo (0 to 1 each way): the centre of its first facial region. */
export function concernAnchor(landmarks: [number, number][], concern: ConcernKey): [number, number] {
  return regionAnchor(landmarks, CONCERNS[concern].regions[0]);
}

/** The centre of one facial region, as a point on the photo (0 to 1 each way). */
export function regionAnchor(landmarks: [number, number][], region: FaceRegion): [number, number] {
  const r = faceRegions(landmarks, 1, 1)[region];
  return [Math.round(r.cx * 1000) / 1000, Math.round(r.cy * 1000) / 1000];
}

export function faceRegions(landmarks: [number, number][], width: number, height: number): Record<FaceRegion, Ellipse> {
  const p = (i: number): P => [landmarks[i][0] * width, landmarks[i][1] * height];
  const top = p(10);
  const chin = p(152);
  const nose = p(1);
  // Landmarks may be mirrored, so take "a" and "b" sides rather than left and right.
  const eyeOutA = p(33);
  const eyeInA = p(133);
  const eyeInB = p(362);
  const eyeOutB = p(263);
  const mouthA = p(61);
  const mouthB = p(291);
  const sideA = p(234);
  const sideB = p(454);
  const browMid = mid(p(105), p(334));
  const faceW = dist(sideA, sideB);
  const eyeW = dist(eyeOutA, eyeInA);
  const angle = (Math.atan2(eyeOutB[1] - eyeOutA[1], eyeOutB[0] - eyeOutA[0]) * 180) / Math.PI;
  const e = (c: P, rx: number, ry: number): Ellipse => ({ cx: c[0], cy: c[1], rx, ry, angle });

  const cheek = (eyeOut: P, mouth: P, side: P) => {
    const base = lerp(eyeOut, mouth, 0.55);
    return e(lerp(base, side, 0.22), faceW * 0.13, faceW * 0.11);
  };
  const eyeCenterA = mid(eyeOutA, eyeInA);
  const eyeCenterB = mid(eyeOutB, eyeInB);
  const down = (c: P, k: number): P => [c[0], c[1] + eyeW * k];
  const outward = (outer: P, inner: P, k: number): P => [outer[0] + (outer[0] - inner[0]) * k, outer[1] + (outer[1] - inner[1]) * k];
  const mouthMid = mid(mouthA, mouthB);
  const jaw = (mouth: P, side: P) => {
    const c = lerp(mouth, side, 0.32);
    return e([c[0], mouth[1] + (chin[1] - mouth[1]) * 0.45], faceW * 0.1, faceW * 0.07);
  };

  return {
    forehead: e([(top[0] + browMid[0]) / 2, top[1] + (browMid[1] - top[1]) * 0.55], faceW * 0.33, Math.max(8, (browMid[1] - top[1]) * 0.42)),
    cheek_left: cheek(eyeOutA, mouthA, sideA),
    cheek_right: cheek(eyeOutB, mouthB, sideB),
    nose: e(lerp(mid(eyeInA, eyeInB), nose, 0.65), faceW * 0.07, dist(mid(eyeInA, eyeInB), nose) * 0.42),
    chin: e(lerp(mouthMid, chin, 0.55), faceW * 0.13, dist(mouthMid, chin) * 0.3),
    under_eye_left: e(down(eyeCenterA, 0.55), eyeW * 0.62, eyeW * 0.25),
    under_eye_right: e(down(eyeCenterB, 0.55), eyeW * 0.62, eyeW * 0.25),
    upper_lid_left: e(down(eyeCenterA, -0.25), eyeW * 0.55, eyeW * 0.18),
    upper_lid_right: e(down(eyeCenterB, -0.25), eyeW * 0.55, eyeW * 0.18),
    crows_left: e(outward(eyeOutA, eyeInA, 0.45), eyeW * 0.3, eyeW * 0.35),
    crows_right: e(outward(eyeOutB, eyeInB, 0.45), eyeW * 0.3, eyeW * 0.35),
    jaw_left: jaw(mouthA, sideA),
    jaw_right: jaw(mouthB, sideB),
  };
}

function rng(seed: string): () => number {
  let h = createHash("sha256").update(seed).digest().readUInt32LE(0);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A uniformly random point inside an ellipse, in pixel space. */
function pointIn(el: Ellipse, rand: () => number): P {
  const r = Math.sqrt(rand());
  const th = rand() * Math.PI * 2;
  const x = r * el.rx * Math.cos(th);
  const y = r * el.ry * Math.sin(th);
  const a = (el.angle * Math.PI) / 180;
  return [el.cx + x * Math.cos(a) - y * Math.sin(a), el.cy + x * Math.sin(a) + y * Math.cos(a)];
}

const f = (n: number) => n.toFixed(1);

function marks(pattern: MaskPattern, regions: Ellipse[], intensity: number, scale: number, rand: () => number): string {
  const out: string[] = [];
  for (const el of regions) {
    // Mark counts follow region size, so small regions (eyelids) don't get crowded.
    const area = (el.rx * el.ry) / (60 * 60 * scale * scale);
    const count = (k: number) => Math.max(2, Math.round(k * intensity * Math.min(2.5, Math.max(0.35, area))));
    if (pattern === "wash") {
      out.push(
        `<ellipse cx="${f(el.cx)}" cy="${f(el.cy)}" rx="${f(el.rx * 0.9)}" ry="${f(el.ry * 0.9)}" transform="rotate(${f(el.angle)} ${f(el.cx)} ${f(el.cy)})" fill="#fff" fill-opacity="${(0.55 + 0.35 * intensity).toFixed(2)}" filter="url(#wash)"/>`,
      );
    } else if (pattern === "lines") {
      for (let i = 0; i < count(9); i++) {
        const [x, y] = pointIn(el, rand);
        const len = (14 + rand() * 16) * scale;
        const tilt = ((el.angle + (rand() * 40 - 20)) * Math.PI) / 180;
        const dx = Math.cos(tilt) * len;
        const dy = Math.sin(tilt) * len;
        out.push(
          `<path d="M${f(x - dx / 2)} ${f(y - dy / 2)} Q${f(x)} ${f(y + 3 * scale)} ${f(x + dx / 2)} ${f(y + dy / 2)}" stroke="#fff" stroke-opacity="0.95" stroke-width="${f(1.8 * scale)}" fill="none" stroke-linecap="round"/>`,
        );
      }
    } else {
      const spec = {
        grain: { n: 90, r: [1.1, 2.2], o: [0.55, 0.9] },
        dots: { n: 40, r: [1.8, 3.4], o: [0.8, 1] },
        blotches: { n: 6, r: [6, 12], o: [0.55, 0.8] },
      }[pattern];
      for (let i = 0; i < count(spec.n); i++) {
        const [x, y] = pointIn(el, rand);
        const r = (spec.r[0] + rand() * (spec.r[1] - spec.r[0])) * scale;
        const o = spec.o[0] + rand() * (spec.o[1] - spec.o[0]);
        out.push(
          `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#fff" fill-opacity="${o.toFixed(2)}"${pattern === "blotches" ? ' filter="url(#soft)"' : ""}/>`,
        );
      }
    }
  }
  return out.join("");
}

/** Renders one concern's demo mask as a PNG at half the photo's resolution. */
export async function renderFixtureMask(input: {
  seed: string;
  concern: ConcernKey;
  ui: number;
  landmarks: [number, number][];
  width: number;
  height: number;
}): Promise<Buffer> {
  const w = Math.round(input.width / 2);
  const h = Math.round(input.height / 2);
  const info = CONCERNS[input.concern];
  const regions = faceRegions(input.landmarks, w, h);
  // Size marks relative to the face, not the photo, so they read the same at any distance.
  const lm = input.landmarks;
  const faceW = Math.hypot((lm[454][0] - lm[234][0]) * w, (lm[454][1] - lm[234][1]) * h);
  const scale = faceW / 260;
  const intensity = Math.max(0.15, Math.min(1, (100 - input.ui) / 50));
  const body = marks(info.pattern, info.regions.map((r) => regions[r]), intensity, scale, rng(`${input.seed}:${input.concern}`));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs>` +
    `<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(2.5 * scale)}"/></filter>` +
    `<filter id="wash" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(6 * scale)}"/></filter>` +
    `</defs>` +
    body +
    `</svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
