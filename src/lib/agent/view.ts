// The agent's drafts as the dashboard shows them (DECISIONS D-093), and which drafts a book still needs. Pure, so the
// pages, the endpoint the brief polls while a draft is being written, and the tests all agree.

import type { AgentDraft, AgentDraftKind, Message, PlanSuggestion } from "@/lib/domain";
import type { ClientFacts, QueueItem } from "@/lib/rebook/engine";
import { draftChannel } from "./context";

export interface DraftView {
  id: string;
  kind: AgentDraftKind;
  status: AgentDraft["status"];
  channel: Message["channel"] | null;
  body: string | null;
  note: string | null;
  steps: string[];
  suggestion: PlanSuggestion | null;
}

export function draftView(d: AgentDraft): DraftView {
  return {
    id: d.id,
    kind: d.kind,
    status: d.status,
    channel: d.channel,
    body: d.body,
    note: d.note,
    steps: d.steps.map((s) => s.text),
    suggestion: d.suggestion,
  };
}

export interface WantedDraft {
  kind: AgentDraftKind;
  clientId: string;
  forKey: string;
}

/**
 * What the agent should draft and hasn't yet: an answer for each reply waiting on Dana that she could answer, and a
 * second look at each stalled client in the queue. Longest-waiting replies first, then the stalled.
 */
export function wantedDrafts(facts: ClientFacts[], items: QueueItem[], drafts: AgentDraft[]): WantedDraft[] {
  const has = new Set(drafts.map((d) => `${d.clientId}:${d.forKey}`));
  const answers = facts
    .filter((f) => f.client.firstName && f.reply && draftChannel(f, f.reply.channel) && !has.has(`${f.client.id}:${f.reply.id}`))
    .sort((a, b) => (a.reply!.sentAt ?? a.reply!.createdAt).localeCompare(b.reply!.sentAt ?? b.reply!.createdAt))
    .map((f): WantedDraft => ({ kind: "answer", clientId: f.client.id, forKey: f.reply!.id }));
  const reviews = items
    .filter((i) => i.kind === "stalled" && !has.has(`${i.clientId}:${i.dedupeKey}`))
    .filter((i) => {
      const f = facts.find((x) => x.client.id === i.clientId);
      return f && draftChannel(f, null);
    })
    .map((i): WantedDraft => ({ kind: "plan_review", clientId: i.clientId, forKey: i.dedupeKey }));
  return [...answers, ...reviews];
}

/** The draft for what's in front of Dana now: the reply waiting on her, or the queue item on screen. */
export function draftFor(drafts: AgentDraft[], clientId: string, forKey: string | null | undefined): AgentDraft | null {
  if (!forKey) return null;
  return drafts.find((d) => d.clientId === clientId && d.forKey === forKey && d.status !== "dismissed") ?? null;
}
