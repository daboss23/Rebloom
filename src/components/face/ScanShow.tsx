"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CountUp } from "@/components/dashboard/CountUp";
import { cx } from "@/components/ui/cx";
import { onStage, type Framing } from "@/lib/face/frame";
import { FACE_POINT_COUNT, faceFeatures, type Pt } from "@/lib/face/grid";

/**
 * The scan as a show (DECISIONS D-092): five acts around the face, each in its own light, with glass cards that
 * slide in, float and hand over to the next. Lock-on (points and outlines), contour (the camera swings side to side
 * with a beam), texture (a close-up with a loupe on the cheek), tone (a light sheet and the skin's own colours) and
 * lines (rings and traces around the eyes). The camera orbits in perspective: one photo can't show the side of a
 * head, so it's the view that turns, never an invented face. Then, while the report
 * is put together, a gold network and its steps. Every figure and colour is true: the face model's points, and
 * colours sampled from the photo itself. The camera moves only with transforms; with reduced motion the first act
 * simply rests.
 *
 * Fills its positioned parent. `children` are what the camera carries: the photo and its light.
 */

const ACTS = ["lock", "contour", "texture", "tone", "lines"] as const;
type Act = (typeof ACTS)[number] | "report";

/** Landmarks (MediaPipe Face Mesh) the acts look at. */
const CHEEK = 205;
/** Where tone is sampled, and which side its chip opens to (clear of the tone card, top left). */
const TONE_POINTS: { i: number; label: string; side: "left" | "right"; gap: number }[] = [
  { i: 151, label: "Forehead", side: "right", gap: 0.1 },
  { i: 425, label: "Cheek", side: "right", gap: 0.05 },
  { i: 152, label: "Jaw", side: "left", gap: 0.05 },
];
const EYE_A = [33, 133];
const EYE_B = [362, 263];
const UNDER_A = [33, 7, 163, 144, 145, 153, 154, 155, 133];
const UNDER_B = [362, 382, 381, 380, 374, 373, 390, 249, 263];
const BROW = [70, 63, 105, 66, 107, 336, 296, 334, 293, 300];
const DOTS = Array.from({ length: 94 }, (_, k) => (k * 5) % FACE_POINT_COUNT);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The camera's move for an act: where it looks, how close, and how far it orbits (degrees, side to side and up and
 * down), kept so no edge of the stage shows.
 */
function shot(focus: Pt, zoom: number, yaw = 0, pitch = 0) {
  const along = (f: number) => clamp(0.5 - f, -(1 - f) * (zoom - 1), f * (zoom - 1));
  return { focus, zoom, yaw, pitch, tx: along(focus[0]), ty: along(focus[1]) };
}

