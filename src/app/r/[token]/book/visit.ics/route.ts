// "Add to my calendar": the booked visit as an invite any calendar opens (DECISIONS D-065). The token is the key.
import { bookingContext } from "@/lib/booking/service";
import { visitInvite } from "@/lib/email/booking";
import { appOrigin } from "@/lib/origin";
import { getStore } from "@/lib/store";

export async function GET(_request: Request, ctx: RouteContext<"/r/[token]/book/visit.ics">) {
  const { token } = await ctx.params;
  const booking = await bookingContext(token);
  const visit = booking?.upcoming;
  if (!booking || !visit) return new Response("Not found", { status: 404 });
  const treatment = (await getStore().listTreatments(booking.data.clinic.id)).find((t) => t.id === visit.treatmentId);
  const ics = visitInvite({
    uid: visit.id,
    clinic: booking.data.clinic,
    treatmentName: treatment?.name ?? (visit.kind === "consult" ? "Consultation" : "Your visit"),
    startsAt: visit.startsAt,
    endsAt: visit.endsAt,
    reportUrl: `${await appOrigin()}/r/${token}`,
    now: booking.now,
  });
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="visit.ics"',
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}
