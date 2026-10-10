import { describe, expect, it } from "vitest";
import { MAISON_VERRE } from "@/data/clinics";
import type { Client, Message } from "@/lib/domain";
import { HANDOFF_DAYS, answerLink, handoffToken, readHandoffToken } from "@/lib/dashboard/handoff";
import { waitingReplies } from "@/lib/dashboard/replies";
import { ANSWER_TYPE, REPLY_TYPE } from "@/lib/replies/thread";

const sandbox = "0b6f3c1e-7d2a-4f5b-9c8e-1a2b3c4d5e6f";
const client = "9f8e7d6c-5b4a-4321-8fed-cba987654321";
const now = new Date("2026-10-10T09:00:00Z");

describe("the Answer link that works on any device (DECISIONS D-088)", () => {
  it("names the demo and the client, and nothing reads it back changed", () => {
    const token = handoffToken(sandbox, client, now)!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(readHandoffToken(token, now)).toEqual({ sandboxId: sandbox, clientId: client });

    // One character changed anywhere: the signature no longer holds.
    for (const i of [0, 20, 40, 63]) {
      const swapped = token.slice(0, i) + (token[i] === "A" ? "B" : "A") + token.slice(i + 1);
      expect(readHandoffToken(swapped, now)).toBeNull();
    }
    expect(readHandoffToken(token.slice(1), now)).toBeNull();
    expect(readHandoffToken("not a token", now)).toBeNull();
  });

  it(`lasts ${HANDOFF_DAYS} days`, () => {
    const token = handoffToken(sandbox, client, now)!;
    const day = 86_400_000;
    expect(readHandoffToken(token, new Date(now.getTime() + (HANDOFF_DAYS - 1) * day))).not.toBeNull();
    expect(readHandoffToken(token, new Date(now.getTime() + (HANDOFF_DAYS + 1) * day))).toBeNull();
  });

  it("goes through the handoff for a demo client, and straight to the brief for a clinic's own", () => {
    expect(answerLink("https://www.rebloom.test", { id: client, sandboxId: sandbox }, now)).toBe(
      `https://www.rebloom.test/dashboard/open/${handoffToken(sandbox, client, now)}`,
    );
    expect(answerLink("https://www.rebloom.test", { id: client, sandboxId: null }, now)).toBe(
      `https://www.rebloom.test/dashboard/clients/${client}#conversation`,
    );
  });
});

describe("who the dashboard's live notice counts as waiting (D-089)", () => {
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
});
