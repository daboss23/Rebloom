import "server-only";
// Where the agent's work starts (DECISIONS D-093). When Dana opens Today or a brief, the drafts her book still needs
// are marked as being written, and the writing happens after the page has gone out, so the page is never slower for
// it. A reply that arrives by webhook starts its own draft the same way, so the answer is often ready before she
// opens the alert. Safety valves on spend, as for YouCam and the goal reading.

import { after } from "next/server";
import { cache } from "react";
import type { AgentDraft, AgentDraftKind, Client } from "@/lib/domain";
import { getStore } from "@/lib/store";
import { AGENT_FEATURES, agentEnabled, runDraft } from "./run";
import { wantedDrafts } from "./view";
import type { ClientFacts, QueueItem } from "@/lib/rebook/engine";

/** Real time on purpose: they're about real spend. */
export const AGENT_LIMITS = {
  /** Drafts one demo may start in a day. */
  perSandboxPerDay: 15,
  /** Drafts every demo together may start in a day. */
  globalPerDay: 150,
  /** Drafts one page load may start, so a big book fills in over a few visits rather than all at once. */
  perLoad: 3,
} as const;

/** A draft still marked working after this long was cut off (a deploy, a timeout): it's marked failed to retry. */
export const STALE_MS = 4 * 60_000;
const DAY_MS = 86_400_000;

export interface Desk {
  /** False without a key, or before the agent_drafts migration: the dashboard is then exactly as it was. */
  enabled: boolean;
  drafts: AgentDraft[];
}

const blank = (kind: AgentDraftKind, client: Pick<Client, "id" | "clinicId" | "sandboxId">, forKey: string): Omit<AgentDraft, "id"> => {
  const at = new Date().toISOString();
  return {
    clinicId: client.clinicId,
    clientId: client.id,
    sandboxId: client.sandboxId,
    kind,
    forKey,
    status: "working",
    channel: null,
    subject: null,
    body: null,
    note: null,
    steps: [],
    suggestion: null,
    offeredTimes: [],
    model: null,
    tokens: 0,
    sentBody: null,
    createdAt: at,
    updatedAt: at,
  };
};

/** Under both valves: this demo's drafts today, and everyone's. */
async function roomFor(sandboxId: string, drafts: AgentDraft[]): Promise<number> {
  const since = Date.now() - DAY_MS;
  const mine = drafts.filter((d) => Date.parse(d.createdAt) >= since).length;
  const everyone = await getStore().sumUsage({ provider: "anthropic", since: new Date(since), features: Object.values(AGENT_FEATURES) });
  return Math.max(0, Math.min(AGENT_LIMITS.perSandboxPerDay - mine, AGENT_LIMITS.globalPerDay - everyone.count));
}

/** Runs drafts once the response has gone, side by side. Each run is on its own: one failing doesn't stop another. */
function runLater(ids: string[], origin: string): void {
  if (ids.length === 0) return;
  after(() => Promise.all(ids.map((id) => runDraft(id, origin))));
}

/**
 * The agent's drafts for this book, after starting any it still needs. Once per request: the layout and the page
 * share it. Never throws: without the migration, or on any error, the agent is simply off.
 */
export const openDesk = cache(async (book: { clinic: { id: string }; sandboxId: string; facts: ClientFacts[]; queue: { items: QueueItem[] } }, origin: string): Promise<Desk> => {
  if (!agentEnabled()) return { enabled: false, drafts: [] };
  const store = getStore();
  try {
    const drafts = await store.listAgentDrafts(book.clinic.id, book.sandboxId);
    // Cut off mid-run: mark it failed, so Dana can try again or write it herself.
    for (const d of drafts) {
      if (d.status === "working" && Date.now() - Date.parse(d.updatedAt) > STALE_MS) {
        const failed = await store.updateAgentDraft(d.id, ["working"], {
          status: "failed",
          steps: [...d.steps, { text: "Took too long, so stopped", at: new Date().toISOString() }],
          updatedAt: new Date().toISOString(),
        });
        if (failed) Object.assign(d, failed);
      }
    }
    const wanted = wantedDrafts(book.facts, book.queue.items, drafts);
    const room = wanted.length ? Math.min(AGENT_LIMITS.perLoad, await roomFor(book.sandboxId, drafts)) : 0;
    const started: string[] = [];
    for (const w of wanted.slice(0, room)) {
      const client = book.facts.find((f) => f.client.id === w.clientId)!.client;
      const draft = await store.startAgentDraft(blank(w.kind, client, w.forKey));
      // Null: another request started it a moment ago.
      if (draft) {
        drafts.push(draft);
        started.push(draft.id);
      }
    }
    runLater(started, origin);
    return { enabled: true, drafts };
  } catch (error) {
    console.error("The agent is off for this page.", error instanceof Error ? error.message : error);
    return { enabled: false, drafts: [] };
  }
});

/** A reply just landed (webhook): start its answer now, so it may be ready before Dana opens the alert. */
export async function draftForReply(client: Client, replyId: string, origin: string): Promise<void> {
  if (!agentEnabled() || !client.sandboxId || !client.firstName) return;
  const store = getStore();
  try {
    const drafts = await store.listAgentDrafts(client.clinicId, client.sandboxId);
    if ((await roomFor(client.sandboxId, drafts)) < 1) return;
    const draft = await store.startAgentDraft(blank("answer", client, replyId));
    if (draft) runLater([draft.id], origin);
  } catch (error) {
    console.error("No draft for this reply.", error instanceof Error ? error.message : error);
  }
}

/** "Try again" on a draft that failed. False when it isn't failed any more (another tab got there first). */
export async function retryDraft(draft: AgentDraft, origin: string): Promise<boolean> {
  if (!agentEnabled() || !draft.sandboxId) return false;
  // A retry is a new run, so it counts against everyone's daily valve too.
  const since = new Date(Date.now() - DAY_MS);
  const everyone = await getStore().sumUsage({ provider: "anthropic", since, features: Object.values(AGENT_FEATURES) });
  if (everyone.count >= AGENT_LIMITS.globalPerDay) return false;
  const restarted = await getStore().updateAgentDraft(draft.id, ["failed"], {
    status: "working",
    steps: [],
    body: null,
    note: null,
    suggestion: null,
    offeredTimes: [],
    updatedAt: new Date().toISOString(),
  });
  if (restarted) runLater([restarted.id], origin);
  return Boolean(restarted);
}
