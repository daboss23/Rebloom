// Pure maths for the capture quality gate. No DOM here, so it can be unit-tested.
import { GATE } from "./thresholds";

export interface Point {
  x: number;
  y: number;
}

/** MediaPipe face-mesh landmark indices we rely on. */
export const LM = {
  foreheadTop: 10,
  chin: 152,
  noseTip: 1,
  rightEyeOuter: 33, // subject's right, image left (unmirrored)
  rightEyeInner: 133,
  leftEyeInner: 362,
  leftEyeOuter: 263,
  mouthRight: 61,
  mouthLeft: 291,
  faceRight: 234,
  faceLeft: 454,
  rightBrow: 105,
  leftBrow: 334,
} as const;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function boundingBox(points: Point[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Largest 3:4 portrait rectangle centred in a frame. What the preview shows is what we send. */
export function portraitCrop(width: number, height: number): Box {
  const target = 3 / 4;
  if (width / height > target) {
    const w = Math.round(height * target);
    return { x: Math.round((width - w) / 2), y: 0, w, h: height };
  }
  const h = Math.round(width / target);
  return { x: 0, y: Math.round((height - h) / 2), w: width, h };
}

/**
 * A 3:4 crop around a face so the face fills `fill` of the crop width, kept inside the image.
 * Used for uploaded photos, where the person framed the shot themselves.
 */
export function cropAroundFace(face: Box, imageW: number, imageH: number, fill = 0.7): Box {
  let w = face.w / fill;
  let h = (w * 4) / 3;
  if (w > imageW) {
    w = imageW;
    h = (w * 4) / 3;
  }
  if (h > imageH) {
    h = imageH;
    w = (h * 3) / 4;
  }
  const cx = face.x + face.w / 2;
  const cy = face.y + face.h / 2 - h * (GATE.targetCenterY - 0.5);
  const x = Math.min(Math.max(cx - w / 2, 0), imageW - w);
  const y = Math.min(Math.max(cy - h / 2, 0), imageH - h);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** Converts landmarks normalised to the full frame into landmarks normalised to a crop. */
export function toCropSpace(points: Point[], frameW: number, frameH: number, crop: Box, mirror = false): Point[] {
  return points.map((p) => {
    const x = (p.x * frameW - crop.x) / crop.w;
    return { x: mirror ? 1 - x : x, y: (p.y * frameH - crop.y) / crop.h };
  });
}

/**
 * Yaw, pitch and roll in degrees from MediaPipe's 4x4 facial transformation matrix
 * (column-major), assuming R = Ry(yaw) · Rx(pitch) · Rz(roll).
 */
export function eulerFromMatrix(data: ArrayLike<number>): { yaw: number; pitch: number; roll: number } {
  const r = (row: number, col: number) => data[col * 4 + row];
  const deg = 180 / Math.PI;
  const yaw = Math.atan2(r(0, 2), r(2, 2)) * deg;
  const pitch = Math.asin(Math.max(-1, Math.min(1, -r(1, 2)))) * deg;
  const roll = Math.atan2(r(1, 0), r(1, 1)) * deg;
  return { yaw, pitch, roll };
}

export interface LumaStats {
  mean: number;
  clippedShare: number;
  /** Mean red ÷ mean blue. Higher is warmer light. */
  warmth: number;
}

/** Luma statistics for an RGBA pixel buffer region. */
export function lumaStats(rgba: ArrayLike<number>, width: number, region: Box): LumaStats {
  let sum = 0;
  let clipped = 0;
  let rSum = 0;
  let bSum = 0;
  let n = 0;
  const x0 = Math.max(0, Math.floor(region.x));
  const y0 = Math.max(0, Math.floor(region.y));
  const x1 = Math.min(width, Math.ceil(region.x + region.w));
  const height = Math.floor(rgba.length / 4 / width);
  const y1 = Math.min(height, Math.ceil(region.y + region.h));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      sum += luma;
      rSum += r;
      bSum += b;
      if (luma >= 250) clipped++;
      n++;
    }
  }
  if (n === 0) return { mean: 0, clippedShare: 0, warmth: 1 };
  return { mean: sum / n, clippedShare: clipped / n, warmth: rSum / Math.max(1, bSum) };
}

/** Variance of the Laplacian over a greyscale buffer. Low values mean blur. */
export function laplacianVariance(gray: ArrayLike<number>, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function rgbaToGray(rgba: ArrayLike<number>): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    out[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }
  return out;
}

/** Relative brightness difference between two cheeks, 0 when equal. */
export function unevenness(a: number, b: number): number {
  const hi = Math.max(a, b);
  return hi === 0 ? 0 : Math.abs(a - b) / hi;
}

/** Cheek sample boxes in crop-normalised space, from landmarks already in crop space. */
export function cheekBoxes(lm: Point[]): [Box, Box] {
  const eyeDist = Math.abs(lm[LM.leftEyeOuter].x - lm[LM.rightEyeOuter].x);
  const size = eyeDist * 0.22;
  const cheek = (eye: Point, mouth: Point): Box => {
    const cx = eye.x + (mouth.x - eye.x) * 0.35;
    const cy = eye.y + (mouth.y - eye.y) * 0.55;
    return { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
  };
  return [cheek(lm[LM.rightEyeOuter], lm[LM.mouthRight]), cheek(lm[LM.leftEyeOuter], lm[LM.mouthLeft])];
}
