"use client";

import { useState, useTransition } from "react";
import { travel } from "@/app/dashboard/actions";
import { cx } from "@/components/ui/cx";

const STEPS = [
  { days: 1, label: "+1 day" },
  { days: 7, label: "+1 week" },
  { days: 30, label: "+1 month" },
];

/**
 * The demo clock (brief 3.4: "time travel"). Moves this browser's clock forward so judges can watch
 * triggers fire. Never backwards (DECISIONS D-016).
 */
export function TimeTravel({ dateLabel, offsetDays, compact }: { dateLabel: string; offsetDays: number; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={cx("flex items-center gap-4", compact && "w-full justify-between")} aria-busy={pending}>
      <div className="flex items-center gap-3 leading-tight">
        <span aria-hidden className={cx("relative hidden h-8 w-8 shrink-0 place-items-center sm:grid rounded-full border border-[#c99645]/50", pending && "animate-spin [animation-duration:1.4s]")}>
          <span className="absolute left-1/2 top-[7px] h-[9px] w-px -translate-x-1/2 bg-[#9a6b22]" />
          <span className="absolute left-1/2 top-1/2 h-px w-[7px] bg-[#9a6b22]" />
        </span>
        <span>
          <span className="t-label block whitespace-nowrap !text-[0.625rem]">Demo clock{offsetDays > 0 ? ` · +${offsetDays} days` : ""}</span>
          <span key={dateLabel} className="focus-in block text-[0.875rem] text-ink tabular-nums">
            {dateLabel}
          </span>
        </span>
      </div>
      <div role="group" aria-label="Move the demo clock forward" className="flex overflow-hidden rounded-[12px] border border-white/80 bg-white/55 shadow-[0_8px_20px_-14px_rgba(12,44,62,0.35)]">
        {STEPS.map((step, i) => (
          <button
            key={step.days}
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const result = await travel(step.days);
                if (!result.ok) setError(result.error ?? "Couldn't move the clock.");
              })
            }
            className={cx(
              "h-9 whitespace-nowrap px-2.5 text-[0.78125rem] text-text-2 sm:px-3.5 transition-[background-color,color,transform] duration-150 ease-out",
              "hover:bg-white hover:text-ink active:scale-[0.96] disabled:opacity-50",
              i > 0 && "border-l border-[#0c1a22]/[0.07]",
            )}
          >
            {step.label}
          </button>
        ))}
      </div>
      <p role="status" className="sr-only">
        {pending ? "Moving the clock forward" : error ?? ""}
      </p>
      {error && <p className="t-caption text-ink">{error}</p>}
    </div>
  );
}
