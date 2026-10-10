"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bloom } from "@/components/dashboard/Bloom";
import { ScanLight } from "@/components/face/ScanLight";
import { ScanShow } from "@/components/face/ScanShow";
import { cx } from "@/components/ui/cx";
import { ScoreRuler } from "@/components/ui/ScoreRuler";
import { framing, onStage, photoBox } from "@/lib/face/frame";

type P = [number, number];

export interface HeroPriority {
  key: string;
  label: string;
  from: number;
  score: number;
  anchor: P;
}

/** How long each priority stays on the face before the next, and each act of the opening scan. */
const HOLD_MS = 4200;
const ACT_MS = 1750;
const REST = { oval: 0.4, features: 0.3 };

/**
 * The hero's proof (DECISIONS D-076, D-078, D-092): a sample client's latest scan, in the scan's own light. It opens
 * with the scan itself, played once (ScanShow) and replayable; then the grid crosses her face every few seconds, a
 * target rests where each priority shows with its score on a ruler, and a card holds the measured change since her
 * first scan. Every point and number is her demo report's own. The priorities can be
 * chosen; with reduced motion it shows the first, still.
 */
export function HeroFace({
  firstName,
  photo,
  aspect,
  points,
  scanNumber,
  priorities,
}: {
  firstName: string;
  photo: string;
  /** Photo width over height. */
  aspect: number;
  points: P[];
  scanNumber: number;
  /** The one with the most measured change first. */
  priorities: HeroPriority[];
}) {
  const plane = useMemo(() => framing(points, aspect), [points, aspect]);
  const [live, setLive] = useState(false);
  // The opening scan: plays once on arrival, and again on request.
  const [showing, setShowing] = useState(true);
  const [take, setTake] = useState(0);
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState(false);
  const [visible, setVisible] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [end, setEnd] = useState<P | null>(null);

  // The leader line ends at the card's inner edge, wherever the layout puts the card.
  useEffect(() => {
    const [s, c] = [stage.current, card.current];
    if (!s || !c) return;
    const measure = () => {
      const a = s.getBoundingClientRect();
      const b = c.getBoundingClientRect();
      if (!a.width || !a.height) return;
      const x = Math.min(1, Math.max(0, (b.right - a.left) / a.width));
      const y = Math.min(1, Math.max(0, (b.top + b.height / 2 - a.top) / a.height));
      setEnd([x, y]);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(s);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  // With reduced motion the scan isn't played: the marks are simply there.
  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setTimeout(() => {
      setShowing(false);
      setLive(true);
      setChosen(true);
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  // Off screen, it stops cycling.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!live || chosen || !visible || priorities.length < 2) return;
    const t = window.setInterval(() => setActive((i) => (i + 1) % priorities.length), HOLD_MS);
    return () => window.clearInterval(t);
  }, [live, chosen, visible, priorities.length]);

  const current = priorities[active];
  const featured = priorities[0];
  const change = featured.score - featured.from;
  const [ax, ay] = onStage(current.anchor, plane);
  const scan = String(scanNumber).padStart(2, "0");

  return (
    <figure ref={box} className="relative">
      <div className="relative mx-auto max-w-[560px] lg:mr-0">
        <div ref={stage} className="relative aspect-[4/5] overflow-hidden rounded-[28px] bg-mist shadow-[0_44px_90px_-40px_rgba(12,44,62,0.7)] ring-1 ring-white/80">
          <ScanShow
            points={points}
            frame={plane}
            photo={photo}
            phase={showing && visible ? "scan" : "off"}
            face="her face"
            actMs={ACT_MS}
            once
            run={take}
            onDone={() => {
              setShowing(false);
              setLive(true);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a bundled demo portrait */}
            <img
              src={photo}
              alt={`${firstName}, a sample client, read by the scan`}
              fetchPriority="high"
              className="absolute max-w-none object-cover"
              style={photoBox(plane)}
            />
            {/* The scan's light crosses her face every few seconds; off screen it stops. */}
            {visible && <ScanLight points={points} frame={plane} passes={Infinity} gapMs={showing ? 300 : 2600} rest={REST} />}
          </ScanShow>

          {/* A line from where the priority shows to its card. */}
          {live && end && (
            <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
              <line
                key={current.key}
                x1={ax * 100}
                y1={ay * 100}
                x2={end[0] * 100}
                y2={end[1] * 100}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                className="fade"
              />
            </svg>
          )}
          {live && (
            <span aria-hidden className="pointer-events-none absolute transition-[left,top] duration-700 ease-gentle" style={{ left: pct(ax), top: pct(ay) }}>
              <span className="scan-target absolute -translate-x-1/2 -translate-y-1/2" />
            </span>
          )}
          <span className="absolute bottom-3 left-4 text-[0.75rem] uppercase tracking-[0.14em] text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
            Scan {scan} · Face map
          </span>
          {live && (
            <button
              type="button"
              onClick={() => {
                setLive(false);
                setShowing(true);
                setTake((n) => n + 1);
              }}
              className="scan-chapter hero-card-in absolute right-3 top-3 flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[0.75rem] font-medium uppercase tracking-[0.14em] text-white transition-transform duration-150 active:scale-[0.96]"
            >
              <svg aria-hidden viewBox="0 0 16 16" width={12} height={12}>
                <path d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5v3h-3" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Replay the scan
            </button>
          )}
        </div>

        {/* The priority on the face: its score on a ruler, from her first scan to now. */}
        <div
          ref={card}
          className={cx(
            "glass !absolute left-3 top-3 w-[min(248px,54%)] px-3.5 py-3 sm:top-[9%] sm:px-4 sm:py-3.5 sm:left-auto sm:right-[calc(100%-2.5rem)] lg:right-[calc(100%-3.5rem)]",
            live ? "hero-card-in hero-float" : "opacity-0",
          )}
          style={{ "--d": "60ms" } as React.CSSProperties}
        >
          <p key={current.key} className="fade flex items-baseline justify-between gap-3">
            <span className="text-[0.75rem] uppercase tracking-[0.14em] text-[#1e5a78]">{current.label}</span>
            <span className="font-display text-[2.125rem] font-light leading-none text-ink">{current.score}</span>
          </p>
          <ScoreRuler value={current.score} from={current.from} tone={current.score > current.from ? "growth" : "sea"} className="mt-2.5" />
          <p className="mt-2 text-[0.8125rem] text-text-2">
            {current.from === current.score ? `Holding at ${current.score} since scan 01` : `${current.from} at scan 01`}
          </p>
        </div>

        {/* The change worth a call: measured since her first scan. */}
        {change > 0 && (
          <div
            className={cx(
              "glass !absolute bottom-[6.25rem] right-3 flex items-center gap-3 px-4 py-3 sm:bottom-auto sm:right-[-1.5rem] sm:top-[52%] lg:right-[-2.5rem]",
              live ? "hero-card-in hero-float" : "opacity-0",
            )}
            style={{ "--d": "260ms" } as React.CSSProperties}
          >
            <Bloom size={22} className="shrink-0 text-[#9e4a5d]" />
            <p>
              <span className="block font-display text-[1.875rem] font-light leading-none text-[var(--growth)]">+{change}</span>
              <span className="mt-1 block text-[0.8125rem] leading-tight text-text-2">
                {featured.label} since scan 01
              </span>
            </p>
          </div>
        )}

        {/* Her three priorities: choose one to see it on her face. */}
        <div
          role="group"
          aria-label={`Show one of ${firstName}'s priorities on her face`}
          className={cx(
            "absolute inset-x-3 bottom-11 flex gap-1.5 rounded-full bg-white/80 p-1.5 shadow-[0_18px_36px_-22px_rgba(12,44,62,0.55)] ring-1 ring-white/80 backdrop-blur-xl sm:inset-x-8",
            live ? "hero-card-in" : "opacity-0",
          )}
          style={{ "--d": "420ms" } as React.CSSProperties}
        >
          {priorities.map((p, i) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={i === active}
              onClick={() => {
                setChosen(true);
                setActive(i);
              }}
              className={cx(
                "flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-[0.8125rem] transition-[background-color,color] duration-300 active:scale-[0.97] sm:text-[0.8125rem]",
                i === active ? "bg-[linear-gradient(180deg,#1e5a78,#0e2230)] text-white" : "text-ink hover:bg-white",
              )}
            >
              <span className="truncate">{p.label}</span>
              <span className={cx("tabular-nums", i === active ? "text-white/75" : "text-text-3")}>{p.score}</span>
            </button>
          ))}
        </div>
      </div>
      <figcaption className="mx-auto mt-4 max-w-[560px] text-[0.8125rem] leading-relaxed text-text-3 lg:mr-0">
        {firstName} is a sample client: an AI-generated portrait, read and scored exactly as her report shows it.
      </figcaption>
    </figure>
  );
}

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
