"use client";

import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LightField } from "@/components/dashboard/LightField";
import { Chip } from "@/components/ui/Chip";
import { cx } from "@/components/ui/cx";

export interface FaceMapLayer {
  key: string;
  label: string;
  describes: string;
  /** The concern's score, 1 to 100. */
  score: number;
  maskUrl: string | null;
  /** Where on the photo the concern shows (0 to 1 each way), for the reveal's callout. */
  anchor: [number, number] | null;
}

/**
 * One soft colour per priority, in rank order: its marks, its callout and its button's dot. Each keeps the hairline
 * deep-sea edge, so the marks read on every skin tone (DECISIONS D-027, D-074).
 */
const TINTS = ["#dff3fb", "#f3d9a4", "#ffc9b8"] as const;

/** The reveal's timeline, in ms. About four seconds, once per scan. */
const T = { scanFrom: 250, scan: 1100, firstMark: 1450, markGap: 650, hold: 950, settle: 600 };

type Phase = "waiting" | "playing" | "settling" | "done";

/** The priority the face map is showing, shared with the priority cards so the two read as one. */
const Shown = createContext<{ shown: string | null; show: (key: string) => void } | null>(null);

export function FaceMapFocus({ initial, children }: { initial: string | null; children: ReactNode }) {
  const [shown, show] = useState(initial);
  return <Shown value={{ shown, show }}>{children}</Shown>;
}

/** A priority card, outlined in sea while the face map shows it. Its parent sets the position. */
export function FaceMapPriority({ concern, className, children }: { concern: string; className?: string; children: ReactNode }) {
  const shown = use(Shown)?.shown === concern;
  return (
    <li className={className}>
      <span
        aria-hidden
        className={cx(
          "pointer-events-none absolute -inset-px rounded-[inherit] ring-1 ring-inset ring-[#1e5a78]/45 transition-opacity duration-500 ease-gentle",
          shown ? "opacity-100" : "opacity-0",
        )}
      />
      {children}
    </li>
  );
}

/**
 * The client's photo with tappable concern overlays (brief 3.3: lead with their face). Each button shows that
 * priority's marks and score on the photo. Demo clients' marks come from their portraits' landmarks (D-070).
 *
 * The first time a scan's map comes into view it plays the analysis back (D-074): the face model's own points appear
 * as a line of light crosses the face, then each priority's marks paint in with a callout and its score. Every mark
 * and number is this scan's own. Tapping a priority skips it, "Replay" plays it again, and with reduced motion it
 * never plays. If the photo can't load, it shows their initials over moving light, never a broken image.
 */
