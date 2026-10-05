"use client";

import { useEffect, useState } from "react";

/** One gear outline centred on 0,0: `teeth` trapezoid teeth between the root and tip circles. */
function gearPath(teeth: number, tip: number, root: number): string {
  const step = (Math.PI * 2) / teeth;
  const at = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  const points: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    points.push(at(root, a), at(tip, a + step * 0.18), at(tip, a + step * 0.42), at(root, a + step * 0.6));
  }
  return `M${points.join(" L")} Z`;
}

// Two meshing gears with the same tooth size. Turn times are in proportion to tooth counts,
// so the teeth stay in step; the small gear's start angle puts a gap where the big gear's tooth enters.
const BIG = { teeth: 12, tip: 26, root: 21, x: 40, y: 52, start: 16, seconds: 12 };
const SMALL = { teeth: 8, tip: 18, root: 13.5, x: 72.15, y: 29.49, start: 19, seconds: 8 };

/** Slowly turning gears for "putting your report together". Still for people who prefer less motion. */
export function ThinkingCogs({ className }: { className?: string }) {
  const [still, setStill] = useState(true);
  useEffect(() => {
    // Motion preference only exists in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const gear = (g: typeof BIG, direction: 1 | -1, className: string) => (
    <g transform={`translate(${g.x} ${g.y}) rotate(${g.start})`} className={className}>
      <g>
        <path d={gearPath(g.teeth, g.tip, g.root)} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
        <circle r={g.root * 0.32} fill="none" stroke="currentColor" strokeWidth="1.25" />
        {!still && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0"
            to={String(360 * direction)}
            dur={`${g.seconds}s`}
            repeatCount="indefinite"
          />
        )}
      </g>
    </g>
  );

  return (
    <svg viewBox="8 6 92 78" className={className} aria-hidden>
      {gear(BIG, 1, "text-ink")}
      {gear(SMALL, -1, "text-bronze")}
    </svg>
  );
}
