import { beforeAll, describe, expect, it, vi } from "vitest";

await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  process.env.REBLOOM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "rebloom-agent-test-"));
  process.env.REBLOOM_STORE = "local";
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.DEMO_TODAY = "2026-12-29";
  process.env.APP_URL = "https://rebloom.test";
});

import { MAISON_VERRE } from "@/data/clinics";
import { SEED_PRODUCTS, SEED_TREATMENTS } from "@/data/menu";
import { SEED_STAFF } from "@/data/staff";
import { bareTimesIn, describeClient, describeMenu, draftChannel, findOpenTimes, pricesIn, timesIn, type AgentContext } from "@/lib/agent/context";
import { draftProblems, signOffProblem } from "@/lib/agent/guard";
import { answerEmail } from "@/lib/email/answer";
import { checkMeasurement } from "@/lib/agent/measure";
import { checkChange } from "@/lib/agent/plan-change";
import { systemPrompt } from "@/lib/agent/prompt";
import { runDraft, type AgentCall } from "@/lib/agent/run";
import { buildTools } from "@/lib/agent/tools";
import { draftView, wantedDrafts } from "@/lib/agent/view";
import { checkVoice, plainPunctuation, voiceExamples } from "@/lib/agent/voice";
import { isoDateInZone, virtualNow } from "@/lib/clock";
import { checkCopy } from "@/lib/copy/check";
import { buildDemoBundle } from "@/lib/demo/seed";
import type { AgentDraft, CaptureQuality, Message, Scan } from "@/lib/domain";
import { buildQueue, clientFacts, type EngineInput } from "@/lib/rebook/engine";
import { ANSWER_TYPE } from "@/lib/replies/thread";
import { localStore as store } from "@/lib/store/local";

const SANDBOX = "agent";
const ORIGIN = "https://rebloom.test";
const treatments = SEED_TREATMENTS.filter((t) => t.clinicId === MAISON_VERRE.id);
const products = SEED_PRODUCTS.filter((p) => p.clinicId === MAISON_VERRE.id);
const now = () => virtualNow({ demoToday: "2026-12-29" });
const today = () => isoDateInZone(now(), MAISON_VERRE.timezone);

async function engineInput(): Promise<EngineInput> {
  const records = await store.listClinicRecords(MAISON_VERRE.id, SANDBOX);
  return { clinic: MAISON_VERRE, practitionerName: "Dana", now: now(), reportUrl: (t) => `${ORIGIN}/r/${t}`, treatments, products, ...records };
}

/** The context a run builds, for one demo client. */
async function contextFor(demoKey: string, kind: AgentContext["kind"] = "answer"): Promise<AgentContext> {
  const input = await engineInput();
  const facts = clientFacts(input).find((f) => f.client.demoKey === demoKey)!;
  const item = buildQueue(input).items.find((i) => i.clientId === facts.client.id) ?? null;
  return {
    kind,
    clinic: MAISON_VERRE,
    staffName: "Dana",
    now: input.now,
    today: today(),
    origin: ORIGIN,
    treatments,
    products,
    facts,
    busy: input.appointments.filter((a) => a.status === "booked"),
    reply: kind === "answer" ? facts.reply : null,
    item: kind === "plan_review" ? item : null,
    channel: draftChannel(facts, facts.reply?.channel ?? null)!,
  };
}

beforeAll(async () => {
  await store.createSandbox(SANDBOX, now());
  await store.seedDemoClients(
    MAISON_VERRE.id,
    SANDBOX,
    buildDemoBundle({ clinic: MAISON_VERRE, treatments, products, staff: SEED_STAFF, sandboxId: SANDBOX, today: today() }),
  );
});

