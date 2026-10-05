import "server-only";
// The YouCam (Perfect Corp) HTTP client: upload, start, poll, delete, credit.
// Wire format confirmed against live-recorded v2.1 responses (DECISIONS D-041).
// Every call is server-side. The API key never leaves this module.

import { z } from "zod";
import { env } from "@/lib/env";

/** File upload stays on v2.0. Skin analysis runs on v2.1, YouCam's updated engines. */
const FILE_PATH = "/s2s/v2.0/file";
const SKIN_TASK_PATH = "/s2s/v2.1/task/skin-analysis";
const DELETE_TASK_PATH = "/s2s/v2.0/task/delete";
const CREDIT_PATH = "/s2s/v1.0/client/credit";

const API_TIMEOUT_MS = 15_000;
const TRANSFER_TIMEOUT_MS = 30_000;

export type YouCamErrorKind =
  | "auth" // missing, wrong or revoked key
  | "credits" // out of units
  | "rate_limited"
  | "bad_request"
  | "not_found"
  | "server"
  | "network"
  | "protocol"; // a response we couldn't read

export class YouCamError extends Error {
  constructor(
    readonly kind: YouCamErrorKind,
    message: string,
    readonly status: number | null = null,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "YouCamError";
  }

  /** The request was fine; trying again later may work. */
  get transient(): boolean {
    return this.kind === "rate_limited" || this.kind === "server" || this.kind === "network";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function httpError(path: string, status: number, body: unknown): YouCamError {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const code = typeof b.error_code === "string" ? b.error_code : null;
  const detail = typeof b.error === "string" ? `: ${b.error}` : "";
  const message = `${path} returned HTTP ${status}${code ? ` ${code}` : ""}${detail}`;
  if (status === 401 || status === 403 || code === "InvalidAccessToken") return new YouCamError("auth", message, status, code);
  if (status === 402 || code === "CreditInsufficiency") return new YouCamError("credits", message, status, code);
  if (status === 429) return new YouCamError("rate_limited", message, status, code);
  if (status === 404) return new YouCamError("not_found", message, status, code);
  if (status >= 500) return new YouCamError("server", message, status, code);
  return new YouCamError("bad_request", message, status, code);
}

async function call(
  path: string,
  opts: { method: "GET" | "POST"; body?: unknown; retries?: number; timeoutMs?: number },
): Promise<unknown> {
  if (!env.YOUCAM_API_KEY) throw new YouCamError("auth", "YOUCAM_API_KEY is not set");
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${env.YOUCAM_API_BASE.replace(/\/+$/, "")}${path}`, {
        method: opts.method,
        headers: {
          Authorization: `Bearer ${env.YOUCAM_API_KEY}`,
          ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: AbortSignal.timeout(opts.timeoutMs ?? API_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      throw new YouCamError("network", `${path} unreachable: ${(error as Error).message}`);
    }
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON. Handled below.
    }
    if (res.ok) {
      if (body === null) throw new YouCamError("protocol", `${path} returned a non-JSON body`, res.status);
      return body;
    }
    // 250 requests per 5 minutes per key and IP. Back off briefly, then give up to the caller.
    if (res.status === 429 && attempt < (opts.retries ?? 0)) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    throw httpError(path, res.status, body);
  }
}

function read<T>(schema: z.ZodType<T>, body: unknown, path: string): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new YouCamError("protocol", `${path} returned an unexpected shape: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}

const uploadSlot = z.object({
  data: z.object({
    files: z
      .array(
        z.object({
          file_id: z.string().min(1),
          requests: z
            .array(
              z.object({
                url: z.url(),
                method: z.string().optional(),
                headers: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
              }),
            )
            .min(1),
        }),
      )
      .min(1),
  }),
});

/**
 * Registers the image with YouCam, then PUTs the bytes to the pre-signed URL it returns,
 * with exactly the headers it asked for and no API key. Returns the file id.
 */
export async function uploadImage(bytes: Buffer, contentType: string, fileName: string): Promise<string> {
  const body = await call(FILE_PATH, {
    method: "POST",
    body: { files: [{ content_type: contentType, file_name: fileName, file_size: bytes.length }] },
    retries: 2,
  });
  const file = read(uploadSlot, body, FILE_PATH).data.files[0];
  const target = file.requests[0];
  const headers = Object.fromEntries(
    Object.entries(target.headers ?? { "Content-Type": contentType }).map(([k, v]) => [k, String(v)]),
  );
  let put: Response;
  try {
    put = await fetch(target.url, {
      method: target.method ?? "PUT",
      headers,
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    throw new YouCamError("network", `image upload unreachable: ${(error as Error).message}`);
  }
  if (!put.ok) {
    throw new YouCamError(put.status >= 500 ? "server" : "protocol", `image upload returned HTTP ${put.status}`, put.status);
  }
  return file.file_id;
}

const taskCreated = z.object({ data: z.object({ task_id: z.string().min(1) }) });

/** Starts an SD skin analysis. Units are charged only if the task succeeds. */
export async function createSkinAnalysisTask(fileId: string, actions: readonly string[]): Promise<string> {
  const body = await call(SKIN_TASK_PATH, {
    method: "POST",
    body: {
      src_file_id: fileId,
      dst_actions: actions,
      // Plain masks, not YouCam's own overlay: the report draws them in the clinic's style.
      miniserver_args: { enable_mask_overlay: false },
      // The default is a zip. JSON gives scores inline and one mask link per concern.
      format: "json",
    },
    retries: 2,
  });
  return read(taskCreated, body, SKIN_TASK_PATH).data.task_id;
}

const taskState = z.object({
  data: z.object({
    task_status: z.string(),
    results: z.unknown().optional(),
    error: z.string().nullable().optional(),
    error_message: z.string().nullable().optional(),
  }),
});

export type SkinTask =
  | { status: "running" }
  | { status: "success"; output: unknown[] }
  | { status: "error"; code: string; message: string | null };

/** One status check. No retries: the browser's next poll is the retry. */
export async function getSkinAnalysisTask(taskId: string): Promise<SkinTask> {
  // Task ids are sent as-is, exactly as YouCam issued them.
  const path = `${SKIN_TASK_PATH}/${taskId}`;
  const { data } = read(taskState, await call(path, { method: "GET" }), SKIN_TASK_PATH);
  if (data.task_status === "success") {
    const results = data.results as { output?: unknown } | unknown[] | null | undefined;
    const output = Array.isArray(results) ? results : Array.isArray(results?.output) ? results.output : null;
    if (!output) throw new YouCamError("protocol", `${SKIN_TASK_PATH} succeeded without an output list`);
    return { status: "success", output };
  }
  if (data.task_status === "error" || data.task_status === "failed") {
    return { status: "error", code: data.error || "unknown_internal_error", message: data.error_message ?? null };
  }
  return { status: "running" };
}

/** Deletes the task, its photo and its outputs from YouCam. Mask links stop working at once. */
export async function deleteTask(taskId: string): Promise<void> {
  await call(DELETE_TASK_PATH, { method: "POST", body: { task_id: taskId }, timeoutMs: 8_000 });
}

/** Units left on the YouCam account. Costs nothing. Null when the balance can't be read. */
export async function getCredits(): Promise<number | null> {
  const body = (await call(CREDIT_PATH, { method: "GET" })) as Record<string, unknown>;
  const data = body.data as Record<string, unknown> | unknown[] | undefined;
  const list = [body.results, Array.isArray(data) ? data : data?.results].find(Array.isArray) as unknown[] | undefined;
  if (!list) return null;
  let total = 0;
  let found = false;
  for (const entry of list) {
    const e = (entry ?? {}) as Record<string, unknown>;
    const amount = [e.amount, e.amount_dec, e.credit].find((v) => typeof v === "number" && Number.isFinite(v));
    if (typeof amount === "number") {
      total += amount;
      found = true;
    }
  }
  return found ? Math.round(total * 100) / 100 : null;
}

// ── Skin simulation (DECISIONS D-047) ──────────────────────────────────────────────────────────
// Confirmed from YouCam's docs: POST /s2s/v2.0/task/skin-simulation with a source file and a 0.0 to 1.0
// intensity per concern, at least one above 0; poll GET .../{task_id}; 4 units for 1 to 4 concerns, 6 for 5 to 10.
// Not yet confirmed (the parameter reference page wasn't available): the exact field names, and where the
// result image sits in the response. Both live in this block only.
const SIMULATION_PATH = "/s2s/v2.0/task/skin-simulation";

/** Starts a skin simulation. `intensities` uses YouCam's concern names, e.g. { wrinkle: 0.4, spot: 0.3 }. */
export async function createSkinSimulationTask(fileId: string, intensities: Record<string, number>): Promise<string> {
  const body = await call(SIMULATION_PATH, { method: "POST", body: { src_file_id: fileId, ...intensities }, retries: 2 });
  return read(taskCreated, body, SIMULATION_PATH).data.task_id;
}

export type SimulationTask =
  | { status: "running" }
  | { status: "success"; imageUrl: string }
  | { status: "error"; code: string; message: string | null };

/** The first image link in a result, wherever it sits: results.url, results.output[0].url, and so on. */
export function findImageUrl(value: unknown, depth = 0): string | null {
  if (depth > 5 || value === null || value === undefined) return null;
  if (typeof value === "string") return /^https?:\/\//.test(value) ? value : null;
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = findImageUrl(v, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    // Prefer fields that name an image or result over anything else that happens to be a link.
    entries.sort(([a], [b]) => Number(/url|image|result|output|dst/i.test(b)) - Number(/url|image|result|output|dst/i.test(a)));
    for (const [, v] of entries) {
      const found = findImageUrl(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** One status check. No retries: the report's next poll is the retry. */
export async function getSkinSimulationTask(taskId: string): Promise<SimulationTask> {
  const path = `${SIMULATION_PATH}/${taskId}`;
  const { data } = read(taskState, await call(path, { method: "GET" }), SIMULATION_PATH);
  if (data.task_status === "success") {
    const imageUrl = findImageUrl(data.results);
    if (!imageUrl) throw new YouCamError("protocol", `${SIMULATION_PATH} succeeded without an image link`);
    return { status: "success", imageUrl };
  }
  if (data.task_status === "error" || data.task_status === "failed") {
    return { status: "error", code: data.error || "unknown_internal_error", message: data.error_message ?? null };
  }
  return { status: "running" };
}

/** Downloads a result image from YouCam's signed link. HTTPS only, except for a local test stand-in. */
export async function downloadResultImage(url: string): Promise<Buffer> {
  const protocol = new URL(url).protocol;
  if (protocol !== "https:" && !(protocol === "http:" && env.YOUCAM_API_BASE.startsWith("http:"))) {
    throw new YouCamError("protocol", "refusing a non-HTTPS result link");
  }
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS), cache: "no-store" });
  } catch (error) {
    throw new YouCamError("network", `result image unreachable: ${(error as Error).message}`);
  }
  if (!res.ok) throw new YouCamError(res.status >= 500 ? "server" : "protocol", `result image returned HTTP ${res.status}`, res.status);
  return Buffer.from(await res.arrayBuffer());
}
