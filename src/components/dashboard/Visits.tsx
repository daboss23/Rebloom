import Link from "next/link";
import { cx } from "@/components/ui/cx";
import { fullName, type Visit } from "@/lib/dashboard/view";

/** Today's appointments as a timeline. The next one carries a gold mark; each opens that client's brief. */
export function Visits({ visits, now, empty }: { visits: Visit[]; now: Date; empty: string }) {
  if (visits.length === 0) {
    return <p className="t-caption px-6 py-6">{empty}</p>;
  }
  const nowIso = now.toISOString();
  const nextId = visits.find((v) => v.appointment.endsAt >= nowIso)?.appointment.id;
  return (
    <ol className="relative px-3 py-3">
      <span aria-hidden className="absolute bottom-8 left-[39px] top-8 w-px bg-gradient-to-b from-[#9fc9dd] via-[#9fc9dd]/60 to-transparent" />
      {visits.map(({ appointment, facts, treatment, time, minutes, session }, i) => {
        const past = appointment.endsAt < nowIso;
        const next = appointment.id === nextId;
        return (
          <li key={appointment.id} className="focus-in" style={{ animationDelay: `${200 + i * 80}ms` }}>
            <Link
              href={`/dashboard/clients/${facts.client.id}`}
              className="group relative grid grid-cols-[2rem_minmax(0,1fr)] gap-4 rounded-[14px] px-3 py-4 transition-colors duration-200 hover:bg-white/70"
            >
              <span className="relative flex justify-center pt-2">
                <span
                  aria-hidden
                  className={cx(
                    "relative z-10 h-3 w-3 rounded-full ring-4 ring-[#f4f8fa]",
                    next ? "bg-[linear-gradient(135deg,#f1d49a,#b98a3c)] shadow-[0_0_0_4px_rgba(226,192,122,0.25)]" : past ? "bg-[#c5d6df]" : "bg-[#1e5a78]",
                  )}
                />
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline justify-between gap-3">
                  <span className={cx("font-display text-[26px] font-light leading-none", past ? "text-text-3" : "text-ink")}>{time}</span>
                  {next && <span className="text-[10.5px] uppercase tracking-[0.16em] text-[#9a6b22]">Next</span>}
                  {past && <span className="text-[10.5px] uppercase tracking-[0.16em] text-text-3">Done</span>}
                </span>
                <span className="mt-2 block text-[15px] text-ink">{fullName(facts.client)}</span>
                <span className="mt-0.5 block text-[13.5px] text-text-2">
                  {treatment?.name ?? "First consultation"} · {minutes} min
                </span>
                {(session || appointment.depositStatus === "paid") && (
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {session && <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11.5px] text-text-3 ring-1 ring-inset ring-[#0c1a22]/[0.06]">{session}</span>}
                    {appointment.depositStatus === "paid" && (
                      <span className="rounded-full bg-[#e2c07a]/20 px-2 py-0.5 text-[11.5px] text-[#7a5014]">Deposit paid</span>
                    )}
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
