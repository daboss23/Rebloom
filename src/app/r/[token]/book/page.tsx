import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TimePicker } from "@/components/booking/TimePicker";
import { VisitCard } from "@/components/booking/VisitCard";
import { FormAlert } from "@/components/ui/FormAlert";
import { IconArrowLeft, IconCheckCircle, IconLock, IconPhone } from "@/components/ui/Icons";
import { NOTICE_HOURS, bookingContext, type BookingContext } from "@/lib/booking/service";
import { bookingWords } from "@/lib/booking/words";
import { formatPrice } from "@/lib/plan/build";

export const metadata: Metadata = { title: "Book your visit" };

/*
 * THESIS: booking continues the report's path. The client isn't shopping a calendar; they take the next step already
 * drawn for them, so the page names that exact visit and why its first day is that day. No month grid.
 * OWN-WORLD: the client journey's ice light, frosted glass, deep-sea chosen states, gold for the one action
 * (DECISIONS D-061). STORY: what this visit is, when it can be, the choice, one gold button.
 * FIRST VIEWPORT: kicker and title, facts line, why-this-date, then the day strip; the gold action pinned below.
 */
export default async function BookPage({ params, searchParams }: PageProps<"/r/[token]/book">) {
  const { token } = await params;
  const query = await searchParams;
  const ctx = await bookingContext(token);
  if (!ctx) notFound();
  const { client, clinic } = ctx.data;
  const phone = clinic.phone.replace(/[^\d+]/g, "");

  const late = Boolean(query.refunded);
  const notice =
    query.cancelled === "refunded"
      ? "Your visit is cancelled and your deposit is on its way back. Refunds usually show within 5 to 10 days."
      : query.cancelled
        ? "Your visit is cancelled."
        : query.refunded
          ? "Your payment came through after that time was booked by someone else, so we've refunded it in full. Please choose another time."
          : null;

  return (
    <article className="booking pb-4 pt-8">
      <Link href={`/r/${token}`} className="t-caption inline-flex min-h-11 items-center gap-2 !text-[13.5px] text-text-2 hover:text-ink">
        <IconArrowLeft width={16} height={16} />
        Your report
      </Link>

      {notice &&
        (late ? (
          <div className="focus-in mt-4">
            <FormAlert>{notice}</FormAlert>
          </div>
        ) : (
          <p role="status" className="glass focus-in mt-4 flex items-start gap-3 px-4 py-3.5 text-[14.5px] leading-relaxed text-ink">
            <IconCheckCircle aria-hidden width={18} height={18} className="mt-[3px] shrink-0 text-[#1f7a63]" />
            {notice}
          </p>
        ))}

      {ctx.upcoming ? (
        <>
          <h1 className="t-h1 focus-in mt-6 [text-wrap:balance]">Your next visit.</h1>
          <VisitCard
            token={token}
            appointment={ctx.upcoming}
            treatment={ctx.upcomingTreatment}
            clinic={clinic}
            canCancel={Date.parse(ctx.upcoming.startsAt) - ctx.now.getTime() >= NOTICE_HOURS * 3_600_000}
            noticeHours={NOTICE_HOURS}
            sessionLabel={ctx.upcomingSession}
            today={ctx.today}
          />
        </>
      ) : ctx.target ? (
        <BookTarget token={token} ctx={ctx} />
      ) : (
        <>
          <h1 className="t-h1 focus-in mt-6 [text-wrap:balance]">Nothing to book from here just now.</h1>
          <p className="t-body mt-4">
            {client.firstName ? `${client.firstName}, your` : "Your"} report has no visit to book at the moment. We&apos;re happy to talk it through.
          </p>
          <a href={`tel:${phone}`} className="btn-gold mt-8 !h-14 w-full gap-2.5 text-[16px]">
            <IconPhone aria-hidden width={18} height={18} />
            Call {clinic.name}
          </a>
        </>
      )}
    </article>
  );
}

function BookTarget({ token, ctx }: { token: string; ctx: BookingContext }) {
  const { clinic, intake } = ctx.data;
  const phone = clinic.phone.replace(/[^\d+]/g, "");
  const target = ctx.target!;
  const words = bookingWords({ target, clinic, intake, today: ctx.today });
  return (
    <>
      <p className="focus-in mt-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-[#1e5a78]">
        <span aria-hidden className="block h-[2px] w-8 rounded-full bg-accent" />
        {words.kicker}
      </p>
      <h1 className="t-h1 focus-in mt-4 [text-wrap:balance]" style={{ animationDelay: "60ms" }}>
        {words.title}
      </h1>
      <p className="focus-in mt-3 text-[15px] text-ink tabular-nums" style={{ animationDelay: "100ms" }}>
        {words.facts}
      </p>
      {(words.why || words.eventNote) && (
        <div className="focus-in mt-4 space-y-2" style={{ animationDelay: "140ms" }}>
          {words.why && <p className="t-body">{words.why}</p>}
          {words.eventNote && <p className="t-body">{words.eventNote}</p>}
        </div>
      )}
      {ctx.depositCents > 0 && (
        <p className="t-caption focus-in mt-4 flex items-start gap-2 !text-[13.5px] text-text-2" style={{ animationDelay: "180ms" }}>
          <IconLock aria-hidden width={16} height={16} className="mt-[2px] shrink-0" />
          A {formatPrice(ctx.depositCents)} deposit holds your time and goes toward the visit. Free to cancel up to {NOTICE_HOURS} hours
          before. Paid securely through Stripe.
        </p>
      )}

      {ctx.days.length > 0 ? (
        <TimePicker token={token} days={ctx.days} depositCents={ctx.depositCents} />
      ) : (
        <div className="glass mt-10 px-6 py-7">
          <p className="text-[15.5px] leading-relaxed text-ink">There are no open times in the next few weeks.</p>
          <p className="t-caption mt-2 !text-[13.5px]">Call us and we&apos;ll find one with you.</p>
          <a href={`tel:${phone}`} className="btn-gold mt-6 !h-12 w-full gap-2.5">
            <IconPhone aria-hidden width={18} height={18} />
            Call {clinic.phone}
          </a>
        </div>
      )}
    </>
  );
}
