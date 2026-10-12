import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MAISON_VERRE } from "@/data/clinics";
import { DEMO_CLIENTS } from "@/data/demo-clients";
import { SEED_PRODUCTS, SEED_TREATMENTS } from "@/data/menu";
import type { ScanResult } from "@/lib/domain";
import { buildPlan } from "@/lib/plan/build";
import type { ConcernKey } from "@/lib/skin/concerns";
import { fitzpatrickRank, isFitzpatrickType, limitLabel, offered, skinRule, suitsSkinType } from "@/lib/skin/fitzpatrick";

// The client reads its key and address when first imported.
process.env.YOUCAM_API_KEY = "test-key";
process.env.YOUCAM_API_BASE = "https://api.youcam.test";

type Client = typeof import("@/lib/youcam/client");
type Live = typeof import("@/lib/youcam/live").liveProvider;
let client: Client;
let live: Live;

beforeAll(async () => {
  client = await import("@/lib/youcam/client");
  live = (await import("@/lib/youcam/live")).liveProvider;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A fake YouCam: answers by method and path, records every request. */
function fakeYouCam(routes: Record<string, () => Response>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const path = String(input).replace("https://api.youcam.test", "");
      calls.push({ method, path, body: typeof init.body === "string" ? JSON.parse(init.body) : null });
      const handler = Object.entries(routes).find(([k]) => `${method} ${path}`.startsWith(k))?.[1];
      if (!handler) throw new Error(`unexpected ${method} ${path}`);
      return handler();
    }),
  );
  return calls;
}

const ok = (data: unknown) => Response.json({ status: 200, data });
const TASK = "/s2s/v2.0/task/fitzpatrick-scale-analyzer";

describe("Fitzpatrick types (D-094)", () => {
  it("knows the six types and their order", () => {
    expect(isFitzpatrickType("IV")).toBe(true);
    expect(isFitzpatrickType("iv")).toBe(false);
    expect(isFitzpatrickType("VII")).toBe(false);
    expect(fitzpatrickRank("I")).toBe(1);
    expect(fitzpatrickRank("VI")).toBe(6);
  });

  it("holds back a treatment only above its limit, and never on an unknown type", () => {
    const ipl = { fitzpatrickMax: 3 };
    expect(suitsSkinType(ipl, "III")).toBe(true);
    expect(suitsSkinType(ipl, "IV")).toBe(false);
    expect(suitsSkinType(ipl, null)).toBe(true);
    expect(suitsSkinType({ fitzpatrickMax: null }, "VI")).toBe(true);
    expect(suitsSkinType({}, "VI")).toBe(true);
  });

  it("says the limit inside a sentence", () => {
    expect(limitLabel(3)).toBe("types I to III");
    expect(limitLabel(1)).toBe("type I");
    expect(limitLabel(null)).toBeNull();
    expect(limitLabel(6)).toBeNull();
  });

  it("gives every demo client a type, and IPL a limit of type III on the menu", () => {
    expect(DEMO_CLIENTS.every((c) => isFitzpatrickType(c.fitzpatrick))).toBe(true);
    expect(SEED_TREATMENTS.filter((t) => t.fitzpatrickMax != null).map((t) => [t.name, t.fitzpatrickMax])).toEqual([
      ["IPL Photofacial", 3],
      ["IPL Photofacial", 3],
    ]);
  });
});

describe("YouCam's Fitzpatrick task", () => {
  it("starts on an uploaded file with version 1.0", async () => {
    const calls = fakeYouCam({ [`POST ${TASK}`]: () => ok({ task_id: "fz-1" }) });
    expect(await client.createFitzpatrickTask("f1")).toBe("fz-1");
    expect(calls[0].body).toEqual({ src_file_id: "f1", version: "1.0" });
  });

  it("reads the type from data.results.fitzpatrick_scale", async () => {
    fakeYouCam({ [`GET ${TASK}/fz-1`]: () => ok({ task_status: "success", results: { fitzpatrick_scale: "IV", timed: 1.2 } }) });
    expect(await client.getFitzpatrickTask("fz-1")).toEqual({ status: "success", type: "IV" });
  });

  it("reports running and errors, and refuses a result that isn't a type", async () => {
    fakeYouCam({ [`GET ${TASK}/a`]: () => ok({ task_status: "running" }) });
    expect(await client.getFitzpatrickTask("a")).toEqual({ status: "running" });
    fakeYouCam({ [`GET ${TASK}/b`]: () => ok({ task_status: "error", error: "error_no_face", error_message: "No face" }) });
    expect(await client.getFitzpatrickTask("b")).toEqual({ status: "error", code: "error_no_face", message: "No face" });
    fakeYouCam({ [`GET ${TASK}/c`]: () => ok({ task_status: "success", results: { fitzpatrick_scale: "7" } }) });
    await expect(client.getFitzpatrickTask("c")).rejects.toMatchObject({ kind: "protocol" });
  });
});

