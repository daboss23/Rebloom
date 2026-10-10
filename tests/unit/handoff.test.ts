import { describe, expect, it } from "vitest";
import { MAISON_VERRE } from "@/data/clinics";
import type { Client, Message } from "@/lib/domain";
import { HANDOFF_DAYS, answerLink, clinicSideLink, handoffToken, readHandoffToken, scanLink } from "@/lib/dashboard/handoff";
import { newClients, waitingReplies } from "@/lib/dashboard/live";
import { reportEmail } from "@/lib/email/report";
import { ANSWER_TYPE, REPLY_TYPE } from "@/lib/replies/thread";

const sandbox = "0b6f3c1e-7d2a-4f5b-9c8e-1a2b3c4d5e6f";
const client = "9f8e7d6c-5b4a-4321-8fed-cba987654321";
const now = new Date("2026-10-10T09:00:00Z");

describe("links that carry a demo to any device (DECISIONS D-088, D-090)", () => {
  it("name the demo and one thing in it, and nothing reads them back changed", () => {
    const token = handoffToken("answer", sandbox, client, now)!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(readHandoffToken("answer", token, now)).toEqual({ sandboxId: sandbox, subjectId: client });

    // One character changed anywhere: the signature no longer holds.
    for (const i of [0, 20, 40, 63]) {
      const swapped = token.slice(0, i) + (token[i] === "A" ? "B" : "A") + token.slice(i + 1);
      expect(readHandoffToken("answer", swapped, now)).toBeNull();
    }
    expect(readHandoffToken("answer", token.slice(1), now)).toBeNull();
    expect(readHandoffToken("answer", "not a token", now)).toBeNull();
  });

  it("only work for what they were made for", () => {
    const brief = handoffToken("brief", sandbox, client, now)!;
    expect(readHandoffToken("brief", brief, now)).not.toBeNull();
    expect(readHandoffToken("answer", brief, now)).toBeNull();
    expect(readHandoffToken("scan", brief, now)).toBeNull();
    expect(readHandoffToken("brief", handoffToken("scan", sandbox, client, now)!, now)).toBeNull();
  });

  it(`last ${HANDOFF_DAYS} days`, () => {
    const token = handoffToken("brief", sandbox, client, now)!;
    const day = 86_400_000;
    expect(readHandoffToken("brief", token, new Date(now.getTime() + (HANDOFF_DAYS - 1) * day))).not.toBeNull();
    expect(readHandoffToken("brief", token, new Date(now.getTime() + (HANDOFF_DAYS + 1) * day))).toBeNull();
  });

  it("send an alert through the handoff for a demo client, and straight to the brief for a clinic's own", () => {
    expect(answerLink("https://www.rebloom.test", { id: client, sandboxId: sandbox }, now)).toBe(
      `https://www.rebloom.test/dashboard/open/${handoffToken("answer", sandbox, client, now)}`,
    );
    expect(answerLink("https://www.rebloom.test", { id: client, sandboxId: null }, now)).toBe(
      `https://www.rebloom.test/dashboard/clients/${client}#conversation`,
    );
  });

  it("show the clinic's side only to someone who scanned themselves into the demo", () => {
    expect(clinicSideLink("", { id: client, sandboxId: sandbox, demoKey: null }, now)).toBe(`/dashboard/open/${handoffToken("brief", sandbox, client, now)}`);
    // A sample client's report, or a real clinic's client: no link.
    expect(clinicSideLink("", { id: client, sandboxId: sandbox, demoKey: "sofia" }, now)).toBeNull();
    expect(clinicSideLink("", { id: client, sandboxId: null, demoKey: null }, now)).toBeNull();
  });

  it("carry the dashboard's demo to a phone, to scan in at its clinic", () => {
    const link = scanLink("https://www.rebloom.test", sandbox, MAISON_VERRE, now)!;
    expect(link).toMatch(/^https:\/\/www\.rebloom\.test\/scan\/[A-Za-z0-9_-]{64}$/);
    expect(readHandoffToken("scan", link.split("/").pop()!, now)).toEqual({ sandboxId: sandbox, subjectId: MAISON_VERRE.id });
  });

  it("put the clinic's side in the report email, only when given", () => {
    const base = { clinic: MAISON_VERRE, firstName: "Ana", url: "https://www.rebloom.test/r/abc" };
    const plain = reportEmail(base);
    expect(plain.text).not.toContain("Rebloom demo");
    const demo = reportEmail({ ...base, clinicSideUrl: "https://www.rebloom.test/dashboard/open/xyz" });
    expect(demo.text).toContain("Rebloom demo: you're now a new prospect in Maison Verre's dashboard. See it from the clinic's side: https://www.rebloom.test/dashboard/open/xyz");
    expect(demo.html).toContain('href="https://www.rebloom.test/dashboard/open/xyz"');
  });
});

