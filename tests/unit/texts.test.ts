import { describe, expect, it } from "vitest";
import { MAISON_VERRE } from "@/data/clinics";
import { SEED_PRODUCTS, SEED_TREATMENTS } from "@/data/menu";
import { SEED_STAFF } from "@/data/staff";
import { addDays, zonedDateTime } from "@/lib/clock";
import { checkCopy } from "@/lib/copy/check";
import { buildDemoBundle } from "@/lib/demo/seed";
import { buildQueue, type EngineInput } from "@/lib/rebook/engine";
import { formatUsPhone, TEXT_OPT_OUT, textParts, toUsE164 } from "@/lib/sms/text";

describe("US phone numbers", () => {
  it("takes what people type", () => {
    for (const typed of ["(310) 555-0142", "310.555.0142", "310 555 0142", "+1 310 555 0142", "13105550142"]) {
      expect(toUsE164(typed)).toBe("+13105550142");
    }
  });

  it("refuses what can't be a US number", () => {
    for (const typed of ["", "555-0142", "(110) 555-0142", "(310) 155-0142", "+44 20 7946 0958", "310555014", null, undefined]) {
      expect(toUsE164(typed)).toBeNull();
    }
  });

  it("shows a number back the American way", () => {
    expect(formatUsPhone("+13105550142")).toBe("(310) 555-0142");
  });
});

describe("text length", () => {
  it("counts plain text at 160 a part, then 153", () => {
    expect(textParts("a".repeat(160))).toEqual({ parts: 1, unicode: false });
    expect(textParts("a".repeat(161))).toEqual({ parts: 2, unicode: false });
    expect(textParts("a".repeat(306))).toEqual({ parts: 2, unicode: false });
    expect(textParts("a".repeat(307))).toEqual({ parts: 3, unicode: false });
  });

  it("counts the extended characters twice", () => {
    expect(textParts("€".repeat(80))).toEqual({ parts: 1, unicode: false });
    expect(textParts("€".repeat(81))).toEqual({ parts: 2, unicode: false });
  });

  it("drops to 70 a part when one character is outside the plain alphabet", () => {
    expect(textParts(`It’s ${"a".repeat(60)}`)).toEqual({ parts: 1, unicode: true });
    expect(textParts(`It’s ${"a".repeat(70)}`)).toEqual({ parts: 2, unicode: true });
  });
});

describe("texts in the rebook queue", () => {
  const today = "2026-12-29";
  const clinic = MAISON_VERRE;
  const treatments = SEED_TREATMENTS.filter((t) => t.clinicId === clinic.id);
  const products = SEED_PRODUCTS.filter((p) => p.clinicId === clinic.id);
  const bundle = buildDemoBundle({ clinic, treatments, products, staff: SEED_STAFF, sandboxId: "sandbox", today });
  const input = (consents = bundle.consents): EngineInput => ({
    clinic,
    practitionerName: "Dana",
    now: addDays(zonedDateTime(today, "09:30", clinic.timezone), 0),
    reportUrl: (token) => `https://rebloom.test/r/${token}`,
    treatments,
    products,
    ...bundle,
    consents,
    plans: bundle.plans.map((p) => ({ ...p, items: bundle.planItems.filter((i) => i.planId === p.id) })),
  });
  const keyOf = (clientId: string) => bundle.clients.find((c) => c.id === clientId)!.demoKey;
  const idOf = (key: string) => bundle.clients.find((c) => c.demoKey === key)!.id;

  it("offers a text beside the email to the clients who said yes to both", () => {
    const queue = buildQueue(input());
    const texted = queue.items.filter((i) => i.text).map((i) => keyOf(i.clientId)).sort();
    expect(texted).toEqual(["daniel", "priya", "sofia"]);
    for (const item of queue.items.filter((i) => i.text)) {
      expect(item.action).toBe("email");
      expect(item.draft).not.toBeNull();
    }
  });

  it("writes every text short, in the clinic's voice, from Dana, with the way out at the end", () => {
    for (const item of buildQueue(input()).items.filter((i) => i.text)) {
      const text = item.text!;
      expect(text).toMatch(/^Hi \w+, it's Dana at Maison Verre\. /);
      expect(text.endsWith(TEXT_OPT_OUT)).toBe(true);
      expect(checkCopy(text)).toEqual([]);
      expect(textParts(text).parts).toBeLessThanOrEqual(2);
      expect(textParts(text).unicode).toBe(false);
    }
  });

  it("links the text to the client's own report", () => {
    const sofia = buildQueue(input()).items.find((i) => keyOf(i.clientId) === "sofia")!;
    expect(sofia.text).toMatch(/Book here: https:\/\/rebloom\.test\/r\/\S+ Reply STOP/);
  });

  it("texts a client who said yes to texts but not to email, instead of calling", () => {
    const chloe = idOf("chloe");
    const consents = [
      ...bundle.consents,
      { id: "texts-chloe", clientId: chloe, type: "texts" as const, grantedAt: bundle.clients[0].createdAt, textVersion: "t", ipHash: null, userAgent: null },
    ];
    const item = buildQueue(input(consents)).items.find((i) => i.clientId === chloe)!;
    expect(item.action).toBe("text");
    expect(item.draft).toBeNull();
    expect(item.text).toMatch(/It's been a while/);
    expect(item.reason).toMatch(/A personal note may bring them back\.$/);
  });

  it("never texts without a yes to texts", () => {
    const noTexts = bundle.consents.filter((c) => c.type !== "texts");
    expect(buildQueue(input(noTexts)).items.every((i) => i.text === null)).toBe(true);
  });
});
