import { beforeAll, describe, expect, it, vi } from "vitest";

// Before any import: the emails import the store, and the store picks its data folder as it loads.
await vi.hoisted(async () => {
  const [{ mkdtempSync }, os, path] = await Promise.all([import("node:fs"), import("node:os"), import("node:path")]);
  process.env.REBLOOM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "rebloom-unsubscribe-test-"));
  process.env.REBLOOM_STORE = "local";
});

import { MAISON_VERRE } from "@/data/clinics";
import { SEED_PRODUCTS, SEED_TREATMENTS } from "@/data/menu";
import { SEED_STAFF } from "@/data/staff";
import { zonedDateTime } from "@/lib/clock";
import { checkCopy } from "@/lib/copy/check";
import { buildDemoBundle } from "@/lib/demo/seed";
import type { Message } from "@/lib/domain";
import { OPT_IN_TYPE, OPT_OUT_TYPE, canWriteByEmail, unsubscribedAddresses, unsubscribedAt } from "@/lib/email/opt-out";
import { bookingConfirmationEmail } from "@/lib/email/booking";
import { UNSUBSCRIBE_LINE, rebookEmail } from "@/lib/email/rebook";
import { reportEmail } from "@/lib/email/report";
import { EMAIL_UPDATES_NOTICE } from "@/lib/flow/consent";
import { buildQueue, clientFacts, type EngineInput } from "@/lib/rebook/engine";
import { thread } from "@/lib/replies/thread";

