import type { Appointment, Clinic, Treatment } from "@/lib/domain";
import { IconCalendar, IconCheckCircle } from "@/components/ui/Icons";
import { CancelVisit } from "./CancelVisit";

const dollars = (cents: number) => `$${Math.round(cents / 100)}`;

/** A booked visit, on the booking page and its confirmation: when, what, where, the deposit, and how to change it. */
export function VisitCard({
  token,
  appointment,
  treatment,
  clinic,
  canCancel,
  noticeHours,
  sessionLabel,
  today,
}: {
  token: string;
  appointment: Appointment;
  treatment: Treatment | null;
  clinic: Clinic;
  canCancel: boolean;
  noticeHours: number;
  sessionLabel: string | null;
  /** "YYYY-MM-DD" in the clinic's time zone, so a visit today says so. */
  today: string;
}) {
  const at = new Date(appointment.startsAt);
  const isToday = new Intl.DateTimeFormat("en-CA", { timeZone: clinic.timezone }).format(at) === today;
  const day = isToday
    ? "Today"
    : new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: clinic.timezone }).format(at);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: clinic.timezone }).format(at);
  const minutes = Math.round((Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)) / 60_000);
  const paid = appointment.depositStatus === "paid";
  const rows: [string, string][] = [
    ["Treatment", [treatment?.name ?? (appointment.kind === "consult" ? "Consultation" : "Your visit"), sessionLabel].filter(Boolean).join(" · ")],
    ["Where", `${clinic.name} · ${clinic.address}`],
    ...(paid ? ([["Deposit", `${dollars(appointment.depositCents)} paid · goes toward your visit`]] as [string, string][]) : []),
  ];

  return (
    <section aria-labelledby="visit-day" className="glass focus-in mt-8 px-6 pb-6 pt-7" style={{ animationDelay: "120ms" }}>
      <p className="t-label flex items-center gap-2 !text-[#1f7a63]">
        <IconCheckCircle aria-hidden width={16} height={16} />
        Confirmed
      </p>
      <h2 id="visit-day" className="mt-3 font-display text-[2.125rem] font-light leading-[1.1] text-ink">
        {day}
      </h2>
      <p className="mt-1.5 text-[1.125rem] text-ink tabular-nums">
        {time} <span className="text-text-3">· {minutes} minutes</span>
      </p>
      <dl className="mt-6 border-t border-[#0c1a22]/[0.08]">
        {rows.map(([term, value]) => (
          <div key={term} className="grid grid-cols-[92px_1fr] gap-3 border-b border-[#0c1a22]/[0.06] py-3.5 last:border-0">
            <dt className="t-label !text-[0.75rem] leading-[1.9]">{term}</dt>
            <dd className="text-[0.9375rem] leading-relaxed text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <a href={`/r/${token}/book/visit.ics`} download="visit.ics" className="btn-ghost mt-5 w-full !h-12 text-[0.9375rem]">
        <IconCalendar width={18} height={18} />
        Add to my calendar
      </a>
      <div className="mt-5 border-t border-[#0c1a22]/[0.08] pt-5">
        {canCancel ? (
          <CancelVisit token={token} appointmentId={appointment.id} refund={paid ? dollars(appointment.depositCents) : null} noticeHours={noticeHours} />
        ) : (
          <p className="t-caption !text-[0.875rem]">
            Your visit is less than {noticeHours} hours away. To change it, please call us on{" "}
            <a href={`tel:${clinic.phone.replace(/[^\d+]/g, "")}`} className="text-ink underline decoration-[#0c1a22]/30 underline-offset-4">
              {clinic.phone}
            </a>
            .
          </p>
        )}
      </div>
    </section>
  );
}
