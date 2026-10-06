import { cx } from "@/components/ui/cx";
import type { ClientStatus } from "@/lib/domain";
import { STATUS_LABEL } from "@/lib/dashboard/view";

/** A client's status in words, with the queue's square: hollow when at risk, glacier when in a course. */
export function StatusMark({ status }: { status: ClientStatus }) {
  const risky = status === "at_risk" || status === "lapsed";
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13.5px] text-text-2">
      <span
        aria-hidden
        className={cx(
          "inline-block h-[7px] w-[7px]",
          risky ? "border border-ink" : status === "in_course" || status === "course_complete" ? "bg-glacier-deep" : "bg-sage/60",
        )}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}