describe("the live scan starts it on the same upload", () => {
  const photo = () => sharp({ create: { width: 600, height: 800, channels: 3, background: "#cbb8a6" } }).jpeg().toBuffer();
  const routes = (fitzpatrick: () => Response) => ({
    "POST /s2s/v2.0/file": () =>
      ok({ files: [{ file_id: "f1", requests: [{ method: "PUT", url: "https://s3.test/put", headers: { "Content-Type": "image/jpeg" } }] }] }),
    "PUT https://s3.test/put": () => new Response(null, { status: 200 }),
    "POST /s2s/v2.1/task/skin-analysis": () => ok({ task_id: "sd-1" }),
    [`POST ${TASK}`]: fitzpatrick,
  });

  it("when asked: one upload, two tasks", async () => {
    const calls = fakeYouCam(routes(() => ok({ task_id: "fz-1" })));
    const started = await live.start({ scanId: "s", image: { bytes: await photo(), contentType: "image/jpeg" }, concerns: ["texture"], fitzpatrick: true });
    expect(started).toMatchObject({ taskId: "sd-1", fitzpatrickTaskId: "fz-1" });
    expect(calls.filter((c) => c.path === "/s2s/v2.0/file")).toHaveLength(1);
    expect(calls.find((c) => c.path === TASK)?.body).toEqual({ src_file_id: "f1", version: "1.0" });
  });

  it("never when not asked, and a refusal never stops the scan", async () => {
    const calls = fakeYouCam(routes(() => Response.json({ status: 400, error_code: "InvalidParameters" }, { status: 400 })));
    const image = { bytes: await photo(), contentType: "image/jpeg" };
    expect(await live.start({ scanId: "s", image, concerns: ["texture"] })).not.toHaveProperty("fitzpatrickTaskId");
    expect(calls.some((c) => c.path === TASK)).toBe(false);
    const started = await live.start({ scanId: "s", image, concerns: ["texture"], fitzpatrick: true });
    expect(started.taskId).toBe("sd-1");
    expect(started).not.toHaveProperty("fitzpatrickTaskId");
  });
});

describe("the plan leaves out what doesn't suit the skin type", () => {
  const treatments = SEED_TREATMENTS.filter((t) => t.clinicId === MAISON_VERRE.id);
  const products = SEED_PRODUCTS.filter((p) => p.clinicId === MAISON_VERRE.id);
  // Redness and sun spots lead: IPL is the menu's best fit.
  const scores: Partial<Record<ConcernKey, number>> = { redness: 55, age_spot: 60 };
  const result: ScanResult = {
    concerns: Object.entries({
      texture: 90, pore: 90, age_spot: 90, redness: 90, wrinkle: 90, firmness: 90, acne: 90, moisture: 90, radiance: 90,
      oiliness: 90, dark_circle_v2: 90, eye_bag: 90, droopy_upper_eyelid: 90, droopy_lower_eyelid: 90, tear_trough: 90,
      ...scores,
    }).map(([key, ui]) => ({ key: key as ConcernKey, ui, raw: ui, maskPath: null })),
    overall: null,
    skinAge: null,
    skinType: null,
  };
  const plan = (type: "II" | "V" | null, allowed: string[] = []) =>
    buildPlan({ result, intake: null, treatments, products, clinic: MAISON_VERRE, from: "2026-10-05", skin: { type, allowed } });
  const ipl = treatments.find((t) => t.name === "IPL Photofacial")!;
  const names = (p: ReturnType<typeof plan>) => p.recommended.lines.map((l) => l.treatment.name);

  it("offers IPL to type II, and to an unknown type", () => {
    expect(names(plan("II"))).toContain("IPL Photofacial");
    expect(names(plan(null))).toContain("IPL Photofacial");
    expect(plan("II").heldBack).toEqual([]);
  });

  it("leaves IPL out for type V, says so, and still plans for the redness", () => {
    const p = plan("V");
    expect(names(p)).not.toContain("IPL Photofacial");
    expect(p.heldBack.map((t) => t.name)).toEqual(["IPL Photofacial"]);
    expect(p.recommended.lines.some((l) => l.covers.includes("redness"))).toBe(true);
  });

  it("offers it again when Dana makes an exception for this client (D-095)", () => {
    const p = plan("V", [ipl.id]);
    expect(names(p)).toContain("IPL Photofacial");
    expect(p.heldBack).toEqual([]);
    // Only for the treatment she named.
    expect(offered(ipl, skinRule({ fitzpatrick: { type: "V", source: "scan", at: "" }, skinTypeExceptions: [] }))).toBe(false);
    expect(
      offered(ipl, skinRule({ fitzpatrick: { type: "V", source: "scan", at: "" }, skinTypeExceptions: [{ treatmentId: ipl.id, reason: "Patch test clear", by: "Dana", at: "", type: "V" }] })),
    ).toBe(true);
  });

  it("never puts it in the lighter, within-budget plan either", () => {
    const p = buildPlan({
      result,
      intake: { clientId: "c", concerns: [], concernsOther: null, goalText: null, hasEvent: false, eventType: null, eventDate: null, pastTreatments: [], budgetBand: "under_500", screening: {}, sensitivitiesNote: null, completedAt: null, updatedAt: "" },
      treatments,
      products,
      clinic: MAISON_VERRE,
      from: "2026-10-05",
      skin: { type: "V", allowed: [] },
    });
    expect([...p.recommended.lines, ...(p.withinBudget?.lines ?? [])].some((l) => l.treatment.name === "IPL Photofacial")).toBe(false);
  });
});
