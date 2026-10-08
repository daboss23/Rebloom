import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Intake } from "@/lib/domain";
import { cleanReading, currentReading, goalWords } from "@/lib/intake/goal-reading";
import { statedConcerns } from "@/lib/plan/build";

process.env.REBLOOM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "rebloom-goal-reading-"));
process.env.ANTHROPIC_API_KEY = "test-key";
// The reader goes through getStore(), so keep it on the local store even where Supabase keys are set.
process.env.REBLOOM_STORE = "local";

const now = new Date("2026-10-08T17:00:00Z");

function intake(patch: Partial<Intake>): Intake {
  return {
    clientId: "c1",
    concerns: [],
    concernsOther: null,
    goalText: null,
    hasEvent: null,
    eventType: null,
    eventDate: null,
    pastTreatments: [],
    budgetBand: null,
    screening: {},
    sensitivitiesNote: null,
    completedAt: null,
    updatedAt: now.toISOString(),
    ...patch,
  };
}

const reading = (text: string, concerns: NonNullable<Intake["goalReading"]>["concerns"]) => ({
  text,
  concerns,
  readAt: now.toISOString(),
});

describe("cleaning Claude's reading", () => {
  it("keeps plain phrases, lowercased and with curly apostrophes straightened", () => {
    expect(cleanReading({ concerns: [{ key: "wrinkle", phrase: " Crow’s  Feet " }] })).toEqual([
      { key: "wrinkle", phrase: "crow's feet" },
    ]);
  });

  it("says the concern's own name when the phrase breaks the copy rules, runs long or has punctuation", () => {
    expect(
      cleanReading({
        concerns: [
          { key: "texture", phrase: "flawless skin" },
          { key: "pore", phrase: "pores, mostly on my nose and the sides of my cheeks" },
          { key: "redness", phrase: "redness!" },
        ],
      }),
    ).toEqual([
      { key: "texture", phrase: "texture" },
      { key: "pore", phrase: "pores" },
      { key: "redness", phrase: "redness" },
    ]);
  });

  it("drops repeats and keeps at most four", () => {
    const keys = ["texture", "texture", "pore", "redness", "wrinkle", "acne"] as const;
    const out = cleanReading({ concerns: keys.map((key) => ({ key, phrase: "skin" })) });
    expect(out.map((c) => c.key)).toEqual(["texture", "pore", "redness", "wrinkle"]);
  });
});

describe("using the reading", () => {
  const words = "I don't have any redness, it's mostly texture";

  it("the word list misreads a negation", () => {
    const stated = statedConcerns(intake({ goalText: words }));
    expect([...stated.keys()].sort()).toEqual(["redness", "texture"]);
  });

  it("Claude's reading replaces the word list for the words it read", () => {
    const stated = statedConcerns(intake({ goalText: words, goalReading: reading(words, [{ key: "texture", phrase: "texture" }]) }));
    expect([...stated.entries()]).toEqual([["texture", { phrase: "texture", ownWords: true }]]);
  });

  it("hears what the word list can't", () => {
    const tired = "I look tired in every photo";
    expect(statedConcerns(intake({ goalText: tired })).size).toBe(0);
    const stated = statedConcerns(
      intake({
        goalText: tired,
        goalReading: reading(tired, [
          { key: "dark_circle_v2", phrase: "tired look" },
          { key: "radiance", phrase: "tired look" },
        ]),
      }),
    );
    expect(stated.get("dark_circle_v2")).toEqual({ phrase: "tired look", ownWords: true });
    expect(stated.get("radiance")).toEqual({ phrase: "tired look", ownWords: true });
  });

  it("an empty reading means nothing they wrote is a measurement, so the word list stays quiet", () => {
    const glow = "I want to glow for my sister's wedding";
    expect(statedConcerns(intake({ goalText: glow })).has("radiance")).toBe(true);
    expect(statedConcerns(intake({ goalText: glow, goalReading: reading(glow, []) })).size).toBe(0);
  });

  it("a reading of words they've since changed is ignored", () => {
    const stale = intake({ goalText: "sun spots on my cheeks", goalReading: reading("old words", [{ key: "acne", phrase: "breakouts" }]) });
    expect(currentReading(stale)).toBeNull();
    expect([...statedConcerns(stale).keys()]).toEqual(["age_spot"]);
  });

  it("ticked boxes still count beside their own words", () => {
    const text = "tired eyes";
    const stated = statedConcerns(
      intake({ goalText: text, concerns: ["pores"], goalReading: reading(text, [{ key: "dark_circle_v2", phrase: "tired eyes" }]) }),
    );
    expect(stated.get("dark_circle_v2")?.ownWords).toBe(true);
    expect(stated.get("pore")?.ownWords).toBe(false);
  });

  it("reads the goal and the 'other' concern together", () => {
    expect(goalWords(intake({ goalText: " smoother skin ", concernsOther: "melasma" }))).toBe("smoother skin  melasma".trim());
    expect(goalWords(intake({}))).toBe("");
  });
});

