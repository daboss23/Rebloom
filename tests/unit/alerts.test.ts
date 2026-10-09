import { beforeAll, describe, expect, it, vi } from "vitest";

// Before any import: the store picks its data folder as it loads, and alerts only go out with email set up.
await vi.hoisted(async () => {
  const [{ mkdtempSync }, os, path] = await Promise.all([import("node:fs"), import("node:os"), import("node:path")]);
  process.env.REBLOOM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "rebloom-alerts-test-"));
  process.env.REBLOOM_STORE = "local";
  process.env.RESEND_API_KEY = "re_test";
  process.env.APP_URL = "https://www.rebloom.test";
});

import { MAISON_VERRE } from "@/data/clinics";
import { checkCopy } from "@/lib/copy/check";
import type { Message } from "@/lib/domain";
import { ALERT_BURST_MS, alertEmail, alertText, alertWorthy } from "@/lib/replies/alert";
import { ANSWER_TYPE, REPLY_TYPE } from "@/lib/replies/thread";
import { textParts } from "@/lib/sms/text";

let n = 0;
const msg = (patch: Partial<Message>): Message => ({
  id: `m${++n}`,
  clinicId: MAISON_VERRE.id,
  clientId: "c",
  sandboxId: "sb",
  type: "report_follow_up",
  channel: "email",
  subject: null,
  body: "Hi",
  status: "sent",
  dedupeKey: null,
  scheduledFor: null,
  sentAt: null,
  createdAt: "2026-10-09T09:00:00.000Z",
  ...patch,
});
const reply = (at: string, patch: Partial<Message> = {}) => msg({ type: REPLY_TYPE, status: "received", createdAt: at, sentAt: at, ...patch });
const minutes = (iso: string, m: number) => new Date(Date.parse(iso) + m * 60_000).toISOString();

describe("which replies are worth an alert (DECISIONS D-087)", () => {
  const t = "2026-10-09T10:00:00.000Z";
  const now = new Date(t);

  it("alerts for a reply that just arrived", () => {
    expect(alertWorthy({ reply: reply(t), before: [msg({})], receivedAt: now, now })).toBe(true);
  });

  it("stays quiet for STOP and START, which never wait on Dana", () => {
    expect(alertWorthy({ reply: reply(t, { channel: "sms", body: "STOP" }), before: [], receivedAt: now, now })).toBe(false);
    expect(alertWorthy({ reply: reply(t, { channel: "sms", body: "Stop please, wrong number" }), before: [], receivedAt: now, now })).toBe(true);
  });

  it("stays quiet for a reply fetched long after it arrived", () => {
    const later = new Date(Date.parse(t) + 2 * 86_400_000);
    expect(alertWorthy({ reply: reply(t), before: [], receivedAt: now, now: later })).toBe(false);
  });

  it("sends one alert for a burst, and another once the first was answered or an hour has passed", () => {
    const first = reply(t, { body: "Can I come Thursday?" });
    expect(alertWorthy({ reply: reply(minutes(t, 2), { body: "Or Friday." }), before: [first], receivedAt: now, now })).toBe(false);
    const answered = [first, msg({ type: ANSWER_TYPE, createdAt: minutes(t, 5), sentAt: minutes(t, 5) })];
    expect(alertWorthy({ reply: reply(minutes(t, 10)), before: answered, receivedAt: now, now })).toBe(true);
    expect(alertWorthy({ reply: reply(minutes(t, ALERT_BURST_MS / 60_000 + 1)), before: [first], receivedAt: now, now })).toBe(true);
  });
});

describe("the alert itself", () => {
  const client = { firstName: "Priya", lastName: "Shah", isDemo: false };
  const link = "https://www.rebloom.test/dashboard/clients/abc#conversation";

  it("says who wrote, how, and what, with a gold button to answer", () => {
    const mail = alertEmail({ clinic: MAISON_VERRE, client, reply: { channel: "email", subject: "Re: Your skin report", body: "Is there any downtime after the first session?", sender: null }, when: "Fri, Oct 9 · 2:14pm", link });
    expect(mail.subject).toBe("Priya Shah wrote back");
    expect(mail.from).toMatch(/^"Rebloom" </);
    expect(mail.text).toContain('"Is there any downtime after the first session?"');
    expect(mail.text).toContain(`Answer Priya: ${link}`);
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.html).toContain("Priya wrote back.");
    expect(mail.html).toContain("By email · Fri, Oct 9 · 2:14pm");
    expect(checkCopy(mail.text)).toEqual([]);
  });

  it("keeps what the client typed as text, and cuts a long reply", () => {
    const mail = alertEmail({ clinic: MAISON_VERRE, client, reply: { channel: "sms", subject: null, body: `<script>x</script> ${"word ".repeat(200)}`, sender: null }, when: "now", link });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("The rest is on their brief.");
    expect(mail.text.length).toBeLessThan(1200);
  });

  it("says plainly when a sample client's reply really came from someone trying the demo", () => {
    const mail = alertEmail({ clinic: MAISON_VERRE, client: { ...client, isDemo: true }, reply: { channel: "email", subject: null, body: "Hi!", sender: "judge@example.com" }, when: "now", link });
    expect(mail.text.startsWith("Rebloom demo: Priya is a sample client. This reply came from judge@example.com.")).toBe(true);
  });

  it("fits a text alert in two parts, link included", () => {
    const text = alertText({ clinic: MAISON_VERRE, client, reply: { body: "Hello ".repeat(100) }, link });
    expect(text.startsWith('Rebloom: Priya Shah wrote back to Maison Verre: "Hello')).toBe(true);
    expect(text.endsWith(`" Answer: ${link}`)).toBe(true);
    expect(textParts(text)).toEqual({ parts: 2, unicode: false });
  });
});

