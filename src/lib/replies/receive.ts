import "server-only";
// Where a reply lands (DECISIONS D-081). The webhooks verify the provider's signature, then hand the message here:
// it finds the client, keeps only their new words, and adds it to their conversation once.

import { virtualNow } from "@/lib/clock";
import type { Client, Message } from "@/lib/domain";
import { env } from "@/lib/env";
import { getStore } from "@/lib/store";
import { clientIdFromAddress } from "./address";
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

/** Adds the reply to the client's conversation, on their sandbox's clock and never before what came before it. */
export async function saveReply(client: Client, inbound: Inbound): Promise<Received> {
  const store = getStore();
  const [messages, sandbox] = await Promise.all([
    store.listClientMessages(client.id),
    client.sandboxId ? store.getSandbox(client.sandboxId) : Promise.resolve(null),
  ]);
  // Real time for the valve, as every limit does (D-016).
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  if (messages.filter((m) => isReply(m) && m.createdAt >= dayAgo).length >= REPLIES_PER_CLIENT_PER_DAY) {
    return { status: "limited", clientId: client.id };
  }
  // The demo clock can run ahead (D-016): a reply belongs after the message it answers, on the same clock.
  const clock = virtualNow({ demoToday: env.DEMO_TODAY, offsetDays: sandbox?.clockOffsetDays ?? 0 });
  const latest = messages.reduce((t, m) => Math.max(t, Date.parse(at(m))), 0);
  const receivedAt = new Date(Math.max(clock.getTime(), latest + 1000)).toISOString();

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
  return message ? { status: "saved", clientId: client.id, messageId: message.id } : { status: "duplicate", clientId: client.id };
}
