// Unsubscribing from the clinic's emails (DECISIONS D-086). Pure, so the engine, the pages and the tests share it.
// An unsubscribe is a line in the client's conversation, as a STOP to texts is (D-081): Dana sees when it happened,
// and the queue reads it. It belongs to the email address, not to one client record: the same person who scanned
// twice is two clients on one address, and unsubscribing from either stops both.

import type { Client, Message } from "@/lib/domain";

/** They unsubscribed: by the link in an email, their mail app's Unsubscribe button, or by asking Dana. */
export const OPT_OUT_TYPE = "email_opt_out";
/** "Keep getting emails" on the unsubscribe page. The only thing that lifts an unsubscribe. */
export const OPT_IN_TYPE = "email_opt_in";

export const isEmailPreference = (m: Pick<Message, "type">) => m.type === OPT_OUT_TYPE || m.type === OPT_IN_TYPE;

const at = (m: Message) => m.sentAt ?? m.createdAt;
const addressKey = (email: string | null | undefined) => email?.trim().toLowerCase() || null;

/**
 * Every address whose latest say is "unsubscribe", with when they said it. A later consent at the report gate doesn't
 * lift it: only pressing "Keep getting emails" does, so a way out once taken stays taken.
 */
export function unsubscribedAddresses(clients: Pick<Client, "id" | "email">[], messages: Message[]): Map<string, string> {
  const addressOf = new Map(clients.map((c) => [c.id, addressKey(c.email)]));
  const latest = new Map<string, Message>();
  for (const m of messages) {
    if (!isEmailPreference(m)) continue;
    const address = addressOf.get(m.clientId);
    if (!address) continue;
    const before = latest.get(address);
    if (!before || at(m) >= at(before)) latest.set(address, m);
  }
  return new Map([...latest].filter(([, m]) => m.type === OPT_OUT_TYPE).map(([address, m]) => [address, at(m)]));
}

/** When this client's address unsubscribed, or null while emails still reach them. */
export function unsubscribedAt(client: Pick<Client, "email">, unsubscribed: Map<string, string>): string | null {
  const address = addressKey(client.email);
  return address ? (unsubscribed.get(address) ?? null) : null;
}

/**
 * Dana can email a client from the brief unless they've unsubscribed. After that, only to answer something they wrote
 * since: a conversation they started, not a campaign.
 */
export function canWriteByEmail({ email, unsubscribedAt, messages }: { email: string | null; unsubscribedAt: string | null; messages: Message[] }): boolean {
  if (!email) return false;
  if (!unsubscribedAt) return true;
  return messages.some((m) => m.status === "received" && at(m) > unsubscribedAt);
}
