import { cx } from "@/components/ui/cx";
import type { MonthBar } from "@/lib/dashboard/insights";
import { formatPrice } from "@/lib/plan/build";

/**
 * One bar chart: revenue kept, month by month. A single series, so no legend: the heading names it.
 * Sharp ends (the brand's corners), a 2px gap of surface between bars, values labelled above each bar,
 * and the same numbers as a table for screen readers.
 */
export function MonthBars({ months, title }: { months: MonthBar[]; title: string }) {
  const max = Math.max(...months.map((m) => m.cents), 1);
  return (
    <figure>
      <div aria-hidden className="relative grid h-64 grid-flow-col auto-cols-fr items-end gap-[2px] border-b border-ink/70">
        {months.map((m, i) => {
          const pct = (m.cents / max) * 100;
          return (
            <div key={m.month} className="group relative flex h-full flex-col justify-end">
              <span
                className="mb-2 text-center text-[12px] tabular-nums text-text-3 transition-colors duration-200 group-hover:text-ink"
                style={{ marginBottom: 8 }}
              >
                {m.cents ? formatPrice(m.cents) : ""}
              </span>
              <div
                className={cx(
                  "bar mx-auto w-full max-w-16 origin-bottom transition-colors duration-200",
                  m.current ? "bg-glacier group-hover:bg-glacier-deep/70" : "bg-glacier-deep group-hover:bg-ink",
                )}
                style={{ height: `${Math.max(pct, m.cents ? 1.5 : 0)}%`, animationDelay: `${i * 60}ms` }}
              />
            </div>
          );
        })}
      </div>
      <div aria-hidden className="mt-3 grid grid-flow-col auto-cols-fr gap-[2px]">
        {months.map((m) => (
          <span key={m.month} className={cx("text-center text-[12.5px]", m.current ? "text-ink" : "text-text-3")}>
            {m.label}
          </span>
        ))}
      </div>
      <figcaption className="t-caption mt-5 !text-[12.5px]">
        The lighter bar is this month so far, with visits already booked for later in the month.
      </figcaption>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Revenue kept</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <th scope="row">{m.label}</th>
              <td>{formatPrice(m.cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
