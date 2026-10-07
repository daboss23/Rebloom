"use client";

import { useEffect, useRef, useState } from "react";

type P = [number, number];

/** Where a priority shows: warm coral, with a soft glow beneath. */
export const MARK = "#ff6f5e";
/** Elsewhere on the face, where this scan found none of it: fresh green (DECISIONS D-075). */
export const CLEAR = "#7be3b0";

/** The face as the dots need it: its outline, and the eyes and lips the dots stay off. All 0 to 1 each way. */
export interface FaceShape {
  hull: P[];
  holes: P[][];
  /** The face's width as a share of the photo's. */
  width: number;
}

// The face model's outlines of the eyes and lips (MediaPipe Face Mesh), each once round.
const HOLES = [
  [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
  [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
];

export function faceShape(points: P[] | null): FaceShape | null {
  if (!points || points.length < 468) return null;
  const hull = convexHull(points);
  const xs = hull.map((p) => p[0]);
  return {
    hull,
    holes: HOLES.map((ring, k) => grow(ring.map((i) => points[i]), k < 2 ? 1.25 : 1.08)),
    width: Math.max(...xs) - Math.min(...xs),
  };
}

/**
 * One priority's marks as fine dots: coral where the scan's mask found it (bigger and brighter where it's stronger),
 * sparse green across the rest of the face. Every dot comes from this scan's own mask; nothing is invented. Shown, it
 * spreads out from where the priority shows; hidden, it fades.
 */
export function MarkDots({
  maskUrl,
  face,
  shown,
  origin,
}: {
  maskUrl: string;
  face: FaceShape | null;
  shown: boolean;
  /** Where the dots spread from (0 to 1 each way). Without one, the mask's own centre. */
  origin: P | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const haze = useRef<HTMLCanvasElement>(null);
  const [centre, setCentre] = useState<P | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    const glow = haze.current;
    if (!el || !glow) return;
    let cancelled = false;
    let mask: HTMLImageElement | null = null;
    const draw = () => {
      if (!mask || cancelled) return;
      const c = paint(el, glow, mask, face);
      if (c) setCentre(c);
      setReady(true);
    };
    const img = new Image();
    img.decoding = "async";
    img.src = maskUrl;
    img
      .decode()
      .then(() => {
        mask = img;
        draw();
      })
      // A mask that won't load leaves the photo unmarked, never a broken image.
      .catch(() => undefined);
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [maskUrl, face]);

  const [ox, oy] = origin ?? centre ?? [0.5, 0.5];
  const at = `${(ox * 100).toFixed(1)}% ${(oy * 100).toFixed(1)}%`;
  const on = shown && ready;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        opacity: on ? 1 : 0,
        clipPath: on ? `circle(150% at ${at})` : `circle(0% at ${at})`,
        // In: spread out from where it shows. Out: a quick fade, then reset the circle out of sight.
        transition: on
          ? "clip-path 1100ms var(--ease-gentle), opacity 200ms ease-out"
          : "opacity 240ms ease-out, clip-path 0ms linear 240ms",
      }}
    >
      {/* A soft warm glow under the dots, as strong as the mask beneath it. */}
      <canvas ref={haze} className="absolute inset-0 h-full w-full opacity-75 blur-[14px]" />
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

/** Draws the dots at the canvas's size and returns the mask's centre, or null for an empty mask. */
function paint(el: HTMLCanvasElement, glow: HTMLCanvasElement, mask: HTMLImageElement, face: FaceShape | null): P | null {
  const W = el.clientWidth;
  const H = el.clientHeight;
  if (!W || !H) return null;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  el.width = Math.round(W * dpr);
  el.height = Math.round(H * dpr);
  const ctx = el.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Dot spacing follows the face, so a close selfie and a distant portrait read alike.
  const pitch = Math.min(7, Math.max(3.6, face ? (face.width * W) / 42 : W / 70));
  const cols = Math.max(1, Math.round(W / pitch));
  const rows = Math.max(1, Math.round(H / pitch));
  const cw = W / cols;
  const ch = H / rows;
  const field = sample(mask, cols, rows);
  if (!field) return null;

  let sx = 0;
  let sy = 0;
  let sw = 0;
  const marks: [number, number, number][] = [];
  const clear: [number, number, number][] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const h = hash(i, j);
      const x = (i + 0.5 + ((h & 0xff) / 255 - 0.5) * 0.7) * cw;
      const y = (j + 0.5 + (((h >> 8) & 0xff) / 255 - 0.5) * 0.7) * ch;
      const p: P = [x / W, y / H];
      if (face && (!inside(p, face.hull) || face.holes.some((hole) => inside(p, hole)))) continue;
      const v = field[j * cols + i];
      if (v >= 0.14) {
        marks.push([x, y, v]);
        sx += p[0] * v;
        sy += p[1] * v;
        sw += v;
      } else if (face && ((h >> 16) & 0xff) < 80) {
        clear.push([x, y, 0.45 + (((h >> 24) & 0xff) / 255) * 0.45]);
      }
    }
  }

  // Points of light, as the scan saw them. A faint deep-sea edge keeps them readable on pale skin (DECISIONS D-027).
  const unit = Math.min(cw, ch);
  const r = (v: number | null) => Math.max(0.6, v === null ? unit * 0.15 : unit * (0.14 + 0.16 * v));
  ctx.fillStyle = "rgba(12,26,34,0.16)";
  ctx.beginPath();
  for (const [x, y] of clear) dot(ctx, x, y, r(null) + 0.5);
  for (const [x, y, v] of marks) dot(ctx, x, y, r(v) + 0.5);
  ctx.fill();

  ctx.fillStyle = CLEAR;
  for (const [x, y, a] of clear) {
    ctx.globalAlpha = a;
    ctx.beginPath();
    dot(ctx, x, y, r(null));
    ctx.fill();
  }

  ctx.fillStyle = MARK;
  ctx.shadowColor = "rgba(255,96,74,0.85)";
  ctx.shadowBlur = 3 * dpr;
  for (const [x, y, v] of marks) {
    ctx.globalAlpha = 0.75 + 0.25 * v;
    ctx.beginPath();
    dot(ctx, x, y, r(v));
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  // The glow: the same field, coarse, blurred by CSS.
  const tint = document.createElement("canvas");
  tint.width = cols;
  tint.height = rows;
  const t = tint.getContext("2d");
  const g = glow.getContext("2d");
  if (t && g) {
    const img = t.createImageData(cols, rows);
    for (let k = 0; k < field.length; k++) {
      img.data.set([255, 111, 94, field[k] >= 0.14 ? Math.round(field[k] * 210) : 0], k * 4);
    }
    t.putImageData(img, 0, 0);
    glow.width = Math.max(1, Math.round(W / 2));
    glow.height = Math.max(1, Math.round(H / 2));
    g.imageSmoothingQuality = "high";
    g.drawImage(tint, 0, 0, glow.width, glow.height);
  }
  return sw > 0 ? [sx / sw, sy / sw] : null;
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/**
 * The mask's strength in each grid cell, 0 to 1: halved step by step so fine lines and specks average in rather
 * than vanish, softened a little so a lone speck still shows, then scaled to the mask's strongest cell.
 */
function sample(mask: HTMLImageElement, cols: number, rows: number): Float32Array | null {
  let src: CanvasImageSource = mask;
  let w = mask.naturalWidth;
  let h = mask.naturalHeight;
  while (w / 2 >= cols * 2 && h / 2 >= rows * 2) {
    const c = document.createElement("canvas");
    c.width = Math.ceil(w / 2);
    c.height = Math.ceil(h / 2);
    const x = c.getContext("2d");
    if (!x) return null;
    x.imageSmoothingQuality = "high";
    x.drawImage(src, 0, 0, c.width, c.height);
    [src, w, h] = [c, c.width, c.height];
  }
  const c = document.createElement("canvas");
  c.width = cols;
  c.height = rows;
  const x = c.getContext("2d", { willReadFrequently: true });
  if (!x) return null;
  x.imageSmoothingQuality = "high";
  x.drawImage(src, 0, 0, cols, rows);
  const px = x.getImageData(0, 0, cols, rows).data;

  const raw = new Float32Array(cols * rows);
  for (let k = 0; k < raw.length; k++) raw[k] = px[k * 4 + 3] / 255;
  const out = new Float32Array(raw.length);
  let max = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      let sum = 0;
      let wsum = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const [a, b] = [i + di, j + dj];
          if (a < 0 || b < 0 || a >= cols || b >= rows) continue;
          const k = (2 - Math.abs(di)) * (2 - Math.abs(dj));
          sum += raw[b * cols + a] * k;
          wsum += k;
        }
      }
      const v = Math.max(raw[j * cols + i], (sum / wsum) * 0.9);
      out[j * cols + i] = v;
      max = Math.max(max, v);
    }
  }
  if (max < 0.02) return null;
  for (let k = 0; k < out.length; k++) out[k] = (out[k] / max) ** 0.7;
  return out;
}

/** A steady pseudo-random number per grid cell, so the dots sit in the same places on every visit. */
function hash(i: number, j: number) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function inside([x, y]: P, poly: P[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** A ring scaled out from its own centre. */
function grow(ring: P[], k: number): P[] {
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return ring.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
}

function convexHull(points: P[]): P[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: P[]) => {
    const out: P[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(pts), ...half([...pts].reverse())];
}
