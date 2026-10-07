// Where Stripe's Checkout page sends the client back (DECISIONS D-065). Paid: the visit is confirmed here at once,
// whether or not the webhook has arrived yet, and the client lands on the confirmation. Left without paying: the
// held time is let go and they're back at the times. The report token never went to Stripe, so it's found from the visit.
import { settleBooking, releaseHold } from "@/lib/booking/service";
import { sandboxNow } from "@/lib/sandbox";
import { checkoutOutcome, depositsLive } from "@/lib/payments/stripe";
import { getStore } from "@/lib/store";

const go = (request: Request, path: string) => Response.redirect(new URL(path, request.url), 303);

async function reportPath(clientId: string): Promise<string | null> {
  const store = getStore();
  const client = await store.getClient(clientId);
  if (!client?.email) return null;
  return `/r/${(await store.getOrCreateReport(client.id, await sandboxNow())).token}`;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const hold = params.get("hold");
  if (hold) {
    const appointment = await releaseHold(hold);
    // Only an unpaid hold leads back to its report: a settled visit's id opens nothing.
    const report = appointment?.depositStatus === "pending" ? await reportPath(appointment.clientId) : null;
    return go(request, report ? `${report}/book` : "/");
  }

  const sessionId = params.get("session_id");
  if (!sessionId || !depositsLive()) return go(request, "/");
  let outcome: Awaited<ReturnType<typeof checkoutOutcome>>;
  try {
    outcome = await checkoutOutcome(sessionId);
  } catch (e) {
    console.error(`Checkout return not read: ${e instanceof Error ? e.message : String(e)}`);
    return go(request, "/");
  }
  const appointment = outcome.appointmentId ? await getStore().getAppointment(outcome.appointmentId) : null;
  const report = appointment ? await reportPath(appointment.clientId) : null;
  if (!appointment || !report) return go(request, "/");
  if (!outcome.paid) return go(request, `${report}/book`);
  const settled = await settleBooking(appointment.id, outcome.paymentIntent);
  return go(request, settled === "refunded" ? `${report}/book?refunded=1` : `${report}/book/done`);
}
