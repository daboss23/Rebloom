"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ScanLight } from "@/components/face/ScanLight";
import { cx } from "@/components/ui/cx";
import { framing, onStage, photoBox } from "@/lib/face/frame";

type P = [number, number];

export interface HeroPriority {
  key: string;
  label: string;
  from: number;
  score: number;
  anchor: P;
}

/**
 * The beats of each close-up, in ms: the camera pushes in, the aim locks on, the reading holds, the marks fade, the
 * camera pulls back, and the whole face rests before the next area. "open" is the first look at the whole face.
 */
const BEATS = { open: 1700, push: 1500, lock: 500, read: 3000, fade: 380, pull: 1400, wide: 1000 } as const;
type Beat = keyof typeof BEATS;
const NEXT: Record<Beat, Beat> = { open: "push", push: "lock", lock: "read", read: "fade", fade: "pull", pull: "wide", wide: "push" };
/** The camera is in close for these beats. */
const CLOSE = new Set<Beat>(["push", "lock", "read", "fade"]);

/** How close the camera goes, and how much further the loupe looks. Phones go a little less close. */
const ZOOM = { wide: 2, compact: 1.7 };
const LOUPE_ZOOM = 1.8;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The hero's proof (DECISIONS D-076, D-078, D-102): a sample client's latest scan, read up close. The camera pushes
 * in on one area of her face at a time, a red aim locks onto a spot, a loupe shows that patch of skin, and one small
 * card counts up her score there with its change since her first scan; then everything clears and the camera pulls
 * back before the next area. Every point and number is her demo report's own: the face model's points, and her
 * three priorities, each in a region her report maps. Hovering holds a reading; the chips jump to one. With reduced
 * motion it rests on the first reading. Off screen, it stops.
 */
