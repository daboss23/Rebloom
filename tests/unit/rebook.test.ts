import { describe, expect, it } from "vitest";
import { MAISON_VERRE, TIDEWATER } from "@/data/clinics";
import { SEED_PRODUCTS, SEED_TREATMENTS } from "@/data/menu";
import { SEED_STAFF } from "@/data/staff";
import type { Clinic, Message } from "@/lib/domain";
import { addDays, zonedDateTime } from "@/lib/clock";
import { checkCopy } from "@/lib/copy/check";
import { buildDemoBundle, type DemoBundle } from "@/lib/demo/seed";
import { buildQueue, type EngineInput, type Queue, type TriggerKind } from "@/lib/rebook/engine";

function inputFor(today: string, opts: { clinic?: Clinic; days?: number; bundle?: DemoBundle; extra?: Message[] } = {}): EngineInput {
  const clinic = opts.clinic ?? MAISON_VERRE;
  const treatments = SEED_TREATMENTS.filter((t) => t.clinicId === clinic.id);
  const products = SEED_PRODUCTS.filter((p) => p.clinicId === clinic.id);
  const bundle = opts.bundle ?? buildDemoBundle({ clinic, treatments, products, staff: SEED_STAFF, sandboxId: "sandbox", today });
  const plans = bundle.plans.map((p) => ({ ...p, items: bundle.planItems.filter((i) => i.planId === p.id) }));
  return {
    clinic,
    practitionerName: "Dana",
    // Mid-morning on the sandbox's today, plus any time travel.
    now: addDays(zonedDateTime(today, "09:30", clinic.timezone), opts.days ?? 0),
    reportUrl: (token) => `https://rebloom.test/r/${token}`,
    treatments,
    products,
    ...bundle,
    plans,
    messages: [...bundle.messages, ...(opts.extra ?? [])],
  };
}

const keyOf = (input: EngineInput, clientId: string) => input.clients.find((c) => c.id === clientId)!.demoKey;
const story = (input: EngineInput, queue: Queue) => Object.fromEntries(queue.items.map((i) => [keyOf(input, i.clientId), i.kind]));

// A full week and both daylight saving changes (DECISIONS D-016).
const TODAYS = ["2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03", "2027-01-04", "2026-11-02", "2027-03-15", "2026-10-06"];

describe.each(TODAYS)("the rebook queue when today is %s", (today) => {
  const input = inputFor(today);
  const queue = buildQueue(input);

  it("puts every story where the demo says it belongs", () => {
    expect(story(input, queue)).toEqual<Record<string, TriggerKind>>({
      sofia: "progress_moment",
      grace: "stalled",
      daniel: "missed",
      priya: "report_follow_up",
      rachel: "progress_scan_due",
      nina: "maintenance_due",
      chloe: "lapsed",
    });
  });

  it("leaves out the clients who are booked or on track", () => {
    const keys = queue.items.map((i) => keyOf(input, i.clientId));
    for (const key of ["amelia", "marcus", "hannah", "olivia", "isabel"]) expect(keys).not.toContain(key);
  });

  it("calls Chloe instead of emailing her, and asks Dana to review Grace's plan", () => {
    const chloe = queue.items.find((i) => keyOf(input, i.clientId) === "chloe")!;
    expect(chloe.action).toBe("call");
    expect(chloe.draft).toBeNull();
    const grace = queue.items.find((i) => keyOf(input, i.clientId) === "grace")!;
    expect(grace.action).toBe("review");
    expect(grace.atRisk).toBe(true);
  });

  it("prices every rebook from the menu", () => {
    const value = (key: string) => queue.items.find((i) => keyOf(input, i.clientId) === key)!.valueCents;
    expect(value("sofia")).toBe(39_500); // one microneedling session left
    expect(value("daniel")).toBe(39_000); // two peels left
    expect(value("nina")).toBe(19_500); // one maintenance peel
    expect(value("rachel")).toBeNull(); // a scan books nothing on its own
    expect(value("priya")).toBeGreaterThan(0); // the plan her report suggests
  });

  it("writes every reason and email within the copy rules", () => {
    for (const item of queue.items) {
      expect(checkCopy(item.reason)).toEqual([]);
      if (item.draft) expect(checkCopy(`${item.draft.subject}\n${item.draft.body}`)).toEqual([]);
      expect(item.reason).not.toMatch(/\b(she|he|her|his|him)\b/i);
    }
  });
});

describe("the rebook queue over time", () => {
  const today = "2026-12-29";

  it("says why in plain words", () => {
    const input = inputFor(today);
    const reasons = Object.fromEntries(buildQueue(input).items.map((i) => [keyOf(input, i.clientId), i.reason]));
    expect(reasons.sofia).toMatch(/^Wrinkles improved \d+ points since the first scan\. The third microneedling session isn't booked\.$/);
    expect(reasons.priya).toBe("Report sent 4 days ago. Nothing booked yet.");
    expect(reasons.daniel).toMatch(/^The second peel was due .+ and never booked\.$/);
    expect(reasons.chloe).toMatch(/No email consent, so a call\.$/);
  });

  it("brings Isabel's follow-up two days on", () => {
    const input = inputFor(today, { days: 2 });
    expect(story(input, buildQueue(input)).isabel).toBe("report_follow_up");
  });

  it("turns Sofia's unbooked session into a missed one once it's two weeks overdue", () => {
    const input = inputFor(today, { days: 60 });
    expect(story(input, buildQueue(input)).sofia).toBe("missed");
  });

  it("moves an item to handled once its message is in the outbox, and never queues it twice", () => {
    const first = inputFor(today);
    const priya = buildQueue(first).items.find((i) => keyOf(first, i.clientId) === "priya")!;
    const sent: Message = {
      id: "m1",
      clinicId: MAISON_VERRE.id,
      clientId: priya.clientId,
      sandboxId: "sandbox",
      type: priya.kind,
      channel: "email",
      subject: priya.draft!.subject,
      body: priya.draft!.body,
      status: "sent",
      dedupeKey: priya.dedupeKey,
      scheduledFor: null,
      sentAt: first.now.toISOString(),
      createdAt: first.now.toISOString(),
    };
    const after = buildQueue({ ...first, messages: [...first.messages, sent] });
    expect(after.items.map((i) => i.clientId)).not.toContain(priya.clientId);
    expect(after.handled.map((h) => h.item.clientId)).toContain(priya.clientId);
  });

  it("works the same for the second clinic, in its own time zone", () => {
    const input = inputFor(today, { clinic: TIDEWATER });
    expect(Object.keys(story(input, buildQueue(input))).sort()).toEqual(["chloe", "daniel", "grace", "nina", "priya", "rachel", "sofia"]);
  });
});