describe("sounding like Dana", () => {
  it("passes a message a person would write", () => {
    expect(checkVoice("Hi Daniel, it's Dana. Saturday at 10am is open for your second peel. Book it here, or reply and I'll do it for you.")).toEqual([]);
  });

  it("catches what gives machine writing away", () => {
    const rules = (t: string) => checkVoice(t).map((i) => i.rule);
    expect(rules("Great question! I hope this email finds you well.")).toEqual(expect.arrayContaining(["Great question", "I hope this finds you well"]));
    expect(rules("Rest assured, don't hesitate to reach out on your skin journey.")).toEqual(
      expect.arrayContaining(["Rest assured", "Don't hesitate", "Reach out", "Journey"]),
    );
    expect(rules("Lovely!! See you soon")).toContain("More than one exclamation mark");
    expect(rules("See you Saturday \u{1F60A}")).toContain("Emoji");
    expect(rules("Two options:\n- Saturday\n- Tuesday")).toContain("A list");
    expect(rules("**Saturday** works")).toContain("Formatting");
  });

  it("straightens curly quotes, which would make every part of a text shorter", () => {
    expect(plainPunctuation("It’s “fine”… ")).toBe('It\'s "fine"...');
  });

  it("learns from Dana's own answers and from the drafts she changed, never from ones sent as written", () => {
    const at = "2026-12-20T17:00:00.000Z";
    const message = (body: string, patch: Partial<Message> = {}): Message => ({
      id: body,
      clinicId: "c",
      clientId: "x",
      sandboxId: SANDBOX,
      type: ANSWER_TYPE,
      channel: "email",
      subject: null,
      body,
      status: "sent",
      dedupeKey: null,
      scheduledFor: null,
      sentAt: at,
      createdAt: at,
      ...patch,
    });
    const draft = (body: string, sentBody: string): AgentDraft => ({
      id: body,
      clinicId: "c",
      clientId: "x",
      sandboxId: SANDBOX,
      kind: "answer",
      forKey: body,
      status: "used",
      channel: "sms",
      subject: null,
      body,
      note: null,
      steps: [],
      suggestion: null,
      offeredTimes: [],
      model: null,
      tokens: 0,
      sentBody,
      createdAt: at,
      updatedAt: at,
    });
    const voice = voiceExamples(
      [message("Her own words"), message("A reminder", { type: "next_session_due" }), message("Edited and sent"), message("Sent as written")],
      [draft("The draft", "Edited and sent"), draft("Sent as written", "Sent  as written")],
    );
    expect(voice.written.map((w) => w.body)).toEqual(["Her own words"]);
    expect(voice.edits).toEqual([{ draft: "The draft", sent: "Edited and sent" }]);
  });
});

describe("whether a stall is real (part 2)", () => {
  const quality = (patch: Partial<CaptureQuality>): CaptureQuality => ({
    method: "camera",
    faceWidthRatio: 0.7,
    centerOffset: 0.01,
    yaw: 1,
    pitch: 1,
    roll: 1,
    luminance: 140,
    clippedShare: 0,
    evenness: 0.95,
    warmth: 1.05,
    sharpness: 400,
    eyesOpen: 0.95,
    passedGate: true,
    ...patch,
  });
  const scan = (n: number, patch: Partial<Scan> = {}): Scan => ({
    id: `s${n}`,
    clientId: "x",
    sandboxId: SANDBOX,
    scanNumber: n,
    status: "complete",
    source: "live",
    imagePath: "p",
    imageWidth: 1080,
    imageHeight: 1440,
    captureQuality: quality({}),
    landmarks: null,
    concernsRequested: [],
    providerTaskId: null,
    analysisStartedAt: null,
    errorCode: null,
    youcamRaw: null,
    result: { concerns: [], overall: null, skinAge: null, skinType: null, engine: "hd" },
    comparisonConfidence: n === 1 ? null : "high",
    createdAt: `2026-1${n}-01T17:00:00.000Z`,
    completedAt: null,
    ...patch,
  });

  it("trusts scans taken the same way", () => {
    expect(checkMeasurement([scan(1), scan(2), scan(3)])).toEqual({ trustworthy: true, reasons: [] });
  });

  it("trusts the demo's authored scans, as the report does", async () => {
    const grace = await contextFor("grace", "plan_review");
    expect(checkMeasurement(grace.facts.scans).trustworthy).toBe(true);
  });

  it("says why when the light changed, a photo was uploaded, or the engine differs", () => {
    const result = checkMeasurement([
      scan(1),
      scan(2, { captureQuality: quality({ luminance: 95 }) }),
      scan(3, { captureQuality: quality({ method: "upload", passedGate: false }), result: { concerns: [], overall: null, skinAge: null, skinType: null, engine: "sd" } }),
    ]);
    expect(result.trustworthy).toBe(false);
    expect(result.reasons).toEqual([
      "scan 03 was an uploaded photo, so the light and angle weren't checked.",
      "scan 02 was taken in dimmer light than scan 01.",
      "scan 02 and scan 03 were read by different analysis engines.",
      "scan 03 was taken in brighter light than scan 02.",
    ]);
  });
});