export function ScanShow({
  points,
  frame,
  photo,
  phase,
  face,
  actMs = 3600,
  once = false,
  run = 0,
  onDone,
  report,
  children,
}: {
  /** The face model's points on the photo, 0 to 1 each way. */
  points: Pt[];
  frame: Framing;
  /** The photo, to sample the skin's own colours from. Null to leave colours out. */
  photo: string | null;
  /** "scan" plays the acts, "report" shows the report being put together, "off" leaves only the camera's content. */
  phase: "scan" | "report" | "off";
  /** Whose face, for the cards: "your face", "her face". */
  face: string;
  actMs?: number;
  /** Play the four acts once, then call `onDone`, instead of looping. */
  once?: boolean;
  /** Changing it plays the acts again from the start. */
  run?: number;
  onDone?: () => void;
  /** The report's steps and how many are done, for the report phase. */
  report?: { steps: string[]; at: number };
  children: ReactNode;
}) {
  const ready = points.length >= FACE_POINT_COUNT;
  const stage = (i: number) => onStage(points[i], frame);
  const mid = (ids: number[]): Pt => {
    const ps = ids.map(stage);
    return [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];
  };

  const [still, setStill] = useState(false);
  useEffect(() => {
    // Motion preference only exists in the browser.
    const s = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setStill(s), 0);
    return () => window.clearTimeout(t);
  }, []);

  // Which act is on, and the one just handed over (its card leaves as the next arrives).
  const [timeline, setTimeline] = useState({ run, act: 0, prev: -1 });
  if (timeline.run !== run) setTimeline({ run, act: 0, prev: -1 });
  const playing = phase === "scan" && !still && ready;
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);
  useEffect(() => {
    if (!playing) return;
    let n = 0;
    const t = window.setInterval(() => {
      n += 1;
      if (once && n >= ACTS.length) {
        window.clearInterval(t);
        done.current?.();
        return;
      }
      setTimeline((s) => ({ ...s, act: (s.act + 1) % ACTS.length, prev: s.act }));
    }, actMs);
    return () => window.clearInterval(t);
  }, [playing, once, actMs, run]);

  const act: Act | null = phase === "off" || !ready ? null : phase === "report" ? "report" : ACTS[still ? 0 : timeline.act];

  // The skin's own colours, sampled from the photo at the forehead, a cheek and the jaw.
  const [swatches, setSwatches] = useState<string[] | null>(null);
  useEffect(() => {
    if (!photo || !ready) return;
    let gone = false;
    const img = new Image();
    img.onload = () => {
      if (gone) return;
      const w = 160;
      const h = Math.max(1, Math.round((w * img.naturalHeight) / Math.max(1, img.naturalWidth)));
      const c = document.createElement("canvas");
      [c.width, c.height] = [w, h];
      const g = c.getContext("2d", { willReadFrequently: true });
      if (!g) return;
      g.drawImage(img, 0, 0, w, h);
      try {
        setSwatches(
          TONE_POINTS.map(({ i }) => {
            const [x, y] = [Math.round(points[i][0] * w), Math.round(points[i][1] * h)];
            const d = g.getImageData(clamp(x - 2, 0, w - 5), clamp(y - 2, 0, h - 5), 5, 5).data;
            let [r, gr, b] = [0, 0, 0];
            for (let k = 0; k < d.length; k += 4) [r, gr, b] = [r + d[k], gr + d[k + 1], b + d[k + 2]];
            const n = d.length / 4;
            return `rgb(${Math.round(r / n)} ${Math.round(gr / n)} ${Math.round(b / n)})`;
          }),
        );
      } catch {
        // A photo from elsewhere can't be read back; the act goes on without its colours.
      }
    };
    img.src = photo;
    return () => {
      gone = true;
    };
  }, [photo, points, ready]);

  // A touch of depth on a desk: the face drifts one way under the pointer, the cards the other.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    const host = el?.parentElement;
    if (!el || !host || still || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let frameId = 0;
    const move = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      const [x, y] = [((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1];
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        el.style.setProperty("--px", clamp(x, -1, 1).toFixed(3));
        el.style.setProperty("--py", clamp(y, -1, 1).toFixed(3));
      });
    };
    const leave = () => {
      el.style.setProperty("--px", "0");
      el.style.setProperty("--py", "0");
    };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frameId);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
    };
  }, [still]);

  const geometry = useMemo(() => {
    if (!ready) return null;
    const on = (p: Pt) => onStage(p, frame);
    const { oval, features } = faceFeatures(points);
    const path = (line: readonly (readonly number[])[]) =>
      line.map((p, k) => `${k ? "L" : "M"}${(on([p[0], p[1]])[0] * 400).toFixed(1)},${(on([p[0], p[1]])[1] * 500).toFixed(1)}`).join(" ");
    const chain = (ids: number[], drop: number) =>
      ids.map((i, k) => {
        const [x, y] = on(points[i]);
        return `${k ? "L" : "M"}${(x * 400).toFixed(1)},${((y + drop) * 500).toFixed(1)}`;
      }).join(" ");
    const xs = points.map((p) => on(p)[0]);
    const ys = points.map((p) => on(p)[1]);
    const box = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
    const browY = BROW.reduce((s, i) => s + on(points[i])[1], 0) / BROW.length;
    const top = on(points[10])[1];
    const foreheadY = browY - (browY - top) * 0.45;
    const [fx0, fx1] = [on(points[70])[0], on(points[300])[0]];
    const forehead = Array.from({ length: 13 }, (_, k) => {
      const u = k / 12;
      const x = fx0 + (fx1 - fx0) * u;
      const y = foreheadY - Math.sin(u * Math.PI) * 0.012;
      return `${k ? "L" : "M"}${(x * 400).toFixed(1)},${(y * 500).toFixed(1)}`;
    }).join(" ");
    const eyeH = Math.abs(on(points[159])[1] - on(points[145])[1]) || 0.02;
    return {
      oval: path(oval),
      features: features.map(path),
      dots: DOTS.map((i) => on(points[i])),
      box,
      center: on(points[1]),
      traces: [chain(UNDER_A, eyeH * 1.6), chain(UNDER_B, eyeH * 1.6), forehead],
    };
  }, [points, frame, ready]);

  if (!ready || !geometry) return <div className="absolute inset-0">{children}</div>;

  // The camera leans toward what it looks at: the near side of the face comes forward.
  const lean = (x: number) => (x < 0.5 ? 1 : -1);
  const camera =
    act === "contour"
      ? shot(geometry.center, 1.28)
      : act === "texture"
        ? shot(stage(CHEEK), 2.05, 9 * lean(stage(CHEEK)[0]), -3)
        : act === "tone"
          ? shot(geometry.center, 1.16, 0, 5)
          : act === "lines"
            ? shot([(mid(EYE_A)[0] + mid(EYE_B)[0]) / 2, (mid(EYE_A)[1] + mid(EYE_B)[1]) / 2 - 0.02], 1.65, -6, 3)
            : shot(geometry.center, 1);
  // Where a point on the photo lands on screen once the camera has moved.
  const onScreen = ([x, y]: Pt): Pt => [
    camera.focus[0] + camera.tx + camera.zoom * (x - camera.focus[0]),
    camera.focus[1] + camera.ty + camera.zoom * (y - camera.focus[1]),
  ];
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const cheek = stage(CHEEK);
  const eyes = [mid(EYE_A), mid(EYE_B)];
  const box = geometry.box;
  const orbit = { w: (box.right - box.left) * 1.35, h: (box.bottom - box.top) * 0.5 };
  const card = (name: Act) => (act === name ? "in" : timeline.prev >= 0 && ACTS[timeline.prev] === name && act !== "report" ? "out" : "idle");

  return (
    <div ref={root} className="scan-show absolute inset-0" style={{ "--px": 0, "--py": 0 } as React.CSSProperties}>
      {/* The camera: the photo and everything drawn on the face, moving together. */}
      <div className="scan-parallax-face absolute inset-0">
        <div
          className="scan-camera absolute inset-0"
          style={{
            transformOrigin: `${pct(camera.focus[0])} ${pct(camera.focus[1])}`,
            transform: `translate(${pct(camera.tx)}, ${pct(camera.ty)}) rotateY(${camera.yaw}deg) rotateX(${camera.pitch}deg) scale(${camera.zoom})`,
          }}
        >
          {/* Contour: the camera swings to one side, then the other, then settles. */}
          <div key={act === "contour" ? `turn-${timeline.run}-${timeline.act}` : "still"} className={cx("absolute inset-0", act === "contour" && "scan-turn")} style={{ "--act": `${actMs}ms` } as React.CSSProperties}>
            {children}
          </div>

          {/* Contour: a beam of light follows the turn across the face. */}
          {act === "contour" && <span key={`beam-${timeline.run}-${timeline.act}`} aria-hidden className="scan-beam pointer-events-none absolute inset-y-0" style={{ "--act": `${actMs}ms` } as React.CSSProperties} />}

          {/* A gold orbit round the head while the scan runs. */}
          {act && act !== "report" && (
            <span
              aria-hidden
              className="scan-orbit pointer-events-none absolute"
              style={{
                left: pct(geometry.center[0] - orbit.w / 2),
                top: pct(box.top + (box.bottom - box.top) * 0.42 - orbit.h / 2),
                width: pct(orbit.w),
                height: pct(orbit.h),
              }}
            />
          )}

          <svg aria-hidden viewBox="0 0 400 500" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
            <defs>
              <filter id="scan-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2.2" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Lock-on: the points arrive, the outlines draw themselves. */}
            {act === "lock" && (
              <g key={`lock-${timeline.run}-${timeline.act}`} filter="url(#scan-glow)">
                <path d={geometry.oval} pathLength={1} className="scan-draw" fill="none" stroke="rgba(226,240,250,0.95)" strokeWidth={1.1} />
                {geometry.features.map((d, k) => (
                  <path key={k} d={d} pathLength={1} className="scan-draw" style={{ animationDelay: `${300 + k * 120}ms` }} fill="none" stroke="rgba(241,212,154,0.95)" strokeWidth={1} />
                ))}
                {geometry.dots.map(([x, y], k) => (
                  <circle key={k} cx={x * 400} cy={y * 500} r={1.6} className="scan-dot" style={{ animationDelay: `${(k * 11) % 900}ms` }} fill="#eafaff" />
                ))}
              </g>
            )}

            {/* Lines: fine traces under the eyes and across the brow. */}
            {act === "lines" && (
              <g key={`lines-${timeline.run}-${timeline.act}`} filter="url(#scan-glow)">
                {geometry.traces.map((d, k) => (
                  <path key={k} d={d} pathLength={1} className="scan-draw scan-trace" style={{ animationDelay: `${400 + k * 260}ms` }} fill="none" stroke="rgba(241,212,154,0.95)" strokeWidth={0.9} />
                ))}
              </g>
            )}

            {/* The report: the face's points joined in gold. */}
            {act === "report" && (
              <g filter="url(#scan-glow)" className="scan-network">
                <path d={geometry.oval} pathLength={1} className="scan-draw" fill="none" stroke="rgba(241,212,154,0.9)" strokeWidth={1} />
                {geometry.features.map((d, k) => (
                  <path key={k} d={d} pathLength={1} className="scan-draw" style={{ animationDelay: `${200 + k * 100}ms` }} fill="none" stroke="rgba(241,212,154,0.85)" strokeWidth={0.9} />
                ))}
                <polyline
                  points={geometry.dots.filter((_, k) => k % 2 === 0).map(([x, y]) => `${(x * 400).toFixed(1)},${(y * 500).toFixed(1)}`).join(" ")}
                  pathLength={1}
                  className="scan-draw scan-web"
                  fill="none"
                  stroke="rgba(241,212,154,0.35)"
                  strokeWidth={0.5}
                />
                {geometry.dots.map(([x, y], k) => (
                  <circle key={k} cx={x * 400} cy={y * 500} r={1.4} className="scan-dot" style={{ animationDelay: `${(k * 9) % 700}ms` }} fill="#f3dca6" />
                ))}
              </g>
            )}
          </svg>

          {/* Texture: a glass loupe that sharpens the skin it passes over. */}
          {act === "texture" && (
            <span
              key={`loupe-${timeline.run}-${timeline.act}`}
              aria-hidden
              className="scan-loupe pointer-events-none absolute"
              style={{ left: pct(cheek[0]), top: pct(cheek[1]) }}
            />
          )}

          {/* Tone: a sheet of light travels down the face. */}
          {act === "tone" && <span key={`sheet-${timeline.run}-${timeline.act}`} aria-hidden className="scan-sheet pointer-events-none absolute inset-x-0" />}

          {/* Lines: rings pulse out from each eye. */}
          {act === "lines" &&
            eyes.map(([x, y], k) => (
              <span key={`ring-${k}-${timeline.act}`} aria-hidden className="pointer-events-none absolute" style={{ left: pct(x), top: pct(y) }}>
                {[0, 1, 2].map((r) => (
                  <span key={r} className="scan-ring" style={{ animationDelay: `${r * 520 + k * 180}ms` }} />
                ))}
              </span>
            ))}
        </div>
      </div>

      {/* The cards, a layer above the camera, drifting against it. */}
      <div aria-hidden className="scan-parallax-cards pointer-events-none absolute inset-0">
        {act && act !== "report" && (
          <span className="scan-chapter absolute left-3 top-3 flex items-center gap-2 rounded-full px-2.5 py-1.5">
            <span className="flex gap-1">
              {ACTS.map((a, k) => (
                <span key={a} className={cx("h-[3px] rounded-full transition-[width,background-color] duration-500", ACTS[timeline.act] === a || (still && k === 0) ? "w-4 bg-[#f1d49a]" : "w-1.5 bg-white/55")} />
              ))}
            </span>
            <span className="text-[0.59375rem] font-medium uppercase tracking-[0.18em] text-white">
              {String((still ? 0 : timeline.act) + 1).padStart(2, "0")} · {CHAPTER[act]}
            </span>
          </span>
        )}

        <ShowCard state={card("lock")} place="left-[5%] bottom-[19%]" from="left">
          <Kicker>Locking on</Kicker>
          <p className="mt-1.5 flex items-baseline gap-2">
            <span className="font-display text-[2.25rem] font-light leading-none text-ink tabular-nums">
              {act === "lock" ? <CountUp key={`n-${timeline.run}-${timeline.act}`} value={points.length >= 468 ? 468 : points.length} format="int" delay={150} /> : "468"}
            </span>
            <span className="text-[0.75rem] leading-tight text-text-2">points mapped on {face}</span>
          </p>
        </ShowCard>

        <ShowCard state={card("contour")} place="right-[5%] bottom-[19%]" from="right">
          <Kicker>Contour</Kicker>
          <p className="mt-1 font-display text-[1.5rem] font-light leading-tight text-ink">Side to side</p>
          <p className="mt-0.5 text-[0.75rem] leading-snug text-text-2">Shape and firmness, as the light turns</p>
        </ShowCard>

        <ShowCard state={card("texture")} place="right-[5%] top-[13%]" from="right">
          <Kicker>Texture</Kicker>
          <p className="mt-1 font-display text-[1.5rem] font-light leading-tight text-ink">Up close</p>
          <p className="mt-0.5 text-[0.75rem] leading-snug text-text-2">Smoothness and pores, cheek to cheek</p>
        </ShowCard>

        <ShowCard state={card("tone")} place="left-[5%] top-[13%]" from="left" narrow>
          <Kicker>Tone</Kicker>
          <p className="mt-1 font-display text-[1.5rem] font-light leading-tight text-ink">Evenness</p>
          <p className="mt-0.5 text-[0.75rem] leading-snug text-text-2">Color compared, forehead to jaw</p>
          {swatches && (
            <span className="mt-2 flex gap-1.5">
              {swatches.map((c, k) => (
                <span key={k} className="h-3.5 w-7 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7),0_2px_6px_-2px_rgba(12,26,34,0.4)]" style={{ background: c }} />
              ))}
            </span>
          )}
        </ShowCard>

        {/* Tone: each sampled colour, pinned where it was taken. */}
        {act === "tone" &&
          swatches &&
          TONE_POINTS.map(({ i, label, side, gap }, k) => {
            const [x, y] = onScreen(stage(i));
            const right = side === "right";
            return (
              <span
                key={`chip-${i}-${timeline.act}`}
                className="scan-chip absolute flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5"
                style={{
                  // Each chip opens to its side of the point it was taken from, a little away from it.
                  left: right ? pct(clamp(x + gap, 0.03, 0.72)) : pct(clamp(x - gap, 0.28, 0.97)),
                  top: pct(clamp(y, 0.08, 0.78)),
                  animationDelay: `${500 + k * 280}ms`,
                  transform: `translate(${right ? "0" : "-100%"}, -50%)`,
                }}
              >
                <span className="h-4 w-4 rounded-full shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.85)]" style={{ background: swatches[k] }} />
                <span className="text-[0.625rem] font-medium uppercase tracking-[0.12em] text-ink">{label}</span>
              </span>
            );
          })}

        <ShowCard state={card("lines")} place="left-[5%] bottom-[19%]" from="left">
          <Kicker>Lines</Kicker>
          <p className="mt-1 font-display text-[1.5rem] font-light leading-tight text-ink">Around the eyes</p>
          <p className="mt-0.5 text-[0.75rem] leading-snug text-text-2">Fine lines, brow to under-eye</p>
        </ShowCard>

        {report && (
          <ShowCard state={act === "report" ? "in" : "idle"} place="inset-x-[8%] bottom-[16%]" from="below">
            <Kicker>Your report</Kicker>
            <ul className="mt-2 space-y-1.5">
              {report.steps.map((s, k) => (
                <li key={s} className={cx("flex items-center gap-2 text-[0.8125rem] transition-colors duration-500", k < report.at ? "text-ink" : k === report.at ? "text-ink" : "text-text-3")}>
                  <span
                    className={cx(
                      "grid h-4 w-4 shrink-0 place-items-center rounded-full transition-[background-color,box-shadow] duration-500",
                      k < report.at ? "bg-[linear-gradient(135deg,#f1d49a,#b98a3c)] text-white" : k === report.at ? "scan-busy" : "shadow-[inset_0_0_0_1px_rgba(12,26,34,0.2)]",
                    )}
                  >
                    {k < report.at && (
                      <svg viewBox="0 0 12 12" width={9} height={9}>
                        <path d="M2.5 6.3l2.2 2.1 4.8-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  {s}
                </li>
              ))}
            </ul>
          </ShowCard>
        )}
      </div>
    </div>
  );
}

const CHAPTER: Record<(typeof ACTS)[number], string> = { lock: "Lock-on", contour: "Contour", texture: "Texture", tone: "Tone", lines: "Lines" };

function Kicker({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[0.625rem] font-medium uppercase tracking-[0.18em] text-[#1e5a78]">
      <span className="scan-pip" />
      {children}
    </span>
  );
}

/** A glass card that slides in from its side, floats while its act runs, and slips away as the next arrives. */
function ShowCard({
  state,
  place,
  from,
  narrow,
  children,
}: {
  state: "in" | "out" | "idle";
  place: string;
  from: "left" | "right" | "below";
  /** Leaves room beside it for chips pinned to the face. */
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cx("scan-card absolute px-3.5 py-3", narrow ? "w-[min(196px,44%)]" : "w-[min(220px,52%)]", place, `scan-from-${from}`, state === "in" ? "scan-card-in" : state === "out" ? "scan-card-out" : "opacity-0")}>
      {children}
    </div>
  );
}