describe("a reply landing sends the alert", () => {
  let store: typeof import("@/lib/store/local").localStore;
  let receive: typeof import("@/lib/replies/receive");
  let resendModule: typeof import("@/lib/email/resend");
  beforeAll(async () => {
    store = (await import("@/lib/store/local")).localStore;
    receive = await import("@/lib/replies/receive");
    resendModule = await import("@/lib/email/resend");
  });

  it("emails the address in Settings once per reply, and nothing without one", async () => {
    const send = vi.fn(async () => ({ data: { id: "sent" }, error: null }));
    const spy = vi.spyOn(resendModule, "resend").mockReturnValue({ emails: { send } } as never);
    await store.createSandbox("alerts", new Date());
    const client = await store.createClient({ clinicId: MAISON_VERRE.id, sandboxId: "alerts", now: new Date() });
    await store.updateClient(client.id, { firstName: "Ana", lastName: "Reyes", email: "ana@example.com" });
    const found = (await store.getClient(client.id))!;

    // No address in Settings: kept, no alert.
    expect((await receive.saveReply(found, { channel: "email", providerId: "a1", sender: "ana@example.com", subject: "Re: Hi", body: "Thursday?" })).status).toBe("saved");
    expect(send).not.toHaveBeenCalled();

    await store.setClinicSettings(MAISON_VERRE.id, "alerts", { alertEmail: "dana@maisonverre.test" }, new Date());
    // Dana answers, then Ana writes again: an alert, keyed to the reply so a retried webhook sends one.
    const now = new Date(Date.now() + 120_000).toISOString();
    await store.addMessage(msg({ clientId: client.id, sandboxId: "alerts", type: ANSWER_TYPE, createdAt: now, sentAt: now }));
    expect((await receive.saveReply(found, { channel: "email", providerId: "a2", sender: "ana@example.com", subject: "Re: Hi", body: "Friday works too." })).status).toBe("saved");
    expect(send).toHaveBeenCalledTimes(1);
    const [mail, options] = send.mock.calls[0] as unknown as [{ to: string; subject: string; text: string }, { idempotencyKey: string }];
    expect(mail.to).toBe("dana@maisonverre.test");
    expect(mail.subject).toBe("Ana Reyes wrote back");
    expect(mail.text).toContain(`https://www.rebloom.test/dashboard/clients/${client.id}#conversation`);
    expect(options.idempotencyKey).toMatch(/^reply_alert:/);

    // The same webhook again: a duplicate, no second alert. A line straight after: the first alert covers it.
    await receive.saveReply(found, { channel: "email", providerId: "a2", sender: "ana@example.com", subject: "Re: Hi", body: "Friday works too." });
    await receive.saveReply(found, { channel: "email", providerId: "a3", sender: "ana@example.com", subject: "Re: Hi", body: "Morning if possible." });
    expect(send).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("keeps the reply when the alert can't be sent", async () => {
    const spy = vi.spyOn(resendModule, "resend").mockReturnValue({ emails: { send: vi.fn(async () => { throw new Error("down"); }) } } as never);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    await store.createSandbox("alerts-down", new Date());
    await store.setClinicSettings(MAISON_VERRE.id, "alerts-down", { alertEmail: "dana@maisonverre.test" }, new Date());
    const client = await store.createClient({ clinicId: MAISON_VERRE.id, sandboxId: "alerts-down", now: new Date() });
    await store.updateClient(client.id, { firstName: "Bo", email: "bo@example.com" });
    const result = await receive.saveReply((await store.getClient(client.id))!, { channel: "email", providerId: "b1", sender: "bo@example.com", subject: null, body: "Hi" });
    expect(result.status).toBe("saved");
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
    spy.mockRestore();
  });
});