let n = 0;
const msg = (patch: Partial<Message>): Message => ({
  id: `m${++n}`,
  clinicId: MAISON_VERRE.id,
  clientId: "a",
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
const optOut = (clientId: string, at: string) => msg({ clientId, type: OPT_OUT_TYPE, status: "skipped", body: "Unsubscribed from emails.", createdAt: at, sentAt: at });
const optIn = (clientId: string, at: string) => msg({ clientId, type: OPT_IN_TYPE, status: "skipped", body: "Chose to keep getting emails.", createdAt: at, sentAt: at });

describe("who has unsubscribed (DECISIONS D-086)", () => {
  const clients = [
    { id: "a", email: "Sofia@Example.com" },
    { id: "b", email: "sofia@example.com" },
    { id: "c", email: "grace@example.com" },
    { id: "d", email: null },
  ];

  it("belongs to the address, so the same person on two records is unsubscribed on both", () => {
    const map = unsubscribedAddresses(clients, [optOut("a", "2026-10-02T09:00:00.000Z")]);
    expect(unsubscribedAt(clients[0], map)).toBe("2026-10-02T09:00:00.000Z");
    expect(unsubscribedAt(clients[1], map)).toBe("2026-10-02T09:00:00.000Z");
    expect(unsubscribedAt(clients[2], map)).toBeNull();
    expect(unsubscribedAt(clients[3], map)).toBeNull();
  });

  it("follows the latest say, from either record, whatever order the rows come in", () => {
    const back = [optIn("b", "2026-10-03T09:00:00.000Z"), optOut("a", "2026-10-02T09:00:00.000Z")];
    expect(unsubscribedAddresses(clients, back).size).toBe(0);
    const again = [...back, optOut("b", "2026-10-04T09:00:00.000Z")];
    expect(unsubscribedAt(clients[0], unsubscribedAddresses(clients, again))).toBe("2026-10-04T09:00:00.000Z");
  });

  it("lets Dana email them again only to answer something they wrote since", () => {
    const at = "2026-10-02T09:00:00.000Z";
    const before = msg({ type: "reply", status: "received", createdAt: "2026-10-01T09:00:00.000Z", sentAt: "2026-10-01T09:00:00.000Z" });
    const after = msg({ type: "reply", status: "received", createdAt: "2026-10-03T09:00:00.000Z", sentAt: "2026-10-03T09:00:00.000Z" });
    expect(canWriteByEmail({ email: "s@example.com", unsubscribedAt: null, messages: [] })).toBe(true);
    expect(canWriteByEmail({ email: null, unsubscribedAt: null, messages: [] })).toBe(false);
    expect(canWriteByEmail({ email: "s@example.com", unsubscribedAt: at, messages: [before] })).toBe(false);
    expect(canWriteByEmail({ email: "s@example.com", unsubscribedAt: at, messages: [before, after] })).toBe(true);
  });

  it("shows in the conversation as a line, not a message", () => {
    const entries = thread([optOut("a", "2026-10-02T09:00:00.000Z")]);
    expect(entries).toHaveLength(1);
    expect(entries[0].side).toBe("note");
  });
});

describe("the rebook queue after an unsubscribe", () => {
  const today = "2026-12-29";
  const clinic = MAISON_VERRE;
  const treatments = SEED_TREATMENTS.filter((t) => t.clinicId === clinic.id);
  const products = SEED_PRODUCTS.filter((p) => p.clinicId === clinic.id);
  const bundle = buildDemoBundle({ clinic, treatments, products, staff: SEED_STAFF, sandboxId: "sandbox", today });
  const now = zonedDateTime(today, "09:30", clinic.timezone);
  const input = (extra: Message[] = [], clients = bundle.clients): EngineInput => ({
    clinic,
    practitionerName: "Dana",
    now,
    reportUrl: (token) => `https://rebloom.test/r/${token}`,
    treatments,
    products,
    ...bundle,
    clients,
    messages: [...bundle.messages, ...extra],
    plans: bundle.plans.map((p) => ({ ...p, items: bundle.planItems.filter((i) => i.planId === p.id) })),
  });
  const idOf = (key: string) => bundle.clients.find((c) => c.demoKey === key)!.id;
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString();

  it("texts a client who said yes to texts, and says why", () => {
    const sofia = idOf("sofia");
    expect(buildQueue(input()).items.find((i) => i.clientId === sofia)!.action).toBe("email");
    const item = buildQueue(input([optOut(sofia, yesterday)])).items.find((i) => i.clientId === sofia)!;
    expect(item.action).toBe("text");
    expect(item.draft).toBeNull();
    expect(item.text).not.toBeNull();
    expect(item.reason.endsWith("Unsubscribed from emails, so a text.")).toBe(true);
    expect(checkCopy(item.reason)).toEqual([]);
  });

  it("calls a client who can't be texted, and never offers the email", () => {
    const emailOnly = buildQueue(input()).items.find((i) => i.action === "email" && !i.text)!;
    const item = buildQueue(input([optOut(emailOnly.clientId, yesterday)])).items.find((i) => i.clientId === emailOnly.clientId)!;
    expect(item.action).toBe("call");
    expect(item.draft).toBeNull();
    expect(item.reason.endsWith("Unsubscribed from emails, so a call.")).toBe(true);
    expect(item.reason).not.toMatch(/ {2}/);
  });

  it("covers a second record on the same address, and lifts once they choose to keep emails", () => {
    const sofia = bundle.clients.find((c) => c.demoKey === "sofia")!;
    const amelia = bundle.clients.find((c) => c.demoKey === "amelia")!;
    // Amelia's record on Sofia's address: the same person, scanned twice.
    const clients = bundle.clients.map((c) => (c.id === amelia.id ? { ...c, email: sofia.email!.toUpperCase() } : c));
    const facts = clientFacts(input([optOut(sofia.id, yesterday)], clients));
    expect(facts.find((f) => f.client.id === amelia.id)!.canEmail).toBe(false);
    const lifted = clientFacts(input([optOut(sofia.id, yesterday), optIn(amelia.id, now.toISOString())], clients));
    expect(lifted.find((f) => f.client.id === sofia.id)!.canEmail).toBe(true);
    expect(lifted.find((f) => f.client.id === sofia.id)!.unsubscribedAt).toBeNull();
  });
});

describe("the way out in every reminder", () => {
  const unsubscribeUrl = "https://rebloom.test/c/maison-verre/unsubscribe/abc";

  it("sits at the foot of a rebook email, in the text and the HTML", () => {
    const mail = rebookEmail({ clinic: MAISON_VERRE, subject: "Hello", body: "Hi Sofia,\n\nA note.", unsubscribeUrl });
    expect(mail.text).toContain(`${UNSUBSCRIBE_LINE} Unsubscribe: ${unsubscribeUrl}`);
    expect(mail.html).toContain(`href="${unsubscribeUrl}"`);
    expect(mail.html).toContain(">Unsubscribe</a>");
    expect(checkCopy(mail.text)).toEqual([]);
  });

  it("is on the demo copy too, and on the report email", () => {
    expect(rebookEmail({ clinic: MAISON_VERRE, subject: "Hello", body: "Hi", demoFor: "Sofia Morales", unsubscribeUrl }).html).toContain(unsubscribeUrl);
    const report = reportEmail({ clinic: MAISON_VERRE, firstName: "Sofia", url: "https://rebloom.test/r/x", unsubscribeUrl });
    expect(report.text).toContain(`Unsubscribe: ${unsubscribeUrl}`);
    expect(report.html).toContain(`href="${unsubscribeUrl}"`);
    expect(checkCopy(report.text)).toEqual([]);
  });

  it("stays off booking emails, which are about a visit they booked", () => {
    const mail = bookingConfirmationEmail({
      clinic: MAISON_VERRE,
      firstName: "Sofia",
      treatmentName: "Signature Peel",
      startsAt: "2026-10-14T18:00:00.000Z",
      endsAt: "2026-10-14T19:00:00.000Z",
      depositCents: 5000,
      reportUrl: "https://rebloom.test/r/x",
      noticeHours: 24,
    });
    expect(mail.html).not.toContain("Unsubscribe");
  });

  it("is promised at the report gate, in the clinic's voice", () => {
    expect(EMAIL_UPDATES_NOTICE("Maison Verre")).toMatch(/Unsubscribe at any time/);
    expect(checkCopy(EMAIL_UPDATES_NOTICE("Maison Verre"))).toEqual([]);
  });
});

describe("the unsubscribe link and page", () => {
  let store: typeof import("@/lib/store/local").localStore;
  let unsubscribe: typeof import("@/lib/email/unsubscribe");
  beforeAll(async () => {
    store = (await import("@/lib/store/local")).localStore;
    unsubscribe = await import("@/lib/email/unsubscribe");
  });

  it("signs each client's token, and refuses one that's been changed", () => {
    const id = "5f0c6a52-3b1e-4c8e-9a7d-2e6f1b0c9d84";
    const token = unsubscribe.unsubscribeToken(id)!;
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    expect(unsubscribe.clientIdFromUnsubscribeToken(token)).toBe(id);
    expect(unsubscribe.clientIdFromUnsubscribeToken(token.toUpperCase())).toBe(id);
    const other = token.slice(0, 31) + (token[31] === "0" ? "1" : "0") + token.slice(32);
    expect(unsubscribe.clientIdFromUnsubscribeToken(other)).toBeNull();
    expect(unsubscribe.clientIdFromUnsubscribeToken("not-a-token")).toBeNull();
  });

  it("links to the clinic's own page, with the headers a mail app's Unsubscribe button posts to", () => {
    const id = "5f0c6a52-3b1e-4c8e-9a7d-2e6f1b0c9d84";
    const links = unsubscribe.unsubscribeLinks("https://www.rebloom.skin/", MAISON_VERRE, id)!;
    const token = unsubscribe.unsubscribeToken(id);
    expect(links.page).toBe(`https://www.rebloom.skin/c/${MAISON_VERRE.slug}/unsubscribe/${token}`);
    expect(links.headers["List-Unsubscribe"]).toBe(`<https://www.rebloom.skin/api/unsubscribe/${token}>`);
    expect(links.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("records an unsubscribe once, for every record on the address, until they choose to keep emails", async () => {
    await store.createSandbox("unsub", new Date());
    const make = async (email: string) => {
      const c = await store.createClient({ clinicId: MAISON_VERRE.id, sandboxId: "unsub", now: new Date() });
      return store.updateClient(c.id, { firstName: "Ana", email });
    };
    const ana = await make("ana@example.com");
    const twin = await make("ANA@example.com");
    const elsewhere = await make("bo@example.com");

    expect((await unsubscribe.emailPreference(MAISON_VERRE, ana.id))!.unsubscribedAt).toBeNull();
    const out = await unsubscribe.setEmailPreference(MAISON_VERRE, ana.id, "out", "page");
    expect(out!.unsubscribedAt).not.toBeNull();
    // Pressed twice, or posted again by a mail app: one line.
    await unsubscribe.setEmailPreference(MAISON_VERRE, ana.id, "out", "mail_app");
    await unsubscribe.setEmailPreference(MAISON_VERRE, twin.id, "out", "page");
    const lines = (await store.listClientMessages(ana.id)).filter((m) => m.type === OPT_OUT_TYPE);
    expect(lines).toHaveLength(1);
    expect(lines[0].status).toBe("skipped");
    expect(lines[0].body).toBe("Unsubscribed from emails, from the link in an email.");
    expect((await store.listClientMessages(twin.id)).some((m) => m.type === OPT_OUT_TYPE)).toBe(false);

    expect((await unsubscribe.emailPreference(MAISON_VERRE, twin.id))!.unsubscribedAt).not.toBeNull();
    expect((await unsubscribe.emailPreference(MAISON_VERRE, elsewhere.id))!.unsubscribedAt).toBeNull();

    const back = await unsubscribe.setEmailPreference(MAISON_VERRE, twin.id, "in", "page");
    expect(back!.unsubscribedAt).toBeNull();
    expect((await unsubscribe.emailPreference(MAISON_VERRE, ana.id))!.unsubscribedAt).toBeNull();
  });

  it("says Dana recorded it when the client asked her", async () => {
    await store.createSandbox("unsub-staff", new Date());
    const c = await store.createClient({ clinicId: MAISON_VERRE.id, sandboxId: "unsub-staff", now: new Date() });
    await store.updateClient(c.id, { firstName: "Cy", email: "cy@example.com" });
    await unsubscribe.setEmailPreference(MAISON_VERRE, c.id, "out", { staff: "Dana" });
    const line = (await store.listClientMessages(c.id)).find((m) => m.type === OPT_OUT_TYPE)!;
    expect(line.body).toBe("Emails stopped by Dana, at their request.");
  });

  it("finds nothing for another clinic's client, or one whose details are gone", async () => {
    await store.createSandbox("unsub-gone", new Date());
    const c = await store.createClient({ clinicId: MAISON_VERRE.id, sandboxId: "unsub-gone", now: new Date() });
    await store.updateClient(c.id, { email: "gone@example.com" });
    expect(await unsubscribe.emailPreference({ id: "another-clinic" }, c.id)).toBeNull();
    await store.deleteClientData(c.id, new Date());
    expect(await unsubscribe.emailPreference(MAISON_VERRE, c.id)).toBeNull();
    expect(await unsubscribe.setEmailPreference(MAISON_VERRE, c.id, "out", "page")).toBeNull();
  });
});