export function FaceMap({
  photoUrl,
  initials,
  layers,
  caption,
  landmarks = null,
}: {
  photoUrl: string;
  initials?: string;
  layers: FaceMapLayer[];
  caption: string;
  /** The face model's points on this photo (0 to 1 each way), for the reveal. */
  landmarks?: [number, number][] | null;
}) {
  const focus = use(Shown);
  const [own, setOwn] = useState(layers[0]?.key ?? null);
  const active = focus ? focus.shown : own;
  const choose = focus ? focus.show : setOwn;
  const current = layers.find((l) => l.key === active) ?? null;
  const [failed, setFailed] = useState(false);
  const marked = !failed && layers.some((l) => l.maskUrl);
  const img = useRef<HTMLImageElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<Phase>("waiting");
  const [lit, setLit] = useState(0);
  const [inView, setInView] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const allowed = useRef(false);
  const timers = useRef<number[]>([]);
  const canReveal = marked || Boolean(landmarks);
  const storageKey = `rebloom:reveal:${photoUrl}`;

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  const play = useCallback(() => {
    clear();
    setLit(0);
    setPhase("playing");
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    layers.forEach((_, i) => at(T.firstMark + i * T.markGap, () => setLit(i + 1)));
    const end = T.firstMark + (layers.length - 1) * T.markGap + T.hold;
    at(end, () => setPhase("settling"));
    at(end + T.settle, () => setPhase("done"));
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // Private mode: it simply plays again next time.
    }
  }, [layers, storageKey]);
  const skip = () => {
    clear();
    setPhase("done");
  };

  // A photo that failed before the page hydrated never fires onError: check once on mount.
  useEffect(() => {
    if (img.current?.complete) {
      if (img.current.naturalWidth === 0) setFailed(true);
      else setLoaded(true);
    }
  }, []);

  // Decide once whether this visit plays the reveal: not with reduced motion, not twice for the same scan.
  useEffect(() => {
    let played = false;
    try {
      played = window.localStorage.getItem(storageKey) === "1";
    } catch {
      played = false;
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    allowed.current = canReveal && !played && !still;
    // Browser-only facts, known after hydration.
    if (!allowed.current) setPhase("done");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setInView(true);
        io.disconnect();
      },
      { threshold: 0.55 },
    );
    if (box.current) io.observe(box.current);
    return () => {
      io.disconnect();
      clear();
    };
  }, [canReveal, storageKey]);

  useEffect(() => {
    if (!failed && phase === "waiting" && allowed.current && inView && loaded) play();
  }, [failed, phase, inView, loaded, play]);

  // A photo that can't load has nothing to reveal.
  const stage: Phase = failed ? "done" : phase;
  const revealing = stage === "playing" || stage === "settling";
  const face = landmarks ? bounds(landmarks) : null;
  const callouts = revealing ? place(layers) : [];

  return (
    <div>
      <div
        ref={box}
        className="relative aspect-[3/4] w-full overflow-hidden rounded-[24px] bg-mist shadow-[0_30px_60px_-32px_rgba(12,44,62,0.6)] ring-1 ring-white/70"
      >
        {failed ? (
          <div aria-hidden className="absolute inset-0 grid place-items-center">
            <LightField variant="ice" />
            {initials && <span className="relative font-display text-[clamp(88px,22vw,140px)] font-light tracking-[0.04em] text-[#1e5a78]/70">{initials}</span>}
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- private, token-scoped image
          <img
            ref={img}
            src={photoUrl}
            alt="Your scan photo"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        {/* Deep sea over the photo while the analysis plays back, so the light and the marks carry. */}
        <div
          aria-hidden
          className={cx(
            "pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(12,26,34,0.5)_0%,rgba(12,26,34,0.3)_60%,rgba(12,26,34,0.42)_100%)] transition-opacity duration-500 ease-gentle",
            stage === "playing" ? "opacity-100" : "opacity-0",
          )}
        />

        {layers.map((layer, i) =>
          layer.maskUrl && !failed ? (
            <div
              key={layer.key}
              aria-hidden
              className="absolute inset-0 transition-opacity duration-[600ms] ease-gentle"
              style={{
                opacity: (stage === "playing" ? i < lit : stage !== "waiting" && layer.key === active) ? 1 : 0,
                filter: "drop-shadow(0 0 1px rgba(12,26,34,0.6))",
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  backgroundColor: TINTS[i % TINTS.length],
                  WebkitMaskImage: `url(${layer.maskUrl})`,
                  maskImage: `url(${layer.maskUrl})`,
                  WebkitMaskSize: "100% 100%",
                  maskSize: "100% 100%",
                }}
              />
            </div>
          ) : null,
        )}

        {revealing && landmarks && face && (
          // Once the marks start to paint, the points step back so the marks carry.
          <div
            aria-hidden
            className={cx(
              "pointer-events-none absolute inset-0 transition-opacity duration-500",
              stage === "settling" ? "opacity-0" : lit > 0 ? "opacity-35" : "opacity-100",
            )}
          >
            <svg viewBox="0 0 300 400" className="absolute inset-0 h-full w-full">
              {landmarks.map(([x, y], i) => (
                <circle
                  key={i}
                  cx={x * 300}
                  cy={y * 400}
                  r={1.15}
                  fill="rgba(232,246,252,0.92)"
                  style={{
                    transformBox: "fill-box",
                    transformOrigin: "center",
                    animation: `reveal-dot 420ms var(--ease-gentle) ${Math.round(T.scanFrom + ((y - face.top) / face.height) * T.scan)}ms both`,
                  }}
                />
              ))}
            </svg>
            <div
              className="absolute inset-0"
              style={
                {
                  "--scan-from": `${face.top * 100}%`,
                  "--scan-to": `${(face.top + face.height) * 100}%`,
                  animation: `reveal-scan ${T.scan}ms linear ${T.scanFrom}ms both`,
                } as React.CSSProperties
              }
            >
              <span className="absolute top-0 h-[2px] bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.95)_50%,rgba(255,255,255,0)_100%)] shadow-[0_0_16px_rgba(223,243,251,0.8)]" style={{ left: `${(face.left - 0.08) * 100}%`, width: `${(face.width + 0.16) * 100}%` }} />
            </div>
          </div>
        )}

        {callouts.length > 0 && (
          <div aria-hidden className={cx("pointer-events-none absolute inset-0 transition-opacity duration-500", stage === "settling" && "opacity-0")}>
            <svg viewBox="0 0 100 133.333" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              {callouts.map((c) => (
                <line
                  key={c.layer.key}
                  x1={c.layer.anchor![0] * 100}
                  y1={c.layer.anchor![1] * 133.333}
                  x2={c.side === "left" ? 34 : 66}
                  y2={c.y * 133.333}
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={c.index < lit ? 0 : 1}
                  style={{ transition: "stroke-dashoffset 450ms cubic-bezier(0.23, 1, 0.32, 1)" }}
                />
              ))}
            </svg>
            {callouts.map((c) => {
              const on = c.index < lit;
              return (
                <div key={c.layer.key}>
                  <span
                    className={cx("absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white transition-opacity duration-300", on ? "opacity-100" : "opacity-0")}
                    style={{ left: `${c.layer.anchor![0] * 100}%`, top: `${c.layer.anchor![1] * 100}%`, background: TINTS[c.index % TINTS.length] }}
                  />
                  <div
                    className={cx(
                      "absolute w-[30%] -translate-y-1/2 rounded-[12px] bg-white/90 px-2.5 py-2 shadow-[0_10px_24px_-14px_rgba(12,26,34,0.7)] transition-[opacity,transform] duration-[400ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
                      c.side === "left" ? "left-[4%]" : "right-[4%]",
                      on ? "opacity-100" : c.side === "left" ? "-translate-x-1 opacity-0" : "translate-x-1 opacity-0",
                    )}
                    style={{ top: `${c.y * 100}%`, transitionDelay: on ? "220ms" : "0ms" }}
                  >
                    {/* Long names ("Upper eyelid firmness") wrap rather than cut off. */}
                    <span className="block text-[9.5px] uppercase leading-tight tracking-[0.07em] text-ink [overflow-wrap:anywhere]">{c.layer.label}</span>
                    <span className="mt-1 flex items-center gap-1.5 font-display text-[24px] leading-none text-ink">
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full ring-1 ring-[#0c1a22]/25" style={{ background: TINTS[c.index % TINTS.length] }} />
                      {on ? <CountUp to={c.layer.score} /> : 0}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {current && (
          <span
            aria-hidden
            className={cx(
              "absolute right-3 top-3 rounded-full bg-white/85 py-1.5 pl-3 pr-3.5 shadow-[0_6px_16px_-10px_rgba(12,26,34,0.6)] backdrop-blur-sm transition-opacity duration-300",
              revealing && "opacity-0",
            )}
          >
            <span key={current.key} className="fade flex items-baseline gap-2 text-ink">
              <span className="text-[11px] uppercase tracking-[0.14em]">{current.label}</span>
              <span className="font-display text-[20px] leading-none">{current.score}</span>
            </span>
          </span>
        )}
        <span className="absolute bottom-3 left-3 text-[11px] uppercase tracking-[0.14em] text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
          {caption}
        </span>
        {stage === "done" && canReveal && !failed && (
          <button
            type="button"
            onClick={play}
            className="fade absolute bottom-0 right-0 min-h-11 px-3 text-[11px] uppercase tracking-[0.14em] text-white/95 underline decoration-white/40 underline-offset-4 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] hover:decoration-white"
          >
            Replay
          </button>
        )}
      </div>
      <p className="mt-4 text-[13.5px] leading-snug text-text-2">
        {marked ? "Choose a priority to see where it shows on your face." : "Choose a priority to see its score."}
      </p>
      <div role="group" aria-label="Show a priority on your photo" className="mt-2.5 grid grid-cols-3 gap-2">
        {layers.map((layer, i) => (
          <Chip
            key={layer.key}
            selected={layer.key === active}
            onClick={() => {
              if (stage !== "done") skip();
              choose(layer.key);
            }}
            className="justify-center gap-1.5 px-2 text-center"
          >
            {marked && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full ring-1 ring-[#0c1a22]/25" style={{ background: TINTS[i % TINTS.length] }} />}
            {layer.label}
          </Chip>
        ))}
      </div>
      <div aria-live="polite">
        {current && (
          <p key={current.key} className="t-body mt-4 fade">
            <span className="sr-only">
              {current.label}, {current.score} out of 100.{" "}
            </span>
            {current.describes}
          </p>
        )}
      </div>
    </div>
  );
}

/** A score counting up from zero as its callout appears. */
function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      // The first frame can be stamped a moment before `start`.
      const k = Math.min(1, Math.max(0, (t - start) / 750));
      setN(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n}</>;
}

function bounds(points: [number, number][]) {
  let [left, top, right, bottom] = [1, 1, 0, 0];
  for (const [x, y] of points) {
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return { left, top, width: Math.max(0.01, right - left), height: Math.max(0.01, bottom - top) };
}

/** Callout labels beside the face, on the side nearer their mark, kept from overlapping one another. */
function place(layers: FaceMapLayer[]) {
  const items = layers
    .map((layer, index) => ({ layer, index, side: (layer.anchor && layer.anchor[0] < 0.5 ? "left" : "right") as "left" | "right", y: 0 }))
    .filter((c) => c.layer.anchor);
  for (const side of ["left", "right"] as const) {
    let last = -Infinity;
    for (const c of items.filter((i) => i.side === side).sort((a, b) => a.layer.anchor![1] - b.layer.anchor![1])) {
      c.y = Math.min(0.84, Math.max(0.12, c.layer.anchor![1], last + 0.14));
      last = c.y;
    }
  }
  return items;
}
