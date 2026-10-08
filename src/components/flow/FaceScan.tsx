"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/ui/cx";
import { framing, onStage } from "@/lib/face/frame";
import { FACE_POINT_COUNT, SPARKLE_POINTS, canonicalFace, faceFeatures, faceGrid, faceTargets, type GridPt, type Pt } from "@/lib/face/grid";

/** One pass of light across the face, the pause before the next, and the soft band's half-width and edge. */
const PASS_MS = 2600;
const GAP_MS = 700;
const HALF = 0.26;
const SOFT = 0.16;
const HOP_MS = 1500;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** How lit a point is, at `u` across the face (0 to 1), for a band centred on `c`. */
const lit = (u: number, c: number) => smooth(c - HALF - SOFT, c - HALF, u) * (1 - smooth(c + HALF, c + HALF + SOFT, u));
const easeInOut = (t: number) => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, t))) / 2;

/**
 * The scan, on the client's own face, while their photo is read (DECISIONS D-077). A fine grid that follows the
 * face's 3D shape sweeps across it, side to side, lighting the eyes, nose and lips as it passes; focus brackets
 * hold the face, a target settles on each feature in turn, and a ruler tracks the sweep. The bar is the analysis's
 * real progress and every figure is true (the face model's 468 points, the 15 measurements). When the reading
 * ends, the light settles and "Analysis complete" arrives. Without the photo (another tab, private mode) it scans
 * the face model itself. With reduced motion it holds still.
 */
