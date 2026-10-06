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
      <div className="leading-tight">
        <p className="t-label !text-[10px]">Demo clock{offsetDays > 0 ? ` · +${offsetDays} days` : ""}</p>
        <p className="text-[14px] text-ink tabular-nums">
          {dateLabel}
        </p>
      </div>
      <div role="group" aria-label="Move the demo clock forward" className="flex border border-mist">
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
              "h-9 px-3 text-[12.5px] text-text-2 transition-[background-color,color,transform] duration-150 ease-out",
              "hover:bg-mist hover:text-ink active:scale-[0.97] disabled:opacity-50",
              i > 0 && "border-l border-mist",
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