export function HeroFace({
  firstName,
  photo,
  photoHd,
  aspect,
  points,
  scanNumber,
  priorities,
}: {
  firstName: string;
  photo: string;
  /** The same photo, sharp enough for close-ups. Loaded after the page, then shown over `photo`. */
  photoHd: string | null;
  /** Photo width over height. */
  aspect: number;
  points: P[];
  scanNumber: number;
  /** The one with the most measured change first. */
  priorities: HeroPriority[];
}) {
  const plane = useMemo(() => framing(points, aspect), [points, aspect]);
  const [area, setArea] = useState(0);
  const [beat, setBeat] = useState<Beat>("open");
  const [visible, setVisible] = useState(true);
  const [held, setHeld] = useState(false);
  const [still, setStill] = useState(false);
  const [hdReady, setHdReady] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  // With reduced motion there's no camera: it rests on the first reading.
  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setTimeout(() => {
      setStill(true);
      setBeat("read");
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  // Off screen, the camera stops where it is.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The overlays are placed in pixels, so they stay the same size however close the camera is.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The sharp photo comes after the page, so it never holds up the first view.
  useEffect(() => {
    if (!photoHd) return;
    const img = new Image();
    img.onload = () => setHdReady(true);
    const start = () => (img.src = photoHd);
    const idle = window.requestIdleCallback?.(start, { timeout: 1500 }) ?? window.setTimeout(start, 600);
    return () => {
      window.cancelIdleCallback?.(idle);
      window.clearTimeout(idle);
      img.onload = null;
    };
  }, [photoHd]);

  // The timeline: each beat hands over to the next. A held reading waits.
  useEffect(() => {
    if (still || !visible || (held && beat === "read")) return;
    const t = window.setTimeout(() => {
      if (beat === "wide") setArea((a) => (a + 1) % priorities.length);
      setBeat(NEXT[beat]);
    }, BEATS[beat]);
    return () => window.clearTimeout(t);
  }, [beat, still, visible, held, priorities.length]);

  const current = priorities[area];
  const compact = (size?.w ?? 560) < 440;
  const close = CLOSE.has(beat);

  // Where the camera looks: the area sits to one side, leaving room for the loupe and the card on the other.
  const spot = onStage(current.anchor, plane);
  const side: "left" | "right" = spot[0] < 0.5 ? "right" : "left";
  const zoom = compact ? ZOOM.compact : ZOOM.wide;
  const goal: P = [side === "right" ? 0.34 : 0.66, 0.44];
  const pan: P = [clamp(goal[0] - zoom * spot[0], 1 - zoom, 0), clamp(goal[1] - zoom * spot[1], 1 - zoom, 0)];
  const camera = close ? { zoom, pan } : { zoom: 1, pan: [0, 0] as P };

  const marks = beat === "lock" || beat === "read" || beat === "fade";
  const reading = beat === "read" || beat === "fade";

  return (
    <figure ref={box} className="relative">
      <div className="relative mx-auto max-w-[560px] lg:mr-0">
        <div
          ref={stage}
          onPointerEnter={(e) => e.pointerType === "mouse" && setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          className="relative aspect-[4/5] overflow-hidden rounded-[28px] bg-mist shadow-[0_44px_90px_-40px_rgba(12,44,62,0.7)] ring-1 ring-white/80"
        >
          {/* The camera: it carries the photo and its light, and moves only by transform. */}
          <div
            className={cx("absolute inset-0 origin-top-left will-change-transform", !still && "transition-transform duration-[1500ms] ease-[cubic-bezier(0.65,0,0.35,1)]")}
            style={{ transform: `translate(${(camera.pan[0] * 100).toFixed(3)}%, ${(camera.pan[1] * 100).toFixed(3)}%) scale(${camera.zoom})` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a bundled demo portrait */}
            <img
              src={photo}
              alt={`${firstName}, a sample client, read by the scan`}
              fetchPriority="high"
              className="absolute max-w-none object-cover"
              style={photoBox(plane)}
            />
            {photoHd && hdReady && (
              // eslint-disable-next-line @next/next/no-img-element -- the same portrait, sharp enough for close-ups
              <img src={photoHd} alt="" aria-hidden className="fade absolute max-w-none object-cover" style={photoBox(plane)} />
            )}
            {/* Between close-ups, the scan's light crosses the whole face. */}
            {visible && !close && !still && <ScanLight points={points} frame={plane} passes={Infinity} gapMs={900} rest={{ oval: 0.35, features: 0.25 }} />}
          </div>

          {/* A soft shade so the marks read on any skin. */}
          <div aria-hidden className={cx("pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,transparent_55%,rgba(6,16,22,0.35)_100%)] transition-opacity duration-700", close ? "opacity-100" : "opacity-60")} />

          {size && marks && (
            <Reading
              key={`${current.key}-${area}`}
              priority={current}
              aim={[(pan[0] + zoom * spot[0]) * size.w, (pan[1] + zoom * spot[1]) * size.h]}
              side={side}
              size={size}
              compact={compact}
              counting={reading}
              leaving={beat === "fade"}
              loupe={{
                src: photoHd && hdReady ? photoHd : photo,
                width: size.w * plane.width * zoom * LOUPE_ZOOM,
                aspect,
              }}
            />
          )}

          <span className="pointer-events-none absolute left-4 top-3.5 text-[0.75rem] uppercase tracking-[0.16em] text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
            Scan {String(scanNumber).padStart(2, "0")} · Face map
          </span>

          {/* Her three priorities: each one a place on her face. Choose one to go there. */}
          <div
            role="group"
            aria-label={`Show one of ${firstName}'s priorities on her face`}
            className="absolute inset-x-3 bottom-3 flex gap-1 rounded-full bg-[rgba(8,18,26,0.55)] p-1 shadow-[0_14px_30px_-16px_rgba(0,0,0,0.6)] ring-1 ring-inset ring-white/15 backdrop-blur-md sm:inset-x-6"
          >
            {priorities.map((p, i) => (
              <button
                key={p.key}
                type="button"
                aria-pressed={i === area}
                aria-label={`${p.label}, ${p.score}${p.score > p.from ? `, up ${p.score - p.from} since scan 01` : ""}`}
                onClick={() => {
                  setArea(i);
                  setBeat(still ? "read" : "push");
                }}
                className={cx(
                  "flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-[0.75rem] transition-[background-color,color] duration-300 active:scale-[0.97] sm:text-[0.8125rem]",
                  i === area ? "bg-white text-ink" : "text-white/75 hover:bg-white/10 hover:text-white",
                )}
              >
                <span className="truncate">{p.label}</span>
                <span className={cx("tabular-nums", i === area ? "text-text-3" : "text-white/50")}>{p.score}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="mx-auto mt-4 max-w-[560px] text-[0.8125rem] leading-relaxed text-text-3 lg:mr-0">
        {firstName} is a sample client: an AI-generated portrait, read and scored exactly as her report shows it.
      </figcaption>
    </figure>
  );
}

/**
 * One close-up's marks, in stage pixels: the red aim on the spot, a hairline to the loupe that shows that patch of
 * skin, and the card with the score. They arrive in that order and leave together.
 */
function Reading({
  priority,
  aim,
  side,
  size,
  compact,
  counting,
  leaving,
  loupe,
}: {
  priority: HeroPriority;
  aim: P;
  side: "left" | "right";
  size: { w: number; h: number };
  compact: boolean;
  counting: boolean;
  leaving: boolean;
  /** The photo for the loupe and its width in pixels at the loupe's magnification. */
  loupe: { src: string; width: number; aspect: number };
}) {
  const L = compact ? 92 : 124;
  const C = compact ? 142 : 176;
  const cardH = compact ? 96 : 108;
  const pad = compact ? 12 : 20;
  const chips = compact ? 54 : 60;
  // The loupe and the card share a column on the far side of the face, clear of the label and the chips.
  const gx = side === "right" ? size.w - pad - C / 2 : pad + C / 2;
  const ly = clamp(aim[1] - L * 0.4, pad + 30 + L / 2, size.h - chips - pad - cardH - 12 - L / 2);
  const [dx, dy] = [gx - aim[0], ly - aim[1]];
  const len = Math.hypot(dx, dy) || 1;
  const from: P = [aim[0] + (dx / len) * 16, aim[1] + (dy / len) * 16];
  const to: P = [gx - (dx / len) * (L / 2 + 3), ly - (dy / len) * (L / 2 + 3)];
  const count = useCount(priority.from, priority.score, counting);
  const change = priority.score - priority.from;
  const bg = { w: loupe.width, h: loupe.width / loupe.aspect };

  return (
    <div aria-hidden className={cx("pointer-events-none absolute inset-0 transition-opacity duration-300", leaving && "opacity-0")}>
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} pathLength={1} className="hero-draw" stroke="rgba(255,255,255,0.85)" strokeWidth={1} />
      </svg>

      <span className="hero-aim" style={{ left: aim[0], top: aim[1] }} />

      <span
        className="hero-loupe"
        style={{
          left: gx,
          top: ly,
          width: L,
          height: L,
          backgroundImage: `url(${loupe.src})`,
          backgroundSize: `${bg.w}px ${bg.h}px`,
          backgroundPosition: `${L / 2 - priority.anchor[0] * bg.w}px ${L / 2 - priority.anchor[1] * bg.h}px`,
        }}
      />

      <div className="hero-reading" style={{ left: gx - C / 2, top: ly + L / 2 + 12, width: C }}>
        <p className="flex items-center gap-2 text-[0.75rem] uppercase tracking-[0.16em] text-white/70">
          <span className="h-1.5 w-1.5 rounded-full bg-[#ff4d5e] shadow-[0_0_8px_rgba(255,77,94,0.9)]" />
          {priority.label}
        </p>
        <p className="mt-1.5 flex items-baseline gap-1.5">
          <span className={cx("font-display font-light leading-none tabular-nums text-white", compact ? "text-[1.75rem]" : "text-[2.125rem]")}>{count}</span>
          <span className="text-[0.75rem] text-white/45">/ 100</span>
        </p>
        <span className="relative mt-2.5 block h-[3px] rounded-full bg-white/15">
          <span className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#3aa889,#8fe3c2)] transition-[width] duration-700 ease-out" style={{ width: `${count}%` }} />
          <span className="absolute -top-[3px] h-[9px] w-px bg-white/70" style={{ left: `${priority.from}%` }} />
        </span>
        <p className="mt-2 text-[0.75rem] text-[#8fe3c2]">{change > 0 ? `+${change} since scan 01` : "Holding since scan 01"}</p>
      </div>
    </div>
  );
}

/** Counts from `from` to `to` once `run` turns on; shows `from` until then. */
function useCount(from: number, to: number, run: boolean, ms = 900) {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, run, ms]);
  return value;
}