describe("what the dashboard's live notice watches for (D-089, D-090)", () => {
  let n = 0;
  const msg = (patch: Partial<Message>): Message => ({
    id: `m${++n}`,
    clinicId: MAISON_VERRE.id,
    clientId: "a",
    sandboxId: sandbox,
    type: REPLY_TYPE,
    channel: "email",
    subject: null,
    body: "Hi",
    status: "received",
    dedupeKey: null,
    scheduledFor: null,
    sentAt: null,
    createdAt: "2026-10-09T09:00:00.000Z",
    ...patch,
  });
  const person = (id: string, firstName: string | null, lastName: string | null = null) => ({ id, firstName, lastName }) as Client;

  it("lists replies still waiting, newest first, the same way Today does", () => {
    const clients = [person("a", "Ana", "Reyes"), person("b", "Ben"), person("c", "Cleo"), person("d", null)];
    const messages = [
      msg({ clientId: "a", body: "Is   Thursday\nfree?", createdAt: "2026-10-09T09:00:00.000Z" }),
      msg({ clientId: "b", channel: "sms", body: "Friday?", createdAt: "2026-10-09T11:00:00.000Z" }),
      // Cleo was answered, so she isn't waiting.
      msg({ clientId: "c", createdAt: "2026-10-09T08:00:00.000Z" }),
      msg({ clientId: "c", type: ANSWER_TYPE, status: "sent", sentAt: "2026-10-09T08:30:00.000Z" }),
      // A new lead still mid-intake has no name to show: Today leaves them out too.
      msg({ clientId: "d", createdAt: "2026-10-09T12:00:00.000Z" }),
    ];
    const waiting = waitingReplies(clients, messages);
    expect(waiting.map((w) => w.first)).toEqual(["Ben", "Ana"]);
    expect(waiting[0]).toMatchObject({ clientId: "b", name: "Ben", channel: "sms", body: "Friday?" });
    expect(waiting[1]).toMatchObject({ name: "Ana Reyes", body: "Is Thursday free?" });
  });

  it("counts people who scanned themselves in and gave their name, newest first, never the sample clients", () => {
    const at = (iso: string, patch: Partial<Client>) => ({ id: iso, firstName: null, lastName: null, demoKey: null, createdAt: iso, ...patch }) as Client;
    const clients = [
      at("2026-10-09T09:00:00.000Z", { firstName: "Joshua", lastName: "Reed" }),
      at("2026-10-09T10:00:00.000Z", { firstName: "Mia" }),
      // Mid-scan, no name yet; and a sample client.
      at("2026-10-09T11:00:00.000Z", {}),
      at("2026-10-09T12:00:00.000Z", { firstName: "Sofia", demoKey: "sofia" }),
    ];
    expect(newClients(clients)).toEqual([
      { clientId: "2026-10-09T10:00:00.000Z", name: "Mia", first: "Mia", at: "2026-10-09T10:00:00.000Z" },
      { clientId: "2026-10-09T09:00:00.000Z", name: "Joshua Reed", first: "Joshua", at: "2026-10-09T09:00:00.000Z" },
    ]);
  });
});
