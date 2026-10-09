// What a queue row needs in the browser: plain data, no rows from the store.
import type { QueueAction, QueueItem, TriggerKind } from "@/lib/rebook/engine";
import { TRIGGER_LABEL } from "@/lib/rebook/engine";
import { formatPrice } from "@/lib/plan/build";
import type { ClientFacts } from "@/lib/rebook/engine";
import { fullName } from "@/lib/dashboard/view";

export interface QueueRow {
  clientId: string;
  dedupeKey: string;
  name: string;
  email: string | null;
  phone: string | null;
  href: string;
  kind: TriggerKind;
  label: string;
  action: QueueAction;
  reason: string;
  value: string | null;
  valueNote: string | null;
  atRisk: boolean;
  draft: { subject: string; body: string } | null;
  /** The pre-written text, when they agreed to texts (D-080). */
  text: string | null;
  /** Who a text shows as coming from: the clinic's name. */
  sender: string;
  /** Their reply, while it waits on an answer (D-081): answer it before sending anything pre-written. */
  reply: string | null;
}

export function toQueueRow(item: QueueItem, facts: ClientFacts, clinicName: string): QueueRow {
  return {
    clientId: item.clientId,
    dedupeKey: item.dedupeKey,
    name: fullName(facts.client),
    email: facts.client.email,
    phone: facts.client.phone,
    href: `/dashboard/clients/${item.clientId}`,
    kind: item.kind,
    label: TRIGGER_LABEL[item.kind],
    action: item.action,
    reason: item.reason,
    value: item.valueCents ? formatPrice(item.valueCents) : null,
    valueNote: item.valueNote,
    atRisk: item.atRisk,
    draft: item.draft,
    text: item.text,
    sender: clinicName,
    reply: facts.reply ? excerpt(facts.reply.body) : null,
  };
}

/** The first words of a reply, on one line. */
export function excerpt(text: string, max = 110): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= max ? line : `${line.slice(0, max).replace(/\s+\S*$/, "")}…`;
}
