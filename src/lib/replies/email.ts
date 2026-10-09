import "server-only";
// Taking in one email reply from Resend (DECISIONS D-081, D-084). The webhook calls it when Resend delivers an
// event; the dashboard calls it for anything Resend received that the webhook never brought (syncEmailReplies).
// Either way a reply is kept once: its Resend id is its outbox key.

import { resend } from "@/lib/email/resend";
import { env, features } from "@/lib/env";
import { getStore } from "@/lib/store";
import { htmlToText, isAutomatic, stripQuoted } from "./parse";
import { clientForEmail, saveReply, type Received } from "./receive";
import { inboundKey } from "./thread";

export interface ReceivedEmail {
  id: string;
  from: string;
  to?: string[] | null;
  cc?: string[] | null;
  received_for?: string[] | null;
  subject?: string | null;
  created_at?: string;
}

export type EmailOutcome = Received | { status: "ignored"; reason: string } | { status: "error"; message: string };

/** Finds the client, reads the email's words from Resend, and adds the reply to their conversation. */
export async function takeInEmail(summary: ReceivedEmail): Promise<EmailOutcome> {
  const { id, from, subject } = summary;
  const client = await clientForEmail([...(summary.received_for ?? []), ...(summary.to ?? []), ...(summary.cc ?? [])], from);
  if (!client) return { status: "ignored", reason: "unknown recipient" };
  // Already kept (the webhook and the fetch can both see it): don't read it from Resend again.
  if ((await getStore().listClientMessages(client.id)).some((m) => m.dedupeKey === inboundKey(id))) return { status: "duplicate", clientId: client.id };

  const { data: email, error } = await resend().emails.receiving.get(id);
  if (error || !email) return { status: "error", message: error?.message ?? "Couldn't read the email." };
  if (isAutomatic({ headers: email.headers, from, subject: subject ?? null })) return { status: "ignored", reason: "automatic" };

  const words = stripQuoted(email.text ?? htmlToText(email.html ?? ""));
  const files = email.attachments?.length ?? 0;
  const body = words || (files ? `Sent ${files === 1 ? "an attachment" : `${files} attachments`}. Attachments aren't shown here yet.` : "");
  if (!body) return { status: "ignored", reason: "empty" };
  return saveReply(client, { channel: "email", providerId: id, sender: from, subject: subject || null, body, receivedAt: summary.created_at ? new Date(summary.created_at) : undefined });
}

/** How often one server asks Resend for new replies, at most. */
const SYNC_EVERY_MS = 60_000;
/** Only recent mail: older replies were either taken in already or belong to deleted clients. */
const SYNC_WINDOW_MS = 14 * 86_400_000;
let lastSync = 0;

/**
 * The safety net under the webhook (D-084): asks Resend for the replies it received lately and takes in any that
 * aren't kept yet. Runs when the dashboard opens, at most once a minute per server, and never throws: if Resend is
 * slow or down, the dashboard opens as before.
 */
export async function syncEmailReplies(now = Date.now()): Promise<number> {
  if (!features.email || !env.REPLY_DOMAIN || now - lastSync < SYNC_EVERY_MS) return 0;
  lastSync = now;
  try {
    const { data, error } = await resend().emails.receiving.list({ limit: 50 });
    // Said in the logs: a sending-only API key can't read received mail, and that's the usual reason.
    if (error || !data) {
      console.error(`Reply sync: Resend wouldn't list received emails (${error?.name ?? "no data"}): ${error?.message ?? ""}`);
      return 0;
    }
    const ours = data.data.filter(
      (e) =>
        now - Date.parse(e.created_at) < SYNC_WINDOW_MS &&
        [...(e.received_for ?? []), ...(e.to ?? [])].some((a) => a.toLowerCase().includes(`@${env.REPLY_DOMAIN}`)),
    );
    let saved = 0;
    for (const e of ours) {
      const outcome = await takeInEmail(e).catch((err) => ({ status: "error" as const, message: err instanceof Error ? err.message : String(err) }));
      if (outcome.status === "saved") saved++;
      if (outcome.status === "error") console.error(`Reply sync: couldn't take in ${e.id}: ${outcome.message}`);
    }
    return saved;
  } catch (e) {
    console.error(`Reply sync failed: ${e instanceof Error ? e.message : String(e)}`);
    return 0;
  }
}
