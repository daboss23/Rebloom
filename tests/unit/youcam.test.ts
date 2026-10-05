import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { checkCopy } from "@/lib/copy/check";
import { SCORED_CONCERNS } from "@/lib/skin/concerns";
import { normalizeResult, priorities } from "@/lib/skin/normalize";
import { friendlyError } from "@/lib/youcam/errors";
import { parseSkinOutput, withoutMaskUrls } from "@/lib/youcam/parse";

// The client reads its key and address when first imported.
process.env.YOUCAM_API_KEY = "test-key";
process.env.YOUCAM_API_BASE = "https://api.youcam.test";

type Client = typeof import("@/lib/youcam/client");
type Live = typeof import("@/lib/youcam/live").liveProvider;
type Masks = typeof import("@/lib/skin/live-masks");
let client: Client;
let live: Live;
let masks: Masks;

beforeAll(async () => {
  client = await import("@/lib/youcam/client");
  live = (await import("@/lib/youcam/live")).liveProvider;
  masks = await import("@/lib/skin/live-masks");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const recorded = JSON.parse(
  readFileSync(path.join(__dirname, "../fixtures/youcam/skin-analysis-sd-v2.1.json"), "utf8"),
) as { data: { results: { output: unknown[] } } };
const output = recorded.data.results.output;

describe("reading YouCam's result", () => {
  const raw = parseSkinOutput(output);

  it("reads every concern with its ui score, raw score and mask link", () => {
    expect(Object.keys(raw.concerns).sort()).toEqual([...SCORED_CONCERNS].sort());
    expect(raw.concerns.eye_bag).toMatchObject({ ui_score: 58, raw_score: 27.28 });
    expect(raw.concerns.texture?.mask_urls?.[0]).toMatch(/^https:\/\/.+texture\.png/);
  });

  it("reads the overall score, skin age and per-zone skin type", () => {
    expect(raw.all).toBe(75.13);
    expect(raw.skin_age).toBe(52);
    expect(raw.skin_type).toBe("oily");
    expect(raw.skin_type_zones).toEqual({ whole: "oily", t_zone: "oily", u_zone: "oily" });
  });

  it("ignores entries it doesn't use and survives junk", () => {
    expect(parseSkinOutput([null, 4, { type: "resize_image" }, { type: "texture", ui_score: "high" }])).toEqual({ concerns: {} });
  });

  it("stores no signed links", () => {
    expect(JSON.stringify(withoutMaskUrls(raw))).not.toContain("http");
  });

  it("normalises: whole ui scores, one-decimal raw scores, our own raw overall", () => {
    const result = normalizeResult(raw);
    expect(result.concerns.find((c) => c.key === "tear_trough")).toMatchObject({ ui: 70, raw: 56.1 });
    const meanRaw = result.concerns.reduce((n, c) => n + c.raw, 0) / result.concerns.length;
    expect(result.overall).toEqual({ ui: 75, raw: Math.round(meanRaw * 10) / 10 });
    expect(result.skinAge).toBe(52);
    expect(result.skinType).toBe("oily");
    expect(priorities(result).map((c) => c.key)).toEqual(["eye_bag", "droopy_lower_eyelid", "moisture"]);
  });
});

/** A fake YouCam: answers by method and path, records every request. */
function fakeYouCam(routes: Record<string, (init: RequestInit) => Response | Promise<Response>>) {
  const calls: { method: string; url: string; headers: Record<string, string>; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    let body: unknown = init.body;
    if (typeof init.body === "string") body = JSON.parse(init.body);
    calls.push({ method, url, headers, body });
    const key = `${method} ${url.replace("https://api.youcam.test", "")}`;
    const handler = Object.entries(routes).find(([k]) => key.startsWith(k))?.[1];
    if (!handler) throw new Error(`unexpected ${key}`);
    return handler(init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const ok = (data: unknown) => Response.json({ status: 200, data });

describe("the YouCam client", () => {
  it("uploads with YouCam's own headers and no API key, then starts an SD task as JSON", async () => {
    const calls = fakeYouCam({
      "POST /s2s/v2.0/file": () =>
        ok({
          files: [
            {
              file_id: "abc/def+ghi==",
              requests: [{ method: "PUT", url: "https://s3.test/put?sig=1", headers: { "Content-Type": "image/jpeg", "Content-Length": "3" } }],
            },
          ],
        }),
      "PUT https://s3.test/put": () => new Response(null, { status: 200 }),
      "POST /s2s/v2.1/task/skin-analysis": () => ok({ task_id: "task-1" }),
    });
    const { taskId, units } = await live.start({
      scanId: "scan-1",
      image: { bytes: Buffer.from([1, 2, 3]), contentType: "image/jpeg" },
      concerns: SCORED_CONCERNS,
    });
    expect(taskId).toBe("task-1");
    expect(units).toBe(16);

    const [slot, put, task] = calls;
    expect(slot.headers.authorization).toBe("Bearer test-key");
    expect(slot.body).toEqual({ files: [{ content_type: "image/jpeg", file_name: "scan-1.jpg", file_size: 3 }] });
    expect(put.method).toBe("PUT");
    expect(put.headers).toEqual({ "content-type": "image/jpeg", "content-length": "3" });
    expect(task.body).toEqual({
      src_file_id: "abc/def+ghi==",
      dst_actions: [...SCORED_CONCERNS, "skin_type"],
      miniserver_args: { enable_mask_overlay: false },
      format: "json",
    });
  });

  it("names each failure so the pipeline can react", async () => {
    const cases: [Response, string][] = [
      [Response.json({ status: 401, error: "Unauthorized", error_code: "InvalidAccessToken" }, { status: 401 }), "auth"],
      [Response.json({ status: 400, error: "no credit", error_code: "CreditInsufficiency" }, { status: 400 }), "credits"],
      [Response.json({ status: 400, error: "Invalid task ID" }, { status: 400 }), "bad_request"],
      [Response.json({ status: 429 }, { status: 429 }), "rate_limited"],
      [new Response("Bad gateway", { status: 502 }), "server"],
      [new Response("<html>", { status: 200 }), "protocol"],
    ];
    for (const [response, kind] of cases) {
      fakeYouCam({ "GET /s2s/v2.1/task/skin-analysis/t": () => response });
      await expect(client.getSkinAnalysisTask("t")).rejects.toMatchObject({ name: "YouCamError", kind });
    }
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(client.getSkinAnalysisTask("t")).rejects.toMatchObject({ kind: "network", transient: true });
  });

  it("backs off and retries a rate-limited start", async () => {
    let attempts = 0;
    fakeYouCam({
      "POST /s2s/v2.1/task/skin-analysis": () => (++attempts === 1 ? Response.json({}, { status: 429 }) : ok({ task_id: "t2" })),
    });
    expect(await client.createSkinAnalysisTask("f", ["texture"])).toBe("t2");
    expect(attempts).toBe(2);
  });

  it("reads the credit balance", async () => {
    fakeYouCam({
      "GET /s2s/v1.0/client/credit": () =>
        Response.json({ status: 200, results: [{ type: "ApiSubsToken", amount: 900 }, { type: "ApiPaygToken", amount_dec: 84.5 }] }),
    });
    expect(await client.getCredits()).toBe(984.5);
  });
});

describe("the live provider's polling", () => {
  const task = { taskId: "t", scanId: "s", startedAt: new Date() };

  it("keeps waiting through blips instead of failing the scan", async () => {
    fakeYouCam({ "GET /s2s/v2.1/task/skin-analysis/t": () => new Response("busy", { status: 503 }) });
    expect(await live.poll(task)).toEqual({ status: "running" });
  });

  it("passes on YouCam's photo error code", async () => {
    fakeYouCam({
      "GET /s2s/v2.1/task/skin-analysis/t": () =>
        ok({ task_status: "error", results: null, error: "error_lighting_dark", error_message: "too dark" }),
    });
    expect(await live.poll(task)).toEqual({ status: "error", code: "error_lighting_dark" });
  });

  it("returns the parsed result on success, and refuses an empty one", async () => {
    fakeYouCam({ "GET /s2s/v2.1/task/skin-analysis/t": () => Response.json(recorded) });
    const done = await live.poll(task);
    expect(done.status === "success" && Object.keys(done.raw.concerns)).toHaveLength(15);

    fakeYouCam({ "GET /s2s/v2.1/task/skin-analysis/t": () => ok({ task_status: "success", results: { output: [] } }) });
    expect(await live.poll(task)).toEqual({ status: "error", code: "empty_result" });
  });

  it("treats a task YouCam no longer knows as lost", async () => {
    fakeYouCam({ "GET /s2s/v2.1/task/skin-analysis/t": () => Response.json({ error: "Invalid task ID" }, { status: 400 }) });
    expect(await live.poll(task)).toEqual({ status: "error", code: "task_lost" });
  });
});

describe("copying YouCam's masks", () => {
  const ellipse = (w: number, h: number, extra = "") =>
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${extra}<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 5}" ry="${h / 8}" fill="#c33"/></svg>`,
    );
  const alphaAt = async (png: Buffer, x: number, y: number) => {
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return data[(y * info.width + x) * info.channels + 3];
  };

  it("redraws an alpha mask as white marks at the photo's exact size", async () => {
    const mask = await sharp(ellipse(400, 600)).png().toBuffer();
    const out = await masks.overlayMask([mask], 810, 1080);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height, meta.channels]).toEqual([810, 1080, 4]);
    expect(await alphaAt(out, 405, 540)).toBe(255);
    expect(await alphaAt(out, 10, 10)).toBe(0);
  });

  it("reads the shape from brightness when a mask has no transparency", async () => {
    const opaque = await sharp(ellipse(300, 400, '<rect width="300" height="400" fill="#000"/>'))
      .flatten({ background: "#000" })
      .png()
      .toBuffer();
    const out = await masks.overlayMask([opaque], 300, 400);
    expect(await alphaAt(out, 150, 200)).toBeGreaterThan(40);
    expect(await alphaAt(out, 5, 5)).toBe(0);
  });

  it("keeps big photos' masks within a memory budget, in the same proportions", () => {
    expect(masks.maskSize(810, 1080)).toEqual({ width: 810, height: 1080 });
    expect(masks.maskSize(4000, 5400)).toEqual({ width: 1067, height: 1440 });
  });

  it("combines several masks for one concern", async () => {
    const left = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="50" height="50" fill="#fff"/></svg>')).png().toBuffer();
    const right = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect x="150" y="150" width="50" height="50" fill="#fff"/></svg>')).png().toBuffer();
    const out = await masks.overlayMask([left, right], 200, 200);
    expect(await alphaAt(out, 10, 10)).toBe(255);
    expect(await alphaAt(out, 190, 190)).toBe(255);
    expect(await alphaAt(out, 100, 100)).toBe(0);
  });
});

describe("error copy", () => {
  const codes = [
    "error_src_face_too_small",
    "error_src_face_out_of_bound",
    "error_lighting_dark",
    "error_below_min_image_size",
    "error_exceed_max_image_size",
    "error_no_face",
    "error_pose",
    "error_face_parsing",
    "error_nsfw_content_detected",
    "analysis_timeout",
  ];

  it("gives every known YouCam error its own instruction", () => {
    const generic = friendlyError("something_new");
    for (const code of codes) expect(friendlyError(code)).not.toBe(generic);
  });

  it("follows the copy rules", () => {
    for (const code of [...codes, null]) {
      const e = friendlyError(code);
      expect(checkCopy(`${e.title} ${e.instruction}`)).toEqual([]);
    }
  });
});
