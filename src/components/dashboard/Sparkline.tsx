import { cx } from "@/components/ui/cx";

/**
 * A tiny trend line beside a score: one 1.5px stroke, the last point marked. Decorative next to the
 * numbers it sits with, so it's hidden from screen readers (the label says the change in words).
 */
export function Sparkline({ values, className, width = 72, height = 22 }: { values: number[]; className?: string; width?: number; height?: number }) {
  if (values.length < 2) {
    return <span aria-hidden className={cx("inline-block h-px bg-mist align-middle", className)} style={{ width }} />;
  }
  const min = Math.min(...values) - 2;
  const max = Math.max(...values) + 2;
  const pad = 3;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (values.length - 1);
  const y = (v: number) => pad + (1 - (v - min) / (max - min || 1)) * (height - pad * 2);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values.length - 1;
  return (
    <svg aria-hidden width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cx("overflow-visible", className)}>
      <path d={d} fill="none" stroke="var(--accent-deep)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last)} cy={y(values[last])} r={2.25} fill="var(--accent-deep)" />
    </svg>
  );
}
