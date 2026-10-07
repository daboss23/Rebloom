import "server-only";
// The booking deposit through Stripe, test mode only (brief section 4, DECISIONS D-065). Stripe's hosted Checkout
// takes the card, so no card detail and no Stripe key ever touch this app's pages. The report token never goes to
// Stripe either: it comes back with the Checkout session's id, and the server finds the visit from that.

import Stripe from "stripe";
import { env } from "@/lib/env";

let client: Stripe | undefined;

/** True when deposits are taken. Without a key, booking still works and says no deposit was taken. */
export function depositsLive(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

export function stripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set.");
  // env.ts refuses sk_live_ keys, so this can only ever reach test mode.
  // STRIPE_API_BASE points at a local stand-in in browser tests (tests/e2e/mock-stripe.mjs), never in production.
  const base = env.STRIPE_API_BASE ? new URL(env.STRIPE_API_BASE) : null;
  client ??= new Stripe(env.STRIPE_SECRET_KEY, {
    maxNetworkRetries: 1,
    timeout: 15_000,
    ...(base ? { host: base.hostname, port: base.port, protocol: base.protocol.replace(":", "") as "http" | "https" } : {}),
  });
  return client;
}

/** Stripe's shortest Checkout session. The time is held this long while the client pays. */
export const CHECKOUT_MINUTES = 30;

/** A hosted Checkout page for one visit's deposit. Returns the page to send the client to. */
export async function depositCheckout(input: {
  appointmentId: string;
  clinicName: string;
  treatmentName: string;
  when: string;
  depositCents: number;
  email: string;
  origin: string;
  noticeHours: number;
}): Promise<{ id: string; url: string }> {
  const session = await stripe().checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: input.depositCents,
            product_data: {
              name: `Deposit · ${input.treatmentName}`,
              description: `${input.clinicName} · ${input.when}. Goes toward your visit, refundable up to ${input.noticeHours} hours before.`,
            },
          },
        },
      ],
      customer_email: input.email,
      client_reference_id: input.appointmentId,
      metadata: { appointmentId: input.appointmentId },
      payment_intent_data: { metadata: { appointmentId: input.appointmentId }, description: `${input.clinicName} deposit · ${input.when}` },
      success_url: `${input.origin}/book/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${input.origin}/book/return?hold=${input.appointmentId}`,
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_MINUTES * 60 + 60,
    },
    // One Checkout page per held time, however often the button is pressed.
    { idempotencyKey: `deposit:${input.appointmentId}` },
  );
  if (!session.url) throw new Error("Stripe returned no Checkout page.");
  return { id: session.id, url: session.url };
}

/** The visit and payment behind a Checkout session, as Stripe tells it. */
export async function checkoutOutcome(sessionId: string): Promise<{ appointmentId: string | null; paid: boolean; paymentIntent: string | null }> {
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  return fromSession(session);
}

export function fromSession(session: Stripe.Checkout.Session): { appointmentId: string | null; paid: boolean; paymentIntent: string | null } {
  const pi = session.payment_intent;
  return {
    appointmentId: session.metadata?.appointmentId ?? session.client_reference_id ?? null,
    paid: session.payment_status === "paid",
    paymentIntent: typeof pi === "string" ? pi : (pi?.id ?? null),
  };
}

/** Gives a deposit back in full. Safe to call twice for the same visit. */
export async function refundDeposit(appointmentId: string, paymentIntent: string): Promise<void> {
  await stripe().refunds.create({ payment_intent: paymentIntent, metadata: { appointmentId } }, { idempotencyKey: `refund:${appointmentId}` });
}

/** A webhook event, checked against the endpoint's signing secret. Throws when it doesn't match. */
export function webhookEvent(body: string, signature: string): Stripe.Event {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
  return stripe().webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET);
}
