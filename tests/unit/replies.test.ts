import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MAISON_VERRE } from "@/data/clinics";
import { SEED_PRODUCTS, SEED_TREATMENTS } from "@/data/menu";
import { SEED_STAFF } from "@/data/staff";
import { zonedDateTime } from "@/lib/clock";
import { checkCopy } from "@/lib/copy/check";
import { buildDemoBundle } from "@/lib/demo/seed";
import type { Message } from "@/lib/domain";
import { clientFacts, type EngineInput } from "@/lib/rebook/engine";
import { addressOf, htmlToText, isAutomatic, optKeyword, stripQuoted } from "@/lib/replies/parse";
import {
  ANSWER_TYPE,
  HANDLED_TYPE,
  REPLY_TYPE,
  canAnswerByText,
  handledKey,
  optedOutOfTexts,
  replySubject,
  thread,
  waitingReply,
} from "@/lib/replies/thread";

process.env.REBLOOM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "rebloom-replies-test-"));
// Before any import reads the environment.
vi.hoisted(() => {
  process.env.REBLOOM_STORE = "local";
  process.env.REPLY_DOMAIN = "reply.maisonverre.test";
  process.env.RESEND_API_KEY = "re_test";
  process.env.RESEND_WEBHOOK_SECRET = "whsec_test";
  process.env.TWILIO_AUTH_TOKEN = "twilio-token";
});

let n = 0;
const msg = (patch: Partial<Message>): Message => ({
  id: `m${++n}`,
  clinicId: "clinic",
  clientId: "client",
  sandboxId: "sb",
  type: "report_follow_up",
  channel: "email",
  subject: null,
  body: "Hi",
  status: "sent",
  dedupeKey: null,
  scheduledFor: null,
  sentAt: null,
  createdAt: "2026-10-01T17:00:00.000Z",
  ...patch,
});
const reply = (at: string, patch: Partial<Message> = {}) => msg({ type: REPLY_TYPE, status: "received", createdAt: at, sentAt: at, ...patch });

describe("reading an email reply", () => {
  it("keeps only the new words above a Gmail quote, even when its header wraps", () => {
    const text = "Thursday works.\n\nThanks!\n\nOn Tue, Oct 6, 2026 at 9:14 AM Maison Verre <\nhello@maisonverre.com> wrote:\n> Hi Sofia,\n> Shall I hold a time?";
    expect(stripQuoted(text)).toBe("Thursday works.\n\nThanks!");
    expect(stripQuoted("Yes please\r\n\r\nOn Tue, Oct 6, 2026 at 9:14 AM Dana <d@x.com> wrote:\r\n> old")).toBe("Yes please");
  });

  it("stops at Outlook's header, a signature, and drops the phone's sign-off", () => {
    expect(stripQuoted("See you then\n\nFrom: Maison Verre <hello@x.com>\nSent: Tuesday\nSubject: Hi")).toBe("See you then");
    expect(stripQuoted("Great\n-----Original Message-----\nold")).toBe("Great");
    expect(stripQuoted("Lovely, thank you\n\nSent from my iPhone")).toBe("Lovely, thank you");
    expect(stripQuoted("Lovely\n-- \nSofia Morales\nVP Sales")).toBe("Lovely");
  });

  it("keeps a line that only looks like a header", () => {
    expect(stripQuoted("On Monday I can come in.\nFrom: my office it's a short walk.")).toBe("On Monday I can come in.\nFrom: my office it's a short walk.");
  });

  it("reads an HTML-only email, without its quote", () => {
    const html = '<div>Yes &amp; thank you!<br>Thursday?</div><div class="gmail_quote">On Tue <b>Dana</b> wrote:<blockquote>old</blockquote></div>';
    expect(stripQuoted(htmlToText(html))).toBe("Yes & thank you!\nThursday?");
  });

  it("finds the address in a From line", () => {
    expect(addressOf("Sofia Morales <Sofia@Example.com>")).toBe("sofia@example.com");
    expect(addressOf("sofia@example.com")).toBe("sofia@example.com");
    expect(addressOf("Sofia")).toBeNull();
  });

  it("knows an out-of-office or a bounce from a person", () => {
    const person = { headers: {}, from: "sofia@example.com", subject: "Re: Your skin report" };
    expect(isAutomatic(person)).toBe(false);
    expect(isAutomatic({ ...person, headers: { "Auto-Submitted": "auto-replied" } })).toBe(true);
    expect(isAutomatic({ ...person, headers: { "Auto-Submitted": "no" } })).toBe(false);
    expect(isAutomatic({ ...person, subject: "Automatic reply: Your skin report" })).toBe(true);
    expect(isAutomatic({ ...person, subject: "Out of Office" })).toBe(true);
    expect(isAutomatic({ ...person, from: "MAILER-DAEMON@mx.example.com" })).toBe(true);
  });
});