describe("what the agent may name", () => {
  it("finds open times that suit the client: Daniel asked for a Saturday morning", async () => {
    const daniel = await contextFor("daniel");
    const found = findOpenTimes(daniel, { weekdays: ["saturday"], partOfDay: "morning" });
    expect(found.offered.length).toBeGreaterThan(0);
    for (const iso of found.offered) {
      const local = new Intl.DateTimeFormat("en-US", { weekday: "long", hour: "numeric", hourCycle: "h23", timeZone: MAISON_VERRE.timezone }).formatToParts(new Date(iso));
      expect(local.find((p) => p.type === "weekday")?.value).toBe("Saturday");
      expect(Number(local.find((p) => p.type === "hour")?.value)).toBeLessThan(12);
    }
    expect(found.text).toContain("Signature Peel Series, session 2 of 3");
    expect(found.text).toContain(`${ORIGIN}/r/${daniel.facts.report!.token}/book`);
  });

  it("reads times and prices the way people write them", () => {
    expect(timesIn("Saturday at 10am, or 2:30 PM, or 11:00 a.m.")).toEqual(["10am", "2:30pm", "11am"]);
    expect(pricesIn("$195 a session, $1,185 in all, $42.50")).toEqual([195, 1185, 42.5]);
  });

  it("finds every time written without am or pm, and nothing that isn't a time", () => {
    expect(bareTimesIn("Saturday at 10, or 10:45, or 16:00. Want me to put you in for 10?")).toEqual(["10:45", "16:00", "at 10", "for 10"]);
    expect(
      bareTimesIn("Saturday at 10am or 10:45 am, 2:30pm, 11 a.m. A peel every 3 weeks, for 2 sessions, from 1 to 3 days of downtime, about 3 days, after 2 sessions, $195."),
    ).toEqual([]);
  });

  it("sends back a time without am or pm, even one that was open", async () => {
    const daniel = await contextFor("daniel");
    const found = findOpenTimes(daniel, { weekdays: ["saturday"], partOfDay: "morning" });
    const problems = draftProblems(daniel, "Hi Daniel, it's Dana. Saturday at 10 is open. Want me to put you in for 10?\nDana", { offered: found.offered, extraCents: [] });
    expect(problems).toEqual(['"at 10" needs am or pm. Write every time as 10am or 2:30pm.', '"for 10" needs am or pm. Write every time as 10am or 2:30pm.']);
  });

  it("sends back an invented time, an invented price, a stranger's link and an em dash", async () => {
    const daniel = await contextFor("daniel");
    const found = findOpenTimes(daniel, { weekdays: ["saturday"], partOfDay: "morning" });
    const problems = draftProblems(daniel, "Hi Daniel — Saturday at 7am is $99. Book at https://example.com", { offered: found.offered, extraCents: [] });
    expect(problems.join("\n")).toMatch(/em dash/);
    expect(problems.join("\n")).toMatch(/7am isn't one of the open times/);
    expect(problems.join("\n")).toMatch(/\$99 isn't a price/);
    expect(problems.join("\n")).toMatch(/example\.com isn't one of their links/);
  });

  it("passes a text built from what the tools gave back", async () => {
    const daniel = await contextFor("daniel");
    const found = findOpenTimes(daniel, { weekdays: ["saturday"], partOfDay: "morning" });
    const at = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: MAISON_VERRE.timezone }).format(new Date(found.offered[0]));
    const time = at.replace(":00", "").replace(" ", "").toLowerCase();
    const body = `Hi Daniel, it's Dana. Sorry nobody got back to you sooner. Saturday at ${time} is open for your second peel ($195). You can take it here: ${ORIGIN}/r/${daniel.facts.report!.token}/book\nDana`;
    expect(daniel.channel).toBe("sms");
    expect(draftProblems(daniel, body, { offered: found.offered, extraCents: [] })).toEqual([]);
  });

  it("asks an email to open with their name, and to close with Dana's own sign-off", async () => {
    const priya = await contextFor("priya");
    expect(priya.channel).toBe("email");
    const problems = draftProblems(priya, "Thanks for asking.\n\nMost people look a little pink for a day.\n\nWarmly,\nDana", { offered: [], extraCents: [] });
    expect(problems).toEqual(['Open the email with "Hi Priya,".', 'Sign off with "Dana" alone, or "Speak soon," and "Dana", not "Warmly,".']);
  });

  it("signs every draft as Dana: her name alone, or Speak soon above it", () => {
    expect(signOffProblem("Hi Priya,\n\nSee you then.\n\nDana", "Dana")).toBeNull();
    expect(signOffProblem("Hi Priya,\n\nSee you then.\n\nSpeak soon,\nDana", "Dana")).toBeNull();
    expect(signOffProblem("Hi Daniel, it's Dana. Saturday at 10am is open.\nDana", "Dana")).toBeNull();
    expect(signOffProblem("Hi Priya,\n\nSee you then.", "Dana")).toMatch(/^End with your name on its own line/);
    expect(signOffProblem("Hi Priya,\n\nSee you then. Dana", "Dana")).toMatch(/^End with your name/);
    expect(signOffProblem("Hi Priya,\n\nBest,\nDana", "Dana")).toMatch(/not "Best,"/);
  });

  it("doesn't put her name under an email twice when she has signed it", () => {
    const quoted = null;
    const signed = answerEmail({ clinic: MAISON_VERRE, subject: "Re: Hi", body: "Hi Priya,\n\nSee you Saturday.\n\nSpeak soon,\nDana", signedBy: "Dana", quoted });
    expect(signed.text.match(/Dana/g)).toHaveLength(1);
    expect(signed.text).toMatch(/Speak soon,\nDana\n\nMaison Verre\n/);
    expect(signed.html).not.toMatch(/Dana<br>/);
    const unsigned = answerEmail({ clinic: MAISON_VERRE, subject: "Re: Hi", body: "Hi Priya,\n\nSee you Saturday.", signedBy: "Dana", quoted });
    expect(unsigned.text).toMatch(/See you Saturday\.\n\nDana\nMaison Verre\n/);
  });
});

describe("a change of plan (part 3)", () => {
  it("only from the menu, never the course that stalled, and only for what stalled", async () => {
    const grace = await contextFor("grace", "plan_review");
    const why = "Her sun spots haven't moved on light pulses; a resurfacing peel works on them from another angle.";
    expect(checkChange(grace, { treatment: "Laser Facial", sessions: 2, why })).toMatchObject({ ok: false, error: expect.stringContaining("isn't on Maison Verre's menu") });
    expect(checkChange(grace, { treatment: "IPL Photofacial", sessions: 2, why })).toMatchObject({ ok: false, error: expect.stringContaining("the course that stalled") });
    expect(checkChange(grace, { treatment: "RF Skin Tightening", sessions: 2, why })).toMatchObject({ ok: false, error: expect.stringContaining("doesn't work on their priorities") });
    expect(checkChange(grace, { treatment: "Signature Peel Series", sessions: 9, why })).toMatchObject({ ok: false, error: "Choose between 1 and 3 sessions of Signature Peel Series." });
  });

  it("prices the change in code and names what it replaces", async () => {
    const grace = await contextFor("grace", "plan_review");
    const result = checkChange(grace, { treatment: "signature peel series", sessions: 2, why: "A resurfacing peel works on sun spots from another angle." });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.change).toMatchObject({ treatmentName: "Signature Peel Series", sessions: 2, priceCents: 39000, replacesName: "IPL Photofacial" });
    expect(result.change.covers).toContain("age_spot");
  });
});

