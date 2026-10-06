import { cx } from "@/components/ui/cx";
import type { ClientStatus } from "@/lib/domain";
import { STATUS_LABEL } from "@/lib/dashboard/view";

/** A client's status in words, with the queue's square: hollow when at risk, glacier when in a course. */
export function StatusMark({ status }: { status: ClientStatus }) {
  const risky = status === "at_risk" || status === "lapsed";
  const course = status === "in_course" || status === "course_complete";
  return (
    <span
      className={cx(
        "inline-flex h-7 items-center gap-2 whitespace-nowrap rounded-full px-3 text-[12.5px]",
        risky ? "bg-[#e9a35f]/15 text-[#8a4b12]" : course ? "bg-[#9fc9dd]/30 text-[#174a63]" : "bg-white/70 text-text-2 ring-1 ring-inset ring-[#0c1a22]/[0.06]",
      )}
    >
      <span
        aria-hidden
        className={cx("inline-block h-[7px] w-[7px] rounded-[2px]", risky ? "border border-[#b8691f]" : course ? "bg-glacier-deep" : "bg-glacier")}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}
