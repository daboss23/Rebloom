import Link from "next/link";
import { cx } from "@/components/ui/cx";
import { IconCheck } from "@/components/ui/Icons";
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
      <span aria-hidden className="absolute bottom-8 left-[39px] top-8 w-0.5 bg-gradient-to-b from-[#9fc9dd] via-[#9fc9dd]/60 to-transparent" />
      {visits.map(({ appointment, facts, treatment, time, minutes, session }, i) => {
        const past = appointment.endsAt < nowIso;
        const next = appointment.id === nextId;
        return (
          <li key={appointment.id} className="focus-in" style={{ animationDelay: `${200 + i * 80}ms` }}>
            <Link
              href={`/dashboard/clients/${facts.client.id}`}
              className="group relative grid grid-cols-[32px_minmax(0,1fr)] gap-4 rounded-[14px] px-3 py-4 transition-colors duration-200 hover:bg-white/70"
            >
              <span className="relative flex justify-center pt-1">
                <span
                  aria-hidden
                  className={cx(
                    "relative z-10 grid h-5 w-5 place-items-center rounded-full ring-4 ring-[#f4f8fa]",
                    next
                      ? "bg-[linear-gradient(135deg,#f1d49a,#b98a3c)] shadow-[0_0_0_5px_rgba(226,192,122,0.28)]"
                      : past
                        ? "bg-[linear-gradient(150deg,#23668a,#134560)] text-white shadow-[0_4px_10px_-4px_rgba(19,69,96,0.6)]"
                        : "bg-white shadow-[inset_0_0_0_2px_#1e5a78]",
                  )}
                >
                  {past && <IconCheck width={11} height={11} strokeWidth={2.5} />}
                </span>
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline justify-between gap-3">
                  <span className={cx("font-display text-[1.625rem] font-light leading-none", past ? "text-text-2" : "text-ink")}>
                    {time.replace(/[ap]m$/, "")}
                    <span className="ml-0.5 text-[1.0625rem]">{time.slice(-2)}</span>
                  </span>
                  {next && (
                    <span className="rounded-full bg-[linear-gradient(180deg,#fff4dc,#f1d49a)] px-2 py-0.5 text-[0.75rem] font-medium uppercase tracking-[0.14em] text-[#5a3a08] ring-1 ring-inset ring-[#c99645]/45">
                      Next
                    </span>
                  )}
                  {past && <span className="text-[0.75rem] font-medium uppercase tracking-[0.16em] text-[#1e5a78]">Done</span>}
                </span>
                <span className="mt-2 block text-[0.9375rem] text-ink">{fullName(facts.client)}</span>
                <span className="mt-0.5 block text-[0.875rem] text-text-2">
                  {treatment?.name ?? "First consultation"} · {minutes} min
                </span>
                {(session || appointment.depositStatus === "paid") && (
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {session && <span className="rounded-full bg-white/80 px-2 py-0.5 text-[0.75rem] text-text-3 ring-1 ring-inset ring-[#0c1a22]/[0.06]">{session}</span>}
                    {appointment.depositStatus === "paid" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#1f7a63]/10 px-2 py-0.5 text-[0.75rem] font-medium text-[color:var(--growth)] ring-1 ring-inset ring-[#1f7a63]/25">
                        <IconCheck width={11} height={11} strokeWidth={2.5} aria-hidden />
                        Deposit paid
                      </span>
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
