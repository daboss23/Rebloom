// What the open dashboard watches for (D-089, D-090): who has written back and waits on an answer (D-081), and who has
// just scanned themselves in as a new client. In the small shapes the live notice needs. Pure, so the layout, the
// endpoint the notice checks and the tests all count the same way.

import type { Client, Message } from "@/lib/domain";
import { at, waitingReply } from "@/lib/replies/thread";

export interface WaitingReply {
  /** The reply's own id: a notice is shown once per reply. */
  id: string;
  clientId: string;
  name: string;
  first: string;
  channel: Message["channel"];
  body: string;
  at: string;
}

/** Newest first. Clients without a first name are new leads still mid-intake, as on Today. */
export function waitingReplies(clients: Client[], messages: Message[]): WaitingReply[] {
  const byClient = new Map<string, Message[]>();
  for (const m of messages) {
    const list = byClient.get(m.clientId);
    if (list) list.push(m);
    else byClient.set(m.clientId, [m]);
  }
  const waiting: WaitingReply[] = [];
  for (const client of clients) {
    const reply = client.firstName ? waitingReply(byClient.get(client.id) ?? []) : null;
    if (!reply) continue;
    waiting.push({
      id: reply.id,
      clientId: client.id,
      name: [client.firstName, client.lastName].filter(Boolean).join(" "),
      first: client.firstName!,
      channel: reply.channel,
      body: reply.body.replace(/\s+/g, " ").trim().slice(0, 280),
      at: at(reply),
    });
  }
  return waiting.sort((a, b) => b.at.localeCompare(a.at));
}

export interface NewClient {
  clientId: string;
  name: string;
  first: string;
  at: string;
}

/**
 * People who scanned themselves into this book and asked for their results: not sample clients, and named, since a
 * name is only given at the report gate. Newest first.
 */
export function newClients(clients: Client[]): NewClient[] {
  return clients
    .filter((c) => !c.demoKey && c.firstName)
    .map((c) => ({ clientId: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(" "), first: c.firstName!, at: c.createdAt }))
    .sort((a, b) => b.at.localeCompare(a.at));
}
