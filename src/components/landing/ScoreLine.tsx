import { cx } from "@/components/ui/cx";

/**
 * One client's score across their scans: a green line rising through labeled points, the latest marked.
 * The line stretches to its box; points and numbers are HTML on top, so they stay round and crisp at any
 * width. Where the browser can, it draws in from the left as it scrolls into view (globals.css, .reveal-line).
 */
export function ScoreLine({ series, label, className, plotClassName }: { series: number[]; label: string; className?: string; plotClassName?: string }) {
  const lo = Math.min(...series) - 3;
  const hi = Math.max(...series) + 2;
  const points = series.map((v, i) => ({
    v,
    x: 6 + (i * 88) / Math.max(series.length - 1, 1),
    y: 18 + (1 - (v - lo) / (hi - lo || 1)) * 70,
  }));
  const line = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const last = points[points.length - 1];

  return (
    <figure className={className}>
      <div className={cx("reveal-line relative h-52 sm:h-60", plotClassName)}>
        <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          <defs>
            <linearGradient id="score-line-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7fd1b4" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#7fd1b4" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L${last.x.toFixed(2)},100 L${points[0].x.toFixed(2)},100 Z`} fill="url(#score-line-fill)" />
          <path d={line} fill="none" stroke="var(--growth)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {points.map((p, i) => {
          const isLast = i === points.length - 1;
          return (
            <div key={i} aria-hidden className="absolute" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              <span
                className={cx(
                  "absolute left-0 top-0 block -translate-x-1/2 -translate-y-1/2 rounded-full",
                  isLast ? "h-3.5 w-3.5 bg-[var(--growth)] ring-[3px] ring-white" : "h-2.5 w-2.5 bg-white ring-2 ring-[var(--growth)]",
                )}
              />
              <span
                className={cx(
                  "absolute bottom-3 left-0 -translate-x-1/2 font-display font-light leading-none",
                  isLast ? "text-[2.125rem] text-[var(--growth)]" : "text-[1.375rem] text-text-2",
                )}
              >
                {p.v}
              </span>
            </div>
          );
        })}
      </div>
      <div aria-hidden className="mt-3 flex justify-between px-[2%] text-[0.75rem] uppercase tracking-[0.14em] text-text-3">
        <span>First scan</span>
        <span>Latest</span>
      </div>
      <figcaption className="sr-only">
        {label} score across {series.length} scans: {series.join(", ")}.
      </figcaption>
    </figure>
  );
}
