import { cx } from "@/components/ui/cx";
import type { MonthBar } from "@/lib/dashboard/insights";
import { formatPrice } from "@/lib/plan/build";

/**
 * One bar chart: revenue kept, month by month. A single series, so no legend: the heading names it.
 * Sea bars rising into ice, this month in gold (it's still filling), values labelled above each bar,
 * and the same numbers as a table for screen readers.
 */
export function MonthBars({ months, title }: { months: MonthBar[]; title: string }) {
  const max = Math.max(...months.map((m) => m.cents), 1);
  return (
    <figure>
      <div aria-hidden className="relative grid h-72 grid-flow-col auto-cols-fr items-end gap-3 border-b border-[#0c1a22]/15 sm:gap-5">
        {[0.25, 0.5, 0.75].map((f) => (
          <span key={f} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[#0c1a22]/[0.07]" style={{ bottom: `${f * 86}%` }} />
        ))}
        {months.map((m, i) => {
          const pct = (m.cents / max) * 100;
          return (
            <div key={m.month} className="group relative flex h-full flex-col justify-end">
              <span
                className={cx("mb-2 text-center text-[12.5px] tabular-nums transition-colors duration-200 group-hover:text-ink", m.current ? "text-[#7a5014]" : "text-text-3")}
                style={{ marginBottom: 8 }}
              >
                {m.cents ? formatPrice(m.cents) : ""}
              </span>
              <div
                className={cx(
                  "bar relative mx-auto w-full max-w-20 origin-bottom rounded-t-[10px] transition-[filter] duration-200 group-hover:brightness-110",
                  m.current
                    ? "bg-[linear-gradient(180deg,#f1d49a_0%,#c99645_60%,#9a6b22_100%)] shadow-[0_18px_30px_-16px_rgba(201,150,69,0.8)]"
                    : "bg-[linear-gradient(180deg,#2a7398_0%,#5f9fc0_55%,#b6d8e8_100%)] shadow-[0_18px_30px_-18px_rgba(30,90,120,0.6)]",
                )}
                style={{ height: `${Math.max(pct * 0.86, m.cents ? 1.5 : 0)}%`, animationDelay: `${200 + i * 80}ms` }}
              />
            </div>
          );
        })}
      </div>
      <div aria-hidden className="mt-3 grid grid-flow-col auto-cols-fr gap-3 sm:gap-5">
        {months.map((m) => (
          <span key={m.month} className={cx("text-center text-[12.5px] uppercase tracking-[0.12em]", m.current ? "text-[#7a5014]" : "text-text-3")}>
            {m.label}
          </span>
        ))}
      </div>
      <figcaption className="t-caption mt-5 !text-[12.5px]">
        The gold bar is this month so far, with visits already booked for later in the month.
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
