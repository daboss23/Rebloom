import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { VisitCard } from "@/components/booking/VisitCard";
import { Bloom } from "@/components/dashboard/Bloom";
import { IconArrowLeft } from "@/components/ui/Icons";
import { NOTICE_HOURS, bookingContext } from "@/lib/booking/service";
import { features } from "@/lib/env";

export const metadata: Metadata = { title: "You're booked" };

/** Where a booking lands: the visit, confirmed, with the bloom opening beside it (DECISIONS D-065). */
export default async function BookedPage({ params }: PageProps<"/r/[token]/book/done">) {
  const { token } = await params;
  const ctx = await bookingContext(token);
  if (!ctx) notFound();
  if (!ctx.upcoming) redirect(`/r/${token}/book`);
  const { client, clinic } = ctx.data;
  // The confirmation is emailed to a real client when Resend is set up; a demo client's is only logged.
  const emailed = features.email && !client.isDemo && Boolean(client.email);

  return (
    <article className="pb-4 pt-8">
      <Link href={`/r/${token}`} className="t-caption inline-flex min-h-11 items-center gap-2 !text-[13.5px] hover:text-ink">
        <IconArrowLeft width={16} height={16} />
        Your report
      </Link>
      <Bloom size={36} unfurl className="mt-6 text-[#9e4a5d]" />
      <h1 className="t-h1 focus-in mt-4 [text-wrap:balance]">{client.firstName ? `You're booked, ${client.firstName}.` : "You're booked."}</h1>
      <p className="t-body focus-in mt-4" style={{ animationDelay: "80ms" }}>
        {emailed ? `We've sent the details to ${client.email}, with an invite for your calendar.` : "Everything you need is below, and on your report."}
      </p>
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
      <Link href={`/r/${token}`} className="btn-gold mt-8 !h-14 w-full text-[16px]">
        Back to your report
      </Link>
    </article>
  );
}
