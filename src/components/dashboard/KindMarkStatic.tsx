import { cx } from "@/components/ui/cx";
import type { TriggerKind } from "@/lib/rebook/engine";

const AT_RISK: TriggerKind[] = ["stalled", "missed", "lapsed"];

/** The queue's square, for places that only know the trigger: glacier for a moment, hollow for at risk. */
export function KindMarkStatic({ kind }: { kind: TriggerKind }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block h-[7px] w-[7px] shrink-0",
        kind === "progress_moment" ? "bg-glacier-deep" : AT_RISK.includes(kind) ? "border border-ink" : "bg-sage/60",
      )}
    />
  );
}
