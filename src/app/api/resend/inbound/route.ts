// A client's email reply, delivered by Resend (DECISIONS D-081). Resend signs each delivery; the event names the email,
// and its words are fetched from Resend's API. Safe to repeat, as Resend may: one row per email.
import { resend } from "@/lib/email/resend";
import { env, features } from "@/lib/env";
import { htmlToText, isAutomatic, stripQuoted } from "@/lib/replies/parse";
import { clientForEmail, saveReply } from "@/lib/replies/receive";
import { json } from "@/lib/scans/access";

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

  const { email_id: emailId, from, to, cc, received_for: receivedFor, subject } = event.data;
  const client = await clientForEmail([...(receivedFor ?? []), ...(to ?? []), ...(cc ?? [])], from);
  // Not for anyone we know: say so and stop, so Resend doesn't keep trying.
  if (!client) return json({ received: true, ignored: "unknown recipient" });

  const { data: email, error } = await resend().emails.receiving.get(emailId);
  // Resend tries again later when this fails.
  if (error || !email) return json({ error: error?.message ?? "Couldn't read the email." }, 502);
  if (isAutomatic({ headers: email.headers, from, subject })) return json({ received: true, ignored: "automatic" });

  const words = stripQuoted(email.text ?? htmlToText(email.html ?? ""));
  const files = email.attachments?.length ?? 0;
  const body = words || (files ? `Sent ${files === 1 ? "an attachment" : `${files} attachments`}. Attachments aren't shown here yet.` : "");
  if (!body) return json({ received: true, ignored: "empty" });

  const result = await saveReply(client, { channel: "email", providerId: emailId, sender: from, subject: subject || null, body });
  return json({ received: true, status: result.status });
}
