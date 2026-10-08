"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Framing } from "@/lib/face/frame";
import { SPARKLE_POINTS, faceFeatures, faceGrid, type GridPt, type Pt } from "@/lib/face/grid";

const PASS_MS = 2600;
const HALF = 0.26;
const SOFT = 0.16;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** How lit a point is, at `u` across the face (0 to 1), for a band centred on `c`. */
const lit = (u: number, c: number) => smooth(c - HALF - SOFT, c - HALF, u) * (1 - smooth(c + HALF, c + HALF + SOFT, u));
const easeInOut = (t: number) => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, t))) / 2;

/**
 * The scan's light, one language everywhere (DECISIONS D-077, D-078): a fine grid that follows the face's 3D
 * shape sweeps across it in a soft band, side to side; the eyes, nose and lips glow as it passes and fade behind
 * it; points on the cheekbones, brow and chin catch the light. After its passes, or once `settled`, it rests as a
 * faint outline of the face and its features. Drawn once per size and shown through a moving mask, with the glow
 * left to the compositor, so it stays smooth on phones. With reduced motion it only ever rests.
 *
 * Fills its positioned parent. `run` restarts it; `passes` may be Infinity.
 */
export function ScanLight({
  points,
  frame,
  passes,
  run = 0,
  settled = false,
  gapMs = 700,
  rest,
  onFront,
}: {
  /** The face model's 468 points on the photo, 0 to 1 each way. */
  points: Pt[];
  /** Where the photo sits in the container (see lib/face/frame). */
  frame: Framing;
  passes: number;
  run?: number;
  settled?: boolean;
  gapMs?: number;
  /** How bright the face's outline and features stay at rest, 0 to 1. */
  rest: { oval: number; features: number };
  /** Where the band's front is across the face, 0 to 1, each frame. */
  onFront?: (front: number) => void;
}) {
  const geometry = useMemo(() => ({ grid: faceGrid(points, { lats: 30, lons: 24 }), ...faceFeatures(points) }), [points]);
  const coreEl = useRef<HTMLCanvasElement>(null);
  const glowEl = useRef<HTMLCanvasElement>(null);
  const haloEl = useRef<HTMLCanvasElement>(null);
  const live = useRef({ settled, onFront, rest });
  useEffect(() => {
    live.current = { settled, onFront, rest };
  }, [settled, onFront, rest]);
  const [still, setStill] = useState(false);
  useEffect(() => {
    // Motion preference only exists in the browser.
    const s = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setStill(s), 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const layers = [coreEl.current, glowEl.current, haloEl.current];
    const host = layers[0]?.parentElement;
    if (!host || layers.some((l) => !l)) return;
    const [core, glow, halo] = layers.map((l) => l!.getContext("2d")!) as CanvasRenderingContext2D[];
    let W = 0;
    let H = 0;
    let dpr = 1;
    let caches: { white: HTMLCanvasElement; blue: HTMLCanvasElement } | null = null;
    const px = (p: GridPt | Pt): Pt => [(frame.left + p[0] * frame.width) * W, (frame.top + p[1] * frame.height) * W];
    const xs = points.map((p) => frame.left + p[0] * frame.width);
    const [boxL, boxR] = [Math.min(...xs), Math.max(...xs)];
    const across = (x: number) => (x / W - boxL) / Math.max(0.01, boxR - boxL);
    let lonX: number[] = [];
    let featureX: number[] = [];
    const glowOf = geometry.features.map(() => 0);

    const stroke = (ctx: CanvasRenderingContext2D, line: (GridPt | Pt)[], color: string, width: number) => {
      ctx.beginPath();
      line.forEach((p, i) => {
        const [x, y] = px(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    };

    // The full grid, drawn once per size; each frame shows it through the moving band.
    const build = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = host.clientWidth;
      H = host.clientHeight;
      if (!W || !H) return;
      layers.forEach((l, i) => {
        const scale = i === 2 ? 0.5 : dpr;
        l!.width = Math.round(W * scale);
        l!.height = Math.round(H * scale);
        [core, glow, halo][i].setTransform(scale, 0, 0, scale, 0, 0);
      });
      const make = (color: string, width: number) => {
        const c = document.createElement("canvas");
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
        const ctx = c.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (const l of [...geometry.grid.lats, ...geometry.grid.lons]) stroke(ctx, l, color, width);
        return c;
      };
      caches = { white: make("rgba(250,253,255,0.9)", 0.7), blue: make("rgba(80,175,235,0.95)", 2.2) };
      lonX = geometry.grid.lons.map((l) => across(l.reduce((s, p) => s + px(p)[0], 0) / l.length));
      featureX = geometry.features.map((f) => across(f.reduce((s, p) => s + px(p)[0], 0) / f.length));
      idle = false;
    };
    let idle = false;
    build();
    const ro = new ResizeObserver(build);
    ro.observe(host);

    const start = performance.now();
    let ended: number | null = null;
    let raf = 0;
    const frameFn = (now: number) => {
      raf = requestAnimationFrame(frameFn);
      if (!caches || !W) return;
      const t = now - start;
      const { settled: stop, onFront: report, rest: r } = live.current;
      const cycle = PASS_MS + gapMs;
      const n = Math.floor(Math.max(0, t - 400) / cycle);
      const k = Math.max(0, t - 400) - n * cycle;
      // It rests after its passes, or as soon as it's told to.
      if (ended === null && (still || stop || n >= passes)) ended = still ? now - 700 : now;
      const settle = ended === null ? 0 : smooth(0, 700, now - ended);
      if (settle >= 1 && idle) return;

      const p = easeInOut(k / PASS_MS);
      const from = 1 + HALF + SOFT;
      const to = -(HALF + SOFT);
      const c = n % 2 === 0 ? from + (to - from) * p : to + (from - to) * p;
      const front = n % 2 === 0 ? c - HALF : c + HALF;
      const running = !still && t > 400 && k < PASS_MS && settle < 1;
      const intro = still ? 1 : smooth(0, 600, t);
      report?.(Math.min(1, Math.max(0, front)));

      for (const [ctx, cache] of [
        [core, caches.white],
        [glow, caches.blue],
        [halo, caches.white],
      ] as const) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
        const gridAlpha = (running ? 1 : 0) * intro * (1 - settle);
        if (gridAlpha > 0.01) {
          ctx.globalAlpha = gridAlpha;
          ctx.drawImage(cache, 0, 0, W, H);
          ctx.globalAlpha = 1;
          // Only the band shows: the grid fades in at its front and out at its back.
          const g = ctx.createLinearGradient(boxL * W, 0, boxR * W, 0);
          const at = [0, 1, c - HALF - SOFT, c - HALF, c + HALF, c + HALF + SOFT].filter((v) => v >= 0 && v <= 1).sort((a, b) => a - b);
          for (const v of at) g.addColorStop(v, `rgba(0,0,0,${lit(v, c)})`);
          ctx.globalCompositeOperation = "destination-in";
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = "source-over";
          // The front of the band: one brighter line down the face.
          let best = 0;
          lonX.forEach((x, i) => {
            if (Math.abs(x - front) < Math.abs(lonX[best] - front)) best = i;
          });
          const a = intro * (1 - settle);
          const line = geometry.grid.lons[best];
          if (line) {
            if (ctx === core) stroke(ctx, line, `rgba(255,255,255,${0.9 * a})`, 1.3);
            else stroke(ctx, line, ctx === glow ? `rgba(90,190,245,${a})` : `rgba(255,255,255,${0.8 * a})`, ctx === glow ? 3.4 : 2.4);
          }
        }

        // The face's outline, and the features the band has lit, fading slowly behind it.
        const base = 0.12 + (r.features - 0.12) * settle;
        const ovalAlpha = intro * (0.32 + (r.oval - 0.32) * settle);
        if (ovalAlpha > 0.01) {
          if (ctx === core) stroke(ctx, geometry.oval, `rgba(250,253,255,${ovalAlpha})`, 1);
          else stroke(ctx, geometry.oval, ctx === glow ? `rgba(80,175,235,${ovalAlpha})` : `rgba(255,255,255,${ovalAlpha * 0.6})`, 2.6);
        }
        geometry.features.forEach((f, i) => {
          if (ctx === core) glowOf[i] = Math.max(running ? lit(featureX[i], c) : 0, glowOf[i] * 0.965);
          const a = intro * Math.min(1, base + 0.8 * glowOf[i] * (1 - settle));
          if (a < 0.01) return;
          if (ctx === core) stroke(ctx, f, `rgba(255,255,255,${a})`, 1.2);
          else stroke(ctx, f, ctx === glow ? `rgba(70,185,250,${a})` : `rgba(210,245,255,${a})`, ctx === glow ? 4 : 3);
        });

        // Points that catch the light as the band passes.
        if (running) {
          SPARKLE_POINTS.forEach((idx, i) => {
            const [x, y] = px(points[idx]);
            const s = lit(across(x), c) * (0.55 + 0.45 * Math.sin(t / 140 + i * 1.7)) * intro;
            if (s < 0.05) return;
            ctx.fillStyle = ctx === glow ? `rgba(110,200,255,${s})` : `rgba(255,255,255,${s})`;
            ctx.beginPath();
            ctx.arc(x, y, ctx === core ? 1.6 : 4.5, 0, Math.PI * 2);
            ctx.fill();
            if (ctx === core) {
              const rr = 7 * s;
              ctx.strokeStyle = `rgba(255,255,255,${s * 0.9})`;
              ctx.lineWidth = 0.8;
              ctx.beginPath();
              ctx.moveTo(x - rr, y);
              ctx.lineTo(x + rr, y);
              ctx.moveTo(x, y - rr);
              ctx.lineTo(x, y + rr);
              ctx.stroke();
            }
          });
        }
      }
      // At rest nothing changes: stop drawing until something does.
      if (settle >= 1) idle = true;
    };
    raf = requestAnimationFrame(frameFn);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [geometry, frame, points, passes, gapMs, still, run]);

  return (
    <>
      <canvas ref={haloEl} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full mix-blend-screen blur-[8px]" />
      <canvas ref={glowEl} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-80 blur-[2.5px]" />
      <canvas ref={coreEl} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
    </>
  );
}
