"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LightField } from "@/components/dashboard/LightField";
import { ScanLight } from "@/components/face/ScanLight";
import { Chip } from "@/components/ui/Chip";
import { cx } from "@/components/ui/cx";
import { framing, onStage, photoBox } from "@/lib/face/frame";
import { FACE_POINT_COUNT } from "@/lib/face/grid";

export interface FaceMapLayer {
  key: string;
  label: string;
  describes: string;
  /** The concern's score, 1 to 100. */
  score: number;
  /** Where on the photo the concern shows (0 to 1 each way), where the target settles. */
  anchor: [number, number] | null;
}

/** The reveal's timeline, in ms: one pass of light, then the target visits each priority in turn. */
const T = { pass: 3000, visit: 1100, settle: 500 };
/** The map is 3:4; with a face found, the photo is framed so the face fills a little over half its width. */
const MAP_RATIO = 4 / 3;
const FACE_SHARE = 0.58;
/** At rest the light stays as a faint outline of the face and its features. */
const REST = { oval: 0.42, features: 0.34 };

type Phase = "waiting" | "playing" | "done";

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
 * The client's photo, read in the scan's own light (brief 3.3: lead with their face; DECISIONS D-078). At rest a
 * faint outline of the face and its features, and a target on the chosen priority with its name and score; each
 * button moves the target to where that priority shows. Nothing is painted on the skin.
 *
 * The first time a scan's map comes into view it plays the reading back: the light grid crosses the face once, then
 * the target visits each priority in turn while its score counts up. Every point and number is this scan's own.
 * Tapping a priority skips it, "Replay" plays it again, and with reduced motion it never plays. If the photo can't
 * load, it shows their initials over moving light, never a broken image.
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
  /** The face model's points on this photo (0 to 1 each way). */
  landmarks?: [number, number][] | null;
}) {
  const focus = use(Shown);
  const [own, setOwn] = useState(layers[0]?.key ?? null);
  const active = focus ? focus.shown : own;
  const choose = focus ? focus.show : setOwn;
  const current = layers.find((l) => l.key === active) ?? null;
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const face = landmarks && landmarks.length >= FACE_POINT_COUNT ? landmarks : null;
  const located = Boolean(face) && layers.some((l) => l.anchor);
  const [aspect, setAspect] = useState(0.75);
  const plane = useMemo(
    () => (face ? framing(face, aspect, FACE_SHARE, MAP_RATIO) : { left: 0, top: 0, width: 1, height: MAP_RATIO, ratio: MAP_RATIO }),
    [face, aspect],
  );

  const [phase, setPhase] = useState<Phase>("waiting");
  const [visit, setVisit] = useState(-1);
  const [run, setRun] = useState(0);
  const [inView, setInView] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const allowed = useRef(false);
  const timers = useRef<number[]>([]);
  const storageKey = `rebloom:reveal:${photoUrl}`;

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  const play = useCallback(() => {
    clear();
    setVisit(-1);
    setRun((r) => r + 1);
    setPhase("playing");
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    const shown = layers.filter((l) => l.anchor);
    shown.forEach((_, i) => at(T.pass + i * T.visit, () => setVisit(i)));
    at(T.pass + shown.length * T.visit + T.settle, () => setPhase("done"));
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
    allowed.current = located && !played && !still;
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
  }, [located, storageKey]);

  useEffect(() => {
    if (!failed && phase === "waiting" && allowed.current && inView && loaded) play();
  }, [failed, phase, inView, loaded, play]);

  // A photo that can't load has nothing to reveal.
  const stage: Phase = failed ? "done" : phase;
  const playing = stage === "playing";
  const visiting = playing && visit >= 0 ? layers.filter((l) => l.anchor)[visit] : null;
  // The target: on the priority being visited, or at rest on the chosen one.
  const target = playing ? visiting : stage === "done" ? current : null;

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
            onLoad={(e) => {
              setLoaded(true);
              if (e.currentTarget.naturalWidth) setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight);
            }}
            onError={() => setFailed(true)}
            className="absolute max-w-none object-cover"
            style={photoBox(plane)}
          />
        )}

        {/* Cool light over the photo while it's read, as on the scan. */}
        <div
          aria-hidden
          className={cx(
            "pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(206,236,248,0.2),rgba(12,44,62,0.22))] transition-opacity duration-700 ease-gentle",
            playing ? "opacity-100" : "opacity-0",
          )}
        />

        {face && !failed && stage !== "waiting" && (
          <ScanLight key={run} points={face} frame={plane} passes={run > 0 ? 1 : 0} rest={REST} />
        )}

        {target?.anchor && (
          <div
            aria-hidden
            className="pointer-events-none absolute transition-[left,top] duration-700 ease-gentle"
            style={{ left: `${onStage(target.anchor, plane)[0] * 100}%`, top: `${onStage(target.anchor, plane)[1] * 100}%` }}
          >
            <span className="scan-target absolute -translate-x-1/2 -translate-y-1/2" />
            <span
              key={target.key}
              className={cx(
                "fade absolute top-0 flex -translate-y-1/2 items-baseline gap-2 whitespace-nowrap rounded-full border border-white/85 bg-white/75 py-1.5 pl-3 pr-3.5 text-ink shadow-[0_10px_24px_-14px_rgba(12,26,34,0.7)] backdrop-blur-md",
                onStage(target.anchor, plane)[0] < 0.62 ? "left-6" : "right-6",
              )}
            >
              <span className="text-[0.75rem] uppercase tracking-[0.14em]">{target.label}</span>
              <span className="font-display text-[1.25rem] leading-none">{playing ? <CountUp to={target.score} /> : target.score}</span>
            </span>
          </div>
        )}

        {/* Without a place on the face to point to, the score sits in the corner. */}
        {current && !located && (
          <span aria-hidden className="absolute right-3 top-3 rounded-full bg-white/85 py-1.5 pl-3 pr-3.5 shadow-[0_6px_16px_-10px_rgba(12,26,34,0.6)] backdrop-blur-sm">
            <span key={current.key} className="fade flex items-baseline gap-2 text-ink">
              <span className="text-[0.75rem] uppercase tracking-[0.14em]">{current.label}</span>
              <span className="font-display text-[1.25rem] leading-none">{current.score}</span>
            </span>
          </span>
        )}
        <span className="absolute bottom-3 left-3 text-[0.75rem] uppercase tracking-[0.14em] text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
          {caption}
        </span>
        {stage === "done" && located && !failed && (
          <button
            type="button"
            onClick={play}
            className="fade absolute bottom-0 right-0 min-h-11 px-3 text-[0.75rem] uppercase tracking-[0.14em] text-white/95 underline decoration-white/40 underline-offset-4 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] hover:decoration-white"
          >
            Replay
          </button>
        )}
      </div>
      <p className="mt-4 text-[0.875rem] leading-snug text-text-2">
        {located ? "Choose a priority to see where it shows on your face." : "Choose a priority to see its score."}
      </p>
      <div role="group" aria-label="Show a priority on your photo" className="mt-2.5 grid grid-cols-3 gap-2">
        {layers.map((layer) => (
          <Chip
            key={layer.key}
            selected={layer.key === active}
            onClick={() => {
              if (stage !== "done") skip();
              choose(layer.key);
            }}
            className="justify-center px-2 text-center"
          >
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