describe("text keywords", () => {
  it("reads STOP and START as Twilio does, and nothing else", () => {
    for (const word of ["STOP", "stop", " Stop. ", "unsubscribe", "Stop all", "QUIT"]) expect(optKeyword(word)).toBe("stop");
    for (const word of ["START", "unstop", "Yes"]) expect(optKeyword(word)).toBe("start");
    for (const word of ["Please stop texting me on Sundays", "Yes please, Thursday", ""]) expect(optKeyword(word)).toBeNull();
  });
});

describe("the conversation", () => {
  it("waits on the latest reply until Dana answers it or marks it handled", () => {
    const sent = msg({ sentAt: "2026-10-02T17:00:00.000Z", createdAt: "2026-10-02T17:00:00.000Z" });
    const r = reply("2026-10-03T17:00:00.000Z");
    expect(waitingReply([sent, r])?.id).toBe(r.id);
    // A booking email afterwards went on its own: it doesn't answer her.
    expect(waitingReply([sent, r, msg({ type: "booking_confirmation", sentAt: "2026-10-04T17:00:00.000Z" })])?.id).toBe(r.id);
    expect(waitingReply([sent, r, msg({ type: ANSWER_TYPE, sentAt: "2026-10-04T17:00:00.000Z" })])).toBeNull();
    // So does a rebook message she sent by hand.
    expect(waitingReply([sent, r, msg({ type: "progress_moment", sentAt: "2026-10-04T17:00:00.000Z" })])).toBeNull();
    // A failed answer didn't reach her.
    expect(waitingReply([sent, r, msg({ type: ANSWER_TYPE, status: "failed", createdAt: "2026-10-04T17:00:00.000Z" })])?.id).toBe(r.id);
    expect(waitingReply([sent, r, msg({ type: HANDLED_TYPE, status: "skipped", dedupeKey: handledKey(r.id) })])).toBeNull();
    // A new reply after the answer waits again.
    const again = reply("2026-10-05T17:00:00.000Z");
    expect(waitingReply([sent, r, msg({ type: ANSWER_TYPE, sentAt: "2026-10-04T17:00:00.000Z" }), again])?.id).toBe(again.id);
  });

  it("never waits on a STOP, and remembers it until START", () => {
    const stop = reply("2026-10-03T17:00:00.000Z", { channel: "sms", body: "STOP" });
    expect(waitingReply([stop])).toBeNull();
    expect(optedOutOfTexts([stop])).toBe(true);
    expect(optedOutOfTexts([stop, reply("2026-10-04T17:00:00.000Z", { channel: "sms", body: "Start" })])).toBe(false);
    // An email saying stop isn't the carrier keyword.
    expect(optedOutOfTexts([reply("2026-10-03T17:00:00.000Z", { body: "STOP" })])).toBe(false);
  });

  it("answers by text only with a yes to texts, or their own text, and never after STOP", () => {
    const phone = "(310) 555-0142";
    expect(canAnswerByText({ phone, canText: true, messages: [] })).toBe(true);
    expect(canAnswerByText({ phone, canText: false, messages: [] })).toBe(false);
    expect(canAnswerByText({ phone, canText: false, messages: [reply("2026-10-03T17:00:00.000Z", { channel: "sms", body: "Hi" })] })).toBe(true);
    expect(canAnswerByText({ phone, canText: true, messages: [reply("2026-10-03T17:00:00.000Z", { channel: "sms", body: "STOP" })] })).toBe(false);
    expect(canAnswerByText({ phone: null, canText: true, messages: [] })).toBe(false);
  });

  it("reads in order, marks what went on its own, and names a sender that isn't on file", () => {
    const entries = thread(
      [
        reply("2026-10-03T17:00:00.000Z", { sender: "Sofia <sofia.work@example.com>" }),
        msg({ type: "report_link", sentAt: "2026-10-01T17:00:00.000Z" }),
        reply("2026-10-04T17:00:00.000Z", { sender: "+13105550142", channel: "sms" }),
        msg({ type: "demo_copy", sentAt: "2026-10-02T17:00:00.000Z" }),
      ],
      { email: "sofia@example.com", phone: "(310) 555-0142" },
    );
    expect(entries.map((e) => e.side)).toEqual(["clinic", "client", "client"]);
    expect(entries[0].automatic).toBe(true);
    expect(entries[1].sender).toBe("Sofia <sofia.work@example.com>");
    expect(entries[2].sender).toBeNull();
  });

  it("writes one Re:, never two", () => {
    expect(replySubject("Your skin report", "x")).toBe("Re: Your skin report");
    expect(replySubject("RE: Your skin report", "x")).toBe("RE: Your skin report");
    expect(replySubject(null, "A note from Maison Verre")).toBe("Re: A note from Maison Verre");
  });
});