describe("skin type (D-094)", () => {
  const why = "Light pulses work on her sun spots and redness from another angle than the peels.";

  it("never suggests a treatment the clinic doesn't offer to their type", async () => {
    const grace = await contextFor("grace", "plan_review");
    // Nothing under way, so IPL isn't the course that stalled; only the skin type decides.
    const fresh = { ...grace, facts: { ...grace.facts, plan: null, appointments: [] } };
    const typed = (type: "III" | "V") => ({ ...fresh, facts: { ...fresh.facts, client: { ...fresh.facts.client, fitzpatrick: { type, source: "scan" as const, at: "" } } } });
    expect(checkChange(typed("III"), { treatment: "IPL Photofacial", sessions: 2, why }).ok).toBe(true);
    expect(checkChange(typed("V"), { treatment: "IPL Photofacial", sessions: 2, why })).toMatchObject({
      ok: false,
      error: expect.stringContaining("isn't offered to skin type V at Maison Verre (skin types I to III only)"),
    });
  });

  it("may suggest it once Dana has offered it to them anyway (D-095)", async () => {
    const grace = await contextFor("grace", "plan_review");
    const ipl = treatments.find((t) => t.name === "IPL Photofacial")!;
    const client = {
      ...grace.facts.client,
      fitzpatrick: { type: "V" as const, source: "practitioner" as const, at: "" },
      skinTypeExceptions: [{ treatmentId: ipl.id, reason: "Patch test clear", by: "Dana", at: "", type: "V" as const }],
    };
    const ctx = { ...grace, facts: { ...grace.facts, client, plan: null, appointments: [] } };
    expect(checkChange(ctx, { treatment: "IPL Photofacial", sessions: 2, why }).ok).toBe(true);
    expect(describeClient(ctx)).toContain('Dana offers them IPL Photofacial anyway, her call: "Patch test clear".');
  });

  it("tells the agent the limit, and the type as Dana's alone", async () => {
    const marcus = await contextFor("marcus");
    expect(describeMenu(marcus)).toContain("Offered to skin types I to III only.");
    expect(describeClient(marcus)).toContain("Skin type for Dana only, never to mention in writing: Fitzpatrick V, estimated from their scan.");
  });
});

