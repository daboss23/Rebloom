import "server-only";
// Where a reply lands (DECISIONS D-081). The webhooks verify the provider's signature, then hand the message here:
// it finds the client, keeps only their new words, and adds it to their conversation once.

import { sandboxClock, virtualNow } from "@/lib/clock";
import type { Client, Message } from "@/lib/domain";
import { env } from "@/lib/env";
import { getStore } from "@/lib/store";
import { clientIdFromAddress } from "./address";
import { alertClinic } from "./alert";
import { addressOf } from "./parse";
import { REPLY_TYPE, at, inboundKey, isReply } from "./thread";

/** A safety valve: past this many replies in a day, one client's address or number is ignored until tomorrow. */
export const REPLIES_PER_CLIENT_PER_DAY = 30;

export interface Inbound {
  channel: Message["channel"];
  /** Resend's email id or Twilio's MessageSid: a webhook delivered twice keeps one row. */
  providerId: string;
  /** The address or number it came from. */
  sender: string;
  subject: string | null;
  body: string;
  /** When the provider received it, if known: a reply fetched late still reads at the time it was sent. */
  receivedAt?: Date;
}

export type Received =
  | { status: "saved"; clientId: string; messageId: string }
  | { status: "duplicate" | "unknown" | "limited"; clientId?: string };

/**
 * The client an email reply is for: the reply address it was sent to, whose signature proves it's theirs. Failing
 * that, the one real client with the sender's address, so a reply to an older email, sent before replies were set up,
 * still lands. Two clients on one address is a guess, so it isn't made.
 */
export async function clientForEmail(recipients: string[], from: string): Promise<Client | null> {
  const store = getStore();
  for (const address of recipients) {
    const id = clientIdFromAddress(addressOf(address) ?? address);
    if (id) return store.getClient(id);
  }
  const sender = addressOf(from);
  if (!sender) return null;
  const matches = await store.findClientsByContact({ email: sender });
  return matches.length === 1 ? matches[0] : null;
}

/**
 * The client a text is from. A number can belong to more than one client (the same person scanned twice): the one
 * the clinic last texted, else the newest.
 */
export async function clientForPhone(phone: string): Promise<Client | null> {
  const store = getStore();
  const matches = await store.findClientsByContact({ phone });
  if (matches.length <= 1) return matches[0] ?? null;
  const lastText = await Promise.all(
    matches.map(async (c) => {
      const texts = (await store.listClientMessages(c.id)).filter((m) => m.channel === "sms" && m.status === "sent");
      return { client: c, at: texts.length ? at(texts[texts.length - 1]) : "" };
    }),
  );
  return lastText.sort((a, b) => b.at.localeCompare(a.at))[0].client;
}

/**
 * When something the client did lands in their conversation: on their sandbox's clock, which the demo can run ahead
 * (D-016), and never before what came before it, so a reply follows the message it answers.
 */
export async function conversationTime(client: Client, messages: Message[], real?: Date): Promise<string> {
  const sandbox = client.sandboxId ? await getStore().getSandbox(client.sandboxId) : null;
  const clock = virtualNow(sandboxClock(env.DEMO_TODAY, sandbox), real);
  const latest = messages.reduce((t, m) => Math.max(t, Date.parse(at(m))), 0);
  return new Date(Math.max(clock.getTime(), latest + 1000)).toISOString();
}

/** Adds the reply to the client's conversation, on their sandbox's clock and never before what came before it. */
export async function saveReply(client: Client, inbound: Inbound): Promise<Received> {
  const store = getStore();
  const messages = await store.listClientMessages(client.id);
  // Real time for the valve, as every limit does (D-016).
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  if (messages.filter((m) => isReply(m) && m.createdAt >= dayAgo).length >= REPLIES_PER_CLIENT_PER_DAY) {
    return { status: "limited", clientId: client.id };
  }
  const receivedAt = await conversationTime(client, messages, inbound.receivedAt);

  const message = await store.addMessage({
    clinicId: client.clinicId,
    clientId: client.id,
    sandboxId: client.sandboxId,
    type: REPLY_TYPE,
    channel: inbound.channel,
    subject: inbound.subject,
    body: inbound.body,
    status: "received",
    dedupeKey: inboundKey(inbound.providerId),
    scheduledFor: null,
    sentAt: receivedAt,
    createdAt: receivedAt,
    sender: inbound.sender,
  });
  if (!message) return { status: "duplicate", clientId: client.id };
  // The clinic hears about it now, wherever Settings says (D-087). Never stops the reply being kept.
  await alertClinic({ client, reply: message, before: messages, receivedAt: inbound.receivedAt ?? new Date() });
  return { status: "saved", clientId: client.id, messageId: message.id };
}