export function FaceScan({
  photo,
  points,
  stage,
  step,
  steps,
  progress,
  done,
}: {
  /** The photo just taken, or null to scan the face model instead. */
  photo: string | null;
  points: Pt[] | null;
  /** What the analysis is doing now, in a few words. */
  stage: string;
  step: number;
  steps: number;
  /** The analysis's real progress, 0 to 1. */
  progress: number;
  done: boolean;
}) {
  const own = Boolean(photo && points && points.length >= FACE_POINT_COUNT);
  const face = useMemo<Pt[]>(() => (own ? points!.slice(0, FACE_POINT_COUNT) : canonicalFace()), [own, points]);
  const [aspect, setAspect] = useState(0.75);
  const plane = useMemo(() => framing(face, own ? aspect : 0.75), [face, own, aspect]);
  const geometry = useMemo(() => ({ grid: faceGrid(face, { lats: 30, lons: 24 }), ...faceFeatures(face) }), [face]);
  const targets = useMemo(() => faceTargets(face), [face]);
  const box = useMemo(() => bounds(face.map((p) => onStage(p, plane))), [face, plane]);

  const stageEl = useRef<HTMLDivElement>(null);
  const coreEl = useRef<HTMLCanvasElement>(null);
  const glowEl = useRef<HTMLCanvasElement>(null);
  const haloEl = useRef<HTMLCanvasElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const doneRef = useRef(done);
  useEffect(() => {
    doneRef.current = done;
  }, [done]);

  const [still, setStill] = useState(false);
  const [hop, setHop] = useState(0);

  useEffect(() => {
    // Motion preference only exists in the browser.
    const s = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setStill(s), 0);
    return () => window.clearTimeout(t);
  }, []);

  // The target moves from feature to feature while the face is read.
  useEffect(() => {
    if (still || done) return;
    const t = window.setInterval(() => setHop((h) => h + 1), HOP_MS);
    return () => window.clearInterval(t);
  }, [still, done]);

  useEffect(() => {
    const host = stageEl.current;
    const layers = [coreEl.current, glowEl.current, haloEl.current];
    if (!host || layers.some((l) => !l)) return;
    const [core, glow, halo] = layers.map((l) => l!.getContext("2d")!) as CanvasRenderingContext2D[];
    let W = 0;
    let H = 0;
    let dpr = 1;
    let caches: { white: HTMLCanvasElement; blue: HTMLCanvasElement } | null = null;
    const px = (p: GridPt | Pt): Pt => [(plane.left + p[0] * plane.width) * W, (plane.top + p[1] * plane.height) * W];
    const across = (x: number) => (x / W - box.left) / Math.max(0.01, box.right - box.left);
    const lonX = geometry.grid.lons.map((l) => across(l.reduce((s, p) => s + px(p)[0], 0) / l.length));
    const featureX = geometry.features.map((f) => across(f.reduce((s, p) => s + px(p)[0], 0) / f.length));
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
      for (const [i, l] of layers.entries()) {
        const scale = i === 2 ? 0.5 : dpr;
        l!.width = Math.round(W * scale);
        l!.height = Math.round(H * scale);
        [core, glow, halo][i].setTransform(scale, 0, 0, scale, 0, 0);
      }
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
    };
    build();
    const ro = new ResizeObserver(build);
    ro.observe(host);

    const start = performance.now();
    let ended: number | null = null;
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!caches || !W) return;
      const t = now - start;
      if (doneRef.current && ended === null) ended = now;
      const settle = ended === null ? 0 : smooth(0, 700, now - ended);

      // The band: one pass, a pause, the next pass the other way.
      const cycle = PASS_MS + GAP_MS;
      const n = Math.floor(Math.max(0, t - 400) / cycle);
      const k = Math.max(0, t - 400) - n * cycle;
      const p = easeInOut(k / PASS_MS);
      const from = 1 + HALF + SOFT;
      const to = -(HALF + SOFT);
      const c = n % 2 === 0 ? from + (to - from) * p : to + (from - to) * p;
      const front = n % 2 === 0 ? c - HALF : c + HALF;
      // Once the reading ends, the light finishes settling and no new pass begins.
      const running = !still && t > 400 && k < PASS_MS && settle < 1;
      const intro = smooth(0, 600, t);
      if (marker.current) marker.current.style.transform = `translateX(${(Math.min(1, Math.max(0, front)) * 100).toFixed(2)}%)`;

      for (const [ctx, cache] of [
        [core, caches.white],
        [glow, caches.blue],
        [halo, caches.white],
      ] as const) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
        const gridAlpha = (still ? 0.4 : running ? 1 : 0) * intro * (1 - settle);
        if (gridAlpha > 0.01) {
          ctx.globalAlpha = gridAlpha;
          ctx.drawImage(cache, 0, 0, W, H);
          ctx.globalAlpha = 1;
          if (!still) {
            // Only the band shows: the grid fades in at its front and out at its back.
            const x0 = box.left * W;
            const x1 = box.right * W;
            const g = ctx.createLinearGradient(x0, 0, x1, 0);
            const at = [0, 1, c - HALF - SOFT, c - HALF, c + HALF, c + HALF + SOFT].filter((v) => v >= 0 && v <= 1).sort((a, b) => a - b);
            for (const v of at) g.addColorStop(v, `rgba(0,0,0,${lit(v, c)})`);
            ctx.globalCompositeOperation = "destination-in";
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
            ctx.globalCompositeOperation = "source-over";
          }
          // The front of the band: one brighter line down the face.
          if (running) {
            let best = 0;
            lonX.forEach((x, i) => {
              if (Math.abs(x - front) < Math.abs(lonX[best] - front)) best = i;
            });
            const line = geometry.grid.lons[best];
            const a = intro * (1 - settle);
            if (ctx === core) stroke(ctx, line, `rgba(255,255,255,${0.9 * a})`, 1.3);
            else stroke(ctx, line, ctx === glow ? `rgba(90,190,245,${a})` : `rgba(255,255,255,${0.8 * a})`, ctx === glow ? 3.4 : 2.4);
          }
        }

        // The face's outline, and the features the band has lit, fading slowly behind it.
        const base = still ? 0.6 : 0.12 + 0.3 * settle;
        const ovalAlpha = intro * (still ? 0.6 : 0.32 + 0.2 * settle);
        if (ctx === core) stroke(ctx, geometry.oval, `rgba(250,253,255,${ovalAlpha})`, 1);
        else stroke(ctx, geometry.oval, ctx === glow ? `rgba(80,175,235,${ovalAlpha})` : `rgba(255,255,255,${ovalAlpha * 0.6})`, 2.6);
        geometry.features.forEach((f, i) => {
          if (ctx === core) {
            const target = running ? lit(featureX[i], c) : 0;
            glowOf[i] = Math.max(target, glowOf[i] * 0.965);
          }
          const a = intro * Math.min(1, base + 0.8 * glowOf[i] * (1 - settle * 0.6));
          if (ctx === core) stroke(ctx, f, `rgba(255,255,255,${a})`, 1.2);
          else stroke(ctx, f, ctx === glow ? `rgba(70,185,250,${a})` : `rgba(210,245,255,${a})`, ctx === glow ? 4 : 3);
        });

        // Points that catch the light as the band passes.
        if (!still && running) {
          SPARKLE_POINTS.forEach((idx, i) => {
            const [x, y] = px(face[idx]);
            const s = lit(across(x), c) * (0.55 + 0.45 * Math.sin(t / 140 + i * 1.7)) * intro * (1 - settle);
            if (s < 0.05) return;
            ctx.fillStyle = ctx === glow ? `rgba(110,200,255,${s})` : `rgba(255,255,255,${s})`;
            ctx.beginPath();
            ctx.arc(x, y, ctx === core ? 1.6 : 4.5, 0, Math.PI * 2);
            ctx.fill();
            if (ctx === core) {
              const r = 7 * s;
              ctx.strokeStyle = `rgba(255,255,255,${s * 0.9})`;
              ctx.lineWidth = 0.8;
              ctx.beginPath();
              ctx.moveTo(x - r, y);
              ctx.lineTo(x + r, y);
              ctx.moveTo(x, y - r);
              ctx.lineTo(x, y + r);
              ctx.stroke();
            }
          });
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [geometry, plane, box, face, still]);

  const target = targets[hop % targets.length];
  const [tx, ty] = onStage(target.at, plane);
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const pad = 0.05;

  return (
    <div className="relative mx-auto w-full max-w-[460px]">
      <div
        ref={stageEl}
        className={cx(
          "relative aspect-[4/5] overflow-hidden rounded-[28px] shadow-[0_40px_80px_-40px_rgba(12,44,62,0.7)] ring-1 ring-white/80",
          own ? "bg-mist" : "bg-[radial-gradient(90%_70%_at_50%_42%,#1e5a78_0%,#0e2230_70%,#081820_100%)]",
        )}
      >
        {own && (
          // eslint-disable-next-line @next/next/no-img-element -- the photo just taken, from this tab only
          <img
            src={photo!}
            alt=""
            onLoad={(e) => setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight || 0.75)}
            className="absolute max-w-none object-cover"
            style={{ left: pct(plane.left), top: pct(plane.top / 1.25), width: pct(plane.width), height: pct(plane.height / 1.25) }}
          />
        )}
        {/* Cool light over the photo while it's read, so the scan carries. */}
        {own && <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(206,236,248,0.18),rgba(12,44,62,0.18))]" />}

        <canvas ref={haloEl} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full mix-blend-screen blur-[8px]" />
        <canvas ref={glowEl} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-80 blur-[2.5px]" />
        <canvas ref={coreEl} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />

        {/* Focus brackets: they close on the face as it's found. */}
        <div
          aria-hidden
          className="scan-brackets pointer-events-none absolute"
          style={{ left: pct(box.left - pad), top: pct(box.top - pad * 0.8), width: pct(box.right - box.left + pad * 2), height: pct(box.bottom - box.top + pad * 1.6) }}
        >
          {["left-0 top-0 border-l border-t rounded-tl-[10px]", "right-0 top-0 border-r border-t rounded-tr-[10px]", "bottom-0 left-0 border-b border-l rounded-bl-[10px]", "bottom-0 right-0 border-b border-r rounded-br-[10px]"].map((c) => (
            <span key={c} className={cx("absolute h-5 w-5 border-white/95 drop-shadow-[0_0_4px_rgba(120,210,255,0.9)]", c)} />
          ))}
        </div>

        {/* The target, settling on each feature in turn. */}
        {!still && !done && (
          <div aria-hidden className="pointer-events-none absolute transition-[left,top] duration-700 ease-gentle" style={{ left: pct(tx), top: pct(ty) }}>
            <span className="scan-target absolute -translate-x-1/2 -translate-y-1/2" />
            <span key={hop} className="fade absolute left-5 top-0 -translate-y-1/2 whitespace-nowrap rounded-full bg-[rgba(8,24,32,0.45)] px-2 py-0.5 text-[9.5px] uppercase tracking-[0.16em] text-white backdrop-blur-sm">
              {target.label}
            </span>
          </div>
        )}

        {/* Readouts, true figures only. */}
        <div
          aria-hidden
          className={cx("pointer-events-none absolute flex flex-col items-start gap-1.5 transition-opacity duration-700", done ? "opacity-0" : "scan-hex")}
          style={{ left: pct(Math.min(0.84, box.right + 0.015)), top: pct(box.top + (box.bottom - box.top) * 0.28) }}
        >
          <Hex value="468" label="points" />
          <span className="ml-6">
            <Hex value="15" label="measures" />
          </span>
        </div>

        {/* Bottom: a ruler that tracks the sweep, and the analysis's real progress. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,rgba(8,24,32,0)_0%,rgba(8,24,32,0.5)_100%)]" />
        <div aria-hidden className="pointer-events-none absolute bottom-[3.3rem] h-3" style={{ left: pct(box.left), width: pct(box.right - box.left) }}>
          <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            {Array.from({ length: 41 }, (_, i) => (
              <line key={i} x1={i * 2.5} x2={i * 2.5} y1={i % 4 === 0 ? 0 : 5} y2={10} stroke="rgba(255,255,255,0.7)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          <span ref={marker} className="absolute inset-y-0 left-0 w-full will-change-transform">
            <span className="absolute -top-1.5 bottom-0 w-[2px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_8px_rgba(130,215,255,1)]" />
          </span>
        </div>
        <div className="absolute inset-x-4 bottom-4 flex items-center gap-3 text-white">
          <span className="relative h-[3px] w-24 shrink-0 overflow-hidden rounded-full bg-white/30">
            <span
              className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-[linear-gradient(90deg,#8fe0ff,#eafaff)] shadow-[0_0_10px_rgba(140,220,255,0.95)] transition-transform duration-1000 ease-gentle"
              style={{ transform: `scaleX(${Math.max(0.04, Math.min(1, progress))})` }}
            />
          </span>
          <span key={stage} className="fade min-w-0 flex-1 truncate text-[10.5px] uppercase tracking-[0.16em] drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
            {stage}
          </span>
          <span className="shrink-0 text-[10.5px] tabular-nums tracking-[0.12em] text-white/80">
            {Math.min(step, steps)}/{steps}
          </span>
        </div>

        {/* The end of the reading. */}
        <div
          className={cx(
            "absolute inset-x-[12%] top-[58%] flex items-center justify-center gap-2.5 rounded-[16px] border border-white/85 bg-white/60 px-5 py-3.5 text-[15px] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_20px_40px_-22px_rgba(12,44,62,0.6)] backdrop-blur-xl transition-[opacity,transform] duration-700 ease-gentle",
            done ? "opacity-100" : "pointer-events-none translate-y-2 scale-[0.98] opacity-0",
          )}
        >
          <svg aria-hidden viewBox="0 0 20 20" width={18} height={18} className="shrink-0 text-[var(--growth)]">
            <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M6.2 10.3l2.5 2.4 5-5.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Analysis complete
        </div>
      </div>
    </div>
  );
}

/** A small glass hexagon with a true figure. */
function Hex({ value, label }: { value: string; label: string }) {
  return (
    <span className="relative grid h-[52px] w-[46px] place-items-center text-white">
      <svg viewBox="0 0 46 52" className="absolute inset-0 h-full w-full drop-shadow-[0_0_6px_rgba(120,210,255,0.8)]">
        <path d="M23 1.5 44 13.5v25L23 50.5 2 38.5v-25Z" fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.9)" strokeWidth="1" />
      </svg>
      <span className="relative text-center leading-none">
        <span className="block font-display text-[17px]">{value}</span>
        <span className="mt-0.5 block text-[7px] uppercase tracking-[0.14em] text-white/85">{label}</span>
      </span>
    </span>
  );
}

function bounds(points: Pt[]) {
  let [left, top, right, bottom] = [1, 1, 0, 0];
  for (const [x, y] of points) {
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return { left, top, right, bottom };
}
