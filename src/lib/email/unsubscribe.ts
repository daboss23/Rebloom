import "server-only";
// The way out of the clinic's emails (DECISIONS D-086). Every reminder and progress email carries a link to a page on
// the clinic's site, and the List-Unsubscribe headers mail apps turn into their own one-click Unsubscribe button
// (RFC 8058). Both are keyed by a signed token for the client, so nobody can unsubscribe someone else.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Client, Clinic, Message } from "@/lib/domain";
import { localSecret } from "@/lib/env";
import { conversationTime } from "@/lib/replies/receive";
import { optedOutOfTexts } from "@/lib/replies/thread";
import { getStore } from "@/lib/store";
import { OPT_IN_TYPE, OPT_OUT_TYPE, isEmailPreference, unsubscribedAddresses, unsubscribedAt } from "./opt-out";

const sign = (hex: string) => createHmac("sha256", `${localSecret()}:unsubscribe`).update(hex).digest("hex").slice(0, 16);

const TOKEN = /^([0-9a-f]{32})([0-9a-f]{16})$/;

/** The client's own token: their id and its signature, 48 characters. */
export function unsubscribeToken(clientId: string): string | null {
  const hex = clientId.replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(hex) ? `${hex}${sign(hex)}` : null;
}

/** The client a token belongs to, when its signature holds. */
export function clientIdFromUnsubscribeToken(token: string): string | null {
  const match = token.trim().toLowerCase().match(TOKEN);
  if (!match) return null;
  const [, hex, signature] = match;
  if (!timingSafeEqual(Buffer.from(sign(hex)), Buffer.from(signature))) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface UnsubscribeLinks {
  /** The page the link in the email opens, on the clinic's site. */
  page: string;
  /** For the email's headers: a mail app's Unsubscribe button posts here, with no page in between. */
  headers: { "List-Unsubscribe": string; "List-Unsubscribe-Post": string };
}

export function unsubscribeLinks(origin: string, clinic: Pick<Clinic, "slug">, clientId: string): UnsubscribeLinks | null {
  const token = unsubscribeToken(clientId);
  if (!token) return null;
  const home = origin.replace(/\/$/, "");
  return {
    page: `${home}/c/${clinic.slug}/unsubscribe/${token}`,
    headers: { "List-Unsubscribe": `<${home}/api/unsubscribe/${token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

export interface EmailPreference {
  client: Client;
  /** When their address unsubscribed, or null while the clinic's emails still reach them. */
  unsubscribedAt: string | null;
  /** They said yes to texts and haven't replied STOP: texts are separate, so the page says how to stop those. */
  texts: boolean;
}

/** Everyone in the clinic's book on this client's address, with their conversations: an unsubscribe covers them all. */
async function sameAddress(client: Client): Promise<{ clients: Client[]; messages: Message[] }> {
  const store = getStore();
  const address = client.email?.trim().toLowerCase();
  const clients =
    address && client.sandboxId
      ? (await store.listClients(client.clinicId, client.sandboxId)).filter((c) => c.email?.trim().toLowerCase() === address)
      : [client];
  if (!clients.some((c) => c.id === client.id)) clients.push(client);
  const messages = (await Promise.all(clients.map((c) => store.listClientMessages(c.id)))).flat();
  return { clients, messages };
}

/** Where this client stands, or null when the token is for a client whose details are gone, or another clinic's. */
export async function emailPreference(clinic: Pick<Clinic, "id">, clientId: string): Promise<EmailPreference | null> {
  const store = getStore();
  const client = await store.getClient(clientId);
  if (!client || client.clinicId !== clinic.id || !client.email) return null;
  const [{ clients, messages }, consents] = await Promise.all([sameAddress(client), store.listConsents(client.id)]);
  const own = messages.filter((m) => m.clientId === client.id);
  return {
    client,
    unsubscribedAt: unsubscribedAt(client, unsubscribedAddresses(clients, messages)),
    texts: consents.some((c) => c.type === "texts") && !optedOutOfTexts(own),
  };
}

/** How the choice was made, for the line Dana reads in the conversation. */
export type ChoiceSource = "page" | "mail_app" | { staff: string };

const NOTE: Record<"out" | "in", (by: ChoiceSource) => string> = {
  out: (by) =>
    by === "page"
      ? "Unsubscribed from emails, from the link in an email."
      : by === "mail_app"
        ? "Unsubscribed from emails, from their mail app."
        : `Emails stopped by ${by.staff}, at their request.`,
  in: () => "Chose to keep getting emails.",
};

/**
 * Records "unsubscribe" or "keep getting emails" in the client's conversation, once: nothing is written when their
 * address already stands there, and two presses at once write one line (the outbox's key per client). Returns where
 * the address stands now. The caller refreshes the dashboard.
 */
export async function setEmailPreference(
  clinic: Pick<Clinic, "id">,
  clientId: string,
  choice: "out" | "in",
  by: ChoiceSource,
): Promise<EmailPreference | null> {
  const before = await emailPreference(clinic, clientId);
  if (!before || (choice === "out") === Boolean(before.unsubscribedAt)) return before;
  const { client } = before;
  const own = await getStore().listClientMessages(client.id);
  const when = await conversationTime(client, own);
  await getStore().addMessage({
    clinicId: client.clinicId,
    clientId: client.id,
    sandboxId: client.sandboxId,
    type: choice === "out" ? OPT_OUT_TYPE : OPT_IN_TYPE,
    channel: "email",
    subject: null,
    body: NOTE[choice](by),
    // A line in the conversation, never a message to the client.
    status: "skipped",
    dedupeKey: `email_preference:${own.filter(isEmailPreference).length + 1}`,
    scheduledFor: null,
    sentAt: when,
    createdAt: when,
  });
  return emailPreference(clinic, clientId);
}
