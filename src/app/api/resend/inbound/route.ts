// A client's email reply, delivered by Resend (DECISIONS D-081). Resend signs each delivery; the event names the email,
// and its words are fetched from Resend's API. Safe to repeat, as Resend may: one row per email.
import { after } from "next/server";
import { draftForReply } from "@/lib/agent/desk";
import { resend } from "@/lib/email/resend";
import { env, features } from "@/lib/env";
import { takeInEmail } from "@/lib/replies/email";
import { appOrigin } from "@/lib/origin";
import { json } from "@/lib/scans/access";
import { getStore } from "@/lib/store";

/** A reply may start the agent's draft, which runs after the answer to Resend (D-093). */
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!features.replies) return json({ error: "Replies aren't set up." }, 503);
  const h = request.headers;
  const payload = await request.text();
  let event: ReturnType<ReturnType<typeof resend>["webhooks"]["verify"]>;
  try {
    // The exact bytes Resend signed: read as text, never parsed and re-serialised first.
    event = resend().webhooks.verify({
      payload,
      headers: {
        id: h.get("svix-id") ?? h.get("webhook-id") ?? "",
        timestamp: h.get("svix-timestamp") ?? h.get("webhook-timestamp") ?? "",
        signature: h.get("svix-signature") ?? h.get("webhook-signature") ?? "",
      },
      webhookSecret: env.RESEND_WEBHOOK_SECRET!,
    });
  } catch {
    return json({ error: "Signature doesn't match." }, 400);
  }
  if (event.type !== "email.received") return json({ received: true, ignored: event.type });

  const { email_id: id, from, to, cc, received_for, subject, created_at } = event.data;
  const outcome = await takeInEmail({ id, from, to, cc, received_for, subject, created_at });
  // Resend tries again later when reading the email fails; anything else is an answer.
  if (outcome.status === "error") {
    console.error(`Reply webhook: couldn't take in ${id}: ${outcome.message}`);
    return json({ error: outcome.message }, 502);
  }
  if (outcome.status === "saved") {
    // The agent starts on an answer straight away (D-093), so it may be ready before Dana opens the alert.
    const [client, origin] = [await getStore().getClient(outcome.clientId), await appOrigin()];
    if (client) after(() => draftForReply(client, outcome.messageId, origin));
  }
  return json({ received: true, status: outcome.status });
}