describe("what the book still needs drafted", () => {
  it("an answer for each reply waiting on Dana, then a second look at the stalled", async () => {
    const input = await engineInput();
    const facts = clientFacts(input);
    const wanted = wantedDrafts(facts, buildQueue(input).items, []);
    const who = (w: { clientId: string }) => facts.find((f) => f.client.id === w.clientId)!.client.demoKey;
    expect(wanted.map((w) => [w.kind, who(w)])).toEqual([
      ["answer", "daniel"],
      ["answer", "priya"],
      ["plan_review", "grace"],
    ]);
    // Once started, never again.
    const started = wanted.map((w) => ({ clientId: w.clientId, forKey: w.forKey }) as AgentDraft);
    expect(wantedDrafts(facts, buildQueue(input).items, started)).toEqual([]);
  });
});

describe("a run", () => {
  /** Starts a draft as the desk does, for one demo client. */
  async function start(demoKey: string, kind: AgentDraft["kind"]): Promise<AgentDraft> {
    const ctx = await contextFor(demoKey, kind);
    const at = new Date().toISOString();
    const draft = await store.startAgentDraft({
      clinicId: MAISON_VERRE.id,
      clientId: ctx.facts.client.id,
      sandboxId: SANDBOX,
      kind,
      forKey: kind === "answer" ? ctx.facts.reply!.id : ctx.item!.dedupeKey,
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
    });
    expect(draft).not.toBeNull();
    return draft!;
  }
  type Tool = ReturnType<typeof buildTools>[number];
  /** Calls a tool as the runner does: its input parsed against its schema first. */
  const callTool = async (tools: Tool[], name: string, input: unknown = {}) => {
    const tool = tools.find((t) => t.name === name)!;
    const run = tool.run as (args: unknown) => unknown;
    try {
      return { ok: true, text: String(await run(tool.parse(input))) };
    } catch (e) {
      return { ok: false, text: e instanceof Error ? e.message : String(e) };
    }
  };

  it("answers Daniel's text: looks up Saturday mornings, gets sent back once, then hands over", async () => {
    const draft = await start("daniel", "answer");
    let rejected = "";
    const fake: AgentCall = async ({ system, task, tools }) => {
      expect(system).toBe(systemPrompt(MAISON_VERRE, "Dana"));
      expect(task).toContain("Daniel wrote to the clinic");
      expect((await callTool(tools, "read_conversation")).text).toContain("Could I come in on a Saturday morning?");
      const times = await callTool(tools, "find_open_times", { weekdays: ["saturday"], part_of_day: "morning" });
      const first = times.text.match(/Saturday, \w+ \d+ at (\S+)/)![1];
      rejected = (await callTool(tools, "submit_draft", { message: "Hi Daniel! Great question! Saturday at 7am works.", note_for_dana: "x" })).text;
      const ok = await callTool(tools, "submit_draft", {
        message: `Hi Daniel, it's Dana. Sorry for the slow reply. Saturday at ${first} is open for your second peel. Reply yes and I'll book it.\nDana`,
        note_for_dana: "He asked weeks ago, so the apology matters.",
      });
      expect(ok.ok).toBe(true);
      return { model: "claude-opus-5-5", tokens: 4200 };
    };
    const done = await runDraft(draft.id, ORIGIN, fake);
    expect(rejected).toMatch(/Not handed over yet/);
    expect(rejected).toMatch(/Great question/);
    expect(rejected).toMatch(/7am isn't one of the open times/);
    expect(done).toMatchObject({ status: "ready", channel: "sms", note: "He asked weeks ago, so the apology matters.", tokens: 4200, model: "claude-opus-5-5" });
    expect(done!.body).toMatch(/^Hi Daniel, it's Dana\./);
    expect(checkCopy(done!.body!)).toEqual([]);
    const view = draftView(done!);
    expect(view.steps[0]).toBe("Read one of Dana's own messages, for her voice");
    expect(view.steps).toEqual(expect.arrayContaining(["Read Daniel's message", expect.stringMatching(/^Found Saturday at \S+ open/), expect.stringMatching(/^Sent back to rewrite: "Great question!?" reads as machine-written$/), "Drafted the text"]));
    expect((await store.sumUsage({ provider: "anthropic", since: new Date(0), sandboxId: SANDBOX, features: ["agent_answer"] })).units).toBe(4200);
  });

  it("takes a second look at Grace's stall: checks the scans, records a change, drafts a note", async () => {
    const draft = await start("grace", "plan_review");
    const fake: AgentCall = async ({ task, tools }) => {
      expect(task).toContain("check_measurement first");
      expect((await callTool(tools, "suggest_plan_change", { treatment: "Signature Peel Series", sessions: 2, why: "Another angle on the sun spots." })).text).toMatch(/check_measurement first/);
      expect((await callTool(tools, "check_measurement")).text).toMatch(/The stall is real/);
      expect((await callTool(tools, "submit_draft", { message: "Hi Grace,\n\nA note before tomorrow.", note_for_dana: "x" })).text).toMatch(/suggest_plan_change before drafting/);
      expect((await callTool(tools, "suggest_plan_change", { treatment: "Signature Peel Series", sessions: 2, why: "Another angle on the sun spots, which IPL hasn't moved." })).ok).toBe(true);
      const ok = await callTool(tools, "submit_draft", {
        message: "Hi Grace,\n\nYour last two scans show your sun spots haven't moved the way we hoped. Before tomorrow's session, I'd like to talk through a small change to your plan with you.\n\nSpeak soon,\nDana",
        note_for_dana: "Talk it through at tomorrow's visit before switching.",
      });
      expect(ok.ok).toBe(true);
      return { model: "claude-opus-5-5", tokens: 5000 };
    };
    const done = await runDraft(draft.id, ORIGIN, fake);
    expect(done).toMatchObject({ status: "ready", channel: "email" });
    expect(done!.suggestion).toMatchObject({
      measurement: { trustworthy: true, reasons: [] },
      change: { treatmentName: "Signature Peel Series", sessions: 2, priceCents: 39000, replacesName: "IPL Photofacial" },
    });
  });

  it("fails cleanly when the model never hands a draft over, and when it throws", async () => {
    const draft = await start("priya", "answer");
    const done = await runDraft(draft.id, ORIGIN, async () => ({ model: "claude-opus-5-5", tokens: 10 }));
    expect(done).toMatchObject({ status: "failed" });
    expect(done!.steps[done!.steps.length - 1].text).toBe("Couldn't finish a draft");
    // A failed draft can be picked up again, once.
    expect(await store.updateAgentDraft(draft.id, ["failed"], { status: "working", steps: [] })).not.toBeNull();
    expect(await store.updateAgentDraft(draft.id, ["failed"], { status: "working" })).toBeNull();
    const again = await runDraft(draft.id, ORIGIN, async () => {
      throw new Error("overloaded");
    });
    expect(again).toMatchObject({ status: "failed" });
  });

  it("stands down when the reply has been answered since", async () => {
    const ctx = await contextFor("sofia");
    const at = new Date().toISOString();
    const draft = await store.startAgentDraft({
      clinicId: MAISON_VERRE.id,
      clientId: ctx.facts.client.id,
      sandboxId: SANDBOX,
      kind: "answer",
      forKey: "a-reply-that-is-not-waiting",
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
    });
    const call = vi.fn<AgentCall>();
    expect(await runDraft(draft!.id, ORIGIN, call)).toMatchObject({ status: "dismissed" });
    expect(call).not.toHaveBeenCalled();
  });

  it("keeps one draft per reply, and never overwrites one Dana has used", async () => {
    const [existing] = await store.listAgentDrafts(MAISON_VERRE.id, SANDBOX);
    const { id: _id, ...copy } = existing;
    void _id;
    expect(await store.startAgentDraft(copy)).toBeNull();
    expect(await store.updateAgentDraft(existing.id, ["ready"], { status: "used", sentBody: "Sent." })).toMatchObject({ status: "used" });
    expect(await store.updateAgentDraft(existing.id, ["working"], { status: "failed" })).toBeNull();
  });
});