describe("the demo's conversations", () => {
  const today = "2026-12-29";
  const treatments = SEED_TREATMENTS.filter((t) => t.clinicId === MAISON_VERRE.id);
  const products = SEED_PRODUCTS.filter((p) => p.clinicId === MAISON_VERRE.id);
  const bundle = buildDemoBundle({ clinic: MAISON_VERRE, treatments, products, staff: SEED_STAFF, sandboxId: "replies", today });
  const input: EngineInput = {
    clinic: MAISON_VERRE,
    practitionerName: "Dana",
    now: zonedDateTime(today, "09:30", MAISON_VERRE.timezone),
    reportUrl: (token) => `https://rebloom.test/r/${token}`,
    treatments,
    products,
    ...bundle,
    plans: bundle.plans.map((p) => ({ ...p, items: bundle.planItems.filter((i) => i.planId === p.id) })),
  };
  const facts = clientFacts(input);
  const of = (key: string) => facts.find((f) => f.client.demoKey === key)!;

  it("has Daniel and Priya waiting on an answer, and Amelia answered", () => {
    expect(facts.filter((f) => f.reply).map((f) => f.client.demoKey).sort()).toEqual(["daniel", "priya"]);
    expect(of("daniel").reply?.channel).toBe("sms");
    expect(of("priya").reply?.subject).toBe("Re: Your skin report from Maison Verre");
    expect(of("amelia").messages.some((m) => m.type === ANSWER_TYPE)).toBe(true);
  });

  it("happened in the past, after what it answers, and speaks in the clinic's voice", () => {
    const now = input.now.toISOString();
    for (const f of facts) {
      const lines = f.messages.filter((m) => m.type === REPLY_TYPE || m.type === ANSWER_TYPE || m.dedupeKey?.startsWith("demo_line:"));
      for (const m of lines) {
        expect(m.createdAt < now).toBe(true);
        expect(m.body).not.toMatch(/\{(practitioner|clinic)\}/);
        if (m.status !== "received") expect(checkCopy(m.body)).toEqual([]);
      }
    }
    // Seeded replies carry no sender: only a real reply decides who a demo answer reaches.
    expect(bundle.messages.filter((m) => m.status === "received").every((m) => !m.sender)).toBe(true);
  });
});

describe("reply addresses", () => {
  it("are the client's own, signed, and can't be made up", async () => {
    const { clientIdFromAddress, replyAddress, replyTo } = await import("@/lib/replies/address");
    const id = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
    const address = replyAddress(id)!;
    expect(address).toMatch(/^r-6f1c2a3b4d5e4f608a7b9c0d1e2f3a4b-[0-9a-f]{16}@reply\.maisonverre\.test$/);
    expect(clientIdFromAddress(address)).toBe(id);
    expect(clientIdFromAddress(address.toUpperCase())).toBe(id);
    expect(replyTo(MAISON_VERRE, id)).toBe(`"Maison Verre" <${address}>`);
    // Another client's id under this signature.
    expect(clientIdFromAddress(address.replace("3a4b-", "3a4c-"))).toBeNull();
    expect(clientIdFromAddress("hello@reply.maisonverre.test")).toBeNull();
  });
});

