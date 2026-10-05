"use client";
// Measures one frame (or one still photo) for the quality gate.
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import type { FrameMetrics } from "@/lib/capture/gate";
import {
  boundingBox,
  cheekBoxes,
  eulerFromMatrix,
  laplacianVariance,
  lumaStats,
  rgbaToGray,
  toCropSpace,
  unevenness,
  type Box,
  type Point,
} from "@/lib/capture/metrics";

const A_W = 240;
const A_H = 320;

function blend(result: FaceLandmarkerResult, name: string): number {
  return result.faceBlendshapes?.[0]?.categories.find((c) => c.categoryName === name)?.score ?? 0;
}

export interface Measurement {
  metrics: FrameMetrics;
  /** Landmarks normalised to the crop, unmirrored. Null when there's no single face. */
  landmarks: Point[] | null;
  center: Point | null;
}

export function measure(
  source: CanvasImageSource,
  sourceW: number,
  sourceH: number,
  crop: Box,
  result: FaceLandmarkerResult,
  previousCenter: Point | null,
  canvas: HTMLCanvasElement,
): Measurement {
  const empty: FrameMetrics = {
    faceCount: result.faceLandmarks.length,
    shortSide: Math.min(crop.w, crop.h),
    faceWidthRatio: 0,
    centerX: 0.5,
    centerY: 0.5,
    yaw: 0,
    pitch: 0,
    roll: 0,
    luminance: 0,
    clippedShare: 0,
    unevenness: 0,
    warmth: 1,
    sharpness: 0,
    eyeBlink: 0,
    jawOpen: 0,
    movement: 0,
  };
  if (result.faceLandmarks.length !== 1) return { metrics: empty, landmarks: null, center: null };

  const lm = toCropSpace(result.faceLandmarks[0], sourceW, sourceH, crop);
  const box = boundingBox(lm);
  const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const pose = result.facialTransformationMatrixes?.[0]
    ? eulerFromMatrix(result.facialTransformationMatrixes[0].data)
    : { yaw: 0, pitch: 0, roll: 0 };

  // Draw the crop small, then sample the face region.
  canvas.width = A_W;
  canvas.height = A_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, A_W, A_H);
  const px = (b: Box): Box => ({ x: b.x * A_W, y: b.y * A_H, w: b.w * A_W, h: b.h * A_H });
  const faceRegion = px({ x: box.x + box.w * 0.15, y: box.y + box.h * 0.2, w: box.w * 0.7, h: box.h * 0.65 });
  const image = ctx.getImageData(0, 0, A_W, A_H);
  const stats = lumaStats(image.data, A_W, faceRegion);
  const [rc, lc] = cheekBoxes(lm);
  const right = lumaStats(image.data, A_W, px(rc)).mean;
  const left = lumaStats(image.data, A_W, px(lc)).mean;

  const fx = Math.max(0, Math.floor(faceRegion.x));
  const fy = Math.max(0, Math.floor(faceRegion.y));
  const fw = Math.max(3, Math.min(A_W - fx, Math.floor(faceRegion.w)));
  const fh = Math.max(3, Math.min(A_H - fy, Math.floor(faceRegion.h)));
  const sharpness = laplacianVariance(rgbaToGray(ctx.getImageData(fx, fy, fw, fh).data), fw, fh);

  return {
    landmarks: lm,
    center,
    metrics: {
      ...empty,
      faceWidthRatio: box.w,
      centerX: center.x,
      centerY: center.y,
      ...pose,
      luminance: stats.mean,
      clippedShare: stats.clippedShare,
      warmth: stats.warmth,
      unevenness: unevenness(left, right),
      sharpness,
      eyeBlink: Math.max(blend(result, "eyeBlinkLeft"), blend(result, "eyeBlinkRight")),
      jawOpen: blend(result, "jawOpen"),
      movement: previousCenter ? Math.hypot(center.x - previousCenter.x, center.y - previousCenter.y) : 0,
    },
  };
}

/** Renders the crop at output size as a JPEG. Mirrored for selfies, so it matches what people saw. */
export async function renderShot(
  source: CanvasImageSource,
  crop: Box,
  opts: { mirror: boolean; shortSide: number; quality: number },
): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, opts.shortSide / Math.min(crop.w, crop.h));
  const width = Math.round(crop.w * scale);
  const height = Math.round(crop.h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  if (opts.mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode photo"))), "image/jpeg", opts.quality),
  );
  return { blob, width, height };
}

export function packLandmarks(points: Point[], mirror: boolean): [number, number][] {
  return points.map((p) => [Math.round((mirror ? 1 - p.x : p.x) * 1e4) / 1e4, Math.round(p.y * 1e4) / 1e4]);
}

const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|Line\/|Snapchat|musical_ly|BytedanceWebview|LinkedInApp|Pinterest|; wv\)/i;
export function isInAppBrowser(ua: string): boolean {
  return IN_APP.test(ua);
}
