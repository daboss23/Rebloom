import { cx } from "@/components/ui/cx";
import type { MonthBar } from "@/lib/dashboard/insights";
import { formatPrice } from "@/lib/plan/build";

/**
 * Insights' one chart, small and on deep sea: revenue kept, month by month. Ice bars, this month in gold
 * (it's still filling), values above, and the same numbers as a table for screen readers.
 */
export function MiniBars({ months, title }: { months: MonthBar[]; title: string }) {
  const max = Math.max(...months.map((m) => m.cents), 1);
  return (
    <figure>
      <div aria-hidden className="grid h-40 grid-flow-col auto-cols-fr items-end gap-2.5 border-b border-white/15 sm:gap-3">
        {months.map((m) => (
          <div key={m.month} className="flex h-full flex-col justify-end">
            <span className={cx("mb-1.5 text-center text-[0.6875rem] tabular-nums", m.current ? "text-[#f1d49a]" : "text-ink-soft")}>
              {m.cents ? formatPrice(m.cents) : ""}
            </span>
            <div
              className={cx(
                "grow-bar mx-auto w-full max-w-12 origin-bottom rounded-t-[6px]",
                m.current ? "bg-[linear-gradient(180deg,#f1d49a_0%,#c99645_100%)]" : "bg-[linear-gradient(180deg,#bfe0ee_0%,#5f9fc0_100%)]",
              )}
              style={{ height: `${Math.max((m.cents / max) * 76, m.cents ? 3 : 0)}%` }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-2.5 grid grid-flow-col auto-cols-fr gap-2.5 sm:gap-3">
        {months.map((m) => (
          <span key={m.month} className={cx("text-center text-[0.6875rem] uppercase tracking-[0.12em]", m.current ? "text-[#f1d49a]" : "text-ink-soft")}>
            {m.label}
          </span>
        ))}
      </div>
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