describe("Twilio's signature", () => {
  it("holds for the URL and fields Twilio sent, and not for anything changed", async () => {
    const { twilioSignature, validTwilioSignature } = await import("@/lib/sms/twilio");
    const url = "https://clinic.test/api/twilio/inbound";
    const params = new URLSearchParams({ MessageSid: "SM1", From: "+13105550142", Body: "Yes please" });
    const signature = twilioSignature(url, params, "twilio-token");
    expect(validTwilioSignature(["http://internal/api/twilio/inbound", url], params, signature)).toBe(true);
    expect(validTwilioSignature([url], new URLSearchParams({ MessageSid: "SM1", From: "+13105550142", Body: "No" }), signature)).toBe(false);
    expect(validTwilioSignature([url], params, null)).toBe(false);
  });
});

describe("a reply arriving", () => {
  let store: typeof import("@/lib/store/local").localStore;
  let receive: typeof import("@/lib/replies/receive");
  beforeAll(async () => {
    store = (await import("@/lib/store/local")).localStore;
    receive = await import("@/lib/replies/receive");
  });

  it("finds the client by their reply address, lands once, and comes after what it answers", async () => {
    const { replyAddress } = await import("@/lib/replies/address");
    await store.createSandbox("arrive", new Date());
    const client = await store.createClient({ clinicId: MAISON_VERRE.id, sandboxId: "arrive", now: new Date() });
    await store.updateClient(client.id, { firstName: "Ana", email: "ana@example.com", phone: "310.555.0177" });
    // Sent "later" on a demo clock that runs ahead.
    const ahead = new Date(Date.now() + 5 * 86_400_000).toISOString();
    await store.addMessage(msg({ clinicId: MAISON_VERRE.id, clientId: client.id, sandboxId: "arrive", sentAt: ahead, createdAt: ahead }));

    const found = await receive.clientForEmail(["someone@else.test", `Maison Verre <${replyAddress(client.id)}>`], "Ana <ana@example.com>");
    expect(found?.id).toBe(client.id);
    const inbound = { channel: "email" as const, providerId: "em_1", sender: "ana@example.com", subject: "Re: Hi", body: "Thursday?" };
    const first = await receive.saveReply(found!, inbound);
    expect(first.status).toBe("saved");
    expect((await receive.saveReply(found!, inbound)).status).toBe("duplicate");
    const saved = (await store.listClientMessages(client.id)).find((m) => m.status === "received")!;
    expect(saved.createdAt > ahead).toBe(true);
    expect(saved.sender).toBe("ana@example.com");
  });

  it("falls back to the one real client with that address or number, and not to a guess", async () => {
    const make = async (email: string, phone: string) => {
      const c = await store.createClient({ clinicId: MAISON_VERRE.id, sandboxId: "arrive", now: new Date() });
      return store.updateClient(c.id, { email, phone });
    };
    const bea = await make("Bea@Example.com", "(415) 555-0101");
    expect((await receive.clientForEmail(["hello@reply.maisonverre.test"], "bea@example.com"))?.id).toBe(bea.id);
    expect((await receive.clientForPhone("+14155550101"))?.id).toBe(bea.id);
    await make("bea@example.com", "415 555 0101");
    expect(await receive.clientForEmail([], "bea@example.com")).toBeNull();
    // The same number twice: the newest, when the clinic hasn't texted either.
    expect(await receive.clientForPhone("+14155550101")).not.toBeNull();
    expect(await receive.clientForEmail([], "nobody@example.com")).toBeNull();
  });
});

describe("the report gate's details", () => {
  it("needs a first name, a last name and a primary email", async () => {
    const { unlockSchema } = await import("@/lib/flow/intake-schema");
    const ok = { firstName: "Bruce", lastName: "Lee", email: "Bruce@Example.com", phone: "" };
    expect(unlockSchema.parse(ok).email).toBe("bruce@example.com");
    expect(unlockSchema.safeParse({ ...ok, lastName: "  " }).error?.issues[0].message).toBe("Please add your last name.");
    expect(unlockSchema.safeParse({ ...ok, firstName: "" }).error?.issues[0].message).toBe("Please add your first name.");
    expect(unlockSchema.safeParse({ ...ok, email: "" }).error?.issues[0].message).toBe("Please add your primary email.");
  });
});