describe("keeping the reading", () => {
  let store: typeof import("@/lib/store/local").localStore;
  let ensure: typeof import("@/lib/intake/read-goal").ensureGoalReading;
  let limits: typeof import("@/lib/intake/read-goal").GOAL_READING_LIMITS;

  beforeAll(async () => {
    store = (await import("@/lib/store/local")).localStore;
    ({ ensureGoalReading: ensure, GOAL_READING_LIMITS: limits } = await import("@/lib/intake/read-goal"));
  });

  async function newClient(sandboxId: string, goalText: string | null) {
    const clinic = (await store.getClinicBySlug("maison-verre"))!;
    const client = await store.createClient({ clinicId: clinic.id, sandboxId, now });
    await store.saveIntake(client.id, { goalText }, now);
    return client;
  }

  it("reads once, keyed to the words, and reads again only when they change", async () => {
    const client = await newClient("sb-read", "I look tired");
    const calls: string[] = [];
    const reader = async (text: string) => {
      calls.push(text);
      return { concerns: [{ key: "dark_circle_v2" as const, phrase: "tired look" }], tokens: 120 };
    };
    const input = { clientId: client.id, sandboxId: "sb-read", ipHash: null, now };

    await ensure(input, reader);
    await ensure(input, reader);
    expect(calls).toEqual(["I look tired"]);
    expect((await store.getIntake(client.id))?.goalReading).toMatchObject({ text: "I look tired", concerns: [{ key: "dark_circle_v2" }] });
    expect((await store.sumUsage({ provider: "anthropic", since: new Date(0), sandboxId: "sb-read" })).units).toBe(120);

    await store.saveIntake(client.id, { goalText: "sun spots" }, now);
    await ensure(input, reader);
    expect(calls).toEqual(["I look tired", "sun spots"]);
  });

  it("shares one call when the intake and the report gate ask at the same time", async () => {
    const client = await newClient("sb-race", "uneven tone");
    let calls = 0;
    const reader = async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { concerns: [{ key: "age_spot" as const, phrase: "uneven tone" }], tokens: 50 };
    };
    const input = { clientId: client.id, sandboxId: "sb-race", ipHash: null, now };
    await Promise.all([ensure(input, reader), ensure(input, reader)]);
    expect(calls).toBe(1);
  });

  it("does nothing without words, and keeps nothing when Claude returns nothing", async () => {
    const quiet = await newClient("sb-quiet", null);
    let called = false;
    await ensure({ clientId: quiet.id, sandboxId: "sb-quiet", ipHash: null, now }, async () => ((called = true), null));
    expect(called).toBe(false);

    const declined = await newClient("sb-quiet", "smoother skin");
    await ensure({ clientId: declined.id, sandboxId: "sb-quiet", ipHash: null, now }, async () => null);
    expect((await store.getIntake(declined.id))?.goalReading).toBeUndefined();
  });

  it("never throws, so the report gate carries on", async () => {
    const client = await newClient("sb-throw", "pores");
    await expect(
      ensure({ clientId: client.id, sandboxId: "sb-throw", ipHash: null, now }, async () => {
        throw new Error("network down");
      }),
    ).resolves.toBeUndefined();
  });

  it("stops at the per-browser limit for the day", async () => {
    for (let i = 0; i < limits.perBrowserPerDay; i++) {
      await store.logUsage({ provider: "anthropic", feature: "goal_reading", units: 1, taskId: null, sandboxId: "sb-cap", ipHash: null, createdAt: new Date().toISOString() });
    }
    const client = await newClient("sb-cap", "dark spots");
    let called = false;
    await ensure({ clientId: client.id, sandboxId: "sb-cap", ipHash: null, now }, async () => ((called = true), null));
    expect(called).toBe(false);
  });
});
