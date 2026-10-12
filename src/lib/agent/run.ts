import "server-only";
// One run of the agent (DECISIONS D-093): picks up a draft marked working, gathers what it needs, lets Claude work
// through its tools, and keeps the result for Dana. Runs after the page or webhook has answered, so nobody waits on
// it. Any failure leaves the draft marked failed and Dana writes the message herself, as she did before.

import Anthropic from "@anthropic-ai/sdk";
import { sandboxClock, isoDateInZone, virtualNow } from "@/lib/clock";
import type { AgentDraft, AgentStep, Message } from "@/lib/domain";
import { env, features } from "@/lib/env";
import { buildQueue, clientFacts, type EngineInput } from "@/lib/rebook/engine";
import { getStore } from "@/lib/store";
import { draftChannel, type AgentContext } from "./context";
import { systemPrompt, taskPrompt } from "./prompt";
import { buildTools, newRunState, type RunState } from "./tools";
import { voiceExamples } from "./voice";

/** The agent writes with the current Opus (Joshua's choice, Oct 12). */
export const AGENT_MODEL = "claude-opus-5-5";

/** Turns of tool use one run may take before it stops: enough to read, look up, draft and fix twice. */
export const MAX_TURNS = 14;

/** The usage feature each kind of run is logged as, against its own safety valves. */
export const AGENT_FEATURES = { answer: "agent_answer", plan_review: "agent_plan_review" } as const;

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  // One minute a turn, one retry: a run that can't finish in a few minutes is left for Dana.
  return (client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 1 }));
}

/** What a model call needs, and what it reports back. Swapped for a stand-in in the tests. */
export interface AgentCall {
  (input: { system: string; task: string; tools: ReturnType<typeof buildTools> }): Promise<{ model: string; tokens: number }>;
}

/** The real call: Claude works through the tools until it hands over a draft, or runs out of turns. */
export const callClaude: AgentCall = async ({ system, task, tools }) => {
  const runner = anthropic().beta.messages.toolRunner({
    model: AGENT_MODEL,
    max_tokens: 16_000,
    // The instructions and tools are the same for every run of a clinic, so they're cached between turns and runs.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    tools,
    messages: [{ role: "user", content: task }],
    // Writing a short message well needs care more than depth.
    output_config: { effort: "medium" },
    // If a safety classifier ever declines, Anthropic's recommended fallback model carries on.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    max_iterations: MAX_TURNS,
  });
  let tokens = 0;
  let model: string = AGENT_MODEL;
  for await (const message of runner) {
    const u = message.usage;
    tokens += u.input_tokens + u.output_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    model = message.model;
  }
  return { model, tokens };
};

/** Everything one run needs, read fresh: the draft may have waited a few seconds, and the book may have moved on. */
async function contextFor(draft: AgentDraft, origin: string): Promise<{ ctx: AgentContext; book: Message[] } | null> {
  const store = getStore();
  if (!draft.sandboxId) return null;
  const [clinic, staff, sandbox, records, treatments, products] = await Promise.all([
    store.getClinic(draft.clinicId),
    store.listStaff(draft.clinicId),
    store.getSandbox(draft.sandboxId),
    store.listClinicRecords(draft.clinicId, draft.sandboxId),
    store.listTreatments(draft.clinicId),
    store.listProducts(draft.clinicId),
  ]);
  const practitioner = staff.find((s) => s.role === "practitioner") ?? staff[0];
  if (!clinic || !practitioner) return null;
  const now = virtualNow(sandboxClock(env.DEMO_TODAY, sandbox));
  const input: EngineInput = {
    clinic,
    practitionerName: practitioner.name,
    now,
    reportUrl: (token) => `${origin}/r/${token}`,
    treatments,
    products,
    ...records,
    // A time held while a client pays isn't a visit yet (D-065), but it does take the time.
    appointments: records.appointments.filter((a) => !(a.status === "booked" && a.depositStatus === "pending")),
  };
  const facts = clientFacts(input).find((f) => f.client.id === draft.clientId);
  if (!facts) return null;
  const item = draft.kind === "plan_review" ? (buildQueue(input).items.find((i) => i.clientId === draft.clientId && i.dedupeKey === draft.forKey) ?? null) : null;
  const reply = draft.kind === "answer" && facts.reply?.id === draft.forKey ? facts.reply : null;
  // Gone stale while it waited: answered already, or no longer in the queue.
  if ((draft.kind === "answer" && !reply) || (draft.kind === "plan_review" && !item)) return null;
  const channel = draftChannel(facts, reply?.channel ?? null);
  if (!channel) return null;
  const ctx: AgentContext = {
    kind: draft.kind,
    clinic,
    staffName: practitioner.name,
    now,
    today: isoDateInZone(now, clinic.timezone),
    origin,
    treatments: treatments.filter((t) => t.active),
    products: products.filter((p) => p.active),
    facts,
    busy: records.appointments.filter((a) => a.status === "booked"),
    reply,
    item,
    channel,
  };
  return { ctx, book: records.messages };
}

