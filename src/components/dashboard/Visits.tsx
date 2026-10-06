import Link from "next/link";
import { cx } from "@/components/ui/cx";
import { fullName, type Visit } from "@/lib/dashboard/view";

/** Today's appointments, in time order. Each opens that client's brief. */
export function Visits({ visits, now, empty }: { visits: Visit[]; now: Date; empty: string }) {
  if (visits.length === 0) {
    return <p className="t-caption border-t border-mist py-6">{empty}</p>;
  }
  return (
    <ol className="border-t border-mist">
      {visits.map(({ appointment, facts, treatment, time, minutes, session }) => {
        const past = appointment.endsAt < now.toISOString();
        return (
          <li key={appointment.id}>
            <Link
              href={`/dashboard/clients/${facts.client.id}`}
              className="group grid grid-cols-[4.25rem_minmax(0,1fr)] gap-4 border-b border-mist py-5 transition-colors duration-200 hover:bg-mist/40"
            >
              <span className={cx("font-display text-[24px] font-light leading-none lining-nums tabular-nums", past ? "text-text-3" : "text-ink")}>
                {time}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] text-ink">{fullName(facts.client)}</span>
                <span className="mt-0.5 block text-[13.5px] text-text-2">
                  {treatment?.name ?? "First consultation"} · {minutes} min
                </span>
                <span className="t-caption mt-1.5 block !text-[12px]">
                  {[session, appointment.depositStatus === "paid" ? "Deposit paid" : null, past ? "Done" : null].filter(Boolean).join(" · ") ||
                    "Brief ready"}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
