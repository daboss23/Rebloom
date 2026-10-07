// Stripe's word on a deposit (DECISIONS D-065), for when the client closes the tab before coming back: a paid
// Checkout confirms the visit, an expired one lets the held time go. Both are safe to repeat, as Stripe may.
import { env } from "@/lib/env";
import { releaseHold, settleBooking } from "@/lib/booking/service";
import { depositsLive, fromSession, webhookEvent } from "@/lib/payments/stripe";
import { json } from "@/lib/scans/access";

export async function POST(request: Request) {
  if (!depositsLive() || !env.STRIPE_WEBHOOK_SECRET) return json({ error: "Stripe webhooks aren't set up." }, 503);
  const signature = request.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing signature." }, 400);
  let event: ReturnType<typeof webhookEvent>;
  try {
    // The exact bytes Stripe signed: read as text, never parsed and re-serialised first.
    event = webhookEvent(await request.text(), signature);
  } catch {
    return json({ error: "Signature doesn't match." }, 400);
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const { appointmentId, paid, paymentIntent } = fromSession(event.data.object);
    if (appointmentId && paid) await settleBooking(appointmentId, paymentIntent);
  } else if (event.type === "checkout.session.expired") {
    const { appointmentId } = fromSession(event.data.object);
    if (appointmentId) await releaseHold(appointmentId);
  }
  return json({ received: true });
}
