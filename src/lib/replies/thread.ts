// A client's conversation with the clinic (DECISIONS D-081): what the clinic sent and what the client wrote back, in
// one order, and which reply is still waiting on Dana. Pure, so the engine, the pages and the tests share it.

import type { Message } from "@/lib/domain";
import { toUsE164 } from "@/lib/sms/text";
import { optKeyword } from "./parse";

/** A reply from the client. */
export const REPLY_TYPE = "reply";
/** Dana's answer, written on the brief. */
export const ANSWER_TYPE = "answer";
/** "Mark as handled": a reply that needed no answer. A line, never a message to the client. */
export const HANDLED_TYPE = "reply_handled";

/** The outbox key for a reply's provider id, so a webhook delivered twice keeps one row. */
export const inboundKey = (providerId: string) => `inbound:${providerId}`;
/** The key of the "handled" line for one reply, so Undo can take it back. */
export const handledKey = (replyId: string) => `reply:${replyId}`;

/** When it happened: sent or received, else when it was written. */
export const at = (m: Message) => m.sentAt ?? m.createdAt;

export const isReply = (m: Message) => m.status === "received";

/** Sent on their own, not by Dana: the report link, booking emails, and demo copies (DEMO_COPY_TYPE). */
const automatic = (m: Pick<Message, "type">) => m.type === "report_link" || m.type.startsWith("booking_") || m.type === "demo_copy";

/** Something Dana sent herself: an answer, or a rebook message from the queue. Either one answers a reply. */
export const byHand = (m: Message) => m.status === "sent" && !automatic(m);

const inOrder = (messages: Message[]) => [...messages].sort((a, b) => at(a).localeCompare(at(b)));

/**
 * The client's latest reply while it waits on the clinic: nothing sent by hand since, and not marked handled.
 * A STOP or START on its own is the carrier's business, not a question, so it never waits.
 */
export function waitingReply(messages: Message[]): Message | null {
  const replies = inOrder(messages.filter(isReply));
  const last = replies[replies.length - 1];
  if (!last || (last.channel === "sms" && optKeyword(last.body))) return null;
  const answered = messages.some(
    (m) => (byHand(m) && at(m) >= at(last)) || (m.type === HANDLED_TYPE && m.dedupeKey === handledKey(last.id)),
  );
  return answered ? null : last;
}

/** The client replied STOP to the clinic's texts, and not START since. Twilio refuses texts to them until they do. */
export function optedOutOfTexts(messages: Message[]): boolean {
  const keywords = inOrder(messages.filter((m) => isReply(m) && m.channel === "sms")).map((m) => optKeyword(m.body)).filter(Boolean);
  return keywords[keywords.length - 1] === "stop";
}

export interface ThreadEntry {
  id: string;
  /** From the client, from the clinic, or a note such as "Called by Dana.". */
  side: "client" | "clinic" | "note";
  channel: Message["channel"];
  subject: string | null;
  body: string;
  at: string;
  /** For the clinic's messages: logged in the demo, sent, or failed. */
  status: Message["status"];
  /** Sent on its own (the report link, a booking email), not written by Dana. */
  automatic: boolean;
  /** For a reply: where it came from, when that isn't the address or number on file. */
  sender: string | null;
}

/** Everything in the conversation, oldest first. Demo copies are for whoever tried the demo, so they stay out. */
export function thread(messages: Message[], onFile: { email: string | null; phone: string | null } = { email: null, phone: null }): ThreadEntry[] {
  const known = [onFile.email?.toLowerCase(), toUsE164(onFile.phone)].filter(Boolean);
  return inOrder(messages.filter((m) => m.type !== "demo_copy" && m.status !== "draft" && m.status !== "queued")).map((m) => ({
    id: m.id,
    side: isReply(m) ? "client" : m.status === "skipped" ? "note" : "clinic",
    channel: m.channel,
    subject: m.subject,
    body: m.body,
    at: at(m),
    status: m.status,
    automatic: !isReply(m) && automatic(m),
    sender: isReply(m) && m.sender && !known.includes(m.sender.toLowerCase()) ? m.sender : null,
  }));
}

/** "Re: Your skin report", for an email answer. Never "Re: Re:". */
export function replySubject(subject: string | null | undefined, fallback: string): string {
  const base = (subject ?? "").trim() || fallback;
  return /^re:/i.test(base) ? base : `Re: ${base}`;
}

/**
 * Dana can answer by text when the client said yes to texts, or texted the clinic themselves, and hasn't replied STOP.
 * Answering someone who wrote in is a conversation, not a campaign, so it needs no rebook consent.
 */
export function canAnswerByText({ phone, canText, messages }: { phone: string | null; canText: boolean; messages: Message[] }): boolean {
  if (!toUsE164(phone) || optedOutOfTexts(messages)) return false;
  return canText || messages.some((m) => isReply(m) && m.channel === "sms");
}

/** The subject the conversation is under: the client's latest email reply, else the clinic's latest email. */
export function threadSubject(messages: Message[]): string | null {
  const emails = inOrder(messages.filter((m) => m.channel === "email" && m.subject && m.type !== "demo_copy" && m.status !== "skipped"));
  return emails[emails.length - 1]?.subject ?? null;
}
