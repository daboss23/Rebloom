import { cx } from "@/components/ui/cx";
import type { ClientStatus } from "@/lib/domain";
import { STATUS_LABEL } from "@/lib/dashboard/view";

/** A client's status in words. At risk and new leads burn bright and pulse; courses wear ice; the rest stays quiet. */
export function StatusMark({ status }: { status: ClientStatus }) {
  const signal =
    status === "at_risk" || status === "lapsed"
      ? "signal-urgent signal-live"
      : status === "lead"
        ? "signal-lead signal-live"
        : status === "in_course" || status === "course_complete"
          ? "signal-course"
          : "signal-calm";
  return (
    <span className={cx("signal h-7 px-3 text-[0.8125rem]", signal)}>
      <span aria-hidden className="signal-dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}
