import { cx } from "@/components/ui/cx";
import type { TriggerKind } from "@/lib/rebook/engine";

const AT_RISK: TriggerKind[] = ["stalled", "missed", "lapsed"];

/**
 * The trigger's dot, for places that only know the trigger (the outbox, the rules): the same colours as the queue's
 * signals. Amber for at risk, rose for a progress moment, sea blue for a new lead, deep sea for the rest. Still, since
 * these are a record, not an alert.
 */
export function KindMarkStatic({ kind }: { kind: TriggerKind }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        kind === "progress_moment"
          ? "bg-[linear-gradient(135deg,#ffc9b8,#e07a8a)]"
          : AT_RISK.includes(kind)
            ? "bg-[linear-gradient(135deg,#ffc27e,#f07a2a)]"
            : kind === "report_follow_up"
              ? "bg-[linear-gradient(135deg,#5fb2e0,#1f78aa)]"
              : "bg-[#1e5a78]",
      )}
    />
  );
}
