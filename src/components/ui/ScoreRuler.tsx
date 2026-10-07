"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cx } from "./cx";

const TICKS = Array.from({ length: 51 }, (_, i) => i * 2);
const clamp = (v: number) => Math.max(0, Math.min(100, v));

/**
 * A score on a fine ruler, 0 to 100, with a marker at the score (DECISIONS D-075). It reads as an instrument: the
 * ticks fill to the score as it comes into view. Given `from`, it shows a change: a faint marker stays at the first
 * score and the marker slides to today's, over a band in green when the change is an improvement.
 */
export function ScoreRuler({
  value,
  from,
  tone = "sea",
  label,
  className,
}: {
  value: number;
  /** The first score, to show a change from it. */
  from?: number;
  /** Green when the change is a confirmed improvement. */
  tone?: "sea" | "growth";
  label?: string;
  className?: string;
}) {
  const id = `ruler${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setSeen(true);
        io.disconnect();
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const to = clamp(value);
  const start = from === undefined ? 0 : clamp(from);
  const at = seen ? to : start;
  const [lo, hi] = [Math.min(start, at), Math.max(start, at)];
  const ease = "var(--ease-gentle)";
  const ticks = (stroke: string) => (
    <svg viewBox="0 0 100 14" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-3.5 w-full overflow-visible">
      {TICKS.map((t) => (
        <line key={t} x1={t} x2={t} y1={t % 10 === 0 ? 2 : 8} y2={14} style={{ stroke }} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );

  return (
    <div
      ref={box}
      className={cx("relative h-[22px] w-full", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg aria-hidden className="absolute h-0 w-0">
        <defs>
          <linearGradient id={`${id}-sea`} gradientUnits="userSpaceOnUse" x1="0" x2="100" y1="0" y2="0">
            <stop offset="0" stopColor="#9fc9dd" />
            <stop offset="1" stopColor="#1e5a78" />
          </linearGradient>
        </defs>
      </svg>
      {ticks("rgba(12,26,34,0.16)")}
      {/* The ticks up to the score, filling as it comes into view. */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - (from === undefined ? at : lo)}% 0 0)`, transition: `clip-path 900ms ${ease}` }}
      >
        {ticks(`url(#${id}-sea)`)}
      </div>
      {/* The change, between the first score and today's. */}
      {from !== undefined && (
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - hi}% 0 ${lo}%)`, transition: `clip-path 900ms ${ease}` }}
        >
          {ticks(tone === "growth" ? "var(--growth)" : "#1e5a78")}
        </div>
      )}
      {from !== undefined && <Marker at={start} faint />}
      <div className="absolute inset-0" style={{ transform: `translateX(${at}%)`, transition: `transform 900ms ${ease}` }}>
        <Marker at={0} />
      </div>
    </div>
  );
}

/** A small pointer above a needle through the ticks. */
function Marker({ at, faint }: { at: number; faint?: boolean }) {
  return (
    <span aria-hidden className="absolute top-0 h-full" style={{ left: `${at}%` }}>
      <svg viewBox="0 0 8 6" width={8} height={6} className={cx("absolute top-0 -translate-x-1/2", faint ? "text-text-3" : "text-ink")}>
        <path d="M0 0H8L4 6Z" fill={faint ? "none" : "currentColor"} stroke="currentColor" strokeWidth={faint ? 1 : 0} strokeLinejoin="round" />
      </svg>
      {!faint && <span className="absolute bottom-0 top-[7px] w-[1.5px] -translate-x-1/2 rounded-full bg-ink" />}
    </span>
  );
}
