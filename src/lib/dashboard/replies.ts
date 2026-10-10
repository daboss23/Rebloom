// Who has written back and is waiting on an answer (DECISIONS D-081), in the small shape the dashboard's live notice
// needs (D-089). Pure, so the layout, the endpoint the notice checks and the tests all count the same way.

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