/**
 * Works one draft through to ready or failed. Never throws: a run that goes wrong leaves the draft failed, with a
 * step saying so, and the brief offers Dana the empty composer as before.
 */
export async function runDraft(draftId: string, origin: string, call: AgentCall = callClaude): Promise<AgentDraft | null> {
  const store = getStore();
  const started = Date.now();
  const state: RunState = newRunState();
  const save = (patch: Partial<AgentDraft>) => store.updateAgentDraft(draftId, ["working"], { ...patch, updatedAt: new Date().toISOString() });
  try {
    const draft = await store.getAgentDraft(draftId);
    if (!draft || draft.status !== "working") return draft;
    const found = await contextFor(draft, origin);
    if (!found) return await save({ status: "dismissed", steps: [{ text: "Nothing to draft any more", at: new Date().toISOString() }] });
    const { ctx, book } = found;

    // Part 4: Dana's own writing in this book, and the drafts she changed before sending (voice.ts).
    const voice = voiceExamples(book, await store.listAgentDrafts(draft.clinicId, draft.sandboxId!));
    const learned = voice.written.length + voice.edits.length;
    if (learned > 0) {
      state.steps.push({
        text: `Read ${learned === 1 ? "one" : learned} of ${ctx.staffName}'s own messages${voice.edits.length ? `, ${voice.edits.length === 1 ? "one" : voice.edits.length} she rewrote from a draft` : ""}, for her voice`,
        at: new Date().toISOString(),
      });
    }
    const onStep = async (steps: AgentStep[]) => {
      await save({ steps: [...steps] });
    };
    const tools = buildTools(ctx, state, onStep);
    const result = await call({ system: systemPrompt(ctx.clinic, ctx.staffName), task: taskPrompt(ctx, voice), tools });

    await store
      .logUsage({
        provider: "anthropic",
        feature: AGENT_FEATURES[draft.kind],
        units: result.tokens,
        taskId: draftId,
        sandboxId: draft.sandboxId,
        ipHash: null,
        createdAt: new Date().toISOString(),
      })
      .catch((e) => console.error("Agent usage not logged.", e instanceof Error ? e.message : e));

    if (!state.submitted) {
      return await save({ status: "failed", steps: [...state.steps, { text: "Couldn't finish a draft", at: new Date().toISOString() }], model: result.model, tokens: result.tokens });
    }
    return await save({
      status: "ready",
      channel: ctx.channel,
      body: state.submitted.body,
      note: state.submitted.note,
      steps: [...state.steps],
      suggestion: ctx.kind === "plan_review" && state.measurement ? { measurement: state.measurement, change: state.change } : null,
      offeredTimes: state.offered,
      model: result.model,
      tokens: result.tokens,
    });
  } catch (error) {
    console.error(`Agent draft ${draftId} failed after ${Math.round((Date.now() - started) / 1000)}s.`, error instanceof Error ? error.message : error);
    return await save({ status: "failed", steps: [...state.steps, { text: "Couldn't finish a draft", at: new Date().toISOString() }] }).catch(() => null);
  }
}

/** The agent runs only with a key. Without one, the dashboard is exactly as it was. */
export const agentEnabled = () => features.claude;
